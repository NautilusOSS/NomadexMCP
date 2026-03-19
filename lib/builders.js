import algosdk from "algosdk";
import { populateAppCallResources } from "@algorandfoundation/algokit-utils";
import { getAlgodClient, toBaseUnits, TOKEN_TYPE } from "./client.js";
import { getPool, findPoolForPair, getSwapDirection } from "./pools.js";
import { getSwapQuoteWithTxns } from "./quotes.js";

const {
  AtomicTransactionComposer,
  ABIMethod,
  makePaymentTxnWithSuggestedParamsFromObject,
  makeAssetTransferTxnWithSuggestedParamsFromObject,
  makeEmptyTransactionSigner,
  getApplicationAddress,
  encodeUnsignedTransaction,
  decodeUnsignedTransaction,
  Address,
} = algosdk;

const ADD_LIQUIDITY = new ABIMethod({
  name: "addLiquidity",
  args: [
    { name: "alphaTxn", type: "txn" },
    { name: "betaTxn", type: "txn" },
  ],
  returns: { type: "bool" },
});

const REMOVE_LIQUIDITY = new ABIMethod({
  name: "removeLiquidity",
  args: [{ name: "lptAmount", type: "uint256" }],
  returns: { type: "bool" },
});

const ARC200_TRANSFER = new ABIMethod({
  name: "arc200_transfer",
  args: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
  ],
  returns: { type: "bool" },
});

const CREATE_BALANCE_BOX = new ABIMethod({
  name: "createBalanceBox",
  args: [{ name: "addr", type: "address" }],
  returns: { type: "bool" },
});

const HAS_BOX = new ABIMethod({
  name: "hasBox",
  args: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
  ],
  returns: { type: "bool" },
});

const emptySigner = makeEmptyTransactionSigner();

function poolAddress(appId) {
  return getApplicationAddress(appId);
}

function poolAddressStr(appId) {
  const addr = getApplicationAddress(appId);
  return addr.toString();
}

async function buildDepositTxn(algod, tokenId, tokenType, amount, sender, poolAppId) {
  const params = await algod.getTransactionParams().do();
  const receiver = poolAddress(poolAppId);

  if (tokenType === TOKEN_TYPE.NATIVE) {
    return makePaymentTxnWithSuggestedParamsFromObject({
      sender: Address.fromString(sender),
      receiver,
      amount,
      suggestedParams: params,
    });
  }

  if (tokenType === TOKEN_TYPE.ASA) {
    return makeAssetTransferTxnWithSuggestedParamsFromObject({
      assetIndex: tokenId,
      sender: Address.fromString(sender),
      receiver,
      amount,
      suggestedParams: params,
    });
  }

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    appID: tokenId,
    method: ARC200_TRANSFER,
    methodArgs: [poolAddressStr(poolAppId), amount],
    sender: Address.fromString(sender),
    suggestedParams: params,
    signer: emptySigner,
  });
  const group = atc.buildGroup();
  return group[0].txn;
}

async function checkAndBuildOptinTxns(algod, tokenId, tokenType, sender) {
  const txns = [];
  const params = await algod.getTransactionParams().do();

  if (tokenType === TOKEN_TYPE.ASA) {
    try {
      await algod.accountAssetInformation(Address.fromString(sender), tokenId).do();
    } catch {
      txns.push(
        makeAssetTransferTxnWithSuggestedParamsFromObject({
          assetIndex: tokenId,
          sender: Address.fromString(sender),
          receiver: Address.fromString(sender),
          amount: 0,
          suggestedParams: params,
        })
      );
    }
  } else if (tokenType === TOKEN_TYPE.SMART) {
    const hasBoxAtc = new AtomicTransactionComposer();
    hasBoxAtc.addMethodCall({
      appID: tokenId,
      method: HAS_BOX,
      methodArgs: [sender, algosdk.encodeAddress(new Uint8Array(32))],
      sender: Address.fromString(sender),
      suggestedParams: params,
      signer: emptySigner,
    });

    try {
      const result = await hasBoxAtc.simulate(algod, new algosdk.modelsv2.SimulateRequest({
        txnGroups: [],
        allowEmptySignatures: true,
        allowUnnamedResources: true,
      }));
      const hasBox = result.methodResults[0]?.returnValue;
      if (!hasBox) throw new Error("no box");
    } catch {
      const payTxn = makePaymentTxnWithSuggestedParamsFromObject({
        sender: Address.fromString(sender),
        receiver: getApplicationAddress(tokenId),
        amount: 28500,
        suggestedParams: params,
      });
      txns.push(payTxn);

      const createBoxAtc = new AtomicTransactionComposer();
      createBoxAtc.addMethodCall({
        appID: tokenId,
        method: CREATE_BALANCE_BOX,
        methodArgs: [sender],
        sender: Address.fromString(sender),
        suggestedParams: params,
        signer: emptySigner,
      });
      txns.push(createBoxAtc.buildGroup()[0].txn);
    }
  }

  return txns;
}

function txnsToBase64(txns) {
  return txns.map((txn) => {
    const bytes = encodeUnsignedTransaction(txn);
    return Buffer.from(bytes).toString("base64");
  });
}

export async function groupAndPopulate(algod, txns) {
  let atc = new AtomicTransactionComposer();
  for (const txn of txns) {
    txn.group = undefined;
    atc.addTransaction({ txn, signer: emptySigner });
  }
  atc.buildGroup();
  atc = await populateAppCallResources(atc, algod);
  return atc.buildGroup().map(({ txn }) => txn);
}

/**
 * Build unsigned swap transactions for a Nomadex pool.
 * Finds the best Nomadex pool for the pair and builds transactions
 * pinned to that pool — no cross-DEX routing.
 *
 * Builds ARC-200 / native / ASA deposit + pool swap app call locally (Nomadex ABI), then:
 *  1. Add ASA opt-in / ARC-200 balance-box creation for the output token if needed
 *  2. Auto-populate foreignAssets/foreignApps via simulate (populateAppCallResources)
 */
export async function prepareSwap(fromSymbol, toSymbol, amount, sender, slippage = 5) {
  const result = await getSwapQuoteWithTxns(fromSymbol, toSymbol, amount, sender, slippage);

  const algod = getAlgodClient();
  const pool = await getPool(result.details.poolAppId);
  const direction = getSwapDirection(pool, fromSymbol);
  const isAlphaToBeta = direction === "alphaToBeta";
  const outTokenId = isAlphaToBeta ? pool.betaId : pool.alphaId;
  const outTokenType = isAlphaToBeta ? pool.betaType : pool.alphaType;

  const swapTxns = result.transactions.map((b64) =>
    decodeUnsignedTransaction(Buffer.from(b64, "base64"))
  );

  // WAD (47138068) on Voi uses a different ARC-200 interface and does not implement
  // hasBox/createBalanceBox; skip opt-in to avoid simulation err at selector match.
  const WAD_APP_ID_VOI = 47138068;
  const skipOptin = outTokenId === WAD_APP_ID_VOI;
  const optinTxns = skipOptin ? [] : await checkAndBuildOptinTxns(algod, outTokenId, outTokenType, sender);

  const allTxns = [...optinTxns, ...swapTxns];
  const finalTxns = await groupAndPopulate(algod, allTxns);

  return {
    transactions: txnsToBase64(finalTxns),
    details: result.details,
  };
}

export async function prepareAddLiquidity(poolAppId, amountA, amountB, sender) {
  const pool = await getPool(poolAppId);
  const algod = getAlgodClient();
  const params = await algod.getTransactionParams().do();

  const baseAmountA = toBaseUnits(amountA, pool.alphaDecimals);
  const baseAmountB = toBaseUnits(amountB, pool.betaDecimals);

  const alphaTxn = await buildDepositTxn(
    algod, pool.alphaId, pool.alphaType, baseAmountA, sender, pool.poolAppId
  );
  const betaTxn = await buildDepositTxn(
    algod, pool.betaId, pool.betaType, baseAmountB, sender, pool.poolAppId
  );

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    appID: pool.poolAppId,
    method: ADD_LIQUIDITY,
    methodArgs: [
      { txn: alphaTxn, signer: emptySigner },
      { txn: betaTxn, signer: emptySigner },
    ],
    sender: Address.fromString(sender),
    suggestedParams: params,
    signer: emptySigner,
  });

  const txns = atc.buildGroup().map(({ txn }) => txn);
  const finalTxns = await groupAndPopulate(algod, txns);

  return {
    transactions: txnsToBase64(finalTxns),
    details: {
      action: "add_liquidity",
      poolAppId: pool.poolAppId,
      symbolA: pool.alphaSymbol,
      symbolB: pool.betaSymbol,
      amountA: amountA.toString(),
      amountB: amountB.toString(),
      amountABaseUnits: baseAmountA.toString(),
      amountBBaseUnits: baseAmountB.toString(),
      sender,
    },
  };
}

export async function prepareRemoveLiquidity(poolAppId, lpAmount, sender) {
  const pool = await getPool(poolAppId);
  const algod = getAlgodClient();
  const params = await algod.getTransactionParams().do();

  const lpDecimals = pool.alphaDecimals;
  const baseLpAmount = toBaseUnits(lpAmount, lpDecimals);

  const optinA = await checkAndBuildOptinTxns(algod, pool.alphaId, pool.alphaType, sender);
  const optinB = await checkAndBuildOptinTxns(algod, pool.betaId, pool.betaType, sender);

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    appID: pool.poolAppId,
    method: REMOVE_LIQUIDITY,
    methodArgs: [baseLpAmount],
    sender: Address.fromString(sender),
    suggestedParams: params,
    signer: emptySigner,
  });

  const removeTxns = atc.buildGroup().map(({ txn }) => txn);
  const allTxns = [...optinA, ...optinB, ...removeTxns];
  const finalTxns = await groupAndPopulate(algod, allTxns);

  return {
    transactions: txnsToBase64(finalTxns),
    details: {
      action: "remove_liquidity",
      poolAppId: pool.poolAppId,
      symbolA: pool.alphaSymbol,
      symbolB: pool.betaSymbol,
      lpAmount: lpAmount.toString(),
      lpAmountBaseUnits: baseLpAmount.toString(),
      sender,
    },
  };
}

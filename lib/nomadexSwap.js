import algosdk from "algosdk";
import { getAlgodClient, getPoolFactory, TOKEN_TYPE } from "./client.js";

const {
  AtomicTransactionComposer,
  ABIMethod,
  makePaymentTxnWithSuggestedParamsFromObject,
  makeAssetTransferTxnWithSuggestedParamsFromObject,
  makeEmptyTransactionSigner,
  getApplicationAddress,
  encodeUnsignedTransaction,
  Address,
} = algosdk;

const emptySigner = makeEmptyTransactionSigner();

const ARC200_TRANSFER = new ABIMethod({
  name: "arc200_transfer",
  args: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
  ],
  returns: { type: "bool" },
});

function swapMethod(isAlphaToBeta) {
  if (isAlphaToBeta) {
    return new ABIMethod({
      name: "swapAlphaToBeta",
      args: [
        { type: "txn", name: "alphaTxn" },
        { type: "uint256", name: "minBetaAmount" },
      ],
      returns: { type: "uint256" },
    });
  }
  return new ABIMethod({
    name: "swapBetaToAlpha",
    args: [
      { type: "txn", name: "betaTxn" },
      { type: "uint256", name: "minAlphaAmount" },
    ],
    returns: { type: "uint256" },
  });
}

/** Map Nomadex pool token type (0/1/2) to swap builder tag. */
export function poolTokenTypeToTag(type) {
  if (type === TOKEN_TYPE.NATIVE) return "native";
  if (type === TOKEN_TYPE.ASA) return "ASA";
  return "ARC200";
}

function poolAddrStr(poolAppId) {
  return getApplicationAddress(poolAppId).toString();
}

function balancesBox(addressStr) {
  const prefix = Buffer.from("balances", "utf8");
  const pk = algosdk.decodeAddress(addressStr).publicKey;
  return new Uint8Array(Buffer.concat([prefix, Buffer.from(pk)]));
}

/**
 * Box refs the pool swap may touch for ARC-200 tokens (matches swap-api nomadex.js).
 */
function arc200SwapBoxes({ sender, poolAppId, inputToken, outputToken, inputTag, outputTag, factoryAppId }) {
  const poolAddr = poolAddrStr(poolAppId);
  const factoryAddr = getApplicationAddress(factoryAppId).toString();
  const refs = [];
  const push = (appIndex, name) => {
    const key = `${appIndex}-${Buffer.from(name).toString("hex")}`;
    if (refs.some((r) => `${r.appIndex}-${Buffer.from(r.name).toString("hex")}` === key)) return;
    refs.push({ appIndex, name });
  };

  if (inputTag === "ARC200" && inputToken !== 0) {
    push(inputToken, balancesBox(sender));
    push(inputToken, balancesBox(poolAddr));
  }
  if (outputTag === "ARC200" && outputToken !== 0) {
    push(outputToken, balancesBox(sender));
    push(outputToken, balancesBox(poolAddr));
    push(outputToken, balancesBox(factoryAddr));
  }
  return refs;
}

async function buildDepositTxn(algod, params, sender, poolAppId, inputToken, amountIn, inputTag) {
  const poolAddr = getApplicationAddress(poolAppId);
  const senderAddr = Address.fromString(sender);

  const amt = BigInt(amountIn);

  if (inputTag === "native") {
    return makePaymentTxnWithSuggestedParamsFromObject({
      sender: senderAddr,
      receiver: poolAddr,
      amount: amt,
      suggestedParams: params,
    });
  }

  if (inputTag === "ASA") {
    return makeAssetTransferTxnWithSuggestedParamsFromObject({
      assetIndex: inputToken,
      sender: senderAddr,
      receiver: poolAddr,
      amount: amt,
      suggestedParams: params,
    });
  }

  if (inputTag === "ARC200") {
    const arc200Boxes = [
      { appIndex: inputToken, name: balancesBox(sender) },
      { appIndex: inputToken, name: balancesBox(poolAddr.toString()) },
    ];
    const atc = new AtomicTransactionComposer();
    atc.addMethodCall({
      appID: inputToken,
      method: ARC200_TRANSFER,
      methodArgs: [poolAddr.toString(), BigInt(amountIn)],
      sender: senderAddr,
      suggestedParams: params,
      signer: emptySigner,
      boxes: arc200Boxes,
    });
    const g = atc.buildGroup();
    if (g.length !== 1) throw new Error(`Expected 1 ARC200 transfer txn, got ${g.length}`);
    const txn = g[0].txn;
    txn.group = undefined;
    return txn;
  }

  throw new Error(`Unsupported input token type tag: ${inputTag}`);
}

/**
 * Build [deposit, swap] unsigned txns for a Nomadex pool (no opt-in / box-create).
 * Returns base64-encoded unsigned transactions for the swap group only.
 */
export async function buildNomadexSwapTxnsBase64({
  sender,
  poolAppId,
  inputToken,
  outputToken,
  amountIn,
  minAmountOut,
  isAlphaToBeta,
  inputTag,
  outputTag,
}) {
  const algod = getAlgodClient();
  const params = await algod.getTransactionParams().do();
  const factoryAppId = getPoolFactory();

  const depositTxn = await buildDepositTxn(
    algod,
    params,
    sender,
    poolAppId,
    inputToken,
    amountIn,
    inputTag
  );

  const foreignAssets = [];
  if (inputTag === "ASA" && inputToken !== 0) foreignAssets.push(inputToken);
  if (outputTag === "ASA" && outputToken !== 0) foreignAssets.push(outputToken);
  const uniqueAssets = [...new Set(foreignAssets)];

  const foreignApps = [factoryAppId];
  if (inputTag === "ARC200" && inputToken !== 0 && !foreignApps.includes(inputToken)) foreignApps.push(inputToken);
  if (outputTag === "ARC200" && outputToken !== 0 && !foreignApps.includes(outputToken)) foreignApps.push(outputToken);

  const boxes = arc200SwapBoxes({
    sender,
    poolAppId,
    inputToken,
    outputToken,
    inputTag,
    outputTag,
    factoryAppId,
  });

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    appID: poolAppId,
    method: swapMethod(isAlphaToBeta),
    methodArgs: [{ txn: depositTxn, signer: emptySigner }, BigInt(minAmountOut)],
    sender: Address.fromString(sender),
    suggestedParams: params,
    signer: emptySigner,
    appForeignApps: foreignApps,
    foreignAssets: uniqueAssets.length > 0 ? uniqueAssets : undefined,
    boxes: boxes.length > 0 ? boxes : undefined,
  });

  const txns = atc.buildGroup().map(({ txn }) => txn);
  return txns.map((txn) => Buffer.from(encodeUnsignedTransaction(txn)).toString("base64"));
}

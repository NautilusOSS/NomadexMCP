import { findPoolForPair, getSwapDirection } from "./pools.js";
import { toBaseUnits, fromBaseUnits } from "./client.js";
import { buildNomadexSwapTxnsBase64, poolTokenTypeToTag } from "./nomadexSwap.js";

const FEE_SCALE = 10n ** 18n;
const DEFAULT_FEE = 3000000000000000n; // 0.3%

function getSwapFee(pool) {
  // Analytics API swapFee uses a different scale; read from on-chain state
  // once the encoding is understood. For now use 0.3% default.
  return DEFAULT_FEE;
}

function computeSwapOutput(inputAmount, inputReserve, outputReserve, fee) {
  const feeAmount = (inputAmount * fee) / FEE_SCALE;
  const netInput = inputAmount - feeAmount;
  const numerator = netInput * outputReserve;
  const denominator = inputReserve + netInput;
  if (denominator === 0n) return 0n;
  return numerator / denominator;
}

function computePriceImpact(inputAmount, inputReserve) {
  if (inputReserve === 0n) return 0;
  return Number(inputAmount * 10000n / inputReserve) / 100;
}

function quoteFromPool(pool, fromSymbol, toSymbol, amount, slippage = 5) {
  const direction = getSwapDirection(pool, fromSymbol);
  const isAlphaToBeta = direction === "alphaToBeta";

  const fromDecimals = isAlphaToBeta ? pool.alphaDecimals : pool.betaDecimals;
  const toDecimals = isAlphaToBeta ? pool.betaDecimals : pool.alphaDecimals;
  const fromSym = isAlphaToBeta ? pool.alphaSymbol : pool.betaSymbol;
  const toSym = isAlphaToBeta ? pool.betaSymbol : pool.alphaSymbol;

  const inputReserveStr = isAlphaToBeta ? pool.alphaBalance : pool.betaBalance;
  const outputReserveStr = isAlphaToBeta ? pool.betaBalance : pool.alphaBalance;

  const inputAmount = toBaseUnits(amount, fromDecimals);
  const inputReserve = toBaseUnits(inputReserveStr, fromDecimals);
  const outputReserve = toBaseUnits(outputReserveStr, toDecimals);

  const fee = getSwapFee(pool);

  const outputAmount = computeSwapOutput(inputAmount, inputReserve, outputReserve, fee);
  const priceImpact = computePriceImpact(inputAmount, inputReserve);

  const slippageBps = BigInt(Math.floor(slippage * 100));
  const minReceived = outputAmount - (outputAmount * slippageBps) / 10000n;

  const feePercent = Number(fee * 10000n / FEE_SCALE) / 100;

  const rate =
    inputAmount > 0n
      ? Number(outputAmount) / Number(inputAmount) * (10 ** fromDecimals / 10 ** toDecimals)
      : 0;

  const quote = {
    source: "nomadex",
    poolAppId: pool.poolAppId,
    from: { symbol: fromSym, amount: amount.toString(), amountBaseUnits: inputAmount.toString(), decimals: fromDecimals },
    to: { symbol: toSym, expectedAmount: fromBaseUnits(outputAmount, toDecimals), amountBaseUnits: outputAmount.toString(), decimals: toDecimals },
    rate,
    feePercent,
    priceImpact,
    slippage,
    minReceived: fromBaseUnits(minReceived, toDecimals),
    minReceivedBaseUnits: minReceived.toString(),
    direction,
  };

  return { quote, isAlphaToBeta };
}

/**
 * Get a swap quote using local Nomadex AMM math.
 * Only routes through Nomadex pools — no cross-DEX aggregation.
 */
export async function getQuote(fromSymbol, toSymbol, amount, slippage = 5) {
  const pool = await findPoolForPair(fromSymbol, toSymbol);
  if (!pool) throw new Error(`No Nomadex pool found for ${fromSymbol}/${toSymbol}`);
  return quoteFromPool(pool, fromSymbol, toSymbol, amount, slippage).quote;
}

/**
 * Build a swap quote with unsigned transactions on-chain (Nomadex pool ABI),
 * using the same pool and amounts as get_quote — no swap-api dependency.
 */
export async function getSwapQuoteWithTxns(fromSymbol, toSymbol, amount, sender, slippage = 5) {
  const pool = await findPoolForPair(fromSymbol, toSymbol);
  if (!pool) throw new Error(`No Nomadex pool found for ${fromSymbol}/${toSymbol}`);

  const { quote, isAlphaToBeta } = quoteFromPool(pool, fromSymbol, toSymbol, amount, slippage);

  const inputTokenId = isAlphaToBeta ? pool.alphaId : pool.betaId;
  const outputTokenId = isAlphaToBeta ? pool.betaId : pool.alphaId;
  const inputTag = poolTokenTypeToTag(isAlphaToBeta ? pool.alphaType : pool.betaType);
  const outputTag = poolTokenTypeToTag(isAlphaToBeta ? pool.betaType : pool.alphaType);

  const transactions = await buildNomadexSwapTxnsBase64({
    sender,
    poolAppId: pool.poolAppId,
    inputToken: inputTokenId,
    outputToken: outputTokenId,
    amountIn: quote.from.amountBaseUnits,
    minAmountOut: quote.minReceivedBaseUnits,
    isAlphaToBeta,
    inputTag,
    outputTag,
  });

  return {
    transactions,
    details: {
      action: "swap",
      poolAppId: pool.poolAppId,
      from: {
        symbol: fromSymbol,
        amount: amount.toString(),
        amountBaseUnits: quote.from.amountBaseUnits,
        decimals: quote.from.decimals,
      },
      to: {
        symbol: toSymbol,
        expectedAmount: quote.to.expectedAmount,
        amountBaseUnits: quote.to.amountBaseUnits,
        decimals: quote.to.decimals,
      },
      rate: quote.rate,
      priceImpact: quote.priceImpact,
      slippage,
      minReceived: quote.minReceived,
      minReceivedBaseUnits: quote.minReceivedBaseUnits,
      sender,
    },
  };
}

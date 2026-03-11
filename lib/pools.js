import { fetchPools, fetchNomadexTokens } from "./api.js";
import { inferTokenType, fromBaseUnits } from "./client.js";

let _tokenCache = null;
let _tokenCacheTime = 0;
const TOKEN_CACHE_TTL = 60_000;

async function getTokenMap() {
  const now = Date.now();
  if (_tokenCache && now - _tokenCacheTime < TOKEN_CACHE_TTL) return _tokenCache;

  const tokens = await fetchNomadexTokens();
  const map = new Map();
  map.set(0, { id: 0, symbol: "VOI", name: "Voi", decimals: 6, type: 0 });
  for (const t of tokens) {
    map.set(t.id, t);
  }
  _tokenCache = map;
  _tokenCacheTime = now;
  return map;
}

function formatPool(raw, tokenMap) {
  const alphaToken = tokenMap.get(raw.alphaId) || { symbol: `${raw.alphaId}`, decimals: 6 };
  const betaToken = tokenMap.get(raw.betaId) || { symbol: `${raw.betaId}`, decimals: 6 };

  const alphaBalance = fromBaseUnits(BigInt(raw.balances[0]), alphaToken.decimals);
  const betaBalance = fromBaseUnits(BigInt(raw.balances[1]), betaToken.decimals);
  const volA = fromBaseUnits(BigInt(raw.volume[0]), alphaToken.decimals);
  const volB = fromBaseUnits(BigInt(raw.volume[1]), betaToken.decimals);

  return {
    poolAppId: raw.id,
    poolId: `${raw.alphaId}-${raw.betaId}`,
    symbolA: alphaToken.symbol,
    symbolB: betaToken.symbol,
    tokenAId: raw.alphaId,
    tokenBId: raw.betaId,
    decimalsA: alphaToken.decimals,
    decimalsB: betaToken.decimals,
    balanceA: alphaBalance,
    balanceB: betaBalance,
    tvl: 0,
    volume24hA: volA,
    volume24hB: volB,
    apr: raw.apr?.toString() ?? "0",
    lpSupply: "0",
    swapFee: raw.swapFee,
    online: raw.online,
    alphaId: raw.alphaId,
    betaId: raw.betaId,
    alphaType: raw.alphaType,
    betaType: raw.betaType,
    alphaSymbol: alphaToken.symbol,
    betaSymbol: betaToken.symbol,
    alphaDecimals: alphaToken.decimals,
    betaDecimals: betaToken.decimals,
    alphaBalance,
    betaBalance,
  };
}

export async function getPools(symbol) {
  const [rawPools, tokenMap] = await Promise.all([fetchPools(), getTokenMap()]);
  let pools = rawPools.map((raw) => formatPool(raw, tokenMap));

  if (symbol) {
    const s = symbol.toUpperCase();
    pools = pools.filter(
      (p) => p.symbolA.toUpperCase() === s || p.symbolB.toUpperCase() === s
    );
  }

  pools.sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
  return pools;
}

export async function getPool(poolAppId) {
  const [rawPools, tokenMap] = await Promise.all([fetchPools(), getTokenMap()]);
  const raw = rawPools.find((p) => p.id === poolAppId);
  if (!raw) throw new Error(`Pool ${poolAppId} not found`);
  return formatPool(raw, tokenMap);
}

export async function findPoolForPair(symbolA, symbolB) {
  const pools = await getPools();
  const a = symbolA.toUpperCase();
  const b = symbolB.toUpperCase();

  let best = null;
  for (const p of pools) {
    const pA = p.symbolA.toUpperCase();
    const pB = p.symbolB.toUpperCase();
    const match = (pA === a && pB === b) || (pA === b && pB === a);
    if (match) {
      if (!best || (p.tvl || 0) > (best.tvl || 0)) {
        best = p;
      }
    }
  }
  return best;
}

export function getSwapDirection(pool, fromSymbol) {
  const from = fromSymbol.toUpperCase();
  if (pool.alphaSymbol.toUpperCase() === from) return "alphaToBeta";
  if (pool.betaSymbol.toUpperCase() === from) return "betaToAlpha";
  throw new Error(`Token "${fromSymbol}" not found in pool ${pool.poolAppId}`);
}

export async function getTokens(symbol) {
  const tokenMap = await getTokenMap();
  let tokens = [...tokenMap.values()].map((t) => ({
    contractId: t.id,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    type: t.type,
  }));

  if (symbol) {
    const s = symbol.toUpperCase();
    tokens = tokens.filter((t) => t.symbol.toUpperCase() === s);
  }
  return tokens;
}

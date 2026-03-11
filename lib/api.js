import { createRequire } from "module";
const require = createRequire(import.meta.url);
const contractsData = require("../data/contracts.json");

const ANALYTICS_BASE = contractsData.voi.analyticsBaseUrl;
const MIMIR_BASE = contractsData.voi.mimirBaseUrl;
const SWAP_API_BASE = contractsData.voi.swapApiBaseUrl;

async function getAnalytics(path) {
  const url = `${ANALYTICS_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nomadex analytics API ${res.status}: ${url}`);
  return res.json();
}

async function getMimir(path) {
  const url = `${MIMIR_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mimir API ${res.status}: ${url}`);
  return res.json();
}

export async function fetchPools() {
  return getAnalytics("/pools");
}

export async function fetchNomadexTokens() {
  return getAnalytics("/tokens");
}

export async function fetchTokenBalances(accountId, opts = {}) {
  let path = `/arc200/balances?accountId=${accountId}`;
  if (opts.contractId) path += `&contractId=${opts.contractId}`;
  const data = await getMimir(path);
  return data.balances || [];
}

/**
 * Fetch a swap quote from the swap-api, pinned to a specific Nomadex pool.
 * Used internally by swap_txn to build unsigned transactions.
 *
 * @param {Object} opts
 * @param {number} opts.inputToken  - Input token ID (0 for native VOI)
 * @param {number} opts.outputToken - Output token ID
 * @param {string} opts.amount      - Amount in **base units** (e.g. "1000000" for 1 VOI)
 * @param {number} [opts.slippageTolerance=0.01] - Slippage as a decimal (0.01 = 1%)
 * @param {string} [opts.address]   - Sender address; when provided the API returns unsignedTransactions
 * @param {string} [opts.poolId]    - Nomadex pool app ID to pin the swap to
 */
export async function fetchSwapQuote(opts) {
  const body = {
    inputToken: opts.inputToken,
    outputToken: opts.outputToken,
    amount: opts.amount,
    slippageTolerance: opts.slippageTolerance ?? 0.01,
  };
  if (opts.address) body.address = opts.address;
  if (opts.poolId) body.poolId = opts.poolId;

  const res = await fetch(`${SWAP_API_BASE}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `swap-api ${res.status}`);
  }

  return res.json();
}

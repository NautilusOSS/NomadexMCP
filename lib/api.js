import { createRequire } from "module";
const require = createRequire(import.meta.url);
const contractsData = require("../data/contracts.json");

const ANALYTICS_BASE = contractsData.voi.analyticsBaseUrl;
const MIMIR_BASE = contractsData.voi.mimirBaseUrl;

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

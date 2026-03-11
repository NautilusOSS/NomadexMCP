import algosdk from "algosdk";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const contractsData = require("../data/contracts.json");

const config = contractsData.voi;

export function getAlgodClient() {
  return new algosdk.Algodv2(config.algodToken || "", config.algodUrl, config.algodPort);
}

export function getConfig() {
  return config;
}

export function getPoolFactory() {
  return config.poolFactory;
}


const TOKEN_TYPE = { NATIVE: 0, ASA: 1, SMART: 2 };

export function inferTokenType(tokenId) {
  if (tokenId === 0) return TOKEN_TYPE.NATIVE;
  return TOKEN_TYPE.SMART;
}

export function parsePoolId(poolIdStr) {
  const parts = poolIdStr.split("-");
  return { alphaId: Number(parts[0]), betaId: Number(parts[1]) };
}

export async function readPoolGlobalState(appId) {
  const algod = getAlgodClient();
  const appInfo = await algod.getApplicationByID(appId).do();
  const gs = appInfo.params?.["global-state"] || appInfo.params?.globalState || [];

  const state = {};
  for (const kv of gs) {
    const key = Buffer.from(kv.key, "base64").toString();
    if (kv.value.type === 2) {
      state[key] = kv.value.uint;
    } else {
      state[key] = kv.value.bytes;
    }
  }
  return state;
}

export function toBaseUnits(amount, decimals) {
  const parts = String(amount).split(".");
  const whole = parts[0];
  const frac = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + frac);
}

export function fromBaseUnits(amount, decimals) {
  const str = String(amount).padStart(decimals + 1, "0");
  const whole = str.slice(0, str.length - decimals);
  const frac = str.slice(str.length - decimals);
  return `${whole}.${frac}`;
}

export { algosdk, TOKEN_TYPE };

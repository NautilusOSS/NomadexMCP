#!/usr/bin/env node
/**
 * Build Nomadex UNIT → WAD (2 txns), run populateAppCallResources, output 2 base64 unsigned txns.
 * No cross-DEX combining; single Nomadex group only.
 */
import algosdk from "algosdk";
import { getAlgodClient } from "../lib/client.js";
import { getSwapQuoteWithTxns } from "../lib/quotes.js";
import { groupAndPopulate } from "../lib/builders.js";

const SENDER = "6TLMFPO53BADTZCT5E6OACBGPQMXMOYRLQ62IRCM6IKAYG5V33462TV57E";

async function main() {
  const nomadex = await getSwapQuoteWithTxns("UNIT", "WAD", "12.18574797", SENDER, 3);
  const twoB64 = nomadex.transactions;
  const txns = twoB64.map((b) => algosdk.decodeUnsignedTransaction(Buffer.from(b, "base64")));
  txns.forEach((t) => {
    t.group = undefined;
  });
  algosdk.assignGroupID(txns);

  const algod = getAlgodClient();
  const populated = await groupAndPopulate(algod, txns);
  const out = populated.map((t) => Buffer.from(algosdk.encodeUnsignedTransaction(t)).toString("base64"));
  console.log(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

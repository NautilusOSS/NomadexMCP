import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getPools, getPool, getTokens } from "./lib/pools.js";
import { getQuote } from "./lib/quotes.js";
import { prepareSwap, prepareAddLiquidity, prepareRemoveLiquidity } from "./lib/builders.js";

const server = new McpServer({
  name: "nomadex-mcp",
  version: "0.3.0",
});

// --- Pool tools ---

server.tool(
  "get_pools",
  "List Nomadex DEX pools on Voi with balances, TVL, volume, and APR. Optionally filter by token symbol.",
  {
    symbol: z.string().optional().describe("Filter pools containing this token symbol (e.g. VOI, UNIT, SHELLY)"),
  },
  async ({ symbol }) => {
    const pools = await getPools(symbol);
    return { content: [{ type: "text", text: JSON.stringify(pools, null, 2) }] };
  }
);

server.tool(
  "get_pool",
  "Get detailed information for a specific Nomadex pool by application ID.",
  {
    poolAppId: z.number().describe("Pool application ID"),
  },
  async ({ poolAppId }) => {
    const pool = await getPool(poolAppId);
    return { content: [{ type: "text", text: JSON.stringify(pool, null, 2) }] };
  }
);

// --- Token tools ---

server.tool(
  "get_tokens",
  "List tokens available on Nomadex with their contract IDs, decimals, and pool count.",
  {
    symbol: z.string().optional().describe("Filter by token symbol"),
  },
  async ({ symbol }) => {
    const tokens = await getTokens(symbol);
    return { content: [{ type: "text", text: JSON.stringify(tokens, null, 2) }] };
  }
);

// --- Quote tools ---

server.tool(
  "get_quote",
  "Get a swap quote with expected output, rate, and price impact. Uses local Nomadex AMM math for direct pool quotes.",
  {
    fromToken: z.string().describe("Source token symbol (e.g. VOI, aUSDC, UNIT)"),
    toToken: z.string().describe("Destination token symbol"),
    amount: z.string().describe("Amount to swap in human-readable units (e.g. '100' for 100 VOI)"),
    slippage: z.number().optional().default(5).describe("Allowed slippage percentage (default 5)"),
  },
  async ({ fromToken, toToken, amount, slippage }) => {
    const quote = await getQuote(fromToken, toToken, amount, slippage);
    return { content: [{ type: "text", text: JSON.stringify(quote, null, 2) }] };
  }
);

// --- Transaction preparation tools ---

server.tool(
  "swap_txn",
  "Build unsigned swap transactions for a Nomadex pool. Finds the best Nomadex pool for the pair and returns base64-encoded transactions for signing via UluWalletMCP.",
  {
    fromToken: z.string().describe("Source token symbol (e.g. VOI, USDC, UNIT)"),
    toToken: z.string().describe("Destination token symbol"),
    amount: z.string().describe("Amount to swap in human-readable units"),
    sender: z.string().describe("Sender wallet address"),
    slippage: z.number().optional().default(5).describe("Allowed slippage percentage (default 5)"),
  },
  async ({ fromToken, toToken, amount, sender, slippage }) => {
    const result = await prepareSwap(fromToken, toToken, amount, sender, slippage);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "add_liquidity_txn",
  "Build unsigned transactions to add liquidity to a Nomadex pool. Returns base64-encoded transactions for signing.",
  {
    poolAppId: z.number().describe("Pool application ID"),
    amountA: z.string().describe("Amount of token A (alpha) in human-readable units"),
    amountB: z.string().describe("Amount of token B (beta) in human-readable units"),
    sender: z.string().describe("Sender wallet address"),
  },
  async ({ poolAppId, amountA, amountB, sender }) => {
    const result = await prepareAddLiquidity(poolAppId, amountA, amountB, sender);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "remove_liquidity_txn",
  "Build unsigned transactions to remove liquidity from a Nomadex pool. Returns base64-encoded transactions for signing.",
  {
    poolAppId: z.number().describe("Pool application ID"),
    lpAmount: z.string().describe("Amount of LP tokens to burn in human-readable units"),
    sender: z.string().describe("Sender wallet address"),
  },
  async ({ poolAppId, lpAmount, sender }) => {
    const result = await prepareRemoveLiquidity(poolAppId, lpAmount, sender);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

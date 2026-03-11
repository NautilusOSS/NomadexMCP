# NomadexMCP

Protocol MCP server for the [Nomadex](https://voi.nomadex.app) DEX on Voi.

## Architecture

NomadexMCP is a protocol-level MCP that sits above the infrastructure MCP layer:

```
UluCoreMCP / UluVoiMCP / UluWalletMCP / UluBroadcastMCP
                                ↓
                          NomadexMCP
                                ↓
                     Mimir API (pool reads)
                     swap-api  (quotes + swap txns)
                     On-chain  (liquidity txns)
```

**Data sources:**

- **Mimir API** (`mainnet-idx.nautilus.sh`) — Pre-indexed Nomadex pool data with balances, TVL, volume, and APR. Used for pool and token listing.
- **swap-api** (`swap-api-iota.vercel.app`) — Cross-DEX aggregator ([source](https://github.com/xarmian/swap-api)) that handles swap quotes and transaction building across both HumbleSwap and Nomadex. Supports multi-hop routing and split routes.
- **On-chain** (algod) — Used for add/remove liquidity transaction preparation and local AMM fallback quotes.

**NomadexMCP handles:**
- Pool discovery with live balances, TVL, volume, and APR
- Token listing across all Nomadex pools
- Cross-DEX swap quotes via swap-api (HumbleSwap + Nomadex, multi-hop)
- Unsigned transaction preparation for swaps (via swap-api), adding/removing liquidity (direct on-chain)

**NomadexMCP does NOT:**
- Sign transactions (use UluWalletMCP)
- Broadcast transactions (use UluBroadcastMCP)
- Manage wallets

## Tools

### Pools

| Tool | Description |
|------|-------------|
| `get_pools` | List Nomadex pools with balances, TVL, volume, and APR |
| `get_pool` | Get detailed info for a specific pool by app ID |

### Tokens

| Tool | Description |
|------|-------------|
| `get_tokens` | List tokens available on Nomadex with contract IDs and pool counts |

### Quotes

| Tool | Description |
|------|-------------|
| `get_quote` | Get a swap quote with cross-DEX routing (HumbleSwap + Nomadex), multi-hop support, rate, and price impact |

### Transaction Preparation

| Tool | Description |
|------|-------------|
| `swap_txn` | Build unsigned swap transactions via swap-api (cross-DEX, multi-hop) |
| `add_liquidity_txn` | Build unsigned transactions to add liquidity to a Nomadex pool |
| `remove_liquidity_txn` | Build unsigned transactions to remove liquidity from a Nomadex pool |

## Agent Workflow

```
Agent calls NomadexMCP:  swap_txn(fromToken, toToken, amount, sender)
       → returns { transactions: [base64, ...], details: { route, rate, ... } }

Agent calls UluWalletMCP: wallet_sign_transactions(signerId, transactions)
       → returns signed transactions

Agent calls UluBroadcastMCP: broadcast_transactions(network, txns)
       → returns transaction IDs
```

## Project Structure

```
index.js              MCP server entry point (7 tools)
lib/
  api.js              Mimir API client + swap-api client
  client.js           Algod client factory, token type inference, on-chain state
  pools.js            Pool data formatting and discovery from Mimir
  quotes.js           Swap quotes via swap-api (fallback: local AMM math)
  builders.js         Transaction builders (swap-api for swaps, algosdk for liquidity)
data/
  contracts.json      Network config, API URLs, pool factory ID
```

## Setup

```bash
npm install
```

## Run

```bash
node index.js
```

Or configure as an MCP server in your agent:

```json
{
  "mcpServers": {
    "nomadex": {
      "command": "node",
      "args": ["/path/to/NomadexMCP/index.js"]
    }
  }
}
```

## Token Types

Nomadex pools support three token types:

| Type | Value | Description |
|------|-------|-------------|
| NATIVE | 0 | Native VOI token |
| ASA | 1 | Algorand Standard Asset |
| SMART | 2 | ARC-200 smart asset |

On Voi mainnet, pools primarily use NATIVE (VOI) and SMART (ARC-200) tokens.

## Pool Factory

The Nomadex pool factory on Voi mainnet is application **411751**. All pools are created through this factory contract.

## External APIs

| API | Base URL | Used by |
|-----|----------|---------|
| Mimir indexer | `https://mainnet-idx.nautilus.sh/nft-indexer/v1/` | `get_pools`, `get_pool`, `get_tokens` |
| swap-api | `https://swap-api-iota.vercel.app` | `get_quote`, `swap_txn` |
| Algod (Voi) | `https://mainnet-api.voi.nodely.dev` | `add_liquidity_txn`, `remove_liquidity_txn` |

## References

- [Nomadex Web](https://github.com/NomadexApp/nomadex-web)
- [swap-api](https://github.com/xarmian/swap-api) — Cross-DEX swap aggregator
- [Ally](https://github.com/NautilusOSS/ally) — DEX aggregator UI using swap-api

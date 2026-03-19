# NomadexMCP

Protocol MCP server for the [Nomadex](https://voi.nomadex.app) DEX on Voi.

## Architecture

NomadexMCP is a protocol-level MCP that sits above the infrastructure MCP layer:

```
UluCoreMCP / UluVoiMCP / UluWalletMCP / UluBroadcastMCP
                                ↓
                          NomadexMCP
                                ↓
                     Nomadex analytics API (pool + token listing)
                     On-chain  (swap + liquidity txns, opt-in / resource simulation)
```

**Data sources:**

- **Nomadex analytics** (`voimain-analytics.nomadex.app`) — Pool and token list with balances, volume, and APR. Drives `get_pools`, `get_pool`, `get_tokens`, and pool selection for `get_quote` / `swap_txn`.
- **Mimir** (`mainnet-idx.nautilus.sh`) — Optional indexer client in `api.js` (e.g. ARC-200 balances); not wired to every MCP tool.
- **On-chain** (algod) — `swap_txn` builds deposit + `swapAlphaToBeta` / `swapBetaToAlpha` app calls locally (same ABI as [swap-api’s Nomadex module](https://github.com/xarmian/swap-api/blob/main/lib/nomadex.js)); add/remove liquidity; ARC-200 box checks; `populateAppCallResources` for groups.

**NomadexMCP handles:**
- Pool discovery with live balances, volume, and APR
- Token listing across Nomadex pools
- `get_quote` — local constant-product math on the pool picked from analytics (Nomadex-only)
- `swap_txn` — unsigned swap groups for any pool returned by analytics (native / ASA / ARC-200), aligned with `get_quote` amounts and slippage
- Add/remove liquidity (direct on-chain)

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
| `get_quote` | Swap quote via local Nomadex AMM math on a pool from analytics (no swap-api) |

### Transaction Preparation

| Tool | Description |
|------|-------------|
| `swap_txn` | Build unsigned swap transactions on-chain (deposit + pool swap; any analytics pool) |
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
  api.js              Nomadex analytics, Mimir (balances)
  client.js           Algod client factory, token type inference, on-chain state
  pools.js            Pool formatting and discovery from analytics
  quotes.js           Local AMM quotes; swap txn details + amounts for swap_txn
  nomadexSwap.js      Nomadex swap ABI (deposit + swapAlphaToBeta / swapBetaToAlpha)
  builders.js         Liquidity + swap groups, opt-in prep, populateAppCallResources
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
| Nomadex analytics | `https://voimain-analytics.nomadex.app` | `get_pools`, `get_pool`, `get_tokens`, pool pick for `get_quote` / `swap_txn` |
| Mimir indexer | `https://mainnet-idx.nautilus.sh/nft-indexer/v1/` | `fetchTokenBalances` in `api.js` |
| Algod (Voi) | `https://mainnet-api.voi.nodely.dev` | Swap + liquidity txns, simulation / resource population |

## References

- [Nomadex Web](https://github.com/NomadexApp/nomadex-web)
- [swap-api](https://github.com/xarmian/swap-api) — Reference implementation for Nomadex swap txn shape (this MCP no longer calls it)
- [Ally](https://github.com/NautilusOSS/ally) — DEX aggregator UI

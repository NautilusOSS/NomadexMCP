# Agent-Assisted Research: WAD Arbitrage Opportunities on Voi

**Example of using Cursor AI agent to research DeFi trading opportunities**

This document demonstrates a real conversation with an AI coding assistant (Cursor) to systematically research cross-DEX arbitrage opportunities for WAD (Whale Asset Dollar) on the Voi blockchain.

---

## Research Session Overview

**Goal:** Identify WAD trading pairs on Nomadex and Humble Swap, find common markets, and evaluate arbitrage opportunities.

**Duration:** ~30 minutes of interactive research  
**Tools Used:** MCP servers (Nomadex, Humble Swap, Core, Wallet, Mimir), terminal commands, code analysis

---

## Conversation Flow

### Phase 1: Initial Swap Simulation

**User:** `sim swap WAD -> UNIT`

**Agent Actions:**
- Called `mcp_nomadex_get_quote` for WAD→UNIT
- Returned quote: 100 WAD → 76.11 UNIT (42.88% price impact, 0.3% fee)

**User:** `what is the quote using humbleswap`

**Agent Actions:**
- Called `mcp_humble-swap_get_quote` for same swap
- Found: 100 WAD → 59.63 UNIT (57.17% impact, 0.99% fee)
- **Discovery:** Nomadex gave better rate for this size

**User:** `sim swap WAD->UNIT->WAD`

**Agent Actions:**
- Simulated round-trip on Nomadex: 100 WAD → 76.11 UNIT → 53.62 WAD
- **Finding:** ~46% round-trip loss due to high price impact at large size

**User:** `what if we use humble on 1st leg and then nomadex`

**Agent Actions:**
- Simulated mixed route: Humble (WAD→UNIT) then Nomadex (UNIT→WAD)
- At 100 WAD: worse outcome (44.21 WAD back vs 53.62 WAD)
- **Insight:** Route choice depends on trade size

### Phase 2: Size-Dependent Analysis

**User:** `what if 1 WAD`

**Agent Actions:**
- Re-simulated Route B (Humble→Nomadex) with 1 WAD
- **Key Finding:** At small size, mixed route showed **+23.8% gain** (1 WAD → 1.24 WAD)
- This was a simulation artifact (not real arb), but revealed size sensitivity

**User:** `execute` (Route B with 1 WAD)

**Agent Actions:**
- Built Humble swap txns (1 WAD → UNIT)
- Signed and broadcasted Leg 1
- Built Nomadex swap txns (UNIT → WAD) using local builder (bypassed MCP bug)
- Signed and broadcasted Leg 2
- **Result:** Successfully executed two-leg swap

**User:** `what is the net change in WAD`

**Agent Actions:**
- Queried WAD balance via `mcp_asset-mcp_arc200_balance_of`
- Calculated net: +0.08 to +0.13 WAD from round-trip

### Phase 3: Systematic Pair Discovery

**User:** `list all of the wad pairs on nomadex`

**Agent Actions:**
- Called `mcp_nomadex_get_pools` filtered by "WAD"
- Found 6 pools: VOI/WAD, WAD/UNIT, WAD/aUSDC, WAD/GM, WAD/NODE
- Identified pool 47160809 as dead (different WAD token)

**User:** `List Wad pairs on HumbleSwap`

**Agent Actions:**
- Called `mcp_humble-swap_get_pools` (no filter, then searched results)
- Found 8 pools: WAD/wVOI, WAD/UNIT, WAD/aUSDC, WAD/TURTLE, WAD/SHELLY, WAD/BUIDL, WAD/POW, WAD/CORN
- Used `mcp_humble-swap_get_pool_details` and `mcp_humble-swap_get_token_metadata` to resolve token symbols

**User:** `are there common pairs`

**Agent Actions:**
- Compared both lists
- Identified 3 common markets: WAD/VOI (≈WAD/wVOI), WAD/UNIT, WAD/aUSDC
- Noted VOI and wVOI are economically equivalent (1:1 wrapped)

### Phase 4: Arbitrage Analysis

**User:** `For WAD / VOI is there a arb opportuninity`

**Agent Actions:**
- Got quotes from both DEXes for WAD⇄VOI
- **Challenge:** Nomadex API returned dead pool (47160809) with zero output
- Used pool reserves (47166025) to calculate implied rates
- **Conclusion:** No arb — rates too similar, fees eat any edge

**User:** `how about WAD / aUSDC`

**Agent Actions:**
- Compared quotes: Nomadex (0.49 aUSDC per WAD, 71% impact) vs Humble (0.80 aUSDC, 1% impact)
- **Finding:** Nomadex pool extremely thin (~1.17 aUSDC, ~1.40 WAD)
- **Conclusion:** No arb — Nomadex's poor rate is from illiquidity, not mispricing

**User:** `look at identical routes between Nomadex and Humbleswap eg WAD->UNIT`

**Agent Actions:**
- Systematically compared WAD→UNIT and UNIT→WAD at multiple sizes (1, 10, 100)
- Created comparison tables showing:
  - Small size: Humble better for WAD→UNIT
  - Large size: Nomadex better for WAD→UNIT
  - UNIT→WAD: Nomadex better at all tested sizes

### Phase 5: Documentation

**User:** `draft document regarding WAD pairs on VOI and arb opportunities`

**Agent Actions:**
- Created comprehensive markdown document (`docs/wad-pairs-voi-arb.md`)
- Included: pair listings, rate comparisons, arb analysis, summary tables
- Structured for easy reference

**User:** `turn into gist`

**Agent Actions:**
- Used `gh gist create` to publish document as public gist
- Gist URL: https://gist.github.com/temptemp3/c390ae151d024e4277ec362687164d6c

---

## Key Agent Capabilities Demonstrated

### 1. Multi-Tool Orchestration
- **MCP Servers:** Nomadex, Humble Swap, Core, Wallet, Mimir, Asset-MCP
- **Terminal:** Node.js scripts, GitHub CLI
- **Code Analysis:** Read and modified Nomadex builder code to fix WAD opt-in bug

### 2. Iterative Research
- Started with simple swap simulation
- Expanded to round-trips and mixed routes
- Systematically discovered all pairs on both DEXes
- Compared rates at multiple sizes

### 3. Problem Solving
- **Bug Fix:** Nomadex MCP failed on UNIT→WAD swaps (WAD opt-in issue)
- **Solution:** Modified `lib/builders.js` to skip opt-in for WAD (47138068)
- **Workaround:** Built swaps locally using fixed code, then signed/broadcasted

### 4. Data Synthesis
- Compared quotes across DEXes
- Identified common markets
- Calculated arbitrage viability
- Documented findings in structured format

### 5. Execution
- Built, signed, and broadcasted actual transactions
- Monitored confirmations
- Tracked balance changes

---

## Research Findings Summary

### Pairs Discovered
- **Nomadex:** 5 active WAD pairs (VOI, UNIT, aUSDC, GM, NODE)
- **Humble:** 8 WAD pairs (wVOI, UNIT, aUSDC, TURTLE, SHELLY, BUIDL, POW, CORN)
- **Common Markets:** 3 (WAD/VOI, WAD/UNIT, WAD/aUSDC)

### Arbitrage Opportunities
- **WAD/VOI:** None — rates too similar, fees eliminate edge
- **WAD/aUSDC:** None — Nomadex pool too thin (illiquidity, not mispricing)
- **WAD/UNIT:** No classic arb, but route optimization possible at small size

### Key Insights
1. **Size matters:** Optimal DEX choice depends on trade size
2. **Liquidity matters:** Nomadex WAD/aUSDC pool is too small for meaningful trades
3. **Route optimization:** Mixed routes (Humble→Nomadex) can outperform single-DEX at small sizes
4. **API quirks:** Nomadex quote API may return dead pools; verify pool liquidity

---

## Tools and Commands Used

### MCP Tools
```bash
# Quote tools
mcp_nomadex_get_quote
mcp_humble-swap_get_quote

# Pool discovery
mcp_nomadex_get_pools
mcp_humble-swap_get_pools
mcp_humble-swap_get_pool_details

# Token metadata
mcp_humble-swap_get_token_metadata

# Balance queries
mcp_asset-mcp_arc200_balance_of
mcp_core_get_account

# Transaction building
mcp_humble-swap_swap_txn
mcp_nomadex_swap_txn (via local builder)

# Execution
mcp_wallet_wallet_sign_transactions
mcp_broadcast_broadcast_transactions
mcp_broadcast_wait_for_confirmation
```

### Terminal Commands
```bash
# Local swap builder (bypassing MCP bug)
node -e "import { prepareSwap } from './lib/builders.js'; ..."

# Gist creation
gh gist create docs/wad-pairs-voi-arb.md --desc "..." --public
```

### Code Modifications
- **File:** `lib/builders.js`
- **Change:** Skip WAD opt-in (WAD doesn't implement standard ARC-200 hasBox/createBalanceBox)
- **Impact:** Enabled UNIT→WAD swaps to work

---

## Lessons for Future Research

1. **Start broad, then narrow:** Begin with simple swaps, expand to full pair discovery
2. **Test multiple sizes:** Liquidity and optimal routes vary by trade size
3. **Verify pool state:** Don't trust quote APIs blindly; check actual pool reserves
4. **Document as you go:** Keep findings organized for easy reference
5. **Fix bugs proactively:** When tools fail, investigate and fix (or work around) rather than giving up

---

## Conclusion

This session demonstrates how an AI coding assistant can:
- **Research** DeFi opportunities systematically
- **Execute** trades when needed
- **Debug** tooling issues
- **Document** findings for future reference

The agent acted as both researcher and executor, using multiple tools in parallel, synthesizing data, and producing actionable insights (or confirming no opportunities exist).

---

*Example session from March 2025. Tools and rates are time-sensitive; verify current state before trading.*

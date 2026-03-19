# WAD Pairs on Voi and Arbitrage Opportunities

**Draft — WAD (Whale Asset Dollar, contract 47138068) across Nomadex and Humble Swap**

---

## 1. Overview

WAD is an ARC-200 token on Voi. This note lists where it trades (Nomadex and Humble Swap), which pairs are common, and whether there are arbitrage opportunities between the two DEXes.

**Assumptions:** VOI and wVOI are treated as the same for cross-DEX comparison (1:1 wrapped native). aUSDC is the same asset on both DEXes.

---

## 2. WAD Pairs by DEX

### 2.1 Nomadex (Voi)

| Pair        | Pool App ID | Alpha (reserve) | Beta (reserve) | Notes                    |
|------------|-------------|------------------|----------------|---------------------------|
| VOI / WAD  | 47166025    | 82,931 VOI       | 19.79 WAD      | Main liquid pool          |
| WAD / UNIT | 47424655    | 227.01 WAD       | 261.08 UNIT    | Liquid; used in Route B  |
| WAD / aUSDC| 47165570    | 1.17 aUSDC       | 1.40 WAD       | Very thin                 |
| WAD / GM   | 47424539    | 3.60 WAD         | 16,890 GM      |                          |
| WAD / NODE | 47511507    | 0.11 WAD         | 70,226 NODE    |                          |

- **Fee:** 0.3% (typical for Nomadex).
- There is also a **VOI/WAD** pool **47160809** with a different WAD token (47155831) and **zero** liquidity; quote APIs may point here by default.

### 2.2 Humble Swap (Voi)

| Pair         | Pool ID   | Token A   | Token B   | Fee   |
|-------------|-----------|-----------|-----------|-------|
| WAD / wVOI  | 47165327  | WAD       | wVOI 390001 | 0.99% |
| WAD / UNIT  | 47175149  | WAD       | UNIT      | 0.99% |
| WAD / aUSDC | 47175110  | WAD       | aUSDC     | 0.99% |
| WAD / TURTLE| 47196468  | TURTLE    | WAD       | 0.99% |
| WAD / SHELLY| 47410064  | SHELLY    | WAD       | 0.99% |
| WAD / BUIDL | 47424826  | WAD       | BUIDL     | 0.99% |
| WAD / POW   | 47512668  | WAD       | POW       | 0.99% |
| WAD / CORN  | 48926986  | CORN      | WAD       | 0.99% |

Humble WAD/aUSDC pool 47175110 has on the order of **~2,869 aUSDC** and **~3,538 WAD** (much deeper than Nomadex).

---

## 3. Common Pairs (Same Economic Market)

Treating **VOI = wVOI**:

| Pair            | Nomadex pool | Humble pool |
|-----------------|--------------|-------------|
| WAD / VOI       | 47166025     | 47165327 (WAD/wVOI) |
| WAD / UNIT      | 47424655     | 47175149    |
| WAD / aUSDC     | 47165570     | 47175110    |

So there are **three** common WAD markets: WAD/VOI (wVOI), WAD/UNIT, and WAD/aUSDC.

---

## 4. Rate Comparison (Representative Quotes)

### 4.1 WAD / UNIT

- **Small size (e.g. 1 WAD):** Humble often gives more UNIT per WAD; Nomadex has lower fee (0.3% vs 0.99%).
- **Larger size (e.g. 100 WAD):** Nomadex can give better UNIT output due to deeper WAD/UNIT book; Humble’s pool shows higher impact at size.

So “which is better” depends on size and direction; no single DEX dominates all sizes.

### 4.2 WAD / VOI (WAD / wVOI)

- **Humble:** e.g. 1 WAD → ~4,045 VOI; 4,000 VOI → ~0.97 WAD (pool 47165327).
- **Nomadex:** Liquid pool 47166025 (82,931 VOI / 19.79 WAD) implies similar rates (e.g. ~4,039 VOI per 1 WAD after 0.3% fee). Some quote endpoints return the **empty** pool 47160809, giving zero; care is needed when automating.

Rates are very close; Humble is marginally better in both directions in tested quotes. Round-trips (VOI → WAD → VOI) lose to combined fees (0.3% + 0.99%) and spread.

### 4.3 WAD / aUSDC

- **Nomadex (47165570):** Very small book (~1.17 aUSDC, ~1.40 WAD). Example: 1 WAD → ~0.49 aUSDC; 1 aUSDC → ~0.64 WAD (with very high price impact, e.g. 71–85%).
- **Humble (47175110):** Deeper book. Example: 1 WAD → ~0.80 aUSDC; 1 aUSDC → ~1.22 WAD (~1% impact).

So Humble has both better liquidity and better execution for WAD/aUSDC at normal sizes.

---

## 5. Arbitrage Opportunities

### 5.1 WAD / VOI (WAD / wVOI)

- **Conclusion:** **No meaningful arbitrage** in the tested setup.
- **Reason:** Mid rates are very similar; Humble is slightly better on both “sell WAD for VOI” and “buy WAD with VOI.” Any round-trip (e.g. VOI → WAD on one DEX → VOI on the other) loses to fees and the small spread.
- **Caveat:** If Nomadex quote APIs or routing use the **liquid** pool 47166025 instead of the empty 47160809, live spreads could differ; re-check with current quotes if building automation.

### 5.2 WAD / aUSDC

- **Conclusion:** **No arbitrage opportunity** in the current setup.
- **Reason:** The “cheap” side is Nomadex’s **very thin** WAD/aUSDC pool (impact 71–85% for 1-unit trades). That makes Nomadex’s effective rate worse, not a source of profitable arb. Humble has better liquidity and better rates both ways.
- **Example round-trips:**  
  - 1 aUSDC → WAD on Nomadex → sell WAD on Humble → ~0.52 aUSDC (loss).  
  - 1 aUSDC → WAD on Humble → sell WAD on Nomadex → ~0.60 aUSDC (loss).  
  So no profitable path after fees.

### 5.3 WAD / UNIT

- **Conclusion:** No systematic **cross-DEX arbitrage** identified; instead there is a **route choice** (e.g. “Route B”: Humble for WAD→UNIT, Nomadex for UNIT→WAD) that can improve round-trip outcome at **small** size (e.g. 1 WAD) versus doing both legs on one DEX. That is routing/execution optimization, not classic two-sided arb.

---

## 6. Summary Table

| Common pair   | Liquidity (relative)     | Better rates (typical) | Arb opportunity |
|---------------|---------------------------|-------------------------|------------------|
| WAD / VOI     | Both have liquid pools    | Humble slightly         | No               |
| WAD / UNIT    | Both usable; size-dependent | Depends on size        | No (route opt. at small size) |
| WAD / aUSDC   | Humble >> Nomadex         | Humble                  | No               |

---

## 7. Data and Conventions

- **WAD:** ARC-200, contract **47138068** (6 decimals).
- **VOI:** Native; **wVOI** = 390001 (6 decimals). Treated as 1:1 with VOI for cross-DEX comparison.
- **aUSDC:** 395614 (Nomadex also references 302190 in pool id; same asset for our purposes).
- **Quotes:** 5% slippage, snapshot in time; real execution may differ.
- **Fees:** Nomadex 0.3%; Humble 0.99% (total, proto + LP).

---

*Draft — not financial advice. Verify pools, fees, and rates before trading.*

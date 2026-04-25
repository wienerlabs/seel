pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// Proves that the 6-month floor average income meets a private threshold
// without revealing the monthly amounts.
//
// Private inputs : monthly_amounts[6]  (USD integer, e.g. 5000)
//                  threshold            (2000 → Tier 1, 5000 → Tier 2)
// Public  output : tier                 (1 or 2)
template IncomeProof() {
    signal input monthly_amounts[6];
    signal input threshold;

    signal output tier;

    // ── 1. Sum ────────────────────────────────────────────────────────────────
    signal sum;
    sum <== monthly_amounts[0] + monthly_amounts[1] + monthly_amounts[2]
          + monthly_amounts[3] + monthly_amounts[4] + monthly_amounts[5];

    // ── 2. Floor average: sum = avg * 6 + rem, 0 <= rem < 6 ──────────────────
    signal avg;
    signal rem;
    avg <-- sum \ 6;
    rem <-- sum % 6;
    sum === avg * 6 + rem;

    // 0 <= rem < 6  (3-bit comparator: both operands < 2^3 = 8)
    component remLt = LessThan(3);
    remLt.in[0] <== rem;
    remLt.in[1] <== 6;
    remLt.out === 1;

    // ── 3. All months positive ────────────────────────────────────────────────
    // 20-bit comparator supports values up to 2^20 ≈ $1 048 576 / month
    component monthGt[6];
    for (var i = 0; i < 6; i++) {
        monthGt[i] = GreaterThan(20);
        monthGt[i].in[0] <== monthly_amounts[i];
        monthGt[i].in[1] <== 0;
        monthGt[i].out === 1;
    }

    // ── 4. avg >= threshold (private constraint) ──────────────────────────────
    component avgGte = GreaterEqThan(20);
    avgGte.in[0] <== avg;
    avgGte.in[1] <== threshold;
    avgGte.out === 1;

    // ── 5. avg >= 2000 (Tier 1 floor, always required) ───────────────────────
    component floorGte = GreaterEqThan(20);
    floorGte.in[0] <== avg;
    floorGte.in[1] <== 2000;
    floorGte.out === 1;

    // ── 6. threshold must be exactly 2000 or 5000 ────────────────────────────
    component isT1 = IsEqual();
    isT1.in[0] <== threshold;
    isT1.in[1] <== 2000;

    component isT2 = IsEqual();
    isT2.in[0] <== threshold;
    isT2.in[1] <== 5000;

    isT1.out + isT2.out === 1;

    // ── 7. tier output ────────────────────────────────────────────────────────
    tier <== isT1.out + 2 * isT2.out;
}

component main = IncomeProof();

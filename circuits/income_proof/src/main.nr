// SEEL Income Proof Circuit
//
// Proves that a user's 6-month average income meets a stated threshold
// without revealing the individual monthly amounts.
//
// Private inputs : monthly_amounts -- the actual income figures (never leave the browser)
//                  threshold       -- the minimum average required by the lending protocol
// Public output  : tier (u8)       -- computed income tier (1 = $2k/mo, 2 = $5k/mo)
//                  A valid proof implicitly encodes result = true.

fn main(
    monthly_amounts: [u64; 6], // private -- threshold is also private, verifier only sees tier
    threshold: u64,             // private
) -> pub u8 {                   // tier is a computed public output

    // Each month must have positive income (recurring income check)
    for i in 0..6 {
        assert(monthly_amounts[i] > 0, "Each month must have positive income");
    }

    // Sum of six months
    let total: u64 = monthly_amounts[0]
                   + monthly_amounts[1]
                   + monthly_amounts[2]
                   + monthly_amounts[3]
                   + monthly_amounts[4]
                   + monthly_amounts[5];

    // Integer average (floor division -- conservative for the prover)
    let average: u64 = total / 6;

    // 1. Average must meet the stated threshold (threshold is private)
    assert(average >= threshold, "Monthly average is below the required threshold");

    // 2. Minimum Tier 1 income required ($2000/mo)
    assert(average >= 2000, "Income does not qualify for any tier");

    // 3. Tier is a computed output, not an input
    //    Tier 2 -> $5000/mo minimum
    //    Tier 1 -> $2000/mo minimum
    if average >= 5000 { 2 } else { 1 }
}

// ---------------------------------------------------------------------------
// Unit tests (run with: nargo test)
// ---------------------------------------------------------------------------

// Tier 2 pass: average = 34500 / 6 = 5750 >= 5000
#[test]
fn test_tier2_pass() {
    let tier = main([5500, 6000, 5200, 5800, 6100, 5900], 5000);
    assert(tier == 2);
}

// Tier 1 pass: average = 12800 / 6 = 2133 >= 2000
#[test]
fn test_tier1_pass() {
    let tier = main([2100, 2200, 2000, 2300, 2150, 2050], 2000);
    assert(tier == 1);
}

// Tier 1 exact boundary: average = 12000 / 6 = 2000
#[test]
fn test_tier1_exact_boundary() {
    let tier = main([2000, 2000, 2000, 2000, 2000, 2000], 2000);
    assert(tier == 1);
}

// Tier 2 exact boundary: average = 30000 / 6 = 5000
#[test]
fn test_tier2_exact_boundary() {
    let tier = main([5000, 5000, 5000, 5000, 5000, 5000], 5000);
    assert(tier == 2);
}

// Fail: average = 6000 / 6 = 1000 < 2000 -- proof must be rejected
#[test(should_fail_with = "Monthly average is below the required threshold")]
fn test_below_threshold_fails() {
    let _ = main([1000, 1200, 800, 1100, 900, 1000], 2000);
}

// Fail: one month is zero -- recurring income check triggers
#[test(should_fail_with = "Each month must have positive income")]
fn test_zero_month_fails() {
    let _ = main([3000, 3000, 0, 3000, 3000, 3000], 2000);
}

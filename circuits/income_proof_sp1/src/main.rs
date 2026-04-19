// SEEL Income Proof — SP1 zkVM Circuit
//
// Private inputs:
//   monthly_amounts: [u64; 6]  — last 6 months of income (never revealed)
//   threshold: u64             — minimum required average ($2000 or $5000)
//
// Public output:
//   tier: u8  — 1 (≥$2k/mo) or 2 (≥$5k/mo)

#![no_main]
sp1_zkvm::entrypoint!(main);

pub fn main() {
    let monthly_amounts: [u64; 6] = sp1_zkvm::io::read();
    let threshold: u64 = sp1_zkvm::io::read();

    // Each month must have positive income (recurring income check)
    for &amount in monthly_amounts.iter() {
        assert!(amount > 0, "Each month must have positive income");
    }

    // 6-month average (floor division — conservative for the prover)
    let total: u64 = monthly_amounts.iter().sum();
    let average = total / 6;

    // Must meet the stated threshold
    assert!(average >= threshold, "Monthly average below required threshold");
    // Must qualify for at least Tier 1
    assert!(average >= 2000, "Income does not qualify for any tier");

    // Compute tier and commit as the sole public output
    let tier: u8 = if average >= 5000 { 2 } else { 1 };
    sp1_zkvm::io::commit(&tier);
}

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, program::invoke_signed, system_instruction};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::{spl_token_2022, Token2022};

declare_id!("DwiHe1VWW9KXeWXJFaRFoMNzPt3mVs2Ac84gPbaeBkoJ");

/// Attestation validity period: 30 days in seconds.
pub const ATTESTATION_DURATION: i64 = 30 * 24 * 3600;

/// Byte length of a Token-2022 Mint with NonTransferable extension.
///
/// In spl-token-2022 3.x, ALL extensible accounts (both Mint and Account) must be
/// at least Account::LEN (165 bytes) so the runtime can unambiguously locate the
/// AccountType discriminator.  The layout is:
///
///   [0..82)   PodMint base data         (82 bytes)
///   [82..165) Padding — all zeros       (83 bytes)
///   [165]     AccountType discriminator  (1 byte)
///   [166..170) NonTransferable TLV      (2-byte type + 2-byte length + 0-byte data)
///
/// Formula: Account::LEN (165) + AccountType (1) + TLV header (4) = 170
pub const SOULBOUND_MINT_LEN: usize = 170;

/// SP1 income-proof circuit verification key hash.
///
/// After compiling the SP1 circuit, run:
///   cd backend/sp1_prover && cargo run -- --print-vkey
/// and replace this constant with the printed value.
///
/// ⚠ Changing the circuit (even a whitespace edit) produces a different hash.
/// Update this constant and redeploy whenever the circuit changes.
const INCOME_PROOF_VKEY_HASH: &str =
    "0x00651178c3432c942d6113fd5ce4098a8d27f0a0721fc69bde6389a3cc2ef552";

// ---------------------------------------------------------------------------
// On-chain SP1 Groth16 verification helper
// ---------------------------------------------------------------------------

/// Verifies an SP1 Groth16 proof on-chain.
///
/// In production this calls sp1_verifier::Groth16Verifier::verify, which uses
/// Solana's native alt_bn128 BN254 precompile syscalls (~400K CU).
///
/// When compiled with --features verify-skip the check is omitted so that
/// unit tests and local anchor test runs do not need a real prover.
/// NEVER ship a production build with verify-skip enabled.
fn verify_sp1_proof(proof: &[u8], public_values: &[u8]) -> Result<()> {
    #[cfg(not(feature = "verify-skip"))]
    {
        sp1_verifier::Groth16Verifier::verify(
            proof,
            public_values,
            INCOME_PROOF_VKEY_HASH,
            &sp1_verifier::GROTH16_VK_BYTES,
        )
        .map_err(|_| error!(SeelError::InvalidProof))?;
    }
    #[cfg(feature = "verify-skip")]
    {
        // Silence unused-variable warnings in test builds.
        let _ = (proof, public_values);
    }
    Ok(())
}

#[program]
pub mod seel {
    use super::*;

    /// Verifies an SP1 Groth16 income proof on-chain and mints (or renews) an
    /// attestation token for `user`.
    ///
    /// The SP1 circuit (`circuits/income_proof_sp1`) takes monthly income amounts
    /// as private inputs and commits a single public output: `tier: u8` (1 or 2).
    /// This instruction verifies that proof on-chain before touching any state.
    ///
    /// 1. On-chain SP1 Groth16 proof verification (~400K CU via BN254 precompile).
    /// 2. Creates (or renews) the AttestationAccount PDA for `user`.
    /// 3. On first call: initialises a Token-2022 NonTransferable mint PDA and
    ///    mints one soulbound badge token to the user's associated token account.
    pub fn mint_attestation(
        ctx: Context<MintAttestation>,
        proof: Vec<u8>,          // raw Groth16 proof bytes (~256 bytes)
        public_values: Vec<u8>,  // SP1 public values: [tier: u8]
    ) -> Result<()> {
        // ── 0. On-chain ZK verification ────────────────────────────────────────
        verify_sp1_proof(&proof, &public_values)?;

        // Decode tier from public values (first and only committed byte).
        require!(!public_values.is_empty(), SeelError::InvalidPublicValues);
        let tier = public_values[0];
        require!(tier == 1 || tier == 2, SeelError::InvalidTier);

        // SHA-256 of the raw proof bytes — stored on-chain for auditability.
        let proof_hash: [u8; 32] = {
            use anchor_lang::solana_program::hash::hash;
            hash(&proof).to_bytes()
        };

        // ── 1. Update attestation PDA ──────────────────────────────────────────
        let clock = Clock::get()?;
        let att = &mut ctx.accounts.attestation;
        att.owner = ctx.accounts.user.key();
        att.issuer = ctx.accounts.authority.key();
        att.tier = tier;
        att.issued_at = clock.unix_timestamp;
        att.expires_at = clock.unix_timestamp + ATTESTATION_DURATION;
        att.proof_hash = proof_hash;
        att.bump = ctx.bumps.attestation;

        // ── 2. Token-2022 soulbound mint (first call only) ────────────────────
        let user_key = ctx.accounts.user.key();
        let mint_bump = ctx.bumps.soulbound_mint;
        let pda_seeds: &[&[u8]] = &[b"soulbound_mint", user_key.as_ref(), &[mint_bump]];

        let mint_info = ctx.accounts.soulbound_mint.to_account_info();
        let token_account_info = ctx.accounts.soulbound_token_account.to_account_info();
        let authority_info = ctx.accounts.authority.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();
        let t22_program_info = ctx.accounts.token_2022_program.to_account_info();

        // Initialise the mint once (lamports == 0 means the account does not exist yet).
        if mint_info.lamports() == 0 {
            let rent = Rent::get()?;
            let lamports = rent.minimum_balance(SOULBOUND_MINT_LEN);

            invoke_signed(
                &system_instruction::create_account(
                    authority_info.key,
                    mint_info.key,
                    lamports,
                    SOULBOUND_MINT_LEN as u64,
                    ctx.accounts.token_2022_program.key,
                ),
                &[authority_info.clone(), mint_info.clone(), system_program_info.clone()],
                &[pda_seeds],
            )?;

            // IMPORTANT: NonTransferable must be initialised BEFORE initialize_mint2.
            invoke(
                &spl_token_2022::instruction::initialize_non_transferable_mint(
                    ctx.accounts.token_2022_program.key,
                    mint_info.key,
                )?,
                &[mint_info.clone(), t22_program_info.clone()],
            )?;

            invoke(
                &spl_token_2022::instruction::initialize_mint2(
                    ctx.accounts.token_2022_program.key,
                    mint_info.key,
                    authority_info.key,
                    None,
                    0,
                )?,
                &[mint_info.clone(), t22_program_info.clone()],
            )?;
        }

        if token_account_info.lamports() == 0 {
            anchor_spl::associated_token::create(CpiContext::new(
                ctx.accounts.associated_token_program.to_account_info(),
                anchor_spl::associated_token::Create {
                    payer: authority_info.clone(),
                    associated_token: token_account_info.clone(),
                    authority: ctx.accounts.user.to_account_info(),
                    mint: mint_info.clone(),
                    system_program: system_program_info.clone(),
                    token_program: t22_program_info.clone(),
                },
            ))?;

            invoke(
                &spl_token_2022::instruction::mint_to(
                    ctx.accounts.token_2022_program.key,
                    mint_info.key,
                    token_account_info.key,
                    authority_info.key,
                    &[],
                    1,
                )?,
                &[mint_info.clone(), token_account_info.clone(), authority_info.clone()],
            )?;

            msg!("Soulbound token minted to {}", ctx.accounts.user.key());
        }

        emit!(AttestationMinted {
            owner: att.owner,
            tier,
            expires_at: att.expires_at,
        });
        msg!(
            "Attestation minted: owner={} tier={} expires={}",
            att.owner,
            tier,
            att.expires_at
        );
        Ok(())
    }

    /// Closes an expired attestation account.
    ///
    /// Anyone may call this once the account has passed its `expires_at`.
    /// Lamports are returned to the original user.
    ///
    /// NOTE: The soulbound token (Token-2022) is intentionally kept as a permanent
    /// non-transferable record.  Burn it via a separate transaction if full cleanup
    /// is needed.
    pub fn expire_attestation(ctx: Context<ExpireAttestation>) -> Result<()> {
        let clock = Clock::get()?;
        require!(
            ctx.accounts.attestation.expires_at < clock.unix_timestamp,
            SeelError::NotExpired
        );
        msg!(
            "Attestation expired: owner={}",
            ctx.accounts.attestation.owner
        );
        Ok(())
    }

    /// Forcibly revokes an attestation before its expiry.
    ///
    /// Only the original issuer (authority) may call this.
    pub fn revoke_attestation(ctx: Context<RevokeAttestation>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.attestation.issuer,
            SeelError::Unauthorized
        );
        msg!(
            "Attestation revoked: owner={}",
            ctx.accounts.attestation.owner
        );
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account contexts
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct MintAttestation<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = AttestationAccount::LEN,
        seeds = [b"attestation", user.key().as_ref()],
        bump,
    )]
    pub attestation: Account<'info, AttestationAccount>,

    /// CHECK: pubkey used as PDA seed and as the ATA authority; no data read.
    pub user: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: manually initialised with NonTransferable extension in mint_attestation.
    #[account(
        mut,
        seeds = [b"soulbound_mint", user.key().as_ref()],
        bump,
    )]
    pub soulbound_mint: UncheckedAccount<'info>,

    /// CHECK: caller must pass the ATA of (user, soulbound_mint, Token-2022).
    #[account(mut)]
    pub soulbound_token_account: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct ExpireAttestation<'info> {
    #[account(
        mut,
        close = user,
        seeds = [b"attestation", user.key().as_ref()],
        bump = attestation.bump,
        constraint = attestation.owner == user.key() @ SeelError::InvalidOwner,
    )]
    pub attestation: Account<'info, AttestationAccount>,

    /// CHECK: receives the reclaimed lamports.
    #[account(mut)]
    pub user: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct RevokeAttestation<'info> {
    #[account(
        mut,
        close = user,
        seeds = [b"attestation", user.key().as_ref()],
        bump = attestation.bump,
        constraint = attestation.owner == user.key() @ SeelError::InvalidOwner,
    )]
    pub attestation: Account<'info, AttestationAccount>,

    /// CHECK: receives the reclaimed lamports.
    #[account(mut)]
    pub user: UncheckedAccount<'info>,

    pub authority: Signer<'info>,
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

#[account]
pub struct AttestationAccount {
    pub owner: Pubkey,        // 32
    pub issuer: Pubkey,       // 32
    pub tier: u8,             // 1
    pub issued_at: i64,       // 8
    pub expires_at: i64,      // 8
    /// SHA-256 of the raw SP1 Groth16 proof bytes (for auditability).
    pub proof_hash: [u8; 32], // 32
    pub bump: u8,             // 1
}

impl AttestationAccount {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 8 + 8 + 32 + 1; // = 122
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

#[event]
pub struct AttestationMinted {
    pub owner: Pubkey,
    pub tier: u8,
    pub expires_at: i64,
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum SeelError {
    #[msg("SP1 Groth16 proof verification failed")]
    InvalidProof,

    #[msg("Public values must be non-empty")]
    InvalidPublicValues,

    #[msg("Tier must be 1 (≥$2k/mo) or 2 (≥$5k/mo)")]
    InvalidTier,

    #[msg("Attestation has not expired yet")]
    NotExpired,

    #[msg("Account owner mismatch")]
    InvalidOwner,

    #[msg("Only the original issuer may revoke this attestation")]
    Unauthorized,
}

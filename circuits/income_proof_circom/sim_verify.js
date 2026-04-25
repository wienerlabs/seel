#!/usr/bin/env node
/**
 * Simulates verify_groth16_proof() from programs/seel/src/lib.rs exactly.
 *
 * Steps:
 *  1. Decode each VK constant from lib.rs → check vs verification_key.json
 *  2. Generate a fresh tier-2 proof and locally verify with snarkjs
 *  3. Serialize proof bytes as groth16ProofToBytes() does
 *  4. Replicate every Rust operation (mul → add → negate → pairing) in JS
 *  5. Report which step diverges so we know where the bug is
 */

"use strict";

const path = require("path");
const fs   = require("fs");

const SNARKJS_PATH = path.resolve(__dirname, "../../backend/node_modules/snarkjs");
const FFJS_PATH    = path.resolve(__dirname, "../../backend/node_modules/ffjavascript");

const snarkjs = require(SNARKJS_PATH);
const { buildBn128 } = require(FFJS_PATH);

// ── Paths ─────────────────────────────────────────────────────────────────────
const WASM_PATH = path.resolve(__dirname, "../../frontend/public/circuits/income_proof.wasm");
const ZKEY_PATH = path.resolve(__dirname, "../../frontend/public/circuits/income_proof_final.zkey");
const VK_PATH   = path.resolve(__dirname, "../../frontend/public/circuits/verification_key.json");

// ── BN254 field prime ─────────────────────────────────────────────────────────
const BN254_Q = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;

// ── VK constants exactly as in programs/seel/src/lib.rs ───────────────────────
const VK_ALPHA_G1 = Buffer.from([
    0x0a, 0xda, 0x6e, 0x07, 0xca, 0x85, 0xb1, 0x81,
    0xee, 0x55, 0xc7, 0xf2, 0x9c, 0x76, 0x0a, 0x8b,
    0x72, 0x2b, 0x66, 0xba, 0xd2, 0x23, 0x2d, 0x97,
    0x9c, 0xb6, 0xe0, 0x27, 0x67, 0xcd, 0x04, 0xb8,
    0x1d, 0x08, 0xf8, 0xda, 0x77, 0x4a, 0xe0, 0x18,
    0xe2, 0x62, 0x82, 0x96, 0x39, 0xc4, 0x46, 0xe3,
    0xbf, 0x2f, 0xe2, 0x09, 0xff, 0x0b, 0x35, 0x69,
    0x64, 0xfa, 0xcc, 0x70, 0x35, 0x0a, 0x0d, 0x40,
]);

const VK_BETA_G2 = Buffer.from([
    0x24, 0x0b, 0xef, 0xb7, 0x83, 0x5e, 0x17, 0xfc,
    0x1e, 0xdf, 0x87, 0xfb, 0xd3, 0x18, 0x1b, 0xee,
    0x8a, 0xad, 0x28, 0xf8, 0x3e, 0x52, 0x76, 0x60,
    0x0c, 0x64, 0x45, 0x69, 0x25, 0x8c, 0x51, 0xd4,
    0x2c, 0x39, 0x7e, 0x34, 0x57, 0xde, 0x25, 0xb2,
    0x65, 0x4f, 0x9a, 0x9b, 0x38, 0x70, 0xe1, 0xe3,
    0x6f, 0x81, 0xf1, 0x0b, 0x3d, 0x27, 0xa5, 0x43,
    0xd9, 0x24, 0x06, 0xde, 0xa1, 0x54, 0x9d, 0x5d,
    0x25, 0xd6, 0x1e, 0x04, 0x42, 0x5e, 0x1a, 0xc1,
    0xd0, 0xa3, 0xbb, 0x37, 0x55, 0xf5, 0x12, 0xa2,
    0xcf, 0x40, 0x02, 0xdf, 0xd6, 0x37, 0x32, 0xed,
    0xbe, 0x27, 0x4b, 0x28, 0x1c, 0x21, 0x23, 0xe8,
    0x04, 0xd7, 0xf3, 0x12, 0xda, 0xe5, 0xb5, 0x4c,
    0x0b, 0x76, 0x67, 0x8a, 0xbe, 0xdb, 0xc1, 0x4a,
    0x6e, 0xcb, 0x19, 0x48, 0x43, 0x83, 0x68, 0x4d,
    0xae, 0xef, 0xc5, 0x3b, 0x9f, 0xfd, 0x65, 0xb6,
]);

const VK_GAMMA_G2 = Buffer.from([
    0x19, 0x8e, 0x93, 0x93, 0x92, 0x0d, 0x48, 0x3a,
    0x72, 0x60, 0xbf, 0xb7, 0x31, 0xfb, 0x5d, 0x25,
    0xf1, 0xaa, 0x49, 0x33, 0x35, 0xa9, 0xe7, 0x12,
    0x97, 0xe4, 0x85, 0xb7, 0xae, 0xf3, 0x12, 0xc2,
    0x18, 0x00, 0xde, 0xef, 0x12, 0x1f, 0x1e, 0x76,
    0x42, 0x6a, 0x00, 0x66, 0x5e, 0x5c, 0x44, 0x79,
    0x67, 0x43, 0x22, 0xd4, 0xf7, 0x5e, 0xda, 0xdd,
    0x46, 0xde, 0xbd, 0x5c, 0xd9, 0x92, 0xf6, 0xed,
    0x09, 0x06, 0x89, 0xd0, 0x58, 0x5f, 0xf0, 0x75,
    0xec, 0x9e, 0x99, 0xad, 0x69, 0x0c, 0x33, 0x95,
    0xbc, 0x4b, 0x31, 0x33, 0x70, 0xb3, 0x8e, 0xf3,
    0x55, 0xac, 0xda, 0xdc, 0xd1, 0x22, 0x97, 0x5b,
    0x12, 0xc8, 0x5e, 0xa5, 0xdb, 0x8c, 0x6d, 0xeb,
    0x4a, 0xab, 0x71, 0x80, 0x8d, 0xcb, 0x40, 0x8f,
    0xe3, 0xd1, 0xe7, 0x69, 0x0c, 0x43, 0xd3, 0x7b,
    0x4c, 0xe6, 0xcc, 0x01, 0x66, 0xfa, 0x7d, 0xaa,
]);

const VK_DELTA_G2 = Buffer.from([
    0x10, 0x93, 0x3c, 0x5f, 0xb6, 0x9a, 0xed, 0xf9,
    0x6f, 0x2d, 0xda, 0x55, 0x85, 0x9f, 0x2b, 0x54,
    0x25, 0xda, 0x9e, 0xf4, 0x7a, 0x07, 0x96, 0x2b,
    0xba, 0xa9, 0xf5, 0xf4, 0xd5, 0x1e, 0x6b, 0x73,
    0x29, 0xf7, 0xfc, 0xaf, 0x7c, 0x6e, 0x10, 0x48,
    0x33, 0xe1, 0xcf, 0xcb, 0xf1, 0x5c, 0x31, 0x21,
    0x7b, 0x9a, 0x6f, 0x5a, 0xf2, 0x06, 0xa8, 0xa6,
    0xe0, 0x2c, 0xf6, 0xd5, 0xe2, 0x2a, 0x9c, 0x38,
    0x0f, 0x24, 0xe6, 0xe5, 0x80, 0x6a, 0x4a, 0x70,
    0x9f, 0x8e, 0xad, 0x58, 0xc6, 0x1f, 0x69, 0xdf,
    0xcc, 0xbd, 0xaf, 0x5d, 0x60, 0xd8, 0x3d, 0xf9,
    0x72, 0x56, 0xac, 0xd9, 0x61, 0x60, 0xae, 0x56,
    0x1e, 0xe0, 0x5a, 0x0e, 0xd0, 0xe2, 0x9c, 0x20,
    0x0f, 0x58, 0x2f, 0xcb, 0x2c, 0xc5, 0x15, 0xfd,
    0x83, 0x4b, 0x77, 0x66, 0x1f, 0x17, 0x97, 0x3e,
    0x1d, 0x9c, 0x53, 0x23, 0x75, 0xc4, 0xc8, 0x77,
]);

const VK_IC0 = Buffer.from([
    0x21, 0x4a, 0x4a, 0x4e, 0xdc, 0x81, 0x8c, 0x65,
    0x92, 0xc1, 0x42, 0xeb, 0xbe, 0xe2, 0x05, 0xb0,
    0x24, 0x1e, 0x98, 0x11, 0xc1, 0x55, 0xa9, 0x06,
    0xf1, 0xcf, 0xfa, 0xab, 0x02, 0xb4, 0xa2, 0x59,
    0x21, 0x53, 0x2c, 0xad, 0xdc, 0x83, 0x16, 0xe0,
    0x5b, 0xee, 0x2b, 0x59, 0x63, 0x95, 0x9c, 0x8b,
    0x98, 0x0f, 0x15, 0xfc, 0x4b, 0xf8, 0x1a, 0x78,
    0x43, 0xc2, 0x5c, 0x2a, 0xc2, 0x63, 0xdc, 0xb9,
]);

const VK_IC1 = Buffer.from([
    0x03, 0x4b, 0xe8, 0xe8, 0x39, 0x0d, 0x7c, 0xc3,
    0x20, 0xe3, 0xac, 0x43, 0x49, 0xf2, 0xc8, 0x30,
    0x56, 0x31, 0x7c, 0xb8, 0xb7, 0xbd, 0x6a, 0x97,
    0x95, 0x55, 0x42, 0xf0, 0xd7, 0x70, 0x78, 0x04,
    0x2f, 0xde, 0x64, 0xdf, 0xc5, 0xb2, 0x1f, 0x8f,
    0xec, 0x12, 0xb4, 0x8d, 0x03, 0xdf, 0xde, 0xc1,
    0x47, 0x0f, 0xbe, 0x13, 0x0c, 0x3a, 0x4f, 0x3d,
    0xbf, 0xaf, 0x1e, 0x54, 0xfc, 0xa3, 0x59, 0xd3,
]);

// ── Byte helpers ──────────────────────────────────────────────────────────────

function bufToBigInt(buf) {
  return BigInt("0x" + buf.toString("hex"));
}

function bigIntToBuf32(n) {
  return Buffer.from(n.toString(16).padStart(64, "0"), "hex");
}

function fieldElemToBytes32(dec) {
  return bigIntToBuf32(BigInt(dec));
}

/** Negate a G1 point: (x, y) → (x, q − y), big-endian 64 bytes */
function negateG1Bytes(point) {
  const out = Buffer.alloc(64);
  point.copy(out, 0, 0, 32);
  const y = bufToBigInt(point.slice(32, 64));
  const neg_y = y === 0n ? 0n : BN254_Q - y;
  bigIntToBuf32(neg_y).copy(out, 32);
  return out;
}

/**
 * Serialize snarkjs proof → 256-byte buffer in the same order as
 * groth16ProofToBytes() in backend/src/modules/solana.ts
 */
function groth16ProofToBytes(proof) {
  const buf = Buffer.alloc(256);
  fieldElemToBytes32(proof.pi_a[0]).copy(buf, 0);
  fieldElemToBytes32(proof.pi_a[1]).copy(buf, 32);
  // pi_b G2: snarkjs stores Fp2 as [c0, c1] = [Re, Im]; EIP-197 wants [Im, Re] for each pair
  fieldElemToBytes32(proof.pi_b[0][1]).copy(buf, 64);   // x_im = c1 (EIP-197 first)
  fieldElemToBytes32(proof.pi_b[0][0]).copy(buf, 96);   // x_re = c0 (EIP-197 second)
  fieldElemToBytes32(proof.pi_b[1][1]).copy(buf, 128);  // y_im = c1 (EIP-197 first)
  fieldElemToBytes32(proof.pi_b[1][0]).copy(buf, 160);  // y_re = c0 (EIP-197 second) (swap!)
  fieldElemToBytes32(proof.pi_c[0]).copy(buf, 192);
  fieldElemToBytes32(proof.pi_c[1]).copy(buf, 224);
  return buf;
}

// ── VK sanity check against verification_key.json ────────────────────────────

function checkVkConstants(vk) {
  console.log("\n=== Step 1: VK constant sanity check ===");
  let allOk = true;

  function checkG1(name, buf, pt) {
    const x_expected = fieldElemToBytes32(pt[0]);
    const y_expected = fieldElemToBytes32(pt[1]);
    const x_got = buf.slice(0, 32);
    const y_got = buf.slice(32, 64);
    const x_ok = x_expected.equals(x_got);
    const y_ok = y_expected.equals(y_got);
    if (x_ok && y_ok) {
      console.log(`  ${name}: ✓`);
    } else {
      console.log(`  ${name}: ✗`);
      if (!x_ok) {
        console.log(`    x expected: ${x_expected.toString("hex")}`);
        console.log(`    x got:      ${x_got.toString("hex")}`);
      }
      if (!y_ok) {
        console.log(`    y expected: ${y_expected.toString("hex")}`);
        console.log(`    y got:      ${y_got.toString("hex")}`);
      }
      allOk = false;
    }
  }

  /**
   * G2 in lib.rs is stored as [x_im(32), x_re(32), y_im(32), y_re(32)] per EIP-197.
   * snarkjs JSON stores pt as Fp2 [c0, c1] = [Re, Im]:
   *   pt[0] = [Re(x), Im(x)] = [c0, c1]
   *   pt[1] = [Re(y), Im(y)] = [c0, c1]
   * EIP-197 order: Im first, Re second (for both x and y).
   */
  function checkG2(name, buf, pt) {
    const x_im_exp = fieldElemToBytes32(pt[0][1]); // Im(x) = c1 = pt[0][1]
    const x_re_exp = fieldElemToBytes32(pt[0][0]); // Re(x) = c0 = pt[0][0]
    const y_im_exp = fieldElemToBytes32(pt[1][1]); // Im(y) = c1 = pt[1][1]
    const y_re_exp = fieldElemToBytes32(pt[1][0]); // Re(y) = c0 = pt[1][0]

    const x_im_got = buf.slice(0, 32);
    const x_re_got = buf.slice(32, 64);
    const y_im_got = buf.slice(64, 96);
    const y_re_got = buf.slice(96, 128);

    const ok = x_im_exp.equals(x_im_got) && x_re_exp.equals(x_re_got) &&
               y_im_exp.equals(y_im_got) && y_re_exp.equals(y_re_got);

    if (ok) {
      console.log(`  ${name}: ✓`);
    } else {
      console.log(`  ${name}: ✗`);
      if (!x_im_exp.equals(x_im_got)) {
        console.log(`    x_im expected: ${x_im_exp.toString("hex")}`);
        console.log(`    x_im got:      ${x_im_got.toString("hex")}`);
      }
      if (!x_re_exp.equals(x_re_got)) {
        console.log(`    x_re expected: ${x_re_exp.toString("hex")}`);
        console.log(`    x_re got:      ${x_re_got.toString("hex")}`);
      }
      if (!y_im_exp.equals(y_im_got)) {
        console.log(`    y_im expected: ${y_im_exp.toString("hex")}`);
        console.log(`    y_im got:      ${y_im_got.toString("hex")}`);
      }
      if (!y_re_exp.equals(y_re_got)) {
        console.log(`    y_re expected: ${y_re_exp.toString("hex")}`);
        console.log(`    y_re got:      ${y_re_got.toString("hex")}`);
      }
      allOk = false;
    }
  }

  checkG1("VK_ALPHA_G1", VK_ALPHA_G1, vk.vk_alpha_1);
  checkG2("VK_BETA_G2",  VK_BETA_G2,  vk.vk_beta_2);
  checkG2("VK_GAMMA_G2", VK_GAMMA_G2, vk.vk_gamma_2);
  checkG2("VK_DELTA_G2", VK_DELTA_G2, vk.vk_delta_2);
  checkG1("VK_IC0",      VK_IC0,      vk.IC[0]);
  checkG1("VK_IC1",      VK_IC1,      vk.IC[1]);

  if (allOk) console.log("  All VK constants match verification_key.json ✓");
  else console.log("  ⚠ VK constant mismatch(es) found — fix lib.rs before deploying");
  return allOk;
}

// ── Rust-exact pairing simulation using ffjavascript ─────────────────────────

/**
 * Build the 768-byte input for alt_bn128_pairing exactly as Rust does.
 * Pair ordering: (A,B), (−α,β), (−vk_x,γ), (−C,δ)
 */
function buildPairingInput(proofBytes, tier) {
  const pi_a = proofBytes.slice(0, 64);
  const pi_b = proofBytes.slice(64, 192);
  const pi_c = proofBytes.slice(192, 256);

  // tier_scalar: 32 bytes big-endian, tier in last 8 bytes
  const tier_scalar = Buffer.alloc(32);
  const tierBuf = Buffer.alloc(8);
  tierBuf.writeBigUInt64BE(BigInt(tier));
  tierBuf.copy(tier_scalar, 24);

  // mul_in = IC1 (64 bytes) || tier_scalar (32 bytes)
  const mul_in = Buffer.concat([VK_IC1, tier_scalar]);

  // add_in = IC0 (64 bytes) || tier_ic (64 bytes)  [tier_ic from mul step]
  // We return the intermediate inputs so the caller can check them
  return { pi_a, pi_b, pi_c, mul_in };
}

/**
 * Implement alt_bn128_multiplication in JS (G1 scalar mult).
 * Input: 96 bytes = G1 (64) || scalar (32), all big-endian.
 * Output: 64 bytes = G1 result (uncompressed, big-endian).
 */
async function altBn128Mul(bn128, input) {
  const G1 = bn128.G1;
  const F1 = bn128.F1;

  const px = bufToBigInt(input.slice(0, 32));
  const py = bufToBigInt(input.slice(32, 64));
  const s  = bufToBigInt(input.slice(64, 96));

  // Convert to Jacobian projective coordinates
  const P = G1.fromObject([px, py]);
  const R = G1.timesScalar(P, s);
  const affine = G1.toObject(G1.toAffine(R));

  // affine is [x, y] as BigInts (or [Fp2, Fp2] for G2)
  const out = Buffer.alloc(64);
  bigIntToBuf32(affine[0]).copy(out, 0);
  bigIntToBuf32(affine[1]).copy(out, 32);
  return out;
}

/**
 * Implement alt_bn128_addition in JS (G1 point addition).
 * Input: 128 bytes = G1 (64) || G1 (64), big-endian.
 * Output: 64 bytes = G1 result.
 */
async function altBn128Add(bn128, input) {
  const G1 = bn128.G1;

  const ax = bufToBigInt(input.slice(0, 32));
  const ay = bufToBigInt(input.slice(32, 64));
  const bx = bufToBigInt(input.slice(64, 96));
  const by = bufToBigInt(input.slice(96, 128));

  const A = G1.fromObject([ax, ay]);
  const B = G1.fromObject([bx, by]);
  const R = G1.add(A, B);
  const affine = G1.toObject(G1.toAffine(R));

  const out = Buffer.alloc(64);
  bigIntToBuf32(affine[0]).copy(out, 0);
  bigIntToBuf32(affine[1]).copy(out, 32);
  return out;
}

/**
 * Decode a G2 point from 128-byte EIP-197 buffer: [x_im, x_re, y_im, y_re].
 * ffjavascript stores Fp2 as [c0, c1] = [Re, Im], so we reverse each pair.
 */
function decodeG2(bn128, buf) {
  const G2 = bn128.G2;
  // EIP-197 layout in buf: [x_im(0..32), x_re(32..64), y_im(64..96), y_re(96..128)]
  const x_im = bufToBigInt(buf.slice(0, 32));
  const x_re = bufToBigInt(buf.slice(32, 64));
  const y_im = bufToBigInt(buf.slice(64, 96));
  const y_re = bufToBigInt(buf.slice(96, 128));
  // ffjavascript fromObject expects [[c0, c1], [c0, c1]] = [[Re, Im], [Re, Im]]
  return G2.fromObject([[x_re, x_im], [y_re, y_im]]);
}

/**
 * Implement alt_bn128_pairing in JS.
 * Input: N*192 bytes (N pairs of G1[64] + G2[128]).
 * Output: 32 bytes (1 if pairing product == GT identity, 0 otherwise).
 *
 * Returns the actual 32-byte result like the Solana syscall would.
 */
async function altBn128Pairing(bn128, input) {
  const G1 = bn128.G1;

  const numPairs = input.length / 192;
  console.log(`    Pairing: ${numPairs} pairs`);

  let acc = bn128.Gt.one;

  for (let i = 0; i < numPairs; i++) {
    const g1Buf = input.slice(i * 192, i * 192 + 64);
    const g2Buf = input.slice(i * 192 + 64, i * 192 + 192);

    const px = bufToBigInt(g1Buf.slice(0, 32));
    const py = bufToBigInt(g1Buf.slice(32, 64));

    // If point is (0,0) treat as infinity (identity)
    let P;
    if (px === 0n && py === 0n) {
      P = G1.zero;
    } else {
      P = G1.fromObject([px, py]);
    }

    const Q = decodeG2(bn128, g2Buf);

    // prepareG1/prepareG2 are required before millerLoop in ffjavascript
    const prepP = bn128.prepareG1(P);
    const prepQ = bn128.prepareG2(Q);
    const mill = bn128.millerLoop(prepP, prepQ);
    acc = bn128.Gt.mul(acc, mill);
  }

  const result = bn128.finalExponentiation(acc);
  const isOne = bn128.Gt.eq(result, bn128.Gt.one);

  const out = Buffer.alloc(32);
  if (isOne) out[31] = 1;
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Seel Groth16 On-Chain Verification Simulation ===");

  // ── Load VK ──
  const vk = JSON.parse(fs.readFileSync(VK_PATH, "utf8"));

  // ── Step 1: VK sanity check ──
  const vkOk = checkVkConstants(vk);

  // ── Step 2: Generate fresh proof ──
  console.log("\n=== Step 2: Generate proof ===");
  const tier = 2;
  const inputs = {
    monthly_amounts: ["6000", "7000", "5500", "6500", "8000", "5200"],
    threshold: "5000",
  };

  console.log("  Generating proof (tier=2)...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, WASM_PATH, ZKEY_PATH);
  console.log("  Public signals:", publicSignals);

  const localOk = await snarkjs.groth16.verify(vk, publicSignals, proof);
  console.log("  snarkjs local verify:", localOk ? "PASS ✓" : "FAIL ✗");

  // ── Step 3: Serialize proof bytes ──
  console.log("\n=== Step 3: Proof serialization ===");
  const proofBytes = groth16ProofToBytes(proof);
  const tier_val = Number(publicSignals[0]);

  console.log(`  tier from publicSignals: ${tier_val}`);
  console.log(`  pi_a[0..8]:  ${proofBytes.slice(0, 8).toString("hex")}`);
  console.log(`  pi_b[0..8]:  ${proofBytes.slice(64, 72).toString("hex")}`);
  console.log(`  pi_b[64..72]: ${proofBytes.slice(128, 136).toString("hex")}`);
  console.log(`  pi_c[0..8]:  ${proofBytes.slice(192, 200).toString("hex")}`);

  // Cross-check: pi_a serialized x coordinate should match proof.pi_a[0]
  const pi_a_x_from_buf = bufToBigInt(proofBytes.slice(0, 32));
  const pi_a_x_from_proof = BigInt(proof.pi_a[0]);
  console.log(`  pi_a x check: ${pi_a_x_from_buf === pi_a_x_from_proof ? "✓" : "✗"}`);

  // Cross-check: pi_b y_im (at offset 128) should be proof.pi_b[1][1]
  const pi_b_y_im_from_buf = bufToBigInt(proofBytes.slice(128, 160));
  const pi_b_y_im_from_proof = BigInt(proof.pi_b[1][1]);
  console.log(`  pi_b y_im (offset 128) check: ${pi_b_y_im_from_buf === pi_b_y_im_from_proof ? "✓ (y_im first = EIP-197)" : "✗"}`);

  // ── Step 4: Build bn128 and simulate Rust computation ──
  console.log("\n=== Step 4: Rust computation simulation ===");
  const bn128 = await buildBn128();

  // 4a. tier * IC1
  const { mul_in } = buildPairingInput(proofBytes, tier_val);
  console.log("  Computing tier * IC1 (alt_bn128_multiplication)...");
  const tier_ic = await altBn128Mul(bn128, mul_in);
  console.log(`  tier_ic[0..4]: ${tier_ic.slice(0, 4).toString("hex")}`);

  // 4b. IC0 + tier_ic
  const add_in = Buffer.concat([VK_IC0, tier_ic]);
  console.log("  Computing IC0 + tier_ic (alt_bn128_addition)...");
  const vk_x = await altBn128Add(bn128, add_in);
  console.log(`  vk_x[0..4]: ${vk_x.slice(0, 4).toString("hex")}`);

  // 4c. Negate G1 points
  const pi_a    = proofBytes.slice(0, 64);
  const pi_b    = proofBytes.slice(64, 192);
  const pi_c    = proofBytes.slice(192, 256);
  const neg_alpha = negateG1Bytes(VK_ALPHA_G1);
  const neg_vk_x  = negateG1Bytes(vk_x);
  const neg_pi_c  = negateG1Bytes(pi_c);

  console.log(`  neg_alpha[0..4]: ${neg_alpha.slice(0, 4).toString("hex")}`);
  console.log(`  neg_vk_x[0..4]: ${neg_vk_x.slice(0, 4).toString("hex")}`);
  console.log(`  neg_pi_c[0..4]: ${neg_pi_c.slice(0, 4).toString("hex")}`);

  // 4d. Build 768-byte pairing input (exactly like Rust)
  const pairs = Buffer.alloc(768);
  pi_a.copy(pairs, 0);
  pi_b.copy(pairs, 64);
  neg_alpha.copy(pairs, 192);
  VK_BETA_G2.copy(pairs, 256);
  neg_vk_x.copy(pairs, 384);
  VK_GAMMA_G2.copy(pairs, 448);
  neg_pi_c.copy(pairs, 576);
  VK_DELTA_G2.copy(pairs, 640);

  // 4e. Pairing check
  console.log("  Computing alt_bn128_pairing (4 pairs)...");
  const result = await altBn128Pairing(bn128, pairs);
  const expected = Buffer.alloc(32);
  expected[31] = 1;
  const pairingOk = result.equals(expected);
  console.log(`  Pairing result[28..32]: ${result.slice(28).toString("hex")}`);
  console.log(`  Pairing check: ${pairingOk ? "PASS ✓" : "FAIL ✗"}`);

  // ── Step 5: Diagnosis ──
  console.log("\n=== Step 5: Diagnosis ===");
  if (!vkOk) {
    console.log("  ROOT CAUSE: VK constants in lib.rs do not match verification_key.json.");
    console.log("  Fix: re-run 'node extract_vk.js' and update lib.rs with the output.");
  } else if (!localOk) {
    console.log("  ROOT CAUSE: snarkjs could not verify the proof locally (circuit/zkey issue).");
  } else if (!pairingOk) {
    console.log("  ROOT CAUSE: VK constants are correct and proof is valid,");
    console.log("  but the pairing simulation fails. This means the EIP-197 encoding");
    console.log("  of G2 points is still wrong somewhere in lib.rs or the proof serialization.");
    console.log("\n  Checking individual pair pairings to isolate which G2 is wrong...");

    // Check each pair individually using a trivial known-good pair for comparison
    const pairNames = ["(A, B)", "(-α, β)", "(-vk_x, γ)", "(-C, δ)"];
    for (let i = 0; i < 4; i++) {
      const singlePair = pairs.slice(i * 192, (i + 1) * 192);
      // Just decode and print the G2 point for inspection
      const g2Buf = singlePair.slice(64, 192);
      const x_im = bufToBigInt(g2Buf.slice(0, 32));
      const x_re = bufToBigInt(g2Buf.slice(32, 64));
      const y_im = bufToBigInt(g2Buf.slice(64, 96));
      const y_re = bufToBigInt(g2Buf.slice(96, 128));
      console.log(`\n  Pair ${i + 1} ${pairNames[i]}:`);
      console.log(`    G2 x_im: ${x_im.toString(16).slice(0, 12)}...`);
      console.log(`    G2 x_re: ${x_re.toString(16).slice(0, 12)}...`);
      console.log(`    G2 y_im: ${y_im.toString(16).slice(0, 12)}...`);
      console.log(`    G2 y_re: ${y_re.toString(16).slice(0, 12)}...`);
    }
  } else {
    console.log("  JS simulation PASSES. If on-chain still fails, the issue is:");
    console.log("  - Stale build (anchor build not re-run / not deployed)");
    console.log("  - Old cached proof bytes being submitted");
    console.log("  - Different proof being sent than what was locally verified");
  }

  await bn128.terminate();
  console.log("\nDone.");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

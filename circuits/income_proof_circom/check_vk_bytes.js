#!/usr/bin/env node
/**
 * Reconstructs VK from the lib.rs byte constants (EIP-197 format) back into
 * snarkjs JSON format, then runs snarkjs.groth16.verify to confirm correctness.
 *
 * If snarkjs verify passes with the reconstructed VK, the lib.rs constants are
 * correctly encoded. If it fails, there's still a bug in the constants.
 */
"use strict";

const path = require("path");
const fs   = require("fs");

const SNARKJS_PATH = path.resolve(__dirname, "../../backend/node_modules/snarkjs");
const snarkjs = require(SNARKJS_PATH);

const WASM_PATH = path.resolve(__dirname, "../../frontend/public/circuits/income_proof.wasm");
const ZKEY_PATH = path.resolve(__dirname, "../../frontend/public/circuits/income_proof_final.zkey");

// ── VK constants from lib.rs (current, after x-coordinate swap fix) ──────────

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

// ── Decode helpers ────────────────────────────────────────────────────────────

function bufToDec(buf) {
  return BigInt("0x" + buf.toString("hex")).toString(10);
}

/**
 * Decode a G1 point from 64-byte big-endian buffer → snarkjs [x, y, "1"] array.
 */
function decodeG1ToSnarkjs(buf) {
  return [bufToDec(buf.slice(0, 32)), bufToDec(buf.slice(32, 64)), "1"];
}

/**
 * Decode a G2 point from 128-byte EIP-197 buffer → snarkjs [[c0,c1],[c0,c1],["1","0"]] array.
 * EIP-197 layout: [x_im(0..32), x_re(32..64), y_im(64..96), y_re(96..128)]
 * snarkjs layout: [[c0=Re, c1=Im], [c0=Re, c1=Im], [1, 0]]
 */
function decodeG2ToSnarkjs(buf) {
  const x_im = bufToDec(buf.slice(0, 32));   // c1 = Im(x)
  const x_re = bufToDec(buf.slice(32, 64));  // c0 = Re(x)
  const y_im = bufToDec(buf.slice(64, 96));  // c1 = Im(y)
  const y_re = bufToDec(buf.slice(96, 128)); // c0 = Re(y)
  return [[x_re, x_im], [y_re, y_im], ["1", "0"]];
}

/** Reconstructs a snarkjs-compatible VK from lib.rs byte constants. */
function buildVkFromBytes() {
  return {
    protocol: "groth16",
    curve: "bn128",
    nPublic: 1,
    vk_alpha_1: decodeG1ToSnarkjs(VK_ALPHA_G1),
    vk_beta_2:  decodeG2ToSnarkjs(VK_BETA_G2),
    vk_gamma_2: decodeG2ToSnarkjs(VK_GAMMA_G2),
    vk_delta_2: decodeG2ToSnarkjs(VK_DELTA_G2),
    vk_alphabeta_12: [], // not used by snarkjs groth16 verify
    IC: [
      decodeG1ToSnarkjs(VK_IC0),
      decodeG1ToSnarkjs(VK_IC1),
    ],
  };
}

/** Serialize proof pi_b as our Rust code sees it (EIP-197 format, same as solana.ts). */
function fieldElemToBytes32(dec) {
  return Buffer.from(BigInt(dec).toString(16).padStart(64, "0"), "hex");
}

function groth16ProofToBytes(proof) {
  const buf = Buffer.alloc(256);
  fieldElemToBytes32(proof.pi_a[0]).copy(buf, 0);
  fieldElemToBytes32(proof.pi_a[1]).copy(buf, 32);
  // EIP-197: [x_im=c1, x_re=c0, y_im=c1, y_re=c0]
  fieldElemToBytes32(proof.pi_b[0][1]).copy(buf, 64);   // x_im = c1
  fieldElemToBytes32(proof.pi_b[0][0]).copy(buf, 96);   // x_re = c0
  fieldElemToBytes32(proof.pi_b[1][1]).copy(buf, 128);  // y_im = c1
  fieldElemToBytes32(proof.pi_b[1][0]).copy(buf, 160);  // y_re = c0
  fieldElemToBytes32(proof.pi_c[0]).copy(buf, 192);
  fieldElemToBytes32(proof.pi_c[1]).copy(buf, 224);
  return buf;
}

/** Decode proof bytes (EIP-197 format) back into snarkjs proof JSON. */
function decodeProofBytesToSnarkjs(buf) {
  const pi_a_x = BigInt("0x" + buf.slice(0, 32).toString("hex")).toString(10);
  const pi_a_y = BigInt("0x" + buf.slice(32, 64).toString("hex")).toString(10);
  // EIP-197 pi_b: [x_im(64..96), x_re(96..128), y_im(128..160), y_re(160..192)]
  const pi_b_x_im = BigInt("0x" + buf.slice(64, 96).toString("hex")).toString(10);
  const pi_b_x_re = BigInt("0x" + buf.slice(96, 128).toString("hex")).toString(10);
  const pi_b_y_im = BigInt("0x" + buf.slice(128, 160).toString("hex")).toString(10);
  const pi_b_y_re = BigInt("0x" + buf.slice(160, 192).toString("hex")).toString(10);
  const pi_c_x = BigInt("0x" + buf.slice(192, 224).toString("hex")).toString(10);
  const pi_c_y = BigInt("0x" + buf.slice(224, 256).toString("hex")).toString(10);

  return {
    pi_a: [pi_a_x, pi_a_y, "1"],
    // snarkjs pi_b: [[c0=Re, c1=Im], [c0=Re, c1=Im], [1, 0]]
    // from EIP-197: c1(x_im)=buf[64..96], c0(x_re)=buf[96..128]
    pi_b: [[pi_b_x_re, pi_b_x_im], [pi_b_y_re, pi_b_y_im], ["1", "0"]],
    pi_c: [pi_c_x, pi_c_y, "1"],
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Verify lib.rs VK constants via snarkjs.groth16.verify ===\n");

  // 1. Generate fresh proof
  console.log("Generating proof (tier=2)...");
  const inputs = {
    monthly_amounts: ["6000", "7000", "5500", "6500", "8000", "5200"],
    threshold: "5000",
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, WASM_PATH, ZKEY_PATH);
  console.log("Public signals:", publicSignals);

  // 2. Verify with the ORIGINAL VK from verification_key.json
  const origVk = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "../../frontend/public/circuits/verification_key.json"), "utf8"
  ));
  const origOk = await snarkjs.groth16.verify(origVk, publicSignals, proof);
  console.log("Original VK verify (should pass):", origOk ? "PASS ✓" : "FAIL ✗");

  // 3. Build VK from lib.rs byte constants and verify with same proof
  console.log("\nBuilding VK from lib.rs byte constants...");
  const vkFromBytes = buildVkFromBytes();
  const vkFromBytesOk = await snarkjs.groth16.verify(vkFromBytes, publicSignals, proof);
  console.log("lib.rs VK verify:", vkFromBytesOk ? "PASS ✓ — lib.rs constants are correct!" : "FAIL ✗ — lib.rs constants are WRONG");

  if (!vkFromBytesOk) {
    // Compare values side by side
    console.log("\nComparison (original vs decoded from lib.rs bytes):");
    console.log("vk_alpha_1[0]:");
    console.log("  orig:", origVk.vk_alpha_1[0]);
    console.log("  ours:", vkFromBytes.vk_alpha_1[0]);
    console.log("vk_beta_2[0][0] (Re(x)):");
    console.log("  orig:", origVk.vk_beta_2[0][0]);
    console.log("  ours:", vkFromBytes.vk_beta_2[0][0]);
    console.log("vk_beta_2[0][1] (Im(x)):");
    console.log("  orig:", origVk.vk_beta_2[0][1]);
    console.log("  ours:", vkFromBytes.vk_beta_2[0][1]);
    console.log("vk_gamma_2[0][0] (Re(x)):");
    console.log("  orig:", origVk.vk_gamma_2[0][0]);
    console.log("  ours:", vkFromBytes.vk_gamma_2[0][0]);
    console.log("vk_gamma_2[0][1] (Im(x)):");
    console.log("  orig:", origVk.vk_gamma_2[0][1]);
    console.log("  ours:", vkFromBytes.vk_gamma_2[0][1]);
    return;
  }

  // 4. Now serialize the proof to bytes and decode back → verify again
  console.log("\nSerializing proof to EIP-197 bytes and decoding back...");
  const proofBytes = groth16ProofToBytes(proof);
  console.log("pi_b[0..8]:", proofBytes.slice(64, 72).toString("hex"), "(x_im first)");

  const decodedProof = decodeProofBytesToSnarkjs(proofBytes);

  // Check that decoded proof == original proof
  const proofMatch =
    decodedProof.pi_a[0] === proof.pi_a[0] &&
    decodedProof.pi_b[0][0] === proof.pi_b[0][0] &&
    decodedProof.pi_b[0][1] === proof.pi_b[0][1] &&
    decodedProof.pi_b[1][0] === proof.pi_b[1][0] &&
    decodedProof.pi_b[1][1] === proof.pi_b[1][1];
  console.log("Proof round-trip match:", proofMatch ? "✓" : "✗");
  if (!proofMatch) {
    console.log("  original pi_b[0][0]:", proof.pi_b[0][0].toString().slice(0, 20));
    console.log("  decoded  pi_b[0][0]:", decodedProof.pi_b[0][0].toString().slice(0, 20));
    console.log("  original pi_b[0][1]:", proof.pi_b[0][1].toString().slice(0, 20));
    console.log("  decoded  pi_b[0][1]:", decodedProof.pi_b[0][1].toString().slice(0, 20));
  }

  const proofBytesVerifyOk = await snarkjs.groth16.verify(origVk, publicSignals, decodedProof);
  console.log("Proof decoded from bytes verifies with orig VK:", proofBytesVerifyOk ? "PASS ✓" : "FAIL ✗");

  console.log("\n=== RESULT ===");
  if (vkFromBytesOk && proofBytesVerifyOk) {
    console.log("✓ All checks pass. lib.rs constants and serialization are CORRECT.");
    console.log("  Next step: anchor build && anchor deploy --provider.cluster devnet");
  } else {
    console.log("✗ Something is still wrong — see details above.");
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

#!/usr/bin/env node
// Reads verification_key.json (produced by snarkjs) and prints Rust [u8; N]
// constant definitions ready to paste into programs/seel/src/lib.rs.
//
// Usage:  node extract_vk.js

const fs = require("fs");
const vk = JSON.parse(fs.readFileSync("verification_key.json", "utf8"));

function toBytes32(dec) {
  const hex = BigInt(dec).toString(16).padStart(64, "0");
  const bytes = [];
  for (let i = 0; i < 64; i += 2) bytes.push("0x" + hex.slice(i, i + 2));
  return bytes;
}

function g1Bytes(pt) {
  return [...toBytes32(pt[0]), ...toBytes32(pt[1])];
}

function g2Bytes(pt) {
  // snarkjs stores Fp2 as [c0, c1] = [Re, Im] for both x and y:
  //   pt[0] = [x_c0, x_c1] = [Re(x), Im(x)]
  //   pt[1] = [y_c0, y_c1] = [Re(y), Im(y)]
  // EIP-197 / Solana alt_bn128_pairing expects [Im, Re] for each Fp2 pair:
  //   [x_im, x_re, y_im, y_re] = [pt[0][1], pt[0][0], pt[1][1], pt[1][0]]
  // Both x AND y need swapping (c1/Im first, c0/Re second).
  return [
    ...toBytes32(pt[0][1]),  // x_im = c1 (EIP-197 first)  ← swap
    ...toBytes32(pt[0][0]),  // x_re = c0 (EIP-197 second) ← swap
    ...toBytes32(pt[1][1]),  // y_im = c1 (EIP-197 first)
    ...toBytes32(pt[1][0]),  // y_re = c0 (EIP-197 second)
  ];
}

function rustConst(name, bytes, perLine = 8) {
  const rows = [];
  for (let i = 0; i < bytes.length; i += perLine) {
    rows.push("    " + bytes.slice(i, i + perLine).join(", ") + ",");
  }
  return `const ${name}: [u8; ${bytes.length}] = [\n${rows.join("\n")}\n];`;
}

console.log("// ── Paste these into programs/seel/src/lib.rs ──────────────────────────");
console.log(rustConst("VK_ALPHA_G1", g1Bytes(vk.vk_alpha_1)));
console.log(rustConst("VK_BETA_G2",  g2Bytes(vk.vk_beta_2)));
console.log(rustConst("VK_GAMMA_G2", g2Bytes(vk.vk_gamma_2)));
console.log(rustConst("VK_DELTA_G2", g2Bytes(vk.vk_delta_2)));
console.log(rustConst("VK_IC0", g1Bytes(vk.IC[0])));
console.log(rustConst("VK_IC1", g1Bytes(vk.IC[1])));

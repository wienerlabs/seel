// Generate UltraPlonk proof and Solidity verifier for income_proof circuit
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const BB_CJS = '../../backend/node_modules/@noir-lang/backend_barretenberg/node_modules/@aztec/bb.js/dest/node-cjs/index.js';
const SERIALIZE = '../../backend/node_modules/@noir-lang/backend_barretenberg/lib/cjs/serialize.js';
const FFLATE = '../../backend/node_modules/fflate/lib/node.cjs';

const { UltraPlonkBackend } = require(BB_CJS);
const { acirToUint8Array } = require(SERIALIZE);
const { decompressSync } = require(FFLATE);

const circuit = JSON.parse(readFileSync('target/income_proof.json', 'utf8'));
const acirBytes = acirToUint8Array(circuit.bytecode);

console.log('Initializing UltraPlonkBackend...');
const backend = new UltraPlonkBackend(acirBytes, { threads: 4 });

// Instantiate and initialize proving key
await backend.instantiate();
console.log('Backend ready. Circuit size:', backend.api && 'OK');

// Load and decompress witness
const compressedWitness = readFileSync('target/income_proof.gz');
const witness = decompressSync(compressedWitness);
console.log('Witness bytes (uncompressed):', witness.length);

// Generate proof
console.log('Generating proof...');
const proofWithPublicInputs = await backend.api.acirCreateProof(
  backend.acirComposer,
  acirBytes,
  witness
);

const NUM_PROOF_BYTES = 2144;
const splitIndex = proofWithPublicInputs.length - NUM_PROOF_BYTES;
const publicInputsBytes = proofWithPublicInputs.slice(0, splitIndex);
const proofBytes = proofWithPublicInputs.slice(splitIndex);

console.log('Full proof+PI length:', proofWithPublicInputs.length);
console.log('Public inputs length:', publicInputsBytes.length, '(', publicInputsBytes.length / 32, 'fields)');
console.log('Proof length:', proofBytes.length);
console.log('Tier (public input):', '0x' + Buffer.from(publicInputsBytes).toString('hex').slice(-2));

writeFileSync('target/proof.bin', proofBytes);
writeFileSync('target/proof.hex', Buffer.from(proofBytes).toString('hex'));
console.log('Proof written to target/proof.bin and target/proof.hex');

// Initialize VK and get it
console.log('\nInitializing verification key...');
await backend.api.acirInitVerificationKey(backend.acirComposer);

const vk = await backend.api.acirGetVerificationKey(backend.acirComposer);
console.log('VK length:', vk.length, 'bytes');
writeFileSync('target/vk_node.bin', vk);

// Get Solidity verifier
console.log('\nGetting Solidity verifier...');
const contract = await backend.api.acirGetSolidityVerifier(backend.acirComposer);
writeFileSync('target/Verifier.sol', contract);
console.log('Solidity verifier written to target/Verifier.sol');
console.log('Lines:', contract.split('\n').length);

// Verify the proof to confirm it's correct
console.log('\nVerifying proof...');
const ok = await backend.api.acirVerifyProof(backend.acirComposer, proofWithPublicInputs);
console.log('Proof valid:', ok);

await backend.destroy();
console.log('\nDone!');

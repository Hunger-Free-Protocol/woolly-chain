/**
 * Woolly Farm Node — Test Suite
 *
 * Hand-rolled assertion runner (same style as woolly-chain/src/test.ts).
 * No external test framework. Run with: npm test
 *
 * IMPORTANT: this file sets WOOLLY_DATA_DIR + WOOLLY_SIMULATE + WOOLLY_CHAIN_URL
 * BEFORE loading any farm-node module, so the real data/identity.json is never
 * touched and the chain client is pointed at a guaranteed-unreachable URL.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Test environment setup (must happen before any farm-node import) ──
const TEST_DATA_DIR = path.join(os.tmpdir(), `woolly-farm-node-test-${process.pid}-${Date.now()}`);
process.env.WOOLLY_DATA_DIR = TEST_DATA_DIR;
process.env.WOOLLY_SIMULATE = 'true';
process.env.WOOLLY_FARM_ID = 'FARM-TEST-001';
process.env.WOOLLY_CHAIN_URL = 'http://127.0.0.1:1';  // guaranteed-unreachable

// Cleanup on any exit path
const cleanup = () => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    try { fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
  }
};
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

// ── Hand-rolled assertion helpers ─────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

const pass = (msg: string) => {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
  passed++;
};
const fail = (msg: string) => {
  console.log(`  \x1b[31m✗\x1b[0m FAIL: ${msg}`);
  failures.push(msg);
  failed++;
};
const assert = (cond: boolean, msg: string) => cond ? pass(msg) : fail(msg);
const assertEq = (actual: unknown, expected: unknown, msg: string) =>
  assert(actual === expected, `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
const assertInRange = (val: number, lo: number, hi: number, label: string) =>
  assert(val >= lo && val <= hi, `${label} in [${lo}, ${hi}] (got ${val})`);

const banner = (title: string) => {
  console.log('');
  console.log(`\x1b[2m─── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}\x1b[0m`);
};

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(`\n\x1b[1mWoolly Farm Node — Test Suite\x1b[0m`);
  console.log(`Temp data dir: ${TEST_DATA_DIR}\n`);

  // Dynamic imports so CONFIG picks up our env vars
  const { loadOrCreateIdentity, signTelemetry, verifySignature } = await import('./identity');
  const { readSensors } = await import('./sensors');
  const { TelemetryManager } = await import('./telemetry');
  const { ChainClient } = await import('./chain-client');

  // ── Stanza 1: Identity roundtrip ────────────────────────────────
  banner('Stanza 1 — Identity roundtrip');
  {
    const id1 = loadOrCreateIdentity();
    assert(typeof id1.address === 'string' && id1.address.startsWith('woolly_'), 'address has woolly_ prefix');
    assert(id1.privateKey.includes('BEGIN PRIVATE KEY'), 'privateKey is PEM-formatted (PKCS8)');
    assert(id1.publicKey.includes('BEGIN PUBLIC KEY'), 'publicKey is PEM-formatted (SPKI)');
    assert(id1.farmId === 'FARM-TEST-001', 'farmId came from env override');
    assert(fs.existsSync(path.join(TEST_DATA_DIR, 'identity.json')), 'identity.json persisted to TEST_DATA_DIR');

    const id2 = loadOrCreateIdentity();
    assertEq(id2.address, id1.address, 'subsequent load returns the same identity');
    assertEq(id2.privateKey, id1.privateKey, 'private key matches across loads');

    const payload = 'woolly-test-payload-' + Date.now();
    const sig = signTelemetry(payload, id1.privateKey);
    assert(typeof sig === 'string' && sig.length > 0, 'signTelemetry returns a non-empty hex signature');
    assert(verifySignature(payload, sig, id1.publicKey), 'verifySignature accepts a valid signature');
    assert(!verifySignature(payload + 'tampered', sig, id1.publicKey), 'verifySignature rejects a tampered payload');
  }

  // ── Stanza 2: Simulation sensor read ────────────────────────────
  banner('Stanza 2 — Simulation sensor read');
  {
    const r = readSensors();
    assert(typeof r.timestamp === 'number' && r.timestamp > 0, 'timestamp present and positive');
    assertEq(r.farmId, 'FARM-TEST-001', 'farmId matches env override');
    assertInRange(r.soilPH, 3.0, 10.0, 'soilPH');
    assertInRange(r.soilEC, 0, 5, 'soilEC');
    assertInRange(r.airTemp, -10, 60, 'airTemp');
    assertInRange(r.humidity, 0, 100, 'humidity');
    assertInRange(r.soilMoisture, 0, 1, 'soilMoisture');
    assertInRange(r.ndviScore, 0, 1, 'ndviScore');
    assert(r.lightIntensity >= 0, 'lightIntensity non-negative');
    assert(r.waterUsageLiters >= 0, 'waterUsageLiters non-negative');
    assert(r.co2Level >= 0, 'co2Level non-negative');
  }

  // ── Stanza 3: Telemetry batch seal + signature verify ──────────
  banner('Stanza 3 — Batch seal + signature verify');
  {
    const id = loadOrCreateIdentity();
    const tm = new TelemetryManager(id.address, id.privateKey);

    // Add 3 simulation readings
    for (let i = 0; i < 3; i++) {
      tm.addReading(readSensors());
    }

    const batch = tm.sealBatch();
    assert(batch !== null, 'sealBatch returns a batch (not null)');
    if (!batch) return;
    assertEq(batch.farmId, 'FARM-TEST-001', 'batch.farmId set');
    assertEq(batch.nodeAddress, id.address, 'batch.nodeAddress matches identity');
    assertEq(batch.readings.length, 3, 'batch contains all 3 readings');
    assertEq(batch.aggregated.readingCount, 3, 'aggregated.readingCount == 3');
    assert(typeof batch.signature === 'string' && batch.signature.length > 0, 'batch.signature is non-empty');

    // Reconstruct the canonical payload exactly as sealBatch did
    const canonical = JSON.stringify({
      farmId: batch.farmId,
      nodeAddress: batch.nodeAddress,
      aggregated: batch.aggregated,
      readingCount: batch.readings.length,
    });
    assert(verifySignature(canonical, batch.signature, id.publicKey),
      'signature verifies against canonical payload + node public key');

    // Negative case: tampered aggregated value should fail
    const tampered = JSON.stringify({
      farmId: batch.farmId,
      nodeAddress: batch.nodeAddress,
      aggregated: { ...batch.aggregated, avgSoilPH: 99 },
      readingCount: batch.readings.length,
    });
    assert(!verifySignature(tampered, batch.signature, id.publicKey),
      'verifySignature rejects a tampered batch payload');

    // sealBatch with no readings returns null
    const empty = tm.sealBatch();
    assertEq(empty, null, 'sealBatch returns null when no readings pending');
  }

  // ── Stanza 4: Buffer persistence across instances ───────────────
  banner('Stanza 4 — Buffer persistence');
  {
    const id = loadOrCreateIdentity();
    const bufferFile = path.join(TEST_DATA_DIR, 'telemetry_buffer.json');

    // Clean any prior buffer from previous stanzas
    if (fs.existsSync(bufferFile)) fs.unlinkSync(bufferFile);

    const tm1 = new TelemetryManager(id.address, id.privateKey);
    tm1.addReading(readSensors());
    tm1.addReading(readSensors());
    const sealed = tm1.sealBatch();
    assert(sealed !== null, 'tm1 sealed a batch');
    if (!sealed) return;
    assert(fs.existsSync(bufferFile), 'telemetry_buffer.json was written to TEST_DATA_DIR');
    assertEq(tm1.getPendingBatches().length, 1, 'tm1 has 1 pending batch');

    // Fresh instance loads the persisted buffer
    const tm2 = new TelemetryManager(id.address, id.privateKey);
    const pending = tm2.getPendingBatches();
    assertEq(pending.length, 1, 'fresh TelemetryManager loaded 1 pending batch from disk');
    assertEq(pending[0].id, sealed.id, 'loaded batch.id matches the persisted one');
    assertEq(pending[0].aggregated.readingCount, 2, 'loaded batch aggregated.readingCount == 2');
  }

  // ── Stanza 5: ChainClient offline behavior ──────────────────────
  banner('Stanza 5 — ChainClient offline');
  {
    const chain = new ChainClient();
    const reachable = await chain.ping();
    assertEq(reachable, false, 'ping() against 127.0.0.1:1 returns false (does not throw)');

    // submitTelemetry against unreachable URL should return false without throwing
    const id = loadOrCreateIdentity();
    const tm = new TelemetryManager(id.address, id.privateKey);
    tm.addReading(readSensors());
    const batch = tm.sealBatch();
    if (!batch) {
      fail('could not seal a batch for offline submit test');
      return;
    }
    const submitted = await chain.submitTelemetry(batch);
    assertEq(submitted, false, 'submitTelemetry against unreachable URL returns false (does not throw)');
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log('');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('');
    console.log('  Failures:');
    for (const f of failures) console.log(`    • ${f}`);
  }
  console.log('══════════════════════════════════════════════════');
  console.log('');

  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('\nTEST RUNNER CRASHED:');
  console.error(err);
  process.exit(2);
});

/**
 * Woolly Farm Node — Main Entry Point
 *
 * Runs the sensor-to-chain pipeline:
 *   1. Boot → load identity (or generate new)
 *   2. Connect to uFarms board via serial
 *   3. Register as validator on Woolly Chain
 *   4. Loop: read sensors → batch → sign → submit to chain
 *   5. Periodically print PoN score status
 *
 * Run with:
 *   npm run dev              (real sensors)
 *   npm run sim              (simulated sensors for testing)
 *   WOOLLY_CHAIN_URL=http://YOUR_VM_IP:3000 npm run dev
 */

import { CONFIG } from './config';
import { loadOrCreateIdentity } from './identity';
import { initSerial, readSensors } from './sensors';
import { TelemetryManager } from './telemetry';
import { ChainClient } from './chain-client';
import {
  printBanner,
  printNodeInfo,
  printReading,
  printSubmissionResult,
  printValidatorStatus,
  printStats,
} from './display';

async function main() {
  printBanner();

  // ── 1. Load or create node identity ────────────────────────
  const identity = loadOrCreateIdentity();
  printNodeInfo({
    address: identity.address,
    farmId: identity.farmId,
    chainUrl: CONFIG.chainUrl,
    simulate: CONFIG.simulate,
    serialPort: CONFIG.serialPort,
    location: { lat: CONFIG.latitude, lng: CONFIG.longitude },
  });

  // ── 2. Initialize sensor connection ────────────────────────
  await initSerial();

  // ── 3. Initialize chain client and telemetry manager ───────
  const chain = new ChainClient();
  const telemetry = new TelemetryManager(identity.address, identity.privateKey);

  // Check chain connectivity
  const chainUp = await chain.ping();
  if (chainUp) {
    console.log(`  \x1b[32m✓\x1b[0m Connected to Woolly Chain`);

    // Create account on chain
    await chain.createAccount();

    // Register as validator
    try {
      await chain.registerValidator(identity.address, CONFIG.farmId, {
        lat: CONFIG.latitude,
        lng: CONFIG.longitude,
      });
    } catch (err: any) {
      console.warn(`  \x1b[33m!\x1b[0m Validator registration: ${err.message}`);
    }

    // Show initial validator status
    const validatorInfo = await chain.getValidatorInfo(identity.address);
    printValidatorStatus(validatorInfo);
  } else {
    console.log(`  \x1b[33m!\x1b[0m Chain not reachable at ${CONFIG.chainUrl}`);
    console.log(`  \x1b[33m!\x1b[0m Will buffer telemetry locally and retry`);
  }

  console.log('  \x1b[2m─── Starting Sensor Loop ────────────────\x1b[0m');
  console.log('');

  // ── 4. Sensor polling loop ─────────────────────────────────
  const sensorLoop = setInterval(() => {
    const reading = readSensors();
    printReading(reading);
    telemetry.addReading(reading);
  }, CONFIG.sensorPollIntervalMs);

  // ── 5. Telemetry submission loop (per-batch exponential backoff) ─
  // Per docs/change-requests/farm-node-submission-backoff.md.
  // Each batch carries its own attempts + nextRetryAt. We seal any
  // pending readings, then try every batch whose backoff has expired.
  // Success on any batch resets all OTHER batches' nextRetryAt to now
  // (chain is back up → don't wait through stale backoffs).
  const submitLoop = setInterval(async () => {
    // Seal current readings (sealBatch initializes attempts=0, nextRetryAt=now)
    telemetry.sealBatch();

    // Try every batch eligible for an attempt right now
    const eligible = telemetry.getEligibleBatches();
    for (const batch of eligible) {
      const success = await chain.submitTelemetry(batch);
      printSubmissionResult(success, batch.id);
      if (success) {
        // markSubmitted also resets nextRetryAt on every OTHER batch — chain is up
        telemetry.markSubmitted(batch.id);
      } else {
        // Increment attempts + compute next backoff with ±10% jitter
        telemetry.markFailed(batch.id);
      }
    }

    printStats(telemetry.getStats());
  }, CONFIG.telemetrySubmitIntervalMs);

  // ── 6. Periodic status check ───────────────────────────────
  const statusLoop = setInterval(async () => {
    try {
      const validatorInfo = await chain.getValidatorInfo(identity.address);
      if (validatorInfo) {
        console.log('');
        printValidatorStatus(validatorInfo);
      }
    } catch {
      // chain might be down — that's ok
    }
  }, 5 * 60 * 1000);  // every 5 minutes

  // ── Graceful shutdown ──────────────────────────────────────
  const shutdown = () => {
    console.log('\n  Shutting down farm node...');
    clearInterval(sensorLoop);
    clearInterval(submitLoop);
    clearInterval(statusLoop);

    // Seal any remaining readings
    telemetry.sealBatch();
    const stats = telemetry.getStats();
    console.log(`  Buffered ${stats.pendingBatches} batches to disk`);
    console.log('  Goodbye! 🌱\n');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive
  console.log(`  Polling sensors every ${CONFIG.sensorPollIntervalMs / 1000}s`);
  console.log(`  Submitting telemetry every ${CONFIG.telemetrySubmitIntervalMs / 1000}s`);
  console.log('  Press Ctrl+C to stop\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

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

  // ── 5. Telemetry submission loop ───────────────────────────
  const submitLoop = setInterval(async () => {
    // Seal current readings into a signed batch
    const batch = telemetry.sealBatch();
    if (!batch) return;

    // Try to submit to chain
    const success = await chain.submitTelemetry(batch);
    printSubmissionResult(success, batch.id);

    if (success) {
      telemetry.markSubmitted(batch.id);
    }

    // Retry any previously failed batches
    const pending = telemetry.getPendingBatches();
    for (const old of pending) {
      if (old.id === batch.id) continue;  // skip the one we just tried
      const retryOk = await chain.submitTelemetry(old);
      if (retryOk) {
        telemetry.markSubmitted(old.id);
        console.log(`  \x1b[32m✓\x1b[0m Retried batch ${old.id.slice(0, 8)} — submitted`);
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

/**
 * Terminal Display
 *
 * Pretty-prints the farm node status to the Pi's terminal.
 * Useful for demo / monitoring without needing a web UI.
 */

import { SensorReading } from './sensors';

export function printBanner(): void {
  console.log('');
  console.log('  \x1b[32m╔══════════════════════════════════════════╗\x1b[0m');
  console.log('  \x1b[32m║\x1b[0m   \x1b[1m🌱 WOOLLY FARM NODE — Prototype v0.1\x1b[0m   \x1b[32m║\x1b[0m');
  console.log('  \x1b[32m║\x1b[0m      Proof of Nourishment Validator      \x1b[32m║\x1b[0m');
  console.log('  \x1b[32m╚══════════════════════════════════════════╝\x1b[0m');
  console.log('');
}

export function printNodeInfo(info: {
  address: string;
  farmId: string;
  chainUrl: string;
  simulate: boolean;
  serialPort: string;
  location: { lat: number; lng: number };
}): void {
  console.log('  \x1b[2m─── Node Identity ───────────────────────\x1b[0m');
  console.log(`  Address:  \x1b[36m${info.address}\x1b[0m`);
  console.log(`  Farm ID:  \x1b[33m${info.farmId}\x1b[0m`);
  console.log(`  Location: ${info.location.lat.toFixed(4)}, ${info.location.lng.toFixed(4)}`);
  console.log(`  Chain:    ${info.chainUrl}`);
  console.log(`  Sensors:  ${info.simulate ? '\x1b[33mSIMULATED\x1b[0m' : `Serial @ ${info.serialPort}`}`);
  console.log('');
}

export function printReading(reading: SensorReading): void {
  const time = new Date(reading.timestamp * 1000).toLocaleTimeString();
  console.log(
    `  \x1b[2m${time}\x1b[0m  ` +
    `pH:\x1b[32m${reading.soilPH.toFixed(1)}\x1b[0m  ` +
    `EC:\x1b[32m${reading.soilEC.toFixed(2)}\x1b[0m  ` +
    `T:\x1b[32m${reading.airTemp.toFixed(1)}\x1b[0m°C  ` +
    `H:\x1b[32m${reading.humidity.toFixed(0)}\x1b[0m%  ` +
    `💧${reading.waterUsageLiters.toFixed(1)}L  ` +
    `CO₂:${reading.co2Level.toFixed(0)}ppm`
  );
}

export function printSubmissionResult(success: boolean, batchId: string): void {
  if (success) {
    console.log(`  \x1b[32m✓\x1b[0m Batch \x1b[36m${batchId.slice(0, 8)}\x1b[0m submitted to chain`);
  } else {
    console.log(`  \x1b[31m✗\x1b[0m Batch \x1b[36m${batchId.slice(0, 8)}\x1b[0m failed — buffered locally`);
  }
}

export function printValidatorStatus(info: any): void {
  if (!info) {
    console.log('  \x1b[33mValidator not yet registered on chain\x1b[0m');
    return;
  }
  console.log('  \x1b[2m─── PoN Validator Status ────────────────\x1b[0m');
  console.log(`  Active:         ${info.isActive ? '\x1b[32mYES\x1b[0m' : '\x1b[33mPENDING\x1b[0m'}`);
  console.log(`  Crop Cycles:    ${info.cropCycles || 0}`);
  console.log(`  PoN Weight:     \x1b[32m${(info.ponWeight || 0).toFixed(4)}\x1b[0m`);
  console.log(`    Productivity: ${(info.productivityScore || 0).toFixed(4)} (×0.25)`);
  console.log(`    Sustain.:     ${(info.sustainabilityScore || 0).toFixed(4)} (×0.40)`);
  console.log(`    Commitment:   ${(info.commitmentScore || 0).toFixed(4)} (×0.35)`);
  console.log(`  Telemetry Pts:  ${info.telemetryHistory?.length || 0}`);
  console.log('');
}

export function printStats(stats: { currentReadings: number; pendingBatches: number; totalSubmitted: number }): void {
  console.log(
    `  \x1b[2m[stats]\x1b[0m readings: ${stats.currentReadings} | ` +
    `pending: ${stats.pendingBatches} | ` +
    `submitted: ${stats.totalSubmitted}`
  );
}

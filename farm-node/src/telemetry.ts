/**
 * Telemetry Manager
 *
 * Collects sensor readings into batches, signs them, buffers locally,
 * and submits to the Woolly Chain. Handles offline buffering gracefully.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SensorReading } from './sensors';
import { signTelemetry } from './identity';
import { CONFIG } from './config';

export interface TelemetryBatch {
  id: string;
  farmId: string;
  nodeAddress: string;
  readings: SensorReading[];
  aggregated: AggregatedTelemetry;
  signature: string;
  submittedAt?: number;
}

export interface AggregatedTelemetry {
  periodStart: number;
  periodEnd: number;
  readingCount: number;
  avgSoilMoisture: number;
  avgSoilPH: number;
  avgSoilEC: number;
  avgAirTemp: number;
  avgHumidity: number;
  avgLightIntensity: number;
  totalWaterUsageLiters: number;
  avgCo2Level: number;
  avgNdviScore: number;
}

const BUFFER_FILE = path.join(CONFIG.dataDir, 'telemetry_buffer.json');

/**
 * TelemetryManager collects readings and batches them for chain submission.
 */
export class TelemetryManager {
  private readings: SensorReading[] = [];
  private pendingBatches: TelemetryBatch[] = [];
  private nodeAddress: string;
  private privateKey: string;
  private submittedCount = 0;

  constructor(nodeAddress: string, privateKey: string) {
    this.nodeAddress = nodeAddress;
    this.privateKey = privateKey;
    this.loadBuffer();
  }

  /**
   * Add a new sensor reading to the current batch
   */
  addReading(reading: SensorReading): void {
    this.readings.push(reading);
    console.log(
      `[telemetry] Reading #${this.readings.length} | ` +
      `pH:${reading.soilPH.toFixed(1)} EC:${reading.soilEC.toFixed(2)} ` +
      `T:${reading.airTemp.toFixed(1)}C H:${reading.humidity.toFixed(0)}% ` +
      `Water:${reading.waterUsageLiters.toFixed(1)}L`
    );
  }

  /**
   * Seal current readings into a signed batch ready for submission.
   * Returns null if no readings to batch.
   */
  sealBatch(): TelemetryBatch | null {
    if (this.readings.length === 0) return null;

    const aggregated = this.aggregate(this.readings);
    const batchData = JSON.stringify({
      farmId: CONFIG.farmId,
      nodeAddress: this.nodeAddress,
      aggregated,
      readingCount: this.readings.length,
    });

    const signature = signTelemetry(batchData, this.privateKey);
    const { v4: uuid } = require('uuid');

    const batch: TelemetryBatch = {
      id: uuid(),
      farmId: CONFIG.farmId,
      nodeAddress: this.nodeAddress,
      readings: [...this.readings],
      aggregated,
      signature,
    };

    this.pendingBatches.push(batch);
    this.readings = [];
    this.saveBuffer();

    console.log(
      `[telemetry] Sealed batch ${batch.id.slice(0, 8)} | ` +
      `${batch.aggregated.readingCount} readings | ` +
      `${this.pendingBatches.length} pending`
    );

    return batch;
  }

  /**
   * Get all pending batches for submission
   */
  getPendingBatches(): TelemetryBatch[] {
    return [...this.pendingBatches];
  }

  /**
   * Mark a batch as successfully submitted
   */
  markSubmitted(batchId: string): void {
    this.pendingBatches = this.pendingBatches.filter(b => b.id !== batchId);
    this.submittedCount++;
    this.saveBuffer();
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      currentReadings: this.readings.length,
      pendingBatches: this.pendingBatches.length,
      totalSubmitted: this.submittedCount,
    };
  }

  /**
   * Aggregate multiple readings into summary stats
   */
  private aggregate(readings: SensorReading[]): AggregatedTelemetry {
    const n = readings.length;
    const sum = (fn: (r: SensorReading) => number) =>
      readings.reduce((s, r) => s + fn(r), 0);

    return {
      periodStart: readings[0].timestamp,
      periodEnd: readings[n - 1].timestamp,
      readingCount: n,
      avgSoilMoisture: sum(r => r.soilMoisture) / n,
      avgSoilPH: sum(r => r.soilPH) / n,
      avgSoilEC: sum(r => r.soilEC) / n,
      avgAirTemp: sum(r => r.airTemp) / n,
      avgHumidity: sum(r => r.humidity) / n,
      avgLightIntensity: sum(r => r.lightIntensity) / n,
      totalWaterUsageLiters: sum(r => r.waterUsageLiters),
      avgCo2Level: sum(r => r.co2Level) / n,
      avgNdviScore: sum(r => r.ndviScore) / n,
    };
  }

  /**
   * Persist pending batches to disk (offline buffer)
   */
  private saveBuffer(): void {
    try {
      if (!fs.existsSync(CONFIG.dataDir)) {
        fs.mkdirSync(CONFIG.dataDir, { recursive: true });
      }
      fs.writeFileSync(BUFFER_FILE, JSON.stringify(this.pendingBatches, null, 2));
    } catch (err: any) {
      console.warn(`[telemetry] Failed to save buffer: ${err.message}`);
    }
  }

  /**
   * Load buffered batches from disk (resume after restart)
   */
  private loadBuffer(): void {
    try {
      if (fs.existsSync(BUFFER_FILE)) {
        this.pendingBatches = JSON.parse(fs.readFileSync(BUFFER_FILE, 'utf-8'));
        if (this.pendingBatches.length > 0) {
          console.log(`[telemetry] Loaded ${this.pendingBatches.length} buffered batches from disk`);
        }
      }
    } catch {
      this.pendingBatches = [];
    }
  }
}

/**
 * Telemetry Manager
 *
 * Collects sensor readings into batches, signs them, buffers locally,
 * and submits to the Woolly Chain. Handles offline buffering gracefully.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SensorReading, clampReading } from './sensors';
import { signTelemetry } from './identity';
import { CONFIG } from './config';
import { TelemetryBoundedField } from '../../src/core/types';

/**
 * Per-batch tally of which bounded fields were clamped across all readings
 * in the batch. Submitted to chain as part of the signed canonical JSON so
 * PoN scoring can apply per-subscore weighting (Option B refined).
 *
 * Example: {soilPH: 3, soilEC: 1} means soilPH was clamped on 3 readings
 * and soilEC on 1 reading within this batch. Fields with zero clamps are
 * omitted (so an all-healthy batch yields {} which serializes compactly).
 */
export type ClampedFieldCounts = Partial<Record<TelemetryBoundedField, number>>;

/**
 * Live-mode timestamp drift tolerance (seconds).
 * Per architecture review §6: ±5 min in live mode; replay mode skips.
 */
export const TIMESTAMP_DRIFT_TOLERANCE_SEC = 5 * 60;

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
  /**
   * Per-batch counts of fields that were clamped before signing.
   * Always present (may be {} = no clamping).
   * Per architecture review §4.4.
   */
  clampedFieldCounts: ClampedFieldCounts;
}

const BUFFER_FILE = path.join(CONFIG.dataDir, 'telemetry_buffer.json');

/**
 * TelemetryManager collects readings and batches them for chain submission.
 */
export class TelemetryManager {
  private readings: SensorReading[] = [];
  /** Per-reading clamped-field lists, parallel to `readings`. Tallied into clampedFieldCounts at sealBatch. */
  private readingClampedFields: TelemetryBoundedField[][] = [];
  private pendingBatches: TelemetryBatch[] = [];
  private nodeAddress: string;
  private privateKey: string;
  private submittedCount = 0;
  /** Count of readings dropped due to timestamp drift (live mode). Surfaced via getStats(). */
  private droppedReadings = 0;
  /** Total field-clamps applied across all readings in this manager's lifetime (current readings + already-sealed batches). */
  private clampedFieldCount = 0;

  constructor(nodeAddress: string, privateKey: string) {
    this.nodeAddress = nodeAddress;
    this.privateKey = privateKey;
    this.loadBuffer();
  }

  /**
   * Add a new sensor reading to the current batch.
   *
   * Behavior (per architecture review §4.4 and §6):
   *   1. Timestamp drift check (±5 min from Date.now()/1000). Out-of-range → DROP
   *      (timestamps are not clampable; pinning rewrites time-series order silently).
   *   2. Bounds clamping via clampReading(): out-of-range fields are pinned to the
   *      nearest bound. The clamped reading enters the batch; the per-field clamp
   *      tally is preserved for the eventual clampedFieldCounts aggregate.
   *
   * Returns true if the reading was accepted (clamped or clean), false if dropped.
   */
  addReading(reading: SensorReading): boolean {
    // Step 1: timestamp drift gate (live mode)
    const nowSec = Date.now() / 1000;
    if (!Number.isFinite(reading.timestamp) ||
        Math.abs(reading.timestamp - nowSec) > TIMESTAMP_DRIFT_TOLERANCE_SEC) {
      this.droppedReadings += 1;
      console.warn(
        `[telemetry] DROPPED reading: timestamp ${reading.timestamp} ` +
        `outside ±${TIMESTAMP_DRIFT_TOLERANCE_SEC}s of now (${nowSec.toFixed(0)})`
      );
      return false;
    }

    // Step 2: bounds clamping
    const { reading: clean, clamped } = clampReading(reading);
    if (clamped.length > 0) {
      this.clampedFieldCount += clamped.length;
      console.warn(`[telemetry] CLAMPED fields on reading #${this.readings.length + 1}: ${clamped.join(', ')}`);
    }

    this.readings.push(clean);
    this.readingClampedFields.push(clamped);
    console.log(
      `[telemetry] Reading #${this.readings.length} | ` +
      `pH:${clean.soilPH.toFixed(1)} EC:${clean.soilEC.toFixed(2)} ` +
      `T:${clean.airTemp.toFixed(1)}C H:${clean.humidity.toFixed(0)}% ` +
      `Water:${clean.waterUsageLiters.toFixed(1)}L` +
      (clamped.length > 0 ? ` | clamped:[${clamped.join(',')}]` : '')
    );
    return true;
  }

  /**
   * Seal current readings into a signed batch ready for submission.
   * Returns null if no readings to batch.
   *
   * The batch's aggregated struct includes clampedFieldCounts (per-batch tally of
   * which bounded fields were clamped, summed across all readings). This is part
   * of the signed canonical JSON, so the chain can trust the clamp metadata
   * without re-validating individual readings (CLAUDE.md §3.g signature coverage,
   * per architecture review §3 hard-conventions check).
   */
  sealBatch(): TelemetryBatch | null {
    if (this.readings.length === 0) return null;

    const aggregated = this.aggregate(this.readings, this.readingClampedFields);
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
    this.readingClampedFields = [];
    this.saveBuffer();

    const clampedSummary = Object.entries(aggregated.clampedFieldCounts);
    console.log(
      `[telemetry] Sealed batch ${batch.id.slice(0, 8)} | ` +
      `${batch.aggregated.readingCount} readings | ` +
      `${this.pendingBatches.length} pending` +
      (clampedSummary.length > 0
        ? ` | clamped:{${clampedSummary.map(([k, v]) => `${k}:${v}`).join(',')}}`
        : '')
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
   * Get stats. Per architecture review §7:
   *   - droppedReadings: count of timestamp-drift drops (clamping never drops).
   *   - clampedFieldCount: total field-clamps across this manager's lifetime.
   */
  getStats() {
    return {
      currentReadings: this.readings.length,
      pendingBatches: this.pendingBatches.length,
      totalSubmitted: this.submittedCount,
      droppedReadings: this.droppedReadings,
      clampedFieldCount: this.clampedFieldCount,
    };
  }

  /**
   * Aggregate multiple readings into summary stats, including the per-batch
   * clampedFieldCounts tally (architecture review §4.4).
   *
   * `perReadingClamped` must be parallel to `readings`; entry i lists the
   * fields clamped on reading i. Fields with zero clamps are omitted from the
   * returned tally (so a fully-healthy batch yields `clampedFieldCounts: {}`).
   */
  private aggregate(
    readings: SensorReading[],
    perReadingClamped: TelemetryBoundedField[][]
  ): AggregatedTelemetry {
    const n = readings.length;
    const sum = (fn: (r: SensorReading) => number) =>
      readings.reduce((s, r) => s + fn(r), 0);

    // Tally per-field clamp counts across all readings in the batch
    const clampedFieldCounts: ClampedFieldCounts = {};
    for (const fieldsClampedOnReading of perReadingClamped) {
      for (const field of fieldsClampedOnReading) {
        clampedFieldCounts[field] = (clampedFieldCounts[field] ?? 0) + 1;
      }
    }

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
      clampedFieldCounts,
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
   * Load buffered batches from disk (resume after restart).
   *
   * Migration: pre-clamp-flag buffer files have no `clampedFieldCounts` in
   * their aggregated struct. Default it to `{}` on load so the new schema
   * holds invariantly (architecture review §9 migration / back-compat).
   */
  private loadBuffer(): void {
    try {
      if (fs.existsSync(BUFFER_FILE)) {
        const raw: TelemetryBatch[] = JSON.parse(fs.readFileSync(BUFFER_FILE, 'utf-8'));
        this.pendingBatches = raw.map(b => ({
          ...b,
          aggregated: {
            ...b.aggregated,
            clampedFieldCounts: b.aggregated?.clampedFieldCounts ?? {},
          },
        }));
        if (this.pendingBatches.length > 0) {
          console.log(`[telemetry] Loaded ${this.pendingBatches.length} buffered batches from disk`);
        }
      }
    } catch {
      this.pendingBatches = [];
    }
  }
}

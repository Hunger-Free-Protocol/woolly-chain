/**
 * Sensor Reader
 *
 * Reads sensor data from the uFarms board via USB serial.
 * The uFarms board sends JSON-formatted sensor readings over serial.
 *
 * Expected uFarms serial output format (one JSON line per reading):
 * {"ec":1.8,"ph":6.2,"temp":26.5,"humidity":72,"water_level":85}
 *
 * If the format differs, adapt the parseUfarmsData() function below.
 * In simulation mode, generates realistic fake data for testing.
 */

import { CONFIG } from './config';
import { TELEMETRY_BOUNDS, TelemetryBoundedField } from '../../src/core/types';

export interface SensorReading {
  timestamp: number;
  farmId: string;
  soilMoisture: number;     // 0-1 (volumetric water content)
  soilPH: number;           // 3.0-10.0
  soilEC: number;           // mS/cm
  airTemp: number;          // Celsius
  humidity: number;         // 0-100 %RH
  lightIntensity: number;   // lux (estimated from time-of-day if no sensor)
  waterUsageLiters: number; // cumulative since last reading
  co2Level: number;         // ppm (estimated if no sensor)
  ndviScore: number;        // 0-1 (estimated/placeholder for prototype)
}

/**
 * Clamp a sensor reading's out-of-range fields to the nearest bound.
 *
 * Per architecture review §4.3 (docs/architecture-reviews/farm-node-clamp-flag.md):
 *   - Iterates each field with a bound in TELEMETRY_BOUNDS.
 *   - If the value is outside the bound, pins it to the nearest bound AND
 *     adds the field name to the `clamped` list.
 *   - Timestamp check is separate (handled in telemetry.ts addReading) and
 *     does NOT clamp; out-of-range timestamps drop the reading entirely.
 *
 * The clamped reading enters the signed batch; the per-batch counts of
 * which fields were clamped (across all readings) are submitted to chain
 * via the `clampedFieldCounts` aggregate so PoN scoring can apply
 * per-subscore weighting (Option B refined per §5.3 of the review).
 *
 * Returns a NEW reading object; the input is not mutated.
 */
export function clampReading(reading: SensorReading): { reading: SensorReading; clamped: TelemetryBoundedField[] } {
  const out: SensorReading = { ...reading };
  const clamped: TelemetryBoundedField[] = [];

  const outAny = out as unknown as Record<string, number>;
  (Object.keys(TELEMETRY_BOUNDS) as TelemetryBoundedField[]).forEach(field => {
    const [lo, hi] = TELEMETRY_BOUNDS[field];
    const v = outAny[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    if (v < lo) {
      outAny[field] = lo;
      clamped.push(field);
    } else if (v > hi) {
      outAny[field] = hi;
      clamped.push(field);
    }
  });

  return { reading: out, clamped };
}

// ── Serial Reader ────────────────────────────────────────────────

let serialBuffer = '';
let latestUfarmsData: Record<string, number> = {};
let serialConnected = false;

/**
 * Initialize serial connection to uFarms board.
 * Non-blocking — if serial isn't available, falls back to simulation.
 */
export async function initSerial(): Promise<void> {
  if (CONFIG.simulate) {
    console.log('[sensors] Running in SIMULATION mode — no serial connection');
    return;
  }

  try {
    // Dynamic import — serialport may not be installed in dev/test
    const { SerialPort } = await import('serialport');
    const { ReadlineParser } = await import('@serialport/parser-readline');

    const port = new SerialPort({
      path: CONFIG.serialPort,
      baudRate: CONFIG.serialBaud,
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', (line: string) => {
      try {
        const data = JSON.parse(line.trim());
        latestUfarmsData = data;
        serialConnected = true;
      } catch {
        // Non-JSON line from uFarms — ignore (could be debug output)
      }
    });

    port.on('error', (err: Error) => {
      console.error(`[sensors] Serial error: ${err.message}`);
      serialConnected = false;
    });

    port.on('close', () => {
      console.log('[sensors] Serial port closed');
      serialConnected = false;
    });

    console.log(`[sensors] Serial connected: ${CONFIG.serialPort} @ ${CONFIG.serialBaud} baud`);
    serialConnected = true;

  } catch (err: any) {
    console.warn(`[sensors] Could not open serial port: ${err.message}`);
    console.warn('[sensors] Falling back to simulation mode');
    (CONFIG as any).simulate = true;
  }
}

/**
 * Parse raw uFarms board data into Woolly telemetry format.
 *
 * ADAPT THIS FUNCTION to match your uFarms board's actual JSON keys.
 * The mapping below assumes: ec, ph, temp, humidity, water_level
 */
function parseUfarmsData(raw: Record<string, number>): Partial<SensorReading> {
  return {
    soilEC: raw.ec ?? raw.EC ?? raw.tds ?? 1.5,
    soilPH: raw.ph ?? raw.PH ?? raw.pH ?? 6.5,
    airTemp: raw.temp ?? raw.temperature ?? raw.air_temp ?? 25,
    humidity: raw.humidity ?? raw.rh ?? raw.RH ?? 65,
    // uFarms water_level is a percentage; we estimate usage
    waterUsageLiters: raw.water_flow ?? raw.water_usage ?? 0,
    // These may not exist on uFarms board — use defaults
    soilMoisture: raw.soil_moisture ?? raw.moisture ?? 0.35,
    co2Level: raw.co2 ?? raw.CO2 ?? 400,
  };
}

/**
 * Read current sensor values.
 * Returns a complete SensorReading (fills gaps with estimates).
 */
export function readSensors(): SensorReading {
  const now = Math.floor(Date.now() / 1000);

  if (CONFIG.simulate || !serialConnected) {
    return simulateReading(now);
  }

  // Parse whatever the uFarms board gave us
  const parsed = parseUfarmsData(latestUfarmsData);

  // Estimate light from time of day (6am-6pm = daylight)
  const hour = new Date().getHours();
  const isDaylight = hour >= 6 && hour <= 18;
  const lightBase = isDaylight ? 600 + Math.sin((hour - 6) / 12 * Math.PI) * 400 : 10;

  return {
    timestamp: now,
    farmId: CONFIG.farmId,
    soilMoisture: parsed.soilMoisture ?? 0.35,
    soilPH: parsed.soilPH ?? 6.5,
    soilEC: parsed.soilEC ?? 1.5,
    airTemp: parsed.airTemp ?? 25,
    humidity: parsed.humidity ?? 65,
    lightIntensity: lightBase + Math.random() * 50,
    waterUsageLiters: parsed.waterUsageLiters ?? 0,
    co2Level: parsed.co2Level ?? 400,
    ndviScore: 0.75,  // placeholder — needs camera + VLM in future
  };
}

/**
 * Generate realistic simulated sensor data for testing.
 */
function simulateReading(timestamp: number): SensorReading {
  const hour = new Date().getHours();
  const isDaylight = hour >= 6 && hour <= 18;

  // Simulate diurnal patterns
  const tempBase = isDaylight ? 28 + Math.sin((hour - 6) / 12 * Math.PI) * 5 : 22;
  const humidBase = isDaylight ? 55 + Math.cos((hour - 6) / 12 * Math.PI) * 15 : 75;
  const lightBase = isDaylight ? 600 + Math.sin((hour - 6) / 12 * Math.PI) * 400 : 5;

  return {
    timestamp,
    farmId: CONFIG.farmId,
    soilMoisture: 0.30 + Math.random() * 0.15,
    soilPH: 6.0 + Math.random() * 0.6,
    soilEC: 1.2 + Math.random() * 0.8,
    airTemp: tempBase + (Math.random() - 0.5) * 2,
    humidity: humidBase + (Math.random() - 0.5) * 5,
    lightIntensity: Math.max(0, lightBase + (Math.random() - 0.5) * 100),
    waterUsageLiters: Math.random() * 5,
    co2Level: 380 + Math.random() * 40,
    ndviScore: 0.70 + Math.random() * 0.2,
  };
}

export function isSerialConnected(): boolean {
  return serialConnected;
}

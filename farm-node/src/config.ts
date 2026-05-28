/**
 * Farm Node Configuration
 *
 * Configure via environment variables or edit defaults below.
 * On the Pi, create a .env file or export vars before running.
 */

export const CONFIG = {
  // ── Identity ───────────────────────────────────────────────
  farmId: process.env.WOOLLY_FARM_ID || 'FARM-PROTO-001',
  nodeAddress: process.env.WOOLLY_NODE_ADDRESS || '',  // generated on first run if empty
  privateKey: process.env.WOOLLY_PRIVATE_KEY || '',    // generated on first run if empty

  // ── Chain Connection ───────────────────────────────────────
  chainUrl: process.env.WOOLLY_CHAIN_URL || 'http://localhost:3000',

  // ── Sensor Hardware ────────────────────────────────────────
  // uFarms board connects via USB serial (or UART GPIO)
  serialPort: process.env.WOOLLY_SERIAL_PORT || '/dev/ttyUSB0',
  serialBaud: parseInt(process.env.WOOLLY_SERIAL_BAUD || '115200'),

  // ── Timing ─────────────────────────────────────────────────
  sensorPollIntervalMs: parseInt(process.env.WOOLLY_POLL_INTERVAL || '60000'),  // 1 min
  telemetrySubmitIntervalMs: parseInt(process.env.WOOLLY_SUBMIT_INTERVAL || '300000'),  // 5 min
  heartbeatIntervalMs: parseInt(process.env.WOOLLY_HEARTBEAT_INTERVAL || '60000'),  // 1 min

  // ── Location (set to your farm's GPS coordinates) ──────────
  latitude: parseFloat(process.env.WOOLLY_LAT || '12.9716'),
  longitude: parseFloat(process.env.WOOLLY_LNG || '77.5946'),

  // ── Simulation Mode ────────────────────────────────────────
  // When true, generates fake sensor data instead of reading serial
  simulate: process.env.WOOLLY_SIMULATE === 'true',

  // ── Storage ────────────────────────────────────────────────
  dataDir: process.env.WOOLLY_DATA_DIR || './data',
};

/**
 * Woolly Chain Client
 *
 * Talks to the Woolly Chain REST API running on your GCP VM.
 * Handles: account creation, validator registration, telemetry
 * submission, and status queries.
 */

import axios, { AxiosInstance } from 'axios';
import { CONFIG } from './config';
import { TelemetryBatch } from './telemetry';

export class ChainClient {
  private api: AxiosInstance;
  private registered = false;

  constructor() {
    this.api = axios.create({
      baseURL: `${CONFIG.chainUrl}/api/v1`,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Check if the chain node is reachable
   */
  async ping(): Promise<boolean> {
    try {
      const res = await this.api.get('/chain/info');
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get chain info
   */
  async getChainInfo(): Promise<any> {
    const res = await this.api.get('/chain/info');
    return res.data;
  }

  /**
   * Create an account on chain for this node
   */
  async createAccount(): Promise<{ address: string }> {
    try {
      const res = await this.api.post('/account/create');
      console.log(`[chain] Account created on chain`);
      return res.data;
    } catch (err: any) {
      // Account may already exist — that's fine
      if (err.response?.status === 400) {
        console.log(`[chain] Account already exists`);
        return { address: '' };
      }
      throw err;
    }
  }

  /**
   * Register this node as a validator
   */
  async registerValidator(address: string, farmId: string, location: { lat: number; lng: number }): Promise<any> {
    try {
      const res = await this.api.post('/validator/register', {
        address,
        farmId,
        location,
      });
      this.registered = true;
      console.log(`[chain] Validator registered: ${farmId} @ ${location.lat},${location.lng}`);
      return res.data;
    } catch (err: any) {
      if (err.response?.data?.error?.includes('already')) {
        this.registered = true;
        console.log(`[chain] Validator already registered`);
        return { status: 'already_registered' };
      }
      throw err;
    }
  }

  /**
   * Submit a telemetry batch to the chain
   */
  async submitTelemetry(batch: TelemetryBatch): Promise<boolean> {
    try {
      const res = await this.api.post('/validator/telemetry', {
        address: batch.nodeAddress,
        farmId: batch.farmId,
        telemetry: {
          farmId: batch.farmId,
          timestamp: batch.aggregated.periodEnd,
          soilMoisture: batch.aggregated.avgSoilMoisture,
          soilPH: batch.aggregated.avgSoilPH,
          soilEC: batch.aggregated.avgSoilEC,
          airTemp: batch.aggregated.avgAirTemp,
          humidity: batch.aggregated.avgHumidity,
          lightIntensity: batch.aggregated.avgLightIntensity,
          waterUsageLiters: batch.aggregated.totalWaterUsageLiters,
          co2Level: batch.aggregated.avgCo2Level,
          ndviScore: batch.aggregated.avgNdviScore,
          crossValidationScores: [],  // no neighbors yet in prototype
        },
        signature: batch.signature,
      });

      console.log(`[chain] Telemetry submitted: batch ${batch.id.slice(0, 8)}`);
      return res.status === 200 || res.status === 201;
    } catch (err: any) {
      console.error(`[chain] Telemetry submission failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Get this validator's info and PoN scores
   */
  async getValidatorInfo(address: string): Promise<any> {
    try {
      const res = await this.api.get(`/validator/${address}`);
      return res.data;
    } catch {
      return null;
    }
  }

  /**
   * Get account balances (WOOLLY rewards, etc.)
   */
  async getAccount(address: string): Promise<any> {
    try {
      const res = await this.api.get(`/account/${address}`);
      return res.data;
    } catch {
      return null;
    }
  }

  /**
   * Get current stats
   */
  async getStats(): Promise<any> {
    try {
      const res = await this.api.get('/stats');
      return res.data;
    } catch {
      return null;
    }
  }

  isRegistered(): boolean {
    return this.registered;
  }
}

/**
 * Woolly Chain - WOOLLY-CARBON Credit Tokens
 * Carbon credit tokens with verification, retirement tracking, and telemetry-based estimation
 * 1 token = 1 tCO2e (metric ton of CO2 equivalent)
 */

import { v4 as uuidv4 } from 'uuid';
import { TokenInfo, TokenType, TelemetryData } from '../core/types';
import { WorldState } from '../core/state';

export interface CarbonRetirement {
  retirementId: string;
  tokenId: string;
  amount: number;
  reason: string;
  timestamp: number;
  receiptHash: string;
}

export class CarbonToken {
  private retirements: Map<string, CarbonRetirement[]> = new Map(); // tokenId -> retirements
  private issuanceFeeRate = 0.01; // 1% fee

  /**
   * Mint carbon credits with verification
   * 1 token = 1 tCO2e, applies 1% issuance fee
   * @param state - WorldState instance
   * @param farmId - Farm identifier
   * @param tCO2e - Amount of CO2 equivalent in metric tons
   * @param verificationProof - Verification proof data
   * @returns TokenInfo for the minted carbon credits
   */
  public mintCredits(
    state: WorldState,
    farmId: string,
    tCO2e: number,
    verificationProof: any
  ): TokenInfo {
    if (tCO2e <= 0) {
      throw new Error('tCO2e must be positive');
    }

    const tokenId = `CARBON-${farmId}-${uuidv4()}`;

    // Apply 1% issuance fee (reduces mintable amount)
    const fee = tCO2e * this.issuanceFeeRate;
    const mintableAmount = tCO2e - fee;

    const tokenInfo: TokenInfo = {
      id: tokenId,
      type: TokenType.WOOLLY_CARBON,
      name: `WOOLLY Carbon Credits - ${farmId}`,
      totalSupply: mintableAmount,
      metadata: {
        farmId,
        tCO2e,
        fee,
        verificationProof,
        createdAt: Math.floor(Date.now() / 1000),
      },
    };

    state.registerToken(tokenInfo);
    this.retirements.set(tokenId, []);

    return tokenInfo;
  }

  /**
   * Retire carbon credits
   * Burning and permanently removing credits from circulation with immutable receipt
   * @param state - WorldState instance
   * @param tokenId - Token identifier
   * @param from - Address retiring the credits
   * @param amount - Amount of credits to retire
   * @param reason - Reason for retirement
   * @returns Object with receipt hash
   */
  public retire(
    state: WorldState,
    tokenId: string,
    from: string,
    amount: number,
    reason: string
  ): { receipt: string } {
    if (amount <= 0) {
      return { receipt: '' };
    }

    const balance = state.getBalance(from, tokenId);
    if (balance < amount) {
      return { receipt: '' };
    }

    // Burn the tokens
    const burnSuccess = state.burnToken(tokenId, from, amount);
    if (!burnSuccess) {
      return { receipt: '' };
    }

    // Create immutable retirement record
    const retirement: CarbonRetirement = {
      retirementId: uuidv4(),
      tokenId,
      amount,
      reason,
      timestamp: Math.floor(Date.now() / 1000),
      receiptHash: this.generateReceiptHash(
        tokenId,
        from,
        amount,
        reason,
        Math.floor(Date.now() / 1000)
      ),
    };

    const retirementList = this.retirements.get(tokenId) || [];
    retirementList.push(retirement);
    this.retirements.set(tokenId, retirementList);

    return { receipt: retirement.receiptHash };
  }

  /**
   * Get retirement history for a carbon token
   * @param state - WorldState instance (unused but kept for interface consistency)
   * @param tokenId - Token identifier
   * @returns Array of retirement records
   */
  public getRetirementHistory(state: WorldState, tokenId: string): CarbonRetirement[] {
    return this.retirements.get(tokenId) || [];
  }

  /**
   * Estimate carbon credits based on farm telemetry history
   * CEA (Controlled Environment Agriculture) farms: 2.8-5.2 tCO2e/ha/yr
   * @param telemetryHistory - Array of telemetry data points
   * @returns Estimated tCO2e based on farm practices
   */
  public estimateCredits(telemetryHistory: TelemetryData[]): number {
    if (telemetryHistory.length === 0) {
      return 0;
    }

    // Base estimate: 2.8-5.2 tCO2e/ha/year for CEA farms
    const baseEstimateMin = 2.8;
    const baseEstimateMax = 5.2;

    let waterEfficiencyScore = 0;
    let temperatureControlScore = 0;
    let co2ManagementScore = 0;

    // Analyze telemetry to estimate sustainability factors
    for (const telemetry of telemetryHistory) {
      // Water efficiency: lower water usage indicates efficiency
      // Assume optimal is < 10 liters per reading
      waterEfficiencyScore += Math.max(0, 1 - telemetry.waterUsageLiters / 20);

      // Temperature control: consistent temperatures reduce waste
      // Target range 20-25°C
      const tempDiff = Math.abs(telemetry.airTemp - 22.5);
      temperatureControlScore += Math.max(0, 1 - tempDiff / 10);

      // CO2 management: proper CO2 levels (400-1000 ppm)
      const co2Optimal = telemetry.co2Level >= 400 && telemetry.co2Level <= 1000;
      co2ManagementScore += co2Optimal ? 1 : 0.5;
    }

    // Average the scores
    const samples = telemetryHistory.length;
    const avgWaterScore = waterEfficiencyScore / samples;
    const avgTempScore = temperatureControlScore / samples;
    const avgCo2Score = co2ManagementScore / samples;

    // Compute sustainability multiplier (0.5 to 1.5)
    const avgScore = (avgWaterScore + avgTempScore + avgCo2Score) / 3;
    const multiplier = 0.5 + avgScore * 1.0; // Range: 0.5 to 1.5

    // Estimate based on NDVI (Normalized Difference Vegetation Index)
    // Higher NDVI indicates healthier plants, better carbon sequestration
    const avgNDVI =
      telemetryHistory.reduce((sum, t) => sum + t.ndviScore, 0) / samples;
    const ndviMultiplier = Math.max(0.8, Math.min(1.5, avgNDVI * 2)); // 0.8 to 1.5

    // Base estimate with assumed 1 hectare farm
    const baseEstimate =
      (baseEstimateMin + baseEstimateMax) / 2; // 3.5 tCO2e/ha/yr
    const estimatedCredits = baseEstimate * multiplier * ndviMultiplier;

    return Math.round(estimatedCredits * 100) / 100; // Round to 2 decimals
  }

  /**
   * Generate immutable receipt hash for retirement record
   * @param tokenId - Token identifier
   * @param from - Retiring address
   * @param amount - Amount retired
   * @param reason - Retirement reason
   * @param timestamp - Timestamp of retirement
   * @returns Receipt hash
   */
  private generateReceiptHash(
    tokenId: string,
    from: string,
    amount: number,
    reason: string,
    timestamp: number
  ): string {
    // Simple deterministic hash using data
    const data = `${tokenId}:${from}:${amount}:${reason}:${timestamp}`;
    let hash = 0;

    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `0x${Math.abs(hash).toString(16).padStart(16, '0')}`;
  }

  /**
   * Get total retired credits for a token
   * @param tokenId - Token identifier
   * @returns Total amount of retired credits
   */
  public getTotalRetired(tokenId: string): number {
    const retirementList = this.retirements.get(tokenId) || [];
    return retirementList.reduce((sum, r) => sum + r.amount, 0);
  }
}

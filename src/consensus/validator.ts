/**
 * Woolly Chain - Validator Manager
 * Manages validator registration, activation, telemetry, and cross-validation
 */

import { ValidatorInfo, TelemetryData, ChainConfig, DEFAULT_CHAIN_CONFIG } from '../core/types';
import { updateValidatorScores } from './scoring';

export class ValidatorManager {
  private validators: Map<string, ValidatorInfo> = new Map();
  private config: ChainConfig;

  constructor(config: ChainConfig = DEFAULT_CHAIN_CONFIG) {
    this.config = config;
  }

  /**
   * Register a new validator with initial telemetry
   * Validator starts inactive until 2+ crop cycles completed and 85%+ cross-validation
   */
  registerValidator(
    address: string,
    farmId: string,
    location: { lat: number; lng: number },
    initialTelemetry?: TelemetryData
  ): ValidatorInfo {
    if (this.validators.has(address)) {
      throw new Error(`Validator ${address} already registered`);
    }

    const validator: ValidatorInfo = {
      address,
      farmId,
      location,
      registeredAt: Date.now(),
      cropCycles: 0,
      productivityScore: 0,
      sustainabilityScore: 0,
      commitmentScore: 0,
      ponWeight: 0,
      isActive: false, // Inactive until requirements met
      telemetryHistory: initialTelemetry ? [initialTelemetry] : [],
    };

    this.validators.set(address, validator);
    return validator;
  }

  /**
   * Activate validator if requirements are met
   * Requires: 2+ crop cycles, 85%+ cross-validation score
   */
  activateValidator(address: string): boolean {
    const validator = this.validators.get(address);
    if (!validator) {
      throw new Error(`Validator ${address} not found`);
    }

    // Check minimum crop cycles
    if (validator.cropCycles < this.config.minCropCycles) {
      return false;
    }

    // Check minimum cross-validation score
    const avgCrossValidation = this.calculateAverageCrossValidation(validator);
    if (avgCrossValidation < this.config.minCrossValidation) {
      return false;
    }

    validator.isActive = true;
    this.validators.set(address, validator);
    return true;
  }

  /**
   * Deactivate a validator
   */
  deactivateValidator(address: string): void {
    const validator = this.validators.get(address);
    if (validator) {
      validator.isActive = false;
      this.validators.set(address, validator);
    }
  }

  /**
   * Submit telemetry data for a validator and recalculate scores
   */
  submitTelemetry(address: string, data: TelemetryData): void {
    const validator = this.validators.get(address);
    if (!validator) {
      throw new Error(`Validator ${address} not found`);
    }

    validator.telemetryHistory.push(data);

    // Keep last 100 readings to manage memory
    if (validator.telemetryHistory.length > 100) {
      validator.telemetryHistory = validator.telemetryHistory.slice(-100);
    }

    // Recalculate scores after new telemetry
    const updated = updateValidatorScores(validator);
    this.validators.set(address, updated);
  }

  /**
   * Cross-validate telemetry with neighbors
   * Returns cross-validation score (0-1)
   * Simulates: 3+ neighbors must confirm within 15% variance
   */
  crossValidate(
    validatorAddress: string,
    neighborAddresses: string[],
    telemetryHash: string
  ): number {
    const validator = this.validators.get(validatorAddress);
    if (!validator || validator.telemetryHistory.length === 0) {
      return 0;
    }

    // Get latest telemetry reading
    const latestTelemetry = validator.telemetryHistory[validator.telemetryHistory.length - 1];

    // Simulate neighbor validation: check consistency with neighbors
    let confirmingNeighbors = 0;
    const validNeighbors = Math.min(neighborAddresses.length, 5); // Max 5 neighbors for simulation

    for (const neighborAddr of neighborAddresses.slice(0, validNeighbors)) {
      const neighbor = this.validators.get(neighborAddr);
      if (!neighbor || neighbor.telemetryHistory.length === 0) {
        continue;
      }

      const neighborTelemetry = neighbor.telemetryHistory[neighbor.telemetryHistory.length - 1];

      // Check if readings are within 15% variance on key metrics
      const tempVariance = Math.abs(latestTelemetry.airTemp - neighborTelemetry.airTemp) / latestTelemetry.airTemp;
      const humidityVariance = Math.abs(latestTelemetry.humidity - neighborTelemetry.humidity) / latestTelemetry.humidity;
      const ndviVariance = Math.abs(latestTelemetry.ndviScore - neighborTelemetry.ndviScore) / (latestTelemetry.ndviScore || 1);

      // If all metrics within 15%, neighbor confirms
      if (tempVariance < 0.15 && humidityVariance < 0.15 && ndviVariance < 0.15) {
        confirmingNeighbors++;
      }
    }

    // Require 3+ neighbors OR 2/3 of available neighbors (if fewer than 3)
    const minConfirmations = Math.min(3, Math.ceil(validNeighbors * 2 / 3));
    const crossValidationScore = confirmingNeighbors >= minConfirmations
      ? 0.85 + (confirmingNeighbors / validNeighbors) * 0.15 // Score 0.85-1.0
      : 0.5; // Low score if not enough confirmations

    // Store cross-validation score in telemetry
    latestTelemetry.crossValidationScores.push(crossValidationScore);

    return crossValidationScore;
  }

  /**
   * Get top N validators by PoN weight (active only)
   */
  getTopValidators(n: number): ValidatorInfo[] {
    return Array.from(this.validators.values())
      .filter(v => v.isActive)
      .sort((a, b) => b.ponWeight - a.ponWeight)
      .slice(0, n);
  }

  /**
   * Check if validator is eligible for consensus participation
   * Must be active and meet all minimum requirements
   */
  isEligible(address: string): boolean {
    const validator = this.validators.get(address);
    if (!validator || !validator.isActive) {
      return false;
    }

    // Check minimum scores
    if (validator.cropCycles < this.config.minCropCycles) {
      return false;
    }

    const avgCrossValidation = this.calculateAverageCrossValidation(validator);
    if (avgCrossValidation < this.config.minCrossValidation) {
      return false;
    }

    return true;
  }

  /**
   * Get validator by address
   */
  getValidator(address: string): ValidatorInfo | undefined {
    return this.validators.get(address);
  }

  /**
   * Get all validators
   */
  getAllValidators(): ValidatorInfo[] {
    return Array.from(this.validators.values());
  }

  /**
   * Get all active validators
   */
  getActiveValidators(): ValidatorInfo[] {
    return Array.from(this.validators.values()).filter(v => v.isActive);
  }

  /**
   * Increment crop cycles for a validator
   */
  incrementCropCycles(address: string): void {
    const validator = this.validators.get(address);
    if (validator) {
      validator.cropCycles++;
      // Recalculate scores with new crop cycle count
      const updated = updateValidatorScores(validator);
      this.validators.set(address, updated);
    }
  }

  /**
   * Helper: Calculate average cross-validation score for a validator
   */
  private calculateAverageCrossValidation(validator: ValidatorInfo): number {
    if (validator.telemetryHistory.length === 0) {
      return 0;
    }

    let totalScore = 0;
    let readingsWithScores = 0;

    for (const telemetry of validator.telemetryHistory) {
      if (telemetry.crossValidationScores.length > 0) {
        const avgScore = telemetry.crossValidationScores.reduce((a, b) => a + b, 0) / telemetry.crossValidationScores.length;
        totalScore += avgScore;
        readingsWithScores++;
      }
    }

    return readingsWithScores > 0 ? totalScore / readingsWithScores : 0;
  }
}

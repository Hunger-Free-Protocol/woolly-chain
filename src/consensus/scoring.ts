/**
 * Woolly Chain - Proof of Nourishment Score Calculator
 * Calculates validator scores based on productivity, sustainability, and commitment
 */

import { ValidatorInfo, TelemetryData, ChainConfig, DEFAULT_CHAIN_CONFIG } from '../core/types';

/**
 * Calculate Productivity Score [0, 1]
 * Based on: crop cycles completed, yield efficiency, water efficiency, disease control
 */
export function calculateProductivityScore(validator: ValidatorInfo): number {
  // Crop cycles metric: min 2 required, max 10 for full score
  const cycleScore = Math.min(validator.cropCycles / 10, 1.0);

  if (validator.telemetryHistory.length === 0) {
    return cycleScore * 0.3; // Low score if no telemetry data
  }

  // Calculate efficiency metrics from telemetry
  const recentTelemetry = validator.telemetryHistory.slice(-10); // Last 10 readings

  // Yield efficiency: based on NDVI (Normalized Difference Vegetation Index)
  // Higher NDVI = better vegetation health, target 0.6+
  const avgNDVI = recentTelemetry.reduce((sum, t) => sum + t.ndviScore, 0) / recentTelemetry.length;
  const ndviScore = Math.min(avgNDVI / 0.7, 1.0); // Normalize to max 0.7

  // Water efficiency: lower water usage per unit of vegetation health is better
  // Baseline: 1.5 L/unit_NDVI
  const avgWaterUsage = recentTelemetry.reduce((sum, t) => sum + t.waterUsageLiters, 0) / recentTelemetry.length;
  const waterEfficiency = avgNDVI > 0 ? avgWaterUsage / (avgNDVI * 1.5) : 1.0;
  const waterScore = Math.max(1.0 - waterEfficiency, 0); // Penalize excess water use

  // Disease control: measured via soil EC (electrical conductivity) and pH balance
  // Healthy range: pH 6.0-7.5, EC 0.5-2.0. Score based on stability.
  const pHReadings = recentTelemetry.map(t => t.soilPH);
  const pHVariance = calculateVariance(pHReadings);
  const diseaseScore = Math.max(1.0 - pHVariance / 2.0, 0); // Lower variance = better

  // Normalize and average: cycle (0.2), yield (0.3), water (0.3), disease (0.2)
  const productivityScore =
    cycleScore * 0.2 +
    ndviScore * 0.3 +
    waterScore * 0.3 +
    diseaseScore * 0.2;

  return Math.min(productivityScore, 1.0);
}

/**
 * Calculate Sustainability Score [0, 1]
 * HIGHEST WEIGHT (0.40) - PRIMARY consensus driver
 * Based on: water efficiency, carbon sequestration, organic certification, food program contribution
 */
export function calculateSustainabilityScore(validator: ValidatorInfo): number {
  if (validator.telemetryHistory.length === 0) {
    return 0.2; // Very low score if no environmental data
  }

  const recentTelemetry = validator.telemetryHistory.slice(-10);

  // Water efficiency ratio: compare actual to baseline
  // Baseline: 1000 L per crop cycle for target crop
  // Formula: 1 - (actual / baseline) clamped to [0, 1]
  const totalWaterUsage = recentTelemetry.reduce((sum, t) => sum + t.waterUsageLiters, 0);
  const waterBaseline = 1000 * validator.cropCycles;
  const waterEfficiencyScore = Math.max(1.0 - totalWaterUsage / waterBaseline, 0);

  // Carbon sequestration estimate from CO2 level reduction + NDVI
  // Formula: (baseline_co2 - current_co2) * ndvi_score / baseline_co2
  // Baseline: 400 ppm, with healthy NDVI score
  const avgCO2 = recentTelemetry.reduce((sum, t) => sum + t.co2Level, 0) / recentTelemetry.length;
  const avgNDVI = recentTelemetry.reduce((sum, t) => sum + t.ndviScore, 0) / recentTelemetry.length;
  const co2Baseline = 400;
  const carbonScore = Math.max((co2Baseline - avgCO2) / co2Baseline, 0) * avgNDVI;

  // Chemical-free score: assume 1.0 if certified organic (would be in validator metadata)
  // For MVP, default to 0.7 (some organic practices likely, conservative estimate)
  const organicScore = 0.7;

  // Surplus allocation percentage to free food programs
  // This would come from contract data, default 0.15 (15%) for MVP
  const surplusAllocationScore = 0.15;

  // Sustainability combines: water (0.35), carbon (0.35), organic (0.20), surplus (0.10)
  const sustainabilityScore =
    waterEfficiencyScore * 0.35 +
    Math.min(carbonScore, 1.0) * 0.35 +
    organicScore * 0.20 +
    surplusAllocationScore * 0.10;

  return Math.min(sustainabilityScore, 1.0);
}

/**
 * Calculate Commitment Score [0, 1]
 * Based on: months active (6-month min), capital investment, sensor uptime, cross-validation
 */
export function calculateCommitmentScore(validator: ValidatorInfo): number {
  // Months active: 6-month minimum, 24+ months = 1.0
  const now = Date.now();
  const monthsActive = (now - validator.registeredAt) / (1000 * 60 * 60 * 24 * 30);
  const monthsScore = Math.min(monthsActive / 24, 1.0);

  // Capital investment: estimated from crop cycles and equipment
  // Assume ~$5000 per crop cycle for sensors + infrastructure
  // Max score at $50,000+ investment
  const estimatedInvestment = validator.cropCycles * 5000;
  const investmentBaseline = 50000;
  const investmentScore = Math.min(estimatedInvestment / investmentBaseline, 1.0);

  // Sensor uptime: based on telemetry data consistency
  // If telemetry submitted regularly (daily = 365 per year), score improves
  const expectedReadings = monthsActive * 30; // ~daily readings
  const actualReadings = Math.min(validator.telemetryHistory.length, expectedReadings);
  const uptimeScore = Math.min(actualReadings / expectedReadings, 1.0);

  // Cross-validation score: average of neighbor validations (min 85%)
  const avgCrossValidation = validator.telemetryHistory.length > 0
    ? validator.telemetryHistory.reduce((sum, t) => {
        const avg = t.crossValidationScores.length > 0
          ? t.crossValidationScores.reduce((a, b) => a + b, 0) / t.crossValidationScores.length
          : 0;
        return sum + avg;
      }, 0) / validator.telemetryHistory.length
    : 0;
  const crossValidationScore = Math.max(0, (avgCrossValidation - 0.85) / 0.15); // Normalize from 85-100%

  // Commitment combines: months (0.25), investment (0.25), uptime (0.30), cross-validation (0.20)
  const commitmentScore =
    monthsScore * 0.25 +
    investmentScore * 0.25 +
    uptimeScore * 0.30 +
    Math.min(crossValidationScore, 1.0) * 0.20;

  return Math.min(commitmentScore, 1.0);
}

/**
 * Calculate PoN Weight
 * Formula: W = 0.25 * productivity + 0.40 * sustainability + 0.35 * commitment
 * Sustainability is PRIMARY driver (0.40 weight)
 */
export function calculatePoNWeight(validator: ValidatorInfo): number {
  const productivityScore = calculateProductivityScore(validator);
  const sustainabilityScore = calculateSustainabilityScore(validator);
  const commitmentScore = calculateCommitmentScore(validator);

  const ponWeight =
    productivityScore * 0.25 +
    sustainabilityScore * 0.40 +
    commitmentScore * 0.35;

  return Math.min(Math.max(ponWeight, 0), 1.0); // Clamp to [0, 1]
}

/**
 * Update all scores for a validator
 */
export function updateValidatorScores(validator: ValidatorInfo): ValidatorInfo {
  return {
    ...validator,
    productivityScore: calculateProductivityScore(validator),
    sustainabilityScore: calculateSustainabilityScore(validator),
    commitmentScore: calculateCommitmentScore(validator),
    ponWeight: calculatePoNWeight(validator),
  };
}

/**
 * Update all scores for multiple validators (epoch transition)
 */
export function updateAllScores(validators: ValidatorInfo[]): ValidatorInfo[] {
  return validators.map(v => updateValidatorScores(v));
}

/**
 * Utility: Calculate variance of array
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Utility: Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  return Math.sqrt(calculateVariance(values));
}

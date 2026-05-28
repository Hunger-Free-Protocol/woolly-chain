/**
 * Woolly Chain - Epoch Manager
 * Manages epoch transitions, validator set rotation, and reward distribution
 * Epoch = 1 week of blocks (100800 blocks at 6-second block time)
 */

import { ValidatorInfo, EpochInfo, ChainConfig, DEFAULT_CHAIN_CONFIG } from '../core/types';
import { updateAllScores } from './scoring';
import { WeightedBFT } from './bft';

export class EpochManager {
  private config: ChainConfig;
  private bft: WeightedBFT;
  private currentEpochNumber: number = 0;

  constructor(config: ChainConfig = DEFAULT_CHAIN_CONFIG) {
    this.config = config;
    this.bft = new WeightedBFT(config);
  }

  /**
   * Calculate current epoch number from block index
   * Epoch 0 starts at block 0
   */
  getCurrentEpoch(blockIndex: number): number {
    return Math.floor(blockIndex / this.config.epochLength);
  }

  /**
   * Check if a block index is at an epoch boundary
   */
  isEpochBoundary(blockIndex: number): boolean {
    return blockIndex % this.config.epochLength === 0 && blockIndex > 0;
  }

  /**
   * Get block range for an epoch
   */
  getEpochBlockRange(epochNumber: number): { startBlock: number; endBlock: number } {
    const startBlock = epochNumber * this.config.epochLength;
    const endBlock = startBlock + this.config.epochLength - 1;
    return { startBlock, endBlock };
  }

  /**
   * Transition to next epoch
   * Recalculates all validator scores and selects new validator set
   */
  transitionEpoch(
    currentEpoch: number,
    validators: ValidatorInfo[]
  ): EpochInfo {
    // Recalculate all validator scores
    const updatedValidators = updateAllScores(validators);

    // Select top validators for next epoch
    const epochValidators = this.bft.getEpochValidatorSet(
      updatedValidators,
      this.config.maxValidators
    );

    const epochNumber = currentEpoch + 1;
    const { startBlock, endBlock } = this.getEpochBlockRange(epochNumber);

    return {
      epochNumber,
      startBlock,
      endBlock,
      validators: epochValidators.map(v => v.address),
      totalBlocks: this.config.epochLength,
      totalTransactions: 0, // Will be updated during epoch
    };
  }

  /**
   * Distribute epoch rewards proportional to validator PoN weight
   * Total reward per epoch: 10000 WOOLLY
   */
  getEpochRewards(epoch: EpochInfo, validators: ValidatorInfo[]): Map<string, number> {
    const totalReward = 10000; // Total WOOLLY tokens per epoch
    const rewards = new Map<string, number>();

    // Get validators in this epoch
    const epochValidatorMap = new Map<string, ValidatorInfo>();
    for (const validator of validators) {
      if (epoch.validators.includes(validator.address)) {
        epochValidatorMap.set(validator.address, validator);
      }
    }

    if (epochValidatorMap.size === 0) {
      return rewards; // No validators, no rewards
    }

    // Calculate total weight of epoch validators
    let totalWeight = 0;
    for (const validator of epochValidatorMap.values()) {
      totalWeight += validator.ponWeight;
    }

    if (totalWeight === 0) {
      // Distribute equally if no weight difference
      const equalShare = totalReward / epochValidatorMap.size;
      for (const address of epoch.validators) {
        rewards.set(address, equalShare);
      }
      return rewards;
    }

    // Distribute rewards proportional to PoN weight
    for (const address of epoch.validators) {
      const validator = epochValidatorMap.get(address);
      if (validator) {
        const reward = (validator.ponWeight / totalWeight) * totalReward;
        rewards.set(address, reward);
      }
    }

    return rewards;
  }

  /**
   * Get detailed epoch statistics
   */
  getEpochStats(
    epochNumber: number,
    validators: ValidatorInfo[]
  ): {
    epochNumber: number;
    expectedDuration: string;
    validatorCount: number;
    totalWeight: number;
    avgWeight: number;
  } {
    const epochValidators = validators.filter(v => v.isActive);

    let totalWeight = 0;
    for (const validator of epochValidators) {
      totalWeight += validator.ponWeight;
    }

    const avgWeight = epochValidators.length > 0 ? totalWeight / epochValidators.length : 0;

    // Expected duration: epochLength * blockTime (in milliseconds)
    const durationMs = this.config.epochLength * this.config.blockTime;
    const durationHours = durationMs / (1000 * 60 * 60);
    const durationDays = durationHours / 24;

    return {
      epochNumber,
      expectedDuration: `${durationDays.toFixed(1)} days`,
      validatorCount: epochValidators.length,
      totalWeight,
      avgWeight,
    };
  }

  /**
   * Estimate finality time for blocks
   * With 2/3 BFT consensus and weighted voting
   */
  getEstimatedFinalityTime(): string {
    // In ideal conditions: 1 proposal round + vote collection + finality
    // Roughly 2-3 block times for consensus to be reached
    // With 6-second blocks: ~12-18 seconds
    const estimatedBlocks = 2;
    const estimatedMs = estimatedBlocks * this.config.blockTime;
    const estimatedSeconds = estimatedMs / 1000;

    return `${estimatedSeconds.toFixed(1)} seconds`;
  }
}

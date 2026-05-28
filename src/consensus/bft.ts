/**
 * Woolly Chain - Weighted BFT Consensus Engine
 * Implements Byzantine Fault Tolerant consensus with PoN weight-based voting
 * Requires 2/3 weighted threshold for block finality
 */

import { ValidatorInfo, Block, ChainConfig, DEFAULT_CHAIN_CONFIG } from '../core/types';

export interface VoteResult {
  approved: boolean;
  totalWeight: number;
  approvedWeight: number;
}

export class WeightedBFT {
  private config: ChainConfig;

  constructor(config: ChainConfig = DEFAULT_CHAIN_CONFIG) {
    this.config = config;
  }

  /**
   * Select proposer for next block using weighted probabilistic selection
   * Uses deterministic seeding from block index for reproducibility
   */
  selectProposer(validators: ValidatorInfo[], blockIndex: number): ValidatorInfo {
    if (validators.length === 0) {
      throw new Error('No validators available for proposer selection');
    }

    // Filter to only eligible validators (active with sufficient scores)
    const eligibleValidators = validators.filter(v => v.isActive && v.ponWeight > 0);

    if (eligibleValidators.length === 0) {
      throw new Error('No eligible validators available for proposer selection');
    }

    // Deterministic seed from block index for reproducibility
    // Using xorshift32 PRNG for deterministic randomness
    const seed = this.xorshift32(blockIndex);

    // Calculate cumulative weights
    let totalWeight = 0;
    const cumulativeWeights: number[] = [];

    for (const validator of eligibleValidators) {
      totalWeight += validator.ponWeight;
      cumulativeWeights.push(totalWeight);
    }

    // Select proposer based on weighted probability
    const randomValue = (seed % 10000) / 10000; // Normalize to [0, 1]
    const targetWeight = randomValue * totalWeight;

    for (let i = 0; i < cumulativeWeights.length; i++) {
      if (targetWeight <= cumulativeWeights[i]) {
        return eligibleValidators[i];
      }
    }

    // Fallback to highest weight validator (should not happen)
    return eligibleValidators.reduce((a, b) => a.ponWeight > b.ponWeight ? a : b);
  }

  /**
   * Simulate BFT vote collection for a block
   * Returns vote result with approval status and weight distribution
   */
  collectVotes(block: Block, validators: ValidatorInfo[]): VoteResult {
    const eligibleValidators = validators.filter(v => v.isActive && v.ponWeight > 0);

    if (eligibleValidators.length === 0) {
      return {
        approved: false,
        totalWeight: 0,
        approvedWeight: 0,
      };
    }

    // Calculate total network weight
    let totalWeight = 0;
    for (const validator of eligibleValidators) {
      totalWeight += validator.ponWeight;
    }

    // Simulate voting: validators vote with probability proportional to their reliability
    // In real implementation, this would collect actual signed votes from validators
    // For now, simulate based on validator quality metrics
    let approvedWeight = 0;

    for (const validator of eligibleValidators) {
      // Voting probability based on commitment score (uptime, cross-validation reliability)
      // Higher commitment score = higher probability of voting "yes" on valid blocks
      const votingProbability = 0.95 + (validator.commitmentScore * 0.05); // 95-100% vote yes for valid blocks

      // Deterministic voting based on block hash and validator address
      const hashSeed = this.hashToInt(block.hash + validator.address);
      const vote = (hashSeed % 100) < (votingProbability * 100);

      if (vote) {
        approvedWeight += validator.ponWeight;
      }
    }

    // Calculate if block approved: need 2/3 weighted majority
    const requiredWeight = totalWeight * (2 / 3);
    const approved = approvedWeight >= requiredWeight;

    return {
      approved,
      totalWeight,
      approvedWeight,
    };
  }

  /**
   * Finalize a block after vote collection
   * Returns true if 2/3 weighted threshold is met
   */
  finalizeBlock(block: Block, votes: VoteResult): boolean {
    if (votes.totalWeight === 0) {
      return false;
    }

    const requiredWeight = votes.totalWeight * (2 / 3);
    return votes.approvedWeight >= requiredWeight;
  }

  /**
   * Select top-N validators for current epoch
   * Used for epoch validator set rotation
   */
  getEpochValidatorSet(allValidators: ValidatorInfo[], maxValidators: number): ValidatorInfo[] {
    const activeValidators = allValidators
      .filter(v => v.isActive)
      .sort((a, b) => b.ponWeight - a.ponWeight)
      .slice(0, maxValidators);

    return activeValidators;
  }

  /**
   * Check if a validator has sufficient weight to participate in consensus
   */
  isValidatorEligible(validator: ValidatorInfo, minWeight: number = 0.001): boolean {
    return validator.isActive && validator.ponWeight >= minWeight;
  }

  /**
   * Get consensus statistics for monitoring
   */
  getConsensusStats(validators: ValidatorInfo[]): {
    totalValidators: number;
    activeValidators: number;
    totalWeight: number;
    avgWeight: number;
    medianWeight: number;
  } {
    const eligible = validators.filter(v => v.isActive);

    let totalWeight = 0;
    const weights: number[] = [];

    for (const validator of eligible) {
      totalWeight += validator.ponWeight;
      weights.push(validator.ponWeight);
    }

    weights.sort((a, b) => a - b);
    const medianWeight = weights.length > 0
      ? weights[Math.floor(weights.length / 2)]
      : 0;

    return {
      totalValidators: validators.length,
      activeValidators: eligible.length,
      totalWeight,
      avgWeight: eligible.length > 0 ? totalWeight / eligible.length : 0,
      medianWeight,
    };
  }

  /**
   * Simple 32-bit xorshift PRNG for deterministic randomness
   */
  private xorshift32(seed: number): number {
    let x = seed || 123456789;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return Math.abs(x);
  }

  /**
   * Hash a string to an integer for deterministic selection
   */
  private hashToInt(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

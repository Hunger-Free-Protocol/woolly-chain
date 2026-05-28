/**
 * Woolly Chain - Consensus Engine Exports
 * Proof of Nourishment Consensus Implementation
 */

// Scoring functions
export {
  calculateProductivityScore,
  calculateSustainabilityScore,
  calculateCommitmentScore,
  calculatePoNWeight,
  updateValidatorScores,
  updateAllScores,
} from './scoring';

// Validator management
export { ValidatorManager } from './validator';

// BFT consensus
export { WeightedBFT, type VoteResult } from './bft';

// Epoch management
export { EpochManager } from './epoch';

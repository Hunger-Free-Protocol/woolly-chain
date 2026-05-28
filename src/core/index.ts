/**
 * Woolly Chain - Core Module Exports
 * Public API for the blockchain layer
 */

// Types
export {
  TransactionType,
  Transaction,
  Block,
  TokenType,
  TokenInfo,
  TelemetryData,
  ValidatorInfo,
  AccountState,
  ContractType,
  ContractState,
  EpochInfo,
  ChainConfig,
  DEFAULT_CHAIN_CONFIG,
} from './types';

// Crypto utilities
export {
  sha256,
  hashBlock,
  generateAddress,
  signData,
  verifySignature,
  generateTransactionId,
  generateContractId,
  computeMerkleRoot,
} from './crypto';

// Block operations
export {
  createGenesisBlock,
  createBlock,
  isValidBlock,
} from './block';

// State management
export { WorldState } from './state';

// Blockchain
export { WoollyChain } from './chain';

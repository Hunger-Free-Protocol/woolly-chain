/**
 * Woolly Chain - Core Type Definitions
 * Defines all shared interfaces and enums for the blockchain layer
 */

/**
 * Transaction Types
 */
export enum TransactionType {
  TRANSFER = 'TRANSFER',
  VALIDATOR_REGISTER = 'VALIDATOR_REGISTER',
  TELEMETRY_SUBMIT = 'TELEMETRY_SUBMIT',
  TOKEN_MINT = 'TOKEN_MINT',
  TOKEN_BURN = 'TOKEN_BURN',
  CONTRACT_CALL = 'CONTRACT_CALL',
  CARBON_CREDIT = 'CARBON_CREDIT',
  CONTRIBUTION_REGISTER = 'CONTRIBUTION_REGISTER',
}

/**
 * Transaction - Core unit of blockchain activity
 */
export interface Transaction {
  id: string;
  type: TransactionType;
  from: string;
  to: string;
  amount: number;
  data?: any;
  timestamp: number;
  signature: string;
}

/**
 * Block - Immutable ledger entry
 */
export interface Block {
  index: number;
  timestamp: number;
  previousHash: string;
  hash: string;
  transactions: Transaction[];
  proposer: string;
  ponWeight: number;
  nonce: number;
  epoch: number;
}

/**
 * Token Types
 */
export enum TokenType {
  WOOLLY = 'WOOLLY',
  FARM_EQUITY = 'FARM_EQUITY',
  CROP_CYCLE_YIELD = 'CROP_CYCLE_YIELD',
  IP_NFT = 'IP_NFT',
  WOOLLY_CARBON = 'WOOLLY_CARBON',
}

/**
 * Token Information
 */
export interface TokenInfo {
  id: string;
  type: TokenType;
  name: string;
  totalSupply: number;
  metadata?: any;
}

/**
 * Telemetry Data - Farm sensor readings
 */
export interface TelemetryData {
  farmId: string;
  timestamp: number;
  soilMoisture: number;
  soilPH: number;
  soilEC: number;
  airTemp: number;
  humidity: number;
  lightIntensity: number;
  waterUsageLiters: number;
  co2Level: number;
  ndviScore: number;
  crossValidationScores: number[];
}

/**
 * Validator Information - Registered farm validator
 */
export interface ValidatorInfo {
  address: string;
  farmId: string;
  location: {
    lat: number;
    lng: number;
  };
  registeredAt: number;
  cropCycles: number;
  productivityScore: number;
  sustainabilityScore: number;
  commitmentScore: number;
  ponWeight: number;
  isActive: boolean;
  telemetryHistory: TelemetryData[];
}

/**
 * Account State - User/validator account ledger
 */
export interface AccountState {
  address: string;
  balances: Map<string, number>;
  nonce: number;
  isValidator: boolean;
  validatorInfo?: ValidatorInfo;
}

/**
 * Contract Types
 */
export enum ContractType {
  BUILD = 'BUILD',
  CROP_CYCLE = 'CROP_CYCLE',
  PROFIT_SHARING = 'PROFIT_SHARING',
}

/**
 * Contract State - Smart contract ledger entry
 */
export interface ContractState {
  id: string;
  type: ContractType;
  farmId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  params: any;
  created: number;
  updated: number;
}

/**
 * Epoch Info - Information about a blockchain epoch
 */
export interface EpochInfo {
  epochNumber: number;
  startBlock: number;
  endBlock: number;
  validators: string[];
  totalBlocks: number;
  totalTransactions: number;
}

/**
 * Chain Configuration - Protocol parameters
 * Based on Woolly Protocol specification
 */
export interface ChainConfig {
  // Block production
  blockTime: number; // 6000ms (6 seconds)
  epochLength: number; // ~7 days in blocks = 100800
  maxValidators: number; // 100

  // Validator requirements
  minCropCycles: number; // 2
  minCrossValidation: number; // 0.85

  // Score weights
  sustainabilityWeight: number; // 0.40
  productivityWeight: number; // 0.25
  commitmentWeight: number; // 0.35

  // Fees
  produceSettlementFee: number; // 0.05 (5%)
  carbonIssuanceFee: number; // 0.01 (1%)
}

/**
 * Default Chain Configuration
 */
export const DEFAULT_CHAIN_CONFIG: ChainConfig = {
  blockTime: 6000,
  epochLength: 100800,
  maxValidators: 100,
  minCropCycles: 2,
  minCrossValidation: 0.85,
  sustainabilityWeight: 0.40,
  productivityWeight: 0.25,
  commitmentWeight: 0.35,
  produceSettlementFee: 0.05,
  carbonIssuanceFee: 0.01,
};

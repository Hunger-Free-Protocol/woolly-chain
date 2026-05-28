/**
 * Woolly Chain - World State Management
 * Maintains in-memory state of accounts, validators, tokens, and contracts
 */

import {
  AccountState,
  Block,
  ChainConfig,
  ContractState,
  ContractType,
  DEFAULT_CHAIN_CONFIG,
  EpochInfo,
  TokenInfo,
  TokenType,
  Transaction,
  TransactionType,
  ValidatorInfo,
} from './types';

/**
 * WorldState - Core blockchain state store
 */
export class WorldState {
  private accounts: Map<string, AccountState> = new Map();
  private validators: Map<string, ValidatorInfo> = new Map();
  private tokens: Map<string, TokenInfo> = new Map();
  private contracts: Map<string, ContractState> = new Map();
  private epochs: Map<number, EpochInfo> = new Map();
  private config: ChainConfig;

  constructor(config: ChainConfig = DEFAULT_CHAIN_CONFIG) {
    this.config = config;
  }

  /**
   * Get account state, creating if it doesn't exist
   */
  public getAccount(address: string): AccountState {
    if (!this.accounts.has(address)) {
      this.createAccount(address);
    }
    return this.accounts.get(address)!;
  }

  /**
   * Create a new account
   */
  public createAccount(address: string): AccountState {
    const account: AccountState = {
      address,
      balances: new Map(),
      nonce: 0,
      isValidator: false,
    };
    this.accounts.set(address, account);
    return account;
  }

  /**
   * Update account balance for a token
   */
  public updateBalance(
    address: string,
    tokenId: string,
    delta: number
  ): boolean {
    const account = this.getAccount(address);
    const current = account.balances.get(tokenId) || 0;
    const updated = current + delta;

    if (updated < 0) {
      return false; // Insufficient balance
    }

    account.balances.set(tokenId, updated);
    return true;
  }

  /**
   * Get account balance for a token
   */
  public getBalance(address: string, tokenId: string): number {
    const account = this.getAccount(address);
    return account.balances.get(tokenId) || 0;
  }

  /**
   * Register a validator
   */
  public registerValidator(info: ValidatorInfo): void {
    this.validators.set(info.address, info);
    const account = this.getAccount(info.address);
    account.isValidator = true;
    account.validatorInfo = info;
  }

  /**
   * Get validator info
   */
  public getValidator(address: string): ValidatorInfo | undefined {
    return this.validators.get(address);
  }

  /**
   * Get all active validators
   */
  public getActiveValidators(): ValidatorInfo[] {
    return Array.from(this.validators.values()).filter((v) => v.isActive);
  }

  /**
   * Update validator scores
   */
  public updateValidatorScores(
    address: string,
    scores: {
      productivityScore?: number;
      sustainabilityScore?: number;
      commitmentScore?: number;
    }
  ): boolean {
    const validator = this.validators.get(address);
    if (!validator) {
      return false;
    }

    if (scores.productivityScore !== undefined) {
      validator.productivityScore = scores.productivityScore;
    }
    if (scores.sustainabilityScore !== undefined) {
      validator.sustainabilityScore = scores.sustainabilityScore;
    }
    if (scores.commitmentScore !== undefined) {
      validator.commitmentScore = scores.commitmentScore;
    }

    return true;
  }

  /**
   * Compute PoN weight for a validator
   */
  public computeValidatorPonWeight(address: string): number {
    const validator = this.validators.get(address);
    if (!validator) {
      return 0;
    }

    const { sustainabilityWeight, productivityWeight, commitmentWeight } =
      this.config;

    const ponWeight =
      validator.sustainabilityScore * sustainabilityWeight +
      validator.productivityScore * productivityWeight +
      validator.commitmentScore * commitmentWeight;

    return Math.max(0, Math.min(1, ponWeight));
  }

  /**
   * Register a token
   */
  public registerToken(info: TokenInfo): void {
    this.tokens.set(info.id, info);
  }

  /**
   * Get token info
   */
  public getToken(id: string): TokenInfo | undefined {
    return this.tokens.get(id);
  }

  /**
   * Mint tokens
   */
  public mintToken(tokenId: string, to: string, amount: number): boolean {
    const token = this.tokens.get(tokenId);
    if (!token) {
      return false;
    }

    if (amount < 0) {
      return false;
    }

    token.totalSupply += amount;
    return this.updateBalance(to, tokenId, amount);
  }

  /**
   * Burn tokens
   */
  public burnToken(
    tokenId: string,
    from: string,
    amount: number
  ): boolean {
    const token = this.tokens.get(tokenId);
    if (!token) {
      return false;
    }

    if (amount < 0) {
      return false;
    }

    const balance = this.getBalance(from, tokenId);
    if (balance < amount) {
      return false;
    }

    token.totalSupply -= amount;
    return this.updateBalance(from, tokenId, -amount);
  }

  /**
   * Create a contract
   */
  public createContract(state: ContractState): void {
    this.contracts.set(state.id, state);
  }

  /**
   * Get contract state
   */
  public getContract(id: string): ContractState | undefined {
    return this.contracts.get(id);
  }

  /**
   * Update contract
   */
  public updateContract(id: string, updates: Partial<ContractState>): boolean {
    const contract = this.contracts.get(id);
    if (!contract) {
      return false;
    }

    Object.assign(contract, updates, { updated: Math.floor(Date.now() / 1000) });
    return true;
  }

  /**
   * Get current epoch info
   */
  public getCurrentEpoch(): EpochInfo | undefined {
    let maxEpoch = -1;
    let currentEpoch: EpochInfo | undefined;

    for (const [epochNum, epochInfo] of this.epochs) {
      if (epochNum > maxEpoch) {
        maxEpoch = epochNum;
        currentEpoch = epochInfo;
      }
    }

    return currentEpoch;
  }

  /**
   * Advance to next epoch
   */
  public advanceEpoch(epochInfo: EpochInfo): void {
    this.epochs.set(epochInfo.epochNumber, epochInfo);
  }

  /**
   * Apply a transaction to state
   */
  public applyTransaction(tx: Transaction): boolean {
    switch (tx.type) {
      case TransactionType.TRANSFER:
        return this.handleTransfer(tx);
      case TransactionType.VALIDATOR_REGISTER:
        return this.handleValidatorRegister(tx);
      case TransactionType.TELEMETRY_SUBMIT:
        return this.handleTelemetrySubmit(tx);
      case TransactionType.TOKEN_MINT:
        return this.handleTokenMint(tx);
      case TransactionType.TOKEN_BURN:
        return this.handleTokenBurn(tx);
      case TransactionType.CONTRACT_CALL:
        return this.handleContractCall(tx);
      case TransactionType.CARBON_CREDIT:
        return this.handleCarbonCredit(tx);
      case TransactionType.CONTRIBUTION_REGISTER:
        return this.handleContributionRegister(tx);
      default:
        return false;
    }
  }

  /**
   * Handle TRANSFER transaction
   */
  private handleTransfer(tx: Transaction): boolean {
    const balance = this.getBalance(tx.from, 'WOOLLY');
    if (balance < tx.amount) {
      return false;
    }

    if (!this.updateBalance(tx.from, 'WOOLLY', -tx.amount)) {
      return false;
    }

    if (!this.updateBalance(tx.to, 'WOOLLY', tx.amount)) {
      // Rollback
      this.updateBalance(tx.from, 'WOOLLY', tx.amount);
      return false;
    }

    return true;
  }

  /**
   * Handle VALIDATOR_REGISTER transaction
   */
  private handleValidatorRegister(tx: Transaction): boolean {
    if (!tx.data || !tx.data.validatorInfo) {
      return false;
    }

    try {
      const validatorInfo: ValidatorInfo = tx.data.validatorInfo;
      this.registerValidator(validatorInfo);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle TELEMETRY_SUBMIT transaction
   */
  private handleTelemetrySubmit(tx: Transaction): boolean {
    if (!tx.data || !tx.data.telemetryData) {
      return false;
    }

    try {
      const farmId = tx.data.telemetryData.farmId;
      const validator = Array.from(this.validators.values()).find(
        (v) => v.farmId === farmId
      );

      if (!validator) {
        return false;
      }

      validator.telemetryHistory.push(tx.data.telemetryData);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle TOKEN_MINT transaction
   */
  private handleTokenMint(tx: Transaction): boolean {
    if (!tx.data || !tx.data.tokenId) {
      return false;
    }

    return this.mintToken(tx.data.tokenId, tx.to, tx.amount);
  }

  /**
   * Handle TOKEN_BURN transaction
   */
  private handleTokenBurn(tx: Transaction): boolean {
    if (!tx.data || !tx.data.tokenId) {
      return false;
    }

    return this.burnToken(tx.data.tokenId, tx.from, tx.amount);
  }

  /**
   * Handle CONTRACT_CALL transaction
   */
  private handleContractCall(tx: Transaction): boolean {
    if (!tx.data || !tx.data.contractId) {
      return false;
    }

    try {
      const contractId = tx.data.contractId;
      const contract = this.contracts.get(contractId);

      if (!contract) {
        return false;
      }

      // Update contract state based on call data
      if (tx.data.updates) {
        return this.updateContract(contractId, tx.data.updates);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle CARBON_CREDIT transaction
   */
  private handleCarbonCredit(tx: Transaction): boolean {
    if (!tx.data || !tx.data.coTwoReduction) {
      return false;
    }

    // Apply carbon credit fee
    const fee = tx.amount * this.config.carbonIssuanceFee;
    if (!this.updateBalance(tx.from, 'WOOLLY', -fee)) {
      return false;
    }

    // Mint WOOLLY_CARBON tokens
    return this.mintToken('WOOLLY_CARBON', tx.to, tx.amount);
  }

  /**
   * Handle CONTRIBUTION_REGISTER transaction
   */
  private handleContributionRegister(tx: Transaction): boolean {
    if (!tx.data || !tx.data.contributionType) {
      return false;
    }

    // Record contribution in account data
    const account = this.getAccount(tx.from);
    if (!account.balances.has('CONTRIBUTIONS')) {
      account.balances.set('CONTRIBUTIONS', 0);
    }

    const current = account.balances.get('CONTRIBUTIONS') || 0;
    account.balances.set('CONTRIBUTIONS', current + 1);

    return true;
  }

  /**
   * Create a snapshot of the state
   */
  public snapshot(): object {
    const accountsData: Record<string, any> = {};
    for (const [address, account] of this.accounts) {
      accountsData[address] = {
        address: account.address,
        balances: Object.fromEntries(account.balances),
        nonce: account.nonce,
        isValidator: account.isValidator,
      };
    }

    const validatorsData: Record<string, any> = {};
    for (const [address, validator] of this.validators) {
      validatorsData[address] = {
        ...validator,
      };
    }

    const tokensData: Record<string, any> = {};
    for (const [id, token] of this.tokens) {
      tokensData[id] = {
        ...token,
      };
    }

    const contractsData: Record<string, any> = {};
    for (const [id, contract] of this.contracts) {
      contractsData[id] = {
        ...contract,
      };
    }

    const epochsData: Record<number, any> = {};
    for (const [num, epoch] of this.epochs) {
      epochsData[num] = {
        ...epoch,
      };
    }

    return {
      accounts: accountsData,
      validators: validatorsData,
      tokens: tokensData,
      contracts: contractsData,
      epochs: epochsData,
    };
  }

  /**
   * Restore state from snapshot
   */
  public restore(data: any): void {
    this.accounts.clear();
    this.validators.clear();
    this.tokens.clear();
    this.contracts.clear();
    this.epochs.clear();

    if (data.accounts) {
      for (const [address, accountData] of Object.entries(data.accounts)) {
        const account: AccountState = {
          address: (accountData as any).address,
          balances: new Map(Object.entries((accountData as any).balances)),
          nonce: (accountData as any).nonce,
          isValidator: (accountData as any).isValidator,
        };
        this.accounts.set(address, account);
      }
    }

    if (data.validators) {
      for (const [address, validatorData] of Object.entries(
        data.validators
      )) {
        this.validators.set(address, validatorData as ValidatorInfo);
      }
    }

    if (data.tokens) {
      for (const [id, tokenData] of Object.entries(data.tokens)) {
        this.tokens.set(id, tokenData as TokenInfo);
      }
    }

    if (data.contracts) {
      for (const [id, contractData] of Object.entries(data.contracts)) {
        this.contracts.set(id, contractData as ContractState);
      }
    }

    if (data.epochs) {
      for (const [numStr, epochData] of Object.entries(data.epochs)) {
        const num = parseInt(numStr);
        this.epochs.set(num, epochData as EpochInfo);
      }
    }
  }

  /**
   * Get all accounts
   */
  public getAllAccounts(): AccountState[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Get all tokens
   */
  public getAllTokens(): TokenInfo[] {
    return Array.from(this.tokens.values());
  }

  /**
   * Get all contracts
   */
  public getAllContracts(): ContractState[] {
    return Array.from(this.contracts.values());
  }

  /**
   * Get configuration
   */
  public getConfig(): ChainConfig {
    return this.config;
  }

  /**
   * Increment account nonce
   */
  public incrementNonce(address: string): number {
    const account = this.getAccount(address);
    account.nonce += 1;
    return account.nonce;
  }
}

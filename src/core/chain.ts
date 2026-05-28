/**
 * Woolly Chain - Blockchain Implementation
 * Core blockchain with block production, validation, and state management
 */

import { writeFileSync, readFileSync } from 'fs';
import {
  Block,
  ChainConfig,
  DEFAULT_CHAIN_CONFIG,
  TokenInfo,
  TokenType,
  Transaction,
} from './types';
import { createGenesisBlock, isValidBlock } from './block';
import { WorldState } from './state';
import path from 'path';

/**
 * WoollyChain - Main blockchain class
 */
export class WoollyChain {
  private blocks: Block[] = [];
  private pendingTransactions: Transaction[] = [];
  public state: WorldState;
  private config: ChainConfig;
  private currentEpoch: number = 0;

  constructor(config: ChainConfig = DEFAULT_CHAIN_CONFIG) {
    this.config = config;
    this.state = new WorldState(config);

    // Create genesis block
    const genesisBlock = createGenesisBlock();
    this.blocks.push(genesisBlock);

    // Initialize state with genesis block
    this.initializeGenesis();
  }

  /**
   * Initialize genesis state
   */
  private initializeGenesis(): void {
    const TREASURY_ADDRESS = 'woolly_treasury_initial';
    const INITIAL_SUPPLY = 1_000_000_000; // 1 billion WOOLLY

    // Create WOOLLY token
    const woollyToken: TokenInfo = {
      id: 'WOOLLY',
      type: TokenType.WOOLLY,
      name: 'Woolly',
      totalSupply: 0,
      metadata: {
        decimals: 18,
        description: 'Native token of Woolly Chain',
      },
    };

    this.state.registerToken(woollyToken);

    // Mint initial supply to treasury
    this.state.mintToken('WOOLLY', TREASURY_ADDRESS, INITIAL_SUPPLY);
  }

  /**
   * Add a transaction to the pending pool
   */
  public addTransaction(tx: Transaction): boolean {
    // Validate transaction structure
    if (!tx.id || !tx.type || !tx.from || !tx.to) {
      return false;
    }

    // Check if from account has sufficient balance (for TRANSFER)
    if (tx.type === 'TRANSFER') {
      const balance = this.state.getBalance(tx.from, 'WOOLLY');
      if (balance < tx.amount) {
        return false;
      }
    }

    this.pendingTransactions.push(tx);
    return true;
  }

  /**
   * Get the latest block
   */
  public getLatestBlock(): Block {
    return this.blocks[this.blocks.length - 1];
  }

  /**
   * Add a block to the chain
   */
  public addBlock(block: Block): boolean {
    const prevBlock = this.getLatestBlock();

    // Validate the block
    if (!isValidBlock(block, prevBlock)) {
      return false;
    }

    // Apply all transactions in the block
    for (const tx of block.transactions) {
      if (!this.state.applyTransaction(tx)) {
        // Transaction application failed
        return false;
      }
    }

    // Block is valid and transactions applied
    this.blocks.push(block);

    // Remove applied transactions from pending pool
    const appliedTxIds = new Set(block.transactions.map((tx) => tx.id));
    this.pendingTransactions = this.pendingTransactions.filter(
      (tx) => !appliedTxIds.has(tx.id)
    );

    // Update epoch if needed
    if (block.index % this.config.epochLength === 0) {
      this.currentEpoch += 1;
    }

    return true;
  }

  /**
   * Get pending transactions
   */
  public getPendingTransactions(): Transaction[] {
    return [...this.pendingTransactions];
  }

  /**
   * Get block by index
   */
  public getBlockByIndex(index: number): Block | undefined {
    if (index < 0 || index >= this.blocks.length) {
      return undefined;
    }
    return this.blocks[index];
  }

  /**
   * Get block by hash
   */
  public getBlockByHash(hash: string): Block | undefined {
    return this.blocks.find((block) => block.hash === hash);
  }

  /**
   * Get chain length
   */
  public getChainLength(): number {
    return this.blocks.length;
  }

  /**
   * Get all blocks
   */
  public getBlocks(): Block[] {
    return [...this.blocks];
  }

  /**
   * Validate the entire chain
   */
  public isValidChain(): boolean {
    // Check genesis block
    const genesisBlock = this.blocks[0];
    if (genesisBlock.index !== 0 || genesisBlock.previousHash !== '0'.repeat(64)) {
      return false;
    }

    // Check all subsequent blocks
    for (let i = 1; i < this.blocks.length; i++) {
      const currentBlock = this.blocks[i];
      const prevBlock = this.blocks[i - 1];

      if (!isValidBlock(currentBlock, prevBlock)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get world state
   */
  public getState(): WorldState {
    return this.state;
  }

  /**
   * Get chain config
   */
  public getConfig(): ChainConfig {
    return this.config;
  }

  /**
   * Get current epoch
   */
  public getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  /**
   * Save chain to file
   */
  public saveToFile(filePath: string): void {
    const data = {
      blocks: this.blocks,
      currentEpoch: this.currentEpoch,
      state: this.state.snapshot(),
      timestamp: Math.floor(Date.now() / 1000),
    };

    const directory = path.dirname(filePath);
    try {
      // Ensure directory exists by checking if we can read it
      readFileSync(directory, 'utf-8');
    } catch {
      // Directory doesn't exist, will be created by writeFileSync
    }

    writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Load chain from file
   */
  public static loadFromFile(
    filePath: string,
    config: ChainConfig = DEFAULT_CHAIN_CONFIG
  ): WoollyChain {
    const fileContent = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    const chain = new WoollyChain(config);

    // Clear the genesis block and reload
    chain.blocks = data.blocks;
    chain.currentEpoch = data.currentEpoch;
    chain.state.restore(data.state);

    return chain;
  }

  /**
   * Get transaction by ID from blocks
   */
  public getTransactionById(txId: string): Transaction | undefined {
    for (const block of this.blocks) {
      const tx = block.transactions.find((t) => t.id === txId);
      if (tx) {
        return tx;
      }
    }
    return undefined;
  }

  /**
   * Get transactions from specific block
   */
  public getBlockTransactions(blockIndex: number): Transaction[] {
    const block = this.getBlockByIndex(blockIndex);
    return block ? block.transactions : [];
  }

  /**
   * Get balance for an address
   */
  public getBalance(address: string, tokenId: string = 'WOOLLY'): number {
    return this.state.getBalance(address, tokenId);
  }

  /**
   * Get account state
   */
  public getAccountState(address: string) {
    return this.state.getAccount(address);
  }

  /**
   * Clear pending transactions (for testing)
   */
  public clearPendingTransactions(): void {
    this.pendingTransactions = [];
  }
}

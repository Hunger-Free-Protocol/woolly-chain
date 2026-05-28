/**
 * Woolly Chain - Block Producer
 * Produces blocks at regular intervals using Proof of Nourishment consensus
 */

import { WoollyChain, Block, Transaction, hashBlock, createBlock } from '../core';
import { ValidatorManager, WeightedBFT, EpochManager, updateAllScores } from '../consensus';
import { ChainConfig } from '../core/types';

/**
 * Block Producer Status
 */
export interface ProducerStatus {
  producing: boolean;
  blocksProduced: number;
  currentEpoch: number;
  lastBlockTime: number;
}

/**
 * Block Producer - Generates blocks and manages consensus
 */
export class BlockProducer {
  private chain: WoollyChain;
  private validatorManager: ValidatorManager;
  private bft: WeightedBFT;
  private epochManager: EpochManager;
  private producing: boolean = false;
  private productionInterval: NodeJS.Timeout | null = null;
  private blocksProduced: number = 0;
  private lastBlockTime: number = 0;
  private config: ChainConfig;

  constructor(
    chain: WoollyChain,
    validatorManager: ValidatorManager,
    bft: WeightedBFT,
    epochManager: EpochManager
  ) {
    this.chain = chain;
    this.validatorManager = validatorManager;
    this.bft = bft;
    this.epochManager = epochManager;
    this.config = chain.getConfig();
  }

  /**
   * Start block production
   */
  public start(): void {
    if (this.producing) {
      console.warn('Block production is already running');
      return;
    }

    this.producing = true;
    console.log(`Starting block production (interval: ${this.config.blockTime}ms)`);

    // Produce the first block immediately, then at regular intervals
    this.produceBlock();

    this.productionInterval = setInterval(() => {
      this.produceBlock();
    }, this.config.blockTime);
  }

  /**
   * Stop block production
   */
  public stop(): void {
    if (!this.producing) {
      console.warn('Block production is not running');
      return;
    }

    this.producing = false;

    if (this.productionInterval) {
      clearInterval(this.productionInterval);
      this.productionInterval = null;
    }

    console.log('Block production stopped');
  }

  /**
   * Produce a new block
   * Process:
   * 1. Get pending transactions
   * 2. Get current epoch validator set
   * 3. Select proposer via weighted BFT
   * 4. Create block with proposer info
   * 5. Simulate BFT vote collection
   * 6. Add block to chain if approved
   * 7. Check epoch boundary and trigger epoch transition if needed
   */
  public produceBlock(): void {
    try {
      // Step 1: Get pending transactions
      const pendingTxs = this.chain.getPendingTransactions();

      // Step 2: Get current epoch validator set and update scores
      const currentEpoch = this.chain.getCurrentEpoch();
      const validators = this.validatorManager.getActiveValidators();

      // Update scores based on recent telemetry
      updateAllScores(validators);

      if (validators.length === 0) {
        console.warn('No active validators - skipping block production');
        return;
      }

      // Step 4: Create block
      const latestBlock = this.chain.getLatestBlock();

      // Step 3: Select proposer via weighted BFT
      const proposer = this.bft.selectProposer(validators, latestBlock.index);
      const proposerWeight = proposer.ponWeight;

      const blockIndex = latestBlock.index + 1;
      const timestamp = Math.floor(Date.now() / 1000);

      // Include pending transactions (limit to prevent block bloat)
      const maxTransactionsPerBlock = 100;
      const blockTransactions = pendingTxs.slice(0, maxTransactionsPerBlock);

      const block: Block = {
        index: blockIndex,
        timestamp,
        previousHash: latestBlock.hash,
        hash: '', // Will be calculated
        transactions: blockTransactions,
        proposer: proposer.address,
        ponWeight: proposerWeight,
        nonce: Math.floor(Math.random() * 1000000),
        epoch: currentEpoch,
      };

      // Calculate block hash
      block.hash = hashBlock(block);

      // Step 5: Simulate BFT vote collection
      // In MVP, we simulate 2/3+ weighted votes automatically
      const voteResult = this.bft.collectVotes(block, validators);

      // Step 6: Add block to chain if BFT approved (2/3+ weight)
      const weightRatio = voteResult.totalWeight > 0 ? voteResult.approvedWeight / voteResult.totalWeight : 0;
      if (voteResult.approved && weightRatio >= 2 / 3) {
        const success = this.chain.addBlock(block);

        if (success) {
          this.blocksProduced++;
          this.lastBlockTime = timestamp;

          console.log(`Block #${blockIndex} produced by ${proposer.farmId} (weight: ${proposerWeight.toFixed(4)})`);
          console.log(`  Transactions: ${blockTransactions.length}, Timestamp: ${timestamp}`);

          // Step 7: Check epoch boundary
          if (blockIndex > 0 && blockIndex % this.config.epochLength === 0) {
            console.log(`\n${'*'.repeat(60)}`);
            console.log(`EPOCH TRANSITION: ${currentEpoch} -> ${currentEpoch + 1}`);
            console.log(`${'*'.repeat(60)}`);

            // Trigger epoch transition
            this.transitionEpoch(validators);
          }
        } else {
          console.warn(`Failed to add block #${blockIndex} to chain`);
        }
      } else {
        console.warn(
          `Block #${blockIndex} rejected by BFT (approved: ${voteResult.approved}, weight: ${weightRatio.toFixed(4)})`
        );
      }
    } catch (error) {
      console.error('Error during block production:', error);
    }
  }

  /**
   * Transition to the next epoch
   * - Recalculate validator scores
   * - Distribute rewards to validators
   * - Update validator set for next epoch
   */
  private transitionEpoch(validators: any[]): void {
    try {
      // Recalculate all validator scores
      updateAllScores(validators);

      // Calculate rewards based on PoN weights
      const totalReward = 1_000_000; // 1M WOOLLY per epoch
      const rewards = new Map<string, number>();

      let totalWeight = 0;
      for (const validator of validators) {
        totalWeight += validator.ponWeight;
      }

      for (const validator of validators) {
        const share = (validator.ponWeight / totalWeight) * totalReward;
        rewards.set(validator.address, Math.floor(share));
      }

      // Distribute rewards
      const state = this.chain.getState();
      let rewardCount = 0;
      for (const [address, amount] of rewards) {
        if (amount > 0 && state.mintToken('WOOLLY', address, amount)) {
          rewardCount++;
        }
      }

      console.log(`Rewards distributed to ${rewardCount}/${validators.length} validators`);
      console.log(`Total epoch reward: ${totalReward} WOOLLY`);

      // Epoch transition handled by chain internally
    } catch (error) {
      console.error('Error during epoch transition:', error);
    }
  }

  /**
   * Get producer status
   */
  public getStatus(): ProducerStatus {
    return {
      producing: this.producing,
      blocksProduced: this.blocksProduced,
      currentEpoch: this.chain.getCurrentEpoch(),
      lastBlockTime: this.lastBlockTime,
    };
  }

  /**
   * Get number of blocks produced
   */
  public getBlocksProduced(): number {
    return this.blocksProduced;
  }

  /**
   * Get whether production is active
   */
  public isProducing(): boolean {
    return this.producing;
  }

  /**
   * Reset block production counter (for testing)
   */
  public resetCounter(): void {
    this.blocksProduced = 0;
  }
}

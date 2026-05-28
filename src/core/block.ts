/**
 * Woolly Chain - Block Creation and Validation
 * Handles genesis block and block production
 */

import { Block, Transaction } from './types';
import { hashBlock, sha256 } from './crypto';

const GENESIS_PROPOSER = 'woolly_genesis';

/**
 * Create the genesis block (block 0)
 */
export function createGenesisBlock(): Block {
  const genesisBlock: Omit<Block, 'hash'> = {
    index: 0,
    timestamp: Math.floor(Date.now() / 1000),
    previousHash: '0'.repeat(64),
    transactions: [],
    proposer: GENESIS_PROPOSER,
    ponWeight: 1.0,
    nonce: 0,
    epoch: 0,
  };

  const hash = hashBlock(genesisBlock);

  return {
    ...genesisBlock,
    hash,
  };
}

/**
 * Create a new block
 */
export function createBlock(
  prevBlock: Block,
  transactions: Transaction[],
  proposer: string,
  ponWeight: number,
  epoch: number
): Block {
  const block: Omit<Block, 'hash'> = {
    index: prevBlock.index + 1,
    timestamp: Math.floor(Date.now() / 1000),
    previousHash: prevBlock.hash,
    transactions,
    proposer,
    ponWeight,
    nonce: 0,
    epoch,
  };

  const hash = hashBlock(block);

  return {
    ...block,
    hash,
  };
}

/**
 * Validate a block
 */
export function isValidBlock(block: Block, prevBlock: Block): boolean {
  // Check index is sequential
  if (block.index !== prevBlock.index + 1) {
    return false;
  }

  // Check previous hash matches
  if (block.previousHash !== prevBlock.hash) {
    return false;
  }

  // Check timestamp is reasonable (not in the past or too far in future)
  const now = Math.floor(Date.now() / 1000);
  if (block.timestamp > now + 300) {
    // 5 minute tolerance
    return false;
  }

  // Check hash is correct
  const blockWithoutHash: Omit<Block, 'hash'> = {
    index: block.index,
    timestamp: block.timestamp,
    previousHash: block.previousHash,
    transactions: block.transactions,
    proposer: block.proposer,
    ponWeight: block.ponWeight,
    nonce: block.nonce,
    epoch: block.epoch,
  };

  const computedHash = hashBlock(blockWithoutHash);
  if (block.hash !== computedHash) {
    return false;
  }

  // Check proposer is valid (non-empty address)
  if (!block.proposer || block.proposer.length === 0) {
    return false;
  }

  // Check ponWeight is reasonable (0 < weight <= 1)
  if (block.ponWeight <= 0 || block.ponWeight > 1) {
    return false;
  }

  // Check epoch is non-negative
  if (block.epoch < 0) {
    return false;
  }

  // Check nonce is non-negative
  if (block.nonce < 0) {
    return false;
  }

  // All transactions in block must be valid objects
  for (const tx of block.transactions) {
    if (!isValidTransaction(tx)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a transaction
 */
function isValidTransaction(tx: Transaction): boolean {
  // Check required fields
  if (!tx.id || !tx.type || !tx.from || !tx.to) {
    return false;
  }

  // Check amount is non-negative
  if (typeof tx.amount !== 'number' || tx.amount < 0) {
    return false;
  }

  // Check timestamp is reasonable
  if (typeof tx.timestamp !== 'number' || tx.timestamp <= 0) {
    return false;
  }

  // Check signature exists
  if (!tx.signature || typeof tx.signature !== 'string') {
    return false;
  }

  return true;
}

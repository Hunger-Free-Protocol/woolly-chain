/**
 * Woolly Chain - Cryptography Utilities
 * Handles hashing, signatures, and key generation
 */

import crypto from 'crypto';
import { Block } from './types';

/**
 * Compute SHA-256 hash of data
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Hash a block (all fields except hash)
 */
export function hashBlock(block: Omit<Block, 'hash'>): string {
  const blockData = {
    index: block.index,
    timestamp: block.timestamp,
    previousHash: block.previousHash,
    transactions: block.transactions,
    proposer: block.proposer,
    ponWeight: block.ponWeight,
    nonce: block.nonce,
    epoch: block.epoch,
  };

  return sha256(JSON.stringify(blockData));
}

/**
 * Generate a new random address
 * Format: woolly_<32 hex chars>
 */
export function generateAddress(): string {
  const randomHex = crypto.randomBytes(16).toString('hex');
  return `woolly_${randomHex}`;
}

/**
 * Sign data with a private key (HMAC placeholder)
 * In production, this would use ECDSA or EdDSA
 */
export function signData(data: string, privateKey: string): string {
  return crypto
    .createHmac('sha256', privateKey)
    .update(data)
    .digest('hex');
}

/**
 * Verify a signature with a public key (HMAC placeholder)
 * In production, this would use ECDSA or EdDSA verification
 */
export function verifySignature(
  data: string,
  signature: string,
  publicKey: string
): boolean {
  const computed = signData(data, publicKey);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computed)
  );
}

/**
 * Generate a transaction ID (random hash)
 */
export function generateTransactionId(): string {
  return sha256(crypto.randomBytes(32).toString('hex'));
}

/**
 * Generate a contract ID
 */
export function generateContractId(): string {
  return `contract_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Compute Merkle root of transactions
 */
export function computeMerkleRoot(transactionIds: string[]): string {
  if (transactionIds.length === 0) {
    return sha256('');
  }

  let hashes = transactionIds.map((id) => sha256(id));

  while (hashes.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;
      nextLevel.push(sha256(left + right));
    }
    hashes = nextLevel;
  }

  return hashes[0];
}

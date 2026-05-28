/**
 * Woolly Chain - WOOLLY Governance Token
 * Native governance token for the protocol with validator reward distribution
 */

import { v4 as uuidv4 } from 'uuid';
import { TokenInfo, TokenType } from '../core/types';
import { WorldState } from '../core/state';

export class WoollyToken {
  readonly TOKEN_ID = 'WOOLLY';
  private initialized = false;

  /**
   * Initialize WOOLLY token with 1B supply
   * @param state - WorldState instance
   * @returns TokenInfo for WOOLLY token
   */
  public initialize(state: WorldState): TokenInfo {
    if (this.initialized) {
      const existing = state.getToken(this.TOKEN_ID);
      if (existing) return existing;
    }

    const tokenInfo: TokenInfo = {
      id: this.TOKEN_ID,
      type: TokenType.WOOLLY,
      name: 'Woolly Governance Token',
      totalSupply: 1_000_000_000, // 1 billion
      metadata: {
        decimals: 18,
        description: 'Native governance token for Woolly Protocol',
        createdAt: Math.floor(Date.now() / 1000),
      },
    };

    state.registerToken(tokenInfo);
    this.initialized = true;

    return tokenInfo;
  }

  /**
   * Transfer WOOLLY tokens between addresses
   * @param state - WorldState instance
   * @param from - Source address
   * @param to - Destination address
   * @param amount - Amount to transfer
   * @returns boolean indicating success
   */
  public transfer(
    state: WorldState,
    from: string,
    to: string,
    amount: number
  ): boolean {
    if (amount <= 0) {
      return false;
    }

    const balance = state.getBalance(from, this.TOKEN_ID);
    if (balance < amount) {
      return false;
    }

    // Debit from sender
    if (!state.updateBalance(from, this.TOKEN_ID, -amount)) {
      return false;
    }

    // Credit to receiver
    if (!state.updateBalance(to, this.TOKEN_ID, amount)) {
      // Rollback on failure
      state.updateBalance(from, this.TOKEN_ID, amount);
      return false;
    }

    return true;
  }

  /**
   * Get WOOLLY balance for an address
   * @param state - WorldState instance
   * @param address - Account address
   * @returns Balance in smallest units
   */
  public getBalance(state: WorldState, address: string): number {
    return state.getBalance(address, this.TOKEN_ID);
  }

  /**
   * Distribute validator rewards from treasury
   * Mints new WOOLLY tokens and distributes to validators
   * @param state - WorldState instance
   * @param rewards - Map of validator address to reward amount
   * @returns boolean indicating success
   */
  public distributeValidatorRewards(
    state: WorldState,
    rewards: Map<string, number>
  ): boolean {
    const token = state.getToken(this.TOKEN_ID);
    if (!token) {
      return false;
    }

    try {
      for (const [address, amount] of rewards) {
        if (amount <= 0) {
          continue;
        }

        // Mint tokens to validator
        if (!state.mintToken(this.TOKEN_ID, address, amount)) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }
}

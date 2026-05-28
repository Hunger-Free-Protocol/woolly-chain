/**
 * Woolly Chain - Crop Cycle Yield Tokens
 * Semi-fungible tokens representing crop cycle harvest yields
 * 1 token = 1 kg of produce, redeemable and burnable
 */

import { v4 as uuidv4 } from 'uuid';
import { TokenInfo, TokenType } from '../core/types';
import { WorldState } from '../core/state';

export interface CropCycleYield {
  tokenId: string;
  farmId: string;
  cycleId: string;
  yieldKg: number;
  remainingKg: number;
  createdAt: number;
  redeemable: boolean;
}

export class CropCycleToken {
  private yieldTokens: Map<string, CropCycleYield> = new Map();

  /**
   * Mint harvest tokens for a crop cycle
   * Creates semi-fungible tokens where 1 token = 1 kg of produce
   * @param state - WorldState instance
   * @param farmId - Farm identifier
   * @param cycleId - Crop cycle identifier
   * @param yieldKg - Total yield in kilograms
   * @param to - Address to mint tokens to
   * @returns TokenInfo for the created harvest tokens
   */
  public mintHarvestTokens(
    state: WorldState,
    farmId: string,
    cycleId: string,
    yieldKg: number,
    to: string
  ): TokenInfo {
    if (yieldKg <= 0) {
      throw new Error('Yield must be positive');
    }

    const tokenId = `YIELD-${farmId}-${cycleId}-${uuidv4()}`;

    // Create token info
    const tokenInfo: TokenInfo = {
      id: tokenId,
      type: TokenType.CROP_CYCLE_YIELD,
      name: `Crop Cycle Yield - ${farmId} - ${cycleId}`,
      totalSupply: yieldKg,
      metadata: {
        farmId,
        cycleId,
        yieldKg,
        createdAt: Math.floor(Date.now() / 1000),
      },
    };

    state.registerToken(tokenInfo);

    // Track yield token
    const yieldToken: CropCycleYield = {
      tokenId,
      farmId,
      cycleId,
      yieldKg,
      remainingKg: yieldKg,
      createdAt: Math.floor(Date.now() / 1000),
      redeemable: true,
    };

    this.yieldTokens.set(tokenId, yieldToken);

    // Mint to recipient
    state.mintToken(tokenId, to, yieldKg);

    return tokenInfo;
  }

  /**
   * Redeem (burn) crop cycle yield tokens
   * When tokens are redeemed, they are burned and marked as consumed
   * @param state - WorldState instance
   * @param tokenId - Token identifier to redeem
   * @param from - Address redeeming the tokens
   * @param amount - Amount in kg to redeem
   * @returns Object with redeemed and remaining amounts
   */
  public redeem(
    state: WorldState,
    tokenId: string,
    from: string,
    amount: number
  ): { redeemed: number; remaining: number } {
    const yieldData = this.yieldTokens.get(tokenId);

    if (!yieldData || !yieldData.redeemable) {
      return { redeemed: 0, remaining: 0 };
    }

    if (amount <= 0) {
      return { redeemed: 0, remaining: yieldData.remainingKg };
    }

    const balance = state.getBalance(from, tokenId);
    if (balance < amount) {
      return { redeemed: 0, remaining: yieldData.remainingKg };
    }

    // Burn tokens from user
    const burnSuccess = state.burnToken(tokenId, from, amount);
    if (!burnSuccess) {
      return { redeemed: 0, remaining: yieldData.remainingKg };
    }

    // Update remaining yield
    const newRemaining = yieldData.remainingKg - amount;
    yieldData.remainingKg = Math.max(0, newRemaining);

    // Mark as non-redeemable if fully consumed
    if (yieldData.remainingKg <= 0) {
      yieldData.redeemable = false;
    }

    return { redeemed: amount, remaining: yieldData.remainingKg };
  }

  /**
   * Get available (unredeemed) yield for a token
   * @param state - WorldState instance
   * @param tokenId - Token identifier
   * @returns Amount of remaining yield in kg
   */
  public getAvailableYield(state: WorldState, tokenId: string): number {
    const yieldData = this.yieldTokens.get(tokenId);
    if (!yieldData) {
      return 0;
    }

    const token = state.getToken(tokenId);
    if (!token) {
      return 0;
    }

    return yieldData.remainingKg;
  }

  /**
   * Get yield token information
   * @param tokenId - Token identifier
   * @returns CropCycleYield data or undefined
   */
  public getYieldInfo(tokenId: string): CropCycleYield | undefined {
    return this.yieldTokens.get(tokenId);
  }

  /**
   * Get all yield tokens for a farm-cycle combination
   * @param farmId - Farm identifier
   * @param cycleId - Cycle identifier
   * @returns Array of yield tokens for the farm-cycle
   */
  public getCycleYields(
    farmId: string,
    cycleId: string
  ): CropCycleYield[] {
    return Array.from(this.yieldTokens.values()).filter(
      (y) => y.farmId === farmId && y.cycleId === cycleId
    );
  }
}

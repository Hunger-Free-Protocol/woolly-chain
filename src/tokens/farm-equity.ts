/**
 * Woolly Chain - FARM Equity Tokens
 * Permissioned equity tokens representing farm ownership and contribution shares
 */

import { v4 as uuidv4 } from 'uuid';
import { TokenInfo, TokenType } from '../core/types';
import { WorldState } from '../core/state';

export interface FarmTokenMetadata {
  location: string;
  area: number; // in square meters
  valuation: number; // in USD or smallest currency unit
}

export interface ShareAllocation {
  address: string;
  share: number; // percentage 0-100
}

/**
 * Five-Persona Standard Share Distribution:
 * - Space Owner: 25%
 * - Contributor: 20%
 * - Grower: 30%
 * - Patron: 0% (gets produce instead)
 * - Foundation: 25%
 */
const STANDARD_DISTRIBUTION = {
  spaceOwner: 0.25,
  contributor: 0.2,
  grower: 0.3,
  patron: 0.0,
  foundation: 0.25,
};

export class FarmEquityToken {
  private farmTokens: Map<string, TokenInfo> = new Map();
  private farmHolders: Map<string, Map<string, number>> = new Map(); // farmId -> (address -> balance)
  private farmKYC: Map<string, Set<string>> = new Map(); // farmId -> approved addresses

  /**
   * Create a new FARM-{id} equity token for a farm
   * @param state - WorldState instance
   * @param farmId - Unique farm identifier
   * @param metadata - Farm metadata (location, area, valuation)
   * @returns TokenInfo for the created farm token
   */
  public createFarmToken(
    state: WorldState,
    farmId: string,
    metadata: FarmTokenMetadata
  ): TokenInfo {
    const tokenId = `FARM-${farmId}`;

    // Check if token already exists
    if (this.farmTokens.has(tokenId)) {
      return this.farmTokens.get(tokenId)!;
    }

    const tokenInfo: TokenInfo = {
      id: tokenId,
      type: TokenType.FARM_EQUITY,
      name: `Farm Equity Token - ${farmId}`,
      totalSupply: 1_000_000, // Base unit supply for fractional ownership
      metadata: {
        farmId,
        location: metadata.location,
        area: metadata.area,
        valuation: metadata.valuation,
        createdAt: Math.floor(Date.now() / 1000),
      },
    };

    state.registerToken(tokenInfo);
    this.farmTokens.set(tokenId, tokenInfo);
    this.farmHolders.set(farmId, new Map());
    this.farmKYC.set(farmId, new Set());

    return tokenInfo;
  }

  /**
   * Allocate shares to five personas following standard distribution
   * @param state - WorldState instance
   * @param farmId - Farm identifier
   * @param allocations - Array of {address, share} for the five personas
   * @returns boolean indicating success
   */
  public allocateShares(
    state: WorldState,
    farmId: string,
    allocations: ShareAllocation[]
  ): boolean {
    const tokenId = `FARM-${farmId}`;
    const token = state.getToken(tokenId);

    if (!token) {
      return false;
    }

    // Validate allocations sum to 100%
    const totalShare = allocations.reduce((sum, a) => sum + a.share, 0);
    if (Math.abs(totalShare - 100) > 0.01) {
      return false; // Allow small floating point error
    }

    const holders = this.farmHolders.get(farmId);
    if (!holders) {
      return false;
    }

    const kyc = this.farmKYC.get(farmId)!;

    try {
      for (const allocation of allocations) {
        const tokenAmount = (token.totalSupply * allocation.share) / 100;

        // Add to holders tracking
        const currentBalance = holders.get(allocation.address) || 0;
        holders.set(allocation.address, currentBalance + tokenAmount);

        // Mark as KYC-approved
        kyc.add(allocation.address);

        // Update state balance
        state.updateBalance(allocation.address, tokenId, tokenAmount);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Transfer FARM equity tokens with KYC check
   * @param state - WorldState instance
   * @param farmId - Farm identifier
   * @param from - Source address
   * @param to - Destination address
   * @param amount - Amount to transfer
   * @returns boolean indicating success
   */
  public transfer(
    state: WorldState,
    farmId: string,
    from: string,
    to: string,
    amount: number
  ): boolean {
    const tokenId = `FARM-${farmId}`;

    // Check KYC for both parties
    const kyc = this.farmKYC.get(farmId);
    if (!kyc || !kyc.has(from) || !kyc.has(to)) {
      return false; // Only KYC-approved addresses can transfer
    }

    if (amount <= 0) {
      return false;
    }

    const balance = state.getBalance(from, tokenId);
    if (balance < amount) {
      return false;
    }

    // Debit from sender
    if (!state.updateBalance(from, tokenId, -amount)) {
      return false;
    }

    // Credit to receiver
    if (!state.updateBalance(to, tokenId, amount)) {
      // Rollback on failure
      state.updateBalance(from, tokenId, amount);
      return false;
    }

    // Update holders tracking
    const holders = this.farmHolders.get(farmId)!;
    const fromBalance = holders.get(from) || 0;
    holders.set(from, fromBalance - amount);

    const toBalance = holders.get(to) || 0;
    holders.set(to, toBalance + amount);

    return true;
  }

  /**
   * Get all holders of a farm equity token with their balances
   * @param state - WorldState instance
   * @param farmId - Farm identifier
   * @returns Array of {address, balance} for all holders
   */
  public getHolders(
    state: WorldState,
    farmId: string
  ): { address: string; balance: number }[] {
    const holders = this.farmHolders.get(farmId);
    if (!holders) {
      return [];
    }

    return Array.from(holders.entries())
      .filter(([_, balance]) => balance > 0)
      .map(([address, balance]) => ({ address, balance }));
  }

  /**
   * Approve an address for KYC on a farm
   * @param farmId - Farm identifier
   * @param address - Address to approve
   */
  public approveKYC(farmId: string, address: string): void {
    const kyc = this.farmKYC.get(farmId);
    if (kyc) {
      kyc.add(address);
    }
  }

  /**
   * Check if an address is KYC-approved for a farm
   * @param farmId - Farm identifier
   * @param address - Address to check
   * @returns boolean indicating KYC approval status
   */
  public isKYCApproved(farmId: string, address: string): boolean {
    const kyc = this.farmKYC.get(farmId);
    return kyc ? kyc.has(address) : false;
  }
}

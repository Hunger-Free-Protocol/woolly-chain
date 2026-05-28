/**
 * Woolly Chain - Profit Sharing Contract
 * Smart contract for five-persona revenue distribution
 */

import { v4 as uuidv4 } from 'uuid';
import { ContractState, ContractType } from '../core/types';
import { WorldState } from '../core/state';

export interface Persona {
  role: string;
  address: string;
  share: number; // percentage 0-100
}

export interface ProfitSharingContractParams {
  personas: Persona[];
  totalDistributed: number;
  carbonRevenueDistributed: number;
  validatorRewardsDistributed: number;
  distributionHistory: Array<{
    timestamp: number;
    amount: number;
    type: 'revenue' | 'carbon' | 'validator';
  }>;
}

/**
 * Standard five-persona distribution model:
 * - Space Owner: 25%
 * - Farm Contributor: 20%
 * - Grower: 30%
 * - Patron: 0% (receives produce instead)
 * - Foundation: 25%
 */
export const STANDARD_DISTRIBUTION = {
  spaceOwner: 0.25,
  contributor: 0.2,
  grower: 0.3,
  patron: 0.0,
  foundation: 0.25,
};

export const PROTOCOL_FEE = 0.05; // 5% for profit sharing
export const CARBON_PROTOCOL_FEE = 0.05; // 5% for carbon revenue

export class ProfitSharingContract {
  /**
   * Create a new profit sharing contract
   * @param state - WorldState instance
   * @param farmId - Farm identifier
   * @param personas - Array of personas with addresses and shares
   * @returns ContractState for the created contract
   */
  public create(
    state: WorldState,
    farmId: string,
    personas: Persona[]
  ): ContractState {
    const contractId = `PROFIT-${farmId}-${uuidv4()}`;

    // Validate shares sum to 100%
    const totalShare = personas.reduce((sum, p) => sum + p.share, 0);
    if (Math.abs(totalShare - 100) > 0.01) {
      throw new Error('Persona shares must sum to 100%');
    }

    const now = Math.floor(Date.now() / 1000);

    const contract: ContractState = {
      id: contractId,
      type: ContractType.PROFIT_SHARING,
      farmId,
      status: 'ACTIVE',
      params: {
        personas,
        totalDistributed: 0,
        carbonRevenueDistributed: 0,
        validatorRewardsDistributed: 0,
        distributionHistory: [],
      },
      created: now,
      updated: now,
    };

    state.createContract(contract);
    return contract;
  }

  /**
   * Distribute revenue to personas according to their shares
   * Deducts protocol fee before distribution
   * @param state - WorldState instance
   * @param contractId - Contract identifier
   * @param totalRevenue - Total revenue to distribute
   * @returns Map of address to amount distributed
   */
  public distribute(
    state: WorldState,
    contractId: string,
    totalRevenue: number
  ): Map<string, number> {
    const distribution = new Map<string, number>();

    if (totalRevenue <= 0) {
      return distribution;
    }

    const contract = state.getContract(contractId);
    if (!contract || contract.status !== 'ACTIVE') {
      return distribution;
    }

    // Deduct protocol fee (5%)
    const protocolFee = totalRevenue * PROTOCOL_FEE;
    const distributableAmount = totalRevenue - protocolFee;

    const personas = contract.params.personas || [];

    // Distribute to each persona according to share
    for (const persona of personas) {
      const amount = (distributableAmount * persona.share) / 100;
      if (amount > 0) {
        distribution.set(persona.address, amount);

        // In a real implementation, funds would be transferred here
        // For now, we just track them
      }
    }

    // Update contract totals
    contract.params.totalDistributed =
      (contract.params.totalDistributed || 0) + distributableAmount;

    contract.params.distributionHistory.push({
      timestamp: Math.floor(Date.now() / 1000),
      amount: distributableAmount,
      type: 'revenue',
    });

    state.updateContract(contractId, { params: contract.params });

    return distribution;
  }

  /**
   * Allocate carbon revenue to stakeholders
   * 95% to stakeholders, 5% to protocol
   * @param state - WorldState instance
   * @param contractId - Contract identifier
   * @param carbonRevenue - Carbon credit revenue amount
   * @returns Map of address to carbon revenue distributed
   */
  public allocateCarbonRevenue(
    state: WorldState,
    contractId: string,
    carbonRevenue: number
  ): Map<string, number> {
    const distribution = new Map<string, number>();

    if (carbonRevenue <= 0) {
      return distribution;
    }

    const contract = state.getContract(contractId);
    if (!contract || contract.status !== 'ACTIVE') {
      return distribution;
    }

    // 95% to stakeholders, 5% protocol fee
    const protocolFee = carbonRevenue * CARBON_PROTOCOL_FEE;
    const stakeholderAmount = carbonRevenue - protocolFee;

    const personas = contract.params.personas || [];

    // Distribute to personas (excluding patron who gets 0%)
    for (const persona of personas) {
      if (persona.share > 0) {
        const amount = (stakeholderAmount * persona.share) / 100;
        if (amount > 0) {
          distribution.set(persona.address, amount);
        }
      }
    }

    // Update contract totals
    contract.params.carbonRevenueDistributed =
      (contract.params.carbonRevenueDistributed || 0) + stakeholderAmount;

    contract.params.distributionHistory.push({
      timestamp: Math.floor(Date.now() / 1000),
      amount: stakeholderAmount,
      type: 'carbon',
    });

    state.updateContract(contractId, { params: contract.params });

    return distribution;
  }

  /**
   * Allocate validator rewards
   * Adds to grower (30%) and foundation (25%) shares
   * @param state - WorldState instance
   * @param contractId - Contract identifier
   * @param rewards - Total validator rewards to allocate
   * @returns Map of address to rewards distributed
   */
  public allocateValidatorRewards(
    state: WorldState,
    contractId: string,
    rewards: number
  ): Map<string, number> {
    const distribution = new Map<string, number>();

    if (rewards <= 0) {
      return distribution;
    }

    const contract = state.getContract(contractId);
    if (!contract || contract.status !== 'ACTIVE') {
      return distribution;
    }

    const personas = contract.params.personas || [];

    // Find grower and foundation personas
    let growerShare = 0;
    let foundationShare = 0;
    let growerAddress = '';
    let foundationAddress = '';

    for (const persona of personas) {
      if (persona.role.toLowerCase().includes('grower')) {
        growerShare = persona.share;
        growerAddress = persona.address;
      } else if (persona.role.toLowerCase().includes('foundation')) {
        foundationShare = persona.share;
        foundationAddress = persona.address;
      }
    }

    // Split rewards between grower (30%) and foundation (25%)
    // Proportional to their base shares
    const totalRelevantShare = growerShare + foundationShare;

    if (totalRelevantShare > 0) {
      const growerReward = (rewards * growerShare) / totalRelevantShare;
      const foundationReward = (rewards * foundationShare) / totalRelevantShare;

      if (growerReward > 0) {
        distribution.set(growerAddress, growerReward);
      }
      if (foundationReward > 0) {
        distribution.set(foundationAddress, foundationReward);
      }
    }

    // Update contract totals
    contract.params.validatorRewardsDistributed =
      (contract.params.validatorRewardsDistributed || 0) + rewards;

    contract.params.distributionHistory.push({
      timestamp: Math.floor(Date.now() / 1000),
      amount: rewards,
      type: 'validator',
    });

    state.updateContract(contractId, { params: contract.params });

    return distribution;
  }

  /**
   * Get distribution history
   * @param contract - ContractState
   * @returns Distribution history records
   */
  public getDistributionHistory(contract: ContractState): any[] {
    return contract.params.distributionHistory || [];
  }

  /**
   * Get total distributed across all revenue types
   * @param contract - ContractState
   * @returns Total amount distributed
   */
  public getTotalDistributed(contract: ContractState): number {
    return (
      (contract.params.totalDistributed || 0) +
      (contract.params.carbonRevenueDistributed || 0) +
      (contract.params.validatorRewardsDistributed || 0)
    );
  }

  /**
   * Get personas in contract
   * @param contract - ContractState
   * @returns Array of personas
   */
  public getPersonas(contract: ContractState): Persona[] {
    return contract.params.personas || [];
  }

  /**
   * Get share for a specific role
   * @param personas - Array of personas
   * @param role - Role to find
   * @returns Share percentage or 0 if not found
   */
  public getShareForRole(personas: Persona[], role: string): number {
    const persona = personas.find((p) =>
      p.role.toLowerCase().includes(role.toLowerCase())
    );
    return persona ? persona.share : 0;
  }
}

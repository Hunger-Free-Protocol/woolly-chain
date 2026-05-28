/**
 * Woolly Chain - Build Contract
 * Smart contract for farm infrastructure build-out with milestone funding
 */

import { v4 as uuidv4 } from 'uuid';
import { ContractState, ContractType } from '../core/types';
import { WorldState } from '../core/state';

export interface Milestone {
  description: string;
  amount: number;
  deadline: number; // Unix timestamp
  completed: boolean;
  fundedAt?: number;
}

export interface BuildContractParams {
  totalCost: number;
  contributors: Array<{ address: string; amount: number }>;
  milestones: Array<{ description: string; amount: number; deadline: number }>;
}

export interface VestingSchedule {
  address: string;
  vested: number;
  total: number;
}

export const DEPRECIATION_YEARS = 5;
export const MONTHS_PER_YEAR = 12;

export class BuildContract {
  /**
   * Create a new build contract with contributors and milestones
   * @param state - WorldState instance
   * @param farmId - Farm identifier
   * @param params - Build contract parameters
   * @returns ContractState for the created contract
   */
  public create(
    state: WorldState,
    farmId: string,
    params: BuildContractParams
  ): ContractState {
    const contractId = `BUILD-${farmId}-${uuidv4()}`;

    // Validate milestones sum to total cost
    const milestoneCost = params.milestones.reduce((sum: number, m: any) => sum + m.amount, 0);
    if (milestoneCost !== params.totalCost) {
      throw new Error('Milestone costs must sum to total cost');
    }

    // Validate contributors
    const contributorAmount = params.contributors.reduce(
      (sum, c) => sum + c.amount,
      0
    );
    if (contributorAmount !== params.totalCost) {
      throw new Error('Contributor amounts must sum to total cost');
    }

    const now = Math.floor(Date.now() / 1000);

    const contract: ContractState = {
      id: contractId,
      type: ContractType.BUILD,
      farmId,
      status: 'ACTIVE',
      params: {
        totalCost: params.totalCost,
        contributors: params.contributors.map((c) => ({
          ...c,
          vested: 0,
        })),
        milestones: params.milestones.map((m) => ({
          ...m,
          completed: false,
        })),
        createdAt: now,
        fundedAmount: 0,
      },
      created: now,
      updated: now,
    };

    state.createContract(contract);
    return contract;
  }

  /**
   * Fund a milestone and release vested amounts to contributors
   * @param state - WorldState instance
   * @param contractId - Contract identifier
   * @param milestoneIndex - Index of milestone to fund
   * @returns boolean indicating success
   */
  public fundMilestone(
    state: WorldState,
    contractId: string,
    milestoneIndex: number
  ): boolean {
    const contract = state.getContract(contractId);
    if (!contract || contract.status !== 'ACTIVE') {
      return false;
    }

    const milestones = contract.params.milestones;
    if (!milestones || milestoneIndex >= milestones.length) {
      return false;
    }

    const milestone = milestones[milestoneIndex];
    if (milestone.completed) {
      return false; // Already funded
    }

    // Mark milestone as completed
    milestone.completed = true;
    milestone.fundedAt = Math.floor(Date.now() / 1000);

    // Update total funded amount
    contract.params.fundedAmount =
      (contract.params.fundedAmount || 0) + milestone.amount;

    // Calculate vesting: linear vesting over depreciation period
    const vestingPerMilestone =
      contract.params.totalCost / milestones.length;

    for (const contributor of contract.params.contributors) {
      const vestingAmount =
        (contributor.amount / contract.params.totalCost) * vestingPerMilestone;
      contributor.vested = (contributor.vested || 0) + vestingAmount;
    }

    // Check if all milestones are completed
    const allCompleted = milestones.every((m: any) => m.completed);
    if (allCompleted) {
      contract.status = 'COMPLETED';
    }

    state.updateContract(contractId, {
      params: contract.params,
      status: contract.status,
    });

    return true;
  }

  /**
   * Calculate depreciation for infrastructure using straight-line method
   * @param contract - ContractState to calculate depreciation for
   * @param monthsElapsed - Months since contract creation
   * @returns Depreciation amount
   */
  public calculateDepreciation(
    contract: ContractState,
    monthsElapsed: number
  ): number {
    const totalCost = contract.params.totalCost;
    const totalMonths = DEPRECIATION_YEARS * MONTHS_PER_YEAR; // 60 months
    const monthlyDepreciation = totalCost / totalMonths;

    return monthlyDepreciation * Math.min(monthsElapsed, totalMonths);
  }

  /**
   * Get vesting schedule for all contributors
   * @param contract - ContractState to get vesting for
   * @returns Array of vesting schedules for each contributor
   */
  public getVestingSchedule(contract: ContractState): VestingSchedule[] {
    const contributors = contract.params.contributors || [];
    return contributors.map((contributor: any) => ({
      address: contributor.address,
      vested: contributor.vested || 0,
      total: contributor.amount,
    }));
  }

  /**
   * Get funded milestones
   * @param contract - ContractState
   * @returns Array of completed milestones
   */
  public getFundedMilestones(contract: ContractState): Milestone[] {
    const milestones = contract.params.milestones || [];
    return milestones.filter((m: any) => m.completed);
  }

  /**
   * Get remaining balance to fund
   * @param contract - ContractState
   * @returns Remaining amount to fund
   */
  public getRemainingBalance(contract: ContractState): number {
    const totalCost = contract.params.totalCost;
    const fundedAmount = contract.params.fundedAmount || 0;
    return totalCost - fundedAmount;
  }
}

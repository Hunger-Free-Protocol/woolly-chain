/**
 * Woolly Chain - Crop Cycle Contract
 * Smart contract for crop cycle management with expenses, yields, and settlement
 */

import { v4 as uuidv4 } from 'uuid';
import { ContractState, ContractType } from '../core/types';
import { WorldState } from '../core/state';

export interface CropCycleExpense {
  category: string; // e.g., "seeds", "nutrients", "labor", "utilities"
  amount: number;
  description: string;
  recordedAt: number;
}

export interface CropCycleMetrics {
  expenses: number;
  revenue: number;
  yield: number; // in kg
  efficiency: number; // revenue / expenses ratio
}

export interface CropCycleContractParams {
  cropType: string;
  startDate: number; // Unix timestamp
  expectedDuration: number; // in days
  expectedYieldKg: number;
  expenses: CropCycleExpense[];
  actualYieldKg?: number;
  totalRevenue?: number;
  settled: boolean;
}

export const PRODUCE_SETTLEMENT_FEE = 0.05; // 5%

export class CropCycleContract {
  /**
   * Create a new crop cycle contract
   * @param state - WorldState instance
   * @param farmId - Farm identifier
   * @param params - Crop cycle parameters
   * @returns ContractState for the created contract
   */
  public create(
    state: WorldState,
    farmId: string,
    params: {
      cropType: string;
      startDate: number;
      expectedDuration: number;
      expectedYieldKg: number;
    }
  ): ContractState {
    const contractId = `CYCLE-${farmId}-${uuidv4()}`;
    const now = Math.floor(Date.now() / 1000);

    const contract: ContractState = {
      id: contractId,
      type: ContractType.CROP_CYCLE,
      farmId,
      status: 'ACTIVE',
      params: {
        cropType: params.cropType,
        startDate: params.startDate,
        expectedDuration: params.expectedDuration,
        expectedYieldKg: params.expectedYieldKg,
        expenses: [],
        actualYieldKg: 0,
        totalRevenue: 0,
        settled: false,
      },
      created: now,
      updated: now,
    };

    state.createContract(contract);
    return contract;
  }

  /**
   * Record an expense for the crop cycle
   * @param state - WorldState instance
   * @param contractId - Contract identifier
   * @param expense - Expense to record
   * @returns boolean indicating success
   */
  public recordExpense(
    state: WorldState,
    contractId: string,
    expense: { category: string; amount: number; description: string }
  ): boolean {
    if (expense.amount <= 0) {
      return false;
    }

    const contract = state.getContract(contractId);
    if (!contract || contract.status !== 'ACTIVE') {
      return false;
    }

    const expenseRecord: CropCycleExpense = {
      category: expense.category,
      amount: expense.amount,
      description: expense.description,
      recordedAt: Math.floor(Date.now() / 1000),
    };

    if (!contract.params.expenses) {
      contract.params.expenses = [];
    }

    contract.params.expenses.push(expenseRecord);

    return state.updateContract(contractId, { params: contract.params });
  }

  /**
   * Record harvest and mint crop cycle yield tokens
   * @param state - WorldState instance
   * @param contractId - Contract identifier
   * @param actualYieldKg - Actual yield in kilograms
   * @returns boolean indicating success
   */
  public recordHarvest(
    state: WorldState,
    contractId: string,
    actualYieldKg: number
  ): boolean {
    if (actualYieldKg <= 0) {
      return false;
    }

    const contract = state.getContract(contractId);
    if (!contract || contract.status !== 'ACTIVE') {
      return false;
    }

    contract.params.actualYieldKg = actualYieldKg;

    return state.updateContract(contractId, { params: contract.params });
  }

  /**
   * Settle the crop cycle: apply fees and prepare distribution
   * Applies 5% produce settlement fee
   * @param state - WorldState instance
   * @param contractId - Contract identifier
   * @param revenue - Total revenue from harvest in smallest currency unit
   * @returns boolean indicating success
   */
  public settle(
    state: WorldState,
    contractId: string,
    revenue: number
  ): boolean {
    if (revenue < 0) {
      return false;
    }

    const contract = state.getContract(contractId);
    if (!contract || contract.status !== 'ACTIVE' || contract.params.settled) {
      return false;
    }

    // Calculate settlement fee (5%)
    const fee = revenue * PRODUCE_SETTLEMENT_FEE;
    const netRevenue = revenue - fee;

    // Update contract
    contract.params.totalRevenue = revenue;
    contract.params.settled = true;
    contract.status = 'COMPLETED';

    // Store fee for protocol accumulation
    if (!contract.params.settlementFee) {
      contract.params.settlementFee = 0;
    }
    contract.params.settlementFee = fee;

    return state.updateContract(contractId, {
      params: contract.params,
      status: contract.status,
    });
  }

  /**
   * Get crop cycle metrics
   * @param state - WorldState instance (unused but kept for interface consistency)
   * @param contractId - Contract identifier
   * @param contract - ContractState (from external call)
   * @returns CropCycleMetrics for the cycle
   */
  public getCycleMetrics(
    state: WorldState,
    contractId: string,
    contract?: ContractState
  ): CropCycleMetrics {
    const targetContract =
      contract || state.getContract(contractId);

    if (!targetContract) {
      return {
        expenses: 0,
        revenue: 0,
        yield: 0,
        efficiency: 0,
      };
    }

    const expenses =
      (targetContract.params.expenses || []).reduce(
        (sum: number, e: any) => sum + e.amount,
        0
      );
    const revenue = targetContract.params.totalRevenue || 0;
    const yieldKg = targetContract.params.actualYieldKg || 0;
    const efficiency = expenses > 0 ? revenue / expenses : 0;

    return {
      expenses,
      revenue,
      yield: yieldKg,
      efficiency,
    };
  }

  /**
   * Get total expenses recorded
   * @param contract - ContractState
   * @returns Total expenses
   */
  public getTotalExpenses(contract: ContractState): number {
    return (contract.params.expenses || []).reduce(
      (sum: number, e: any) => sum + e.amount,
      0
    );
  }

  /**
   * Get net profit (revenue - expenses - settlement fee)
   * @param contract - ContractState
   * @returns Net profit amount
   */
  public getNetProfit(contract: ContractState): number {
    const revenue = contract.params.totalRevenue || 0;
    const expenses = this.getTotalExpenses(contract);
    const fee = contract.params.settlementFee || 0;

    return revenue - expenses - fee;
  }

  /**
   * Get expected end date of the cycle
   * @param contract - ContractState
   * @returns Unix timestamp of expected end
   */
  public getExpectedEndDate(contract: ContractState): number {
    const startDate = contract.params.startDate;
    const durationSeconds = contract.params.expectedDuration * 24 * 60 * 60;
    return startDate + durationSeconds;
  }
}

/**
 * Woolly Chain - Contribution-Based Food Access Contract
 * Three-path system for earning free food through capital, land, or labor
 */

import { v4 as uuidv4 } from 'uuid';
import { ContractState, ContractType } from '../core/types';
import { WorldState } from '../core/state';

export interface ContributionPath {
  path: 'capital' | 'land' | 'labor';
  address: string;
  farmId: string;
  startedAt: number;
}

export interface CapitalContribution extends ContributionPath {
  path: 'capital';
  amount: number;
  subscriptionTier: 'basic' | 'premium' | 'elite';
  monthlyAllocation: number;
}

export interface LandContribution extends ContributionPath {
  path: 'land';
  area: number; // in square meters
  foodAllocation: number;
  revenueShare: number; // 25% fixed
}

export interface LaborContribution extends ContributionPath {
  path: 'labor';
  role: string;
  wageRate: number; // per hour
  equityAccrualRate: number; // percentage per hour
  hoursWorked: number;
  totalWagesEarned: number;
  totalEquityEarned: number;
}

/**
 * Minimum thresholds:
 * - Capital: $5000 USD equivalent
 * - Land: 500 square feet (46.5 sq meters)
 * - Labor: 6 months full-time equivalent (260 working days)
 */
export const THRESHOLDS = {
  capital: 5000,
  land: 46.5, // Square meters
  laborDays: 260, // Full-time equivalent over 6 months
  laborHours: 260 * 8, // Assuming 8-hour workday
};

export const LABOR_EQUITY_CONVERSION_TRIGGER = THRESHOLDS.laborHours;

export class ContributionContract {
  private capitalContributions: Map<string, CapitalContribution> = new Map();
  private landContributions: Map<string, LandContribution> = new Map();
  private laborContributions: Map<string, LaborContribution> = new Map();

  // Subscription tier definitions (monthly food allocation in kg)
  private subscriptionTiers = {
    basic: 50, // Basic food bundle
    premium: 100, // Premium selection
    elite: 200, // Full produce access
  };

  /**
   * Register a capital contribution (minimum $5000)
   * @param state - WorldState instance
   * @param address - Contributor address
   * @param amount - Investment amount
   * @param farmId - Farm identifier
   * @returns Object with subscription tier and monthly allocation
   */
  public registerCapitalContribution(
    state: WorldState,
    address: string,
    amount: number,
    farmId: string
  ): { subscriptionTier: string; monthlyAllocation: number } {
    if (amount < THRESHOLDS.capital) {
      throw new Error(
        `Minimum capital contribution is ${THRESHOLDS.capital}`
      );
    }

    // Determine subscription tier based on amount
    let tier: 'basic' | 'premium' | 'elite';

    if (amount >= 50000) {
      tier = 'elite';
    } else if (amount >= 15000) {
      tier = 'premium';
    } else {
      tier = 'basic';
    }

    const monthlyAllocation = this.subscriptionTiers[tier];

    const contribution: CapitalContribution = {
      path: 'capital',
      address,
      farmId,
      startedAt: Math.floor(Date.now() / 1000),
      amount,
      subscriptionTier: tier,
      monthlyAllocation,
    };

    const key = `capital-${farmId}-${address}`;
    this.capitalContributions.set(key, contribution);

    // Update account balance to track contribution
    state.updateBalance(address, 'CAPITAL_CONTRIBUTION', amount);

    return { subscriptionTier: tier, monthlyAllocation };
  }

  /**
   * Register a land contribution (minimum 500 sq ft / 46.5 sq meters)
   * @param state - WorldState instance
   * @param address - Contributor address
   * @param farmId - Farm identifier
   * @param landArea - Land area in square meters
   * @returns Object with food allocation and revenue share
   */
  public registerLandContribution(
    state: WorldState,
    address: string,
    farmId: string,
    landArea: number
  ): { foodAllocation: number; revenueShare: number } {
    if (landArea < THRESHOLDS.land) {
      throw new Error(
        `Minimum land contribution is ${THRESHOLDS.land} square meters`
      );
    }

    // Food allocation: 10 kg per 100 sq meters
    const foodAllocation = (landArea / 100) * 10;
    const revenueShare = 0.25; // Fixed 25% of farm revenue

    const contribution: LandContribution = {
      path: 'land',
      address,
      farmId,
      startedAt: Math.floor(Date.now() / 1000),
      area: landArea,
      foodAllocation,
      revenueShare,
    };

    const key = `land-${farmId}-${address}`;
    this.landContributions.set(key, contribution);

    // Update account balance to track contribution
    state.updateBalance(address, 'LAND_CONTRIBUTION', landArea);

    return { foodAllocation, revenueShare };
  }

  /**
   * Register a labor contribution
   * Worker accrues equity as they work toward the 6-month threshold
   * @param state - WorldState instance
   * @param address - Worker address
   * @param farmId - Farm identifier
   * @param role - Job role
   * @returns Object with wage rate and equity accrual rate
   */
  public registerLaborContribution(
    state: WorldState,
    address: string,
    farmId: string,
    role: string
  ): { wageRate: number; equityAccrualRate: number } {
    // Wage rates vary by role (in smallest currency unit per hour)
    const wageRates: Record<string, number> = {
      farmer: 15,
      technician: 18,
      manager: 20,
      laborer: 12,
    };

    const wageRate = wageRates[role.toLowerCase()] || 15; // Default to 15
    const equityAccrualRate = 0.05; // 5% equity accrual per hour worked

    const contribution: LaborContribution = {
      path: 'labor',
      address,
      farmId,
      startedAt: Math.floor(Date.now() / 1000),
      role,
      wageRate,
      equityAccrualRate,
      hoursWorked: 0,
      totalWagesEarned: 0,
      totalEquityEarned: 0,
    };

    const key = `labor-${farmId}-${address}`;
    this.laborContributions.set(key, contribution);

    return { wageRate, equityAccrualRate };
  }

  /**
   * Process labor payment and equity accrual
   * After 6 months (1560 hours), excess wages convert to equity
   * @param state - WorldState instance
   * @param contractId - Contract identifier (labor contribution key)
   * @param hoursWorked - Hours to record
   * @returns Object with wages, equity earned, and total equity
   */
  public processLaborPayment(
    state: WorldState,
    contractId: string,
    hoursWorked: number
  ): { wages: number; equityEarned: number; totalEquity: number } {
    const contribution = this.laborContributions.get(contractId);
    if (!contribution) {
      return { wages: 0, equityEarned: 0, totalEquity: 0 };
    }

    if (hoursWorked <= 0) {
      return {
        wages: 0,
        equityEarned: 0,
        totalEquity: contribution.totalEquityEarned,
      };
    }

    const wages = hoursWorked * contribution.wageRate;

    // Check if worker has reached minimum commitment threshold
    const previousHours = contribution.hoursWorked;
    const newTotalHours = previousHours + hoursWorked;
    const hasReachedThreshold = newTotalHours >= LABOR_EQUITY_CONVERSION_TRIGGER;

    let equityEarned = 0;

    if (hasReachedThreshold) {
      // Once threshold is reached, partial wages convert to equity
      // Conversion rate: 10% of wages convert to equity value
      const conversionRate = 0.1;
      equityEarned = wages * conversionRate;
      contribution.totalEquityEarned += equityEarned;
    }

    contribution.hoursWorked = newTotalHours;
    contribution.totalWagesEarned += wages;

    // Update account balances
    state.updateBalance(contribution.address, 'LABOR_WAGES', wages);
    if (equityEarned > 0) {
      state.updateBalance(contribution.address, 'LABOR_EQUITY', equityEarned);
    }

    return {
      wages,
      equityEarned,
      totalEquity: contribution.totalEquityEarned,
    };
  }

  /**
   * Check if an address is eligible for free food
   * @param state - WorldState instance
   * @param address - Address to check
   * @returns Object with eligibility status, path, and monthly allocation
   */
  public checkFoodEligibility(
    state: WorldState,
    address: string
  ): { eligible: boolean; path: string; monthlyAllocation: number } {
    // Check capital path
    for (const [, contribution] of this.capitalContributions) {
      if (contribution.address === address) {
        return {
          eligible: true,
          path: 'capital',
          monthlyAllocation: contribution.monthlyAllocation,
        };
      }
    }

    // Check land path
    for (const [, contribution] of this.landContributions) {
      if (contribution.address === address) {
        return {
          eligible: true,
          path: 'land',
          monthlyAllocation: contribution.foodAllocation,
        };
      }
    }

    // Check labor path - eligible after 6 months commitment
    for (const [, contribution] of this.laborContributions) {
      if (contribution.address === address) {
        if (contribution.hoursWorked >= LABOR_EQUITY_CONVERSION_TRIGGER) {
          // After 6 months, worker gets free food
          // Allocation: 50 kg/month base + equity share
          const baseAllocation = 50;
          return {
            eligible: true,
            path: 'labor',
            monthlyAllocation: baseAllocation,
          };
        }
      }
    }

    return { eligible: false, path: '', monthlyAllocation: 0 };
  }

  /**
   * Get capital contribution details
   * @param farmId - Farm identifier
   * @param address - Address
   * @returns CapitalContribution or undefined
   */
  public getCapitalContribution(
    farmId: string,
    address: string
  ): CapitalContribution | undefined {
    const key = `capital-${farmId}-${address}`;
    return this.capitalContributions.get(key);
  }

  /**
   * Get land contribution details
   * @param farmId - Farm identifier
   * @param address - Address
   * @returns LandContribution or undefined
   */
  public getLandContribution(
    farmId: string,
    address: string
  ): LandContribution | undefined {
    const key = `land-${farmId}-${address}`;
    return this.landContributions.get(key);
  }

  /**
   * Get labor contribution details
   * @param farmId - Farm identifier
   * @param address - Address
   * @returns LaborContribution or undefined
   */
  public getLaborContribution(
    farmId: string,
    address: string
  ): LaborContribution | undefined {
    const key = `labor-${farmId}-${address}`;
    return this.laborContributions.get(key);
  }

  /**
   * Get all contributions for a farm
   * @param farmId - Farm identifier
   * @returns Object with all contribution types
   */
  public getFarmContributions(farmId: string): {
    capital: CapitalContribution[];
    land: LandContribution[];
    labor: LaborContribution[];
  } {
    const capital = Array.from(this.capitalContributions.values()).filter(
      (c) => c.farmId === farmId
    );
    const land = Array.from(this.landContributions.values()).filter(
      (c) => c.farmId === farmId
    );
    const labor = Array.from(this.laborContributions.values()).filter(
      (c) => c.farmId === farmId
    );

    return { capital, land, labor };
  }
}

/**
 * Woolly Chain - Contribution-Based Food Access Contract
 * Five-path system for earning food access (L045): capital, land, labor,
 * marketing, and innovation. Capital/Land/Labor are the original three;
 * Marketing and Innovation were added in Module 12 to match Doc 7's V2
 * stakeholder model.
 */

import { v4 as uuidv4 } from 'uuid';
import { ContractState, ContractType } from '../core/types';
import { WorldState } from '../core/state';

export type ContributionPathName =
  | 'capital'
  | 'land'
  | 'labor'
  | 'marketing'
  | 'innovation';

export interface ContributionPath {
  path: ContributionPathName;
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

export interface MarketingContribution extends ContributionPath {
  path: 'marketing';
  verifiedDemandKg: number; // cumulative verified produce demand generated
  contentPieces: number; // verified content/marketing assets produced
  commissionRate: number; // phi_commission,k (parametric, L003) — fraction
  foodAllocation: number; // monthly kg once threshold reached
}

export interface InnovationContribution extends ContributionPath {
  path: 'innovation';
  ipNftId: string; // ERC-721 IP NFT identifier
  royaltyRate: number; // ERC-2981 royalty fraction (parametric, L003)
  accepted: boolean; // IP committed + accepted on-chain
  foodAllocation: number; // monthly kg once accepted
}

/**
 * Minimum thresholds:
 * - Capital: $5000 USD equivalent
 * - Land: 500 square feet (46.5 sq meters)
 * - Labor: 6 months full-time equivalent (260 working days)
 * - Marketing: 1000 kg of verified produce demand generated (parametric)
 * - Innovation: 1 accepted IP NFT
 */
export const THRESHOLDS = {
  capital: 5000,
  land: 46.5, // Square meters
  laborDays: 260, // Full-time equivalent over 6 months
  laborHours: 260 * 8, // Assuming 8-hour workday
  marketingDemandKg: 1000, // verified demand generated to qualify
  innovationNfts: 1, // one accepted IP NFT to qualify
};

/**
 * Parametric commercials (L003 / hard convention §3e). Named inputs with
 * documented ranges; never hardcode at call sites.
 * - phi_commission,k: marketing commission fraction, range 0.02-0.10
 * - innovation royalty: ERC-2981 default fraction, range 0.02-0.10
 */
export const DEFAULT_MARKETING_COMMISSION = 0.05;
export const DEFAULT_INNOVATION_ROYALTY = 0.05;
export const MARKETING_BASE_ALLOCATION_KG = 30; // monthly food once qualified
export const INNOVATION_BASE_ALLOCATION_KG = 50; // monthly food once accepted

export const LABOR_EQUITY_CONVERSION_TRIGGER = THRESHOLDS.laborHours;

export class ContributionContract {
  private capitalContributions: Map<string, CapitalContribution> = new Map();
  private landContributions: Map<string, LandContribution> = new Map();
  private laborContributions: Map<string, LaborContribution> = new Map();
  private marketingContributions: Map<string, MarketingContribution> = new Map();
  private innovationContributions: Map<string, InnovationContribution> = new Map();

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
   * Register a marketing contribution. The contributor earns food access by
   * generating verified produce demand (and content). Qualifies once
   * cumulative verified demand reaches THRESHOLDS.marketingDemandKg.
   * @param state - WorldState instance
   * @param address - Contributor address
   * @param farmId - Farm identifier
   * @param verifiedDemandKg - Verified produce demand generated (kg)
   * @param contentPieces - Verified marketing/content assets produced
   * @param commissionRate - phi_commission,k (parametric, L003); defaults to DEFAULT_MARKETING_COMMISSION
   * @returns Object with food allocation and commission rate
   */
  public registerMarketingContribution(
    state: WorldState,
    address: string,
    farmId: string,
    verifiedDemandKg: number,
    contentPieces: number = 0,
    commissionRate: number = DEFAULT_MARKETING_COMMISSION
  ): { foodAllocation: number; commissionRate: number; qualified: boolean } {
    if (verifiedDemandKg < 0) {
      throw new Error('verifiedDemandKg must be non-negative');
    }

    const qualified = verifiedDemandKg >= THRESHOLDS.marketingDemandKg;
    const foodAllocation = qualified ? MARKETING_BASE_ALLOCATION_KG : 0;

    const contribution: MarketingContribution = {
      path: 'marketing',
      address,
      farmId,
      startedAt: Math.floor(Date.now() / 1000),
      verifiedDemandKg,
      contentPieces,
      commissionRate,
      foodAllocation,
    };

    const key = `marketing-${farmId}-${address}`;
    this.marketingContributions.set(key, contribution);

    state.updateBalance(address, 'MARKETING_CONTRIBUTION', verifiedDemandKg);

    return { foodAllocation, commissionRate, qualified };
  }

  /**
   * Register an innovation contribution. The contributor commits a patentable
   * improvement as an IP NFT (ERC-721 + ERC-2981 royalty). Qualifies for food
   * access once the IP NFT is accepted.
   * @param state - WorldState instance
   * @param address - Contributor address
   * @param farmId - Farm identifier
   * @param ipNftId - IP NFT identifier
   * @param royaltyRate - ERC-2981 royalty fraction (parametric, L003); defaults to DEFAULT_INNOVATION_ROYALTY
   * @param accepted - Whether the IP has been accepted on-chain
   * @returns Object with food allocation and royalty rate
   */
  public registerInnovationContribution(
    state: WorldState,
    address: string,
    farmId: string,
    ipNftId: string,
    royaltyRate: number = DEFAULT_INNOVATION_ROYALTY,
    accepted: boolean = true
  ): { foodAllocation: number; royaltyRate: number; accepted: boolean } {
    if (!ipNftId) {
      throw new Error('innovation contribution requires an ipNftId');
    }

    const foodAllocation = accepted ? INNOVATION_BASE_ALLOCATION_KG : 0;

    const contribution: InnovationContribution = {
      path: 'innovation',
      address,
      farmId,
      startedAt: Math.floor(Date.now() / 1000),
      ipNftId,
      royaltyRate,
      accepted,
      foodAllocation,
    };

    const key = `innovation-${farmId}-${address}`;
    this.innovationContributions.set(key, contribution);

    if (accepted) {
      state.updateBalance(address, 'INNOVATION_CONTRIBUTION', 1);
    }

    return { foodAllocation, royaltyRate, accepted };
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

    // Check marketing path - eligible once verified demand threshold reached
    for (const [, contribution] of this.marketingContributions) {
      if (contribution.address === address) {
        if (contribution.verifiedDemandKg >= THRESHOLDS.marketingDemandKg) {
          return {
            eligible: true,
            path: 'marketing',
            monthlyAllocation: contribution.foodAllocation,
          };
        }
      }
    }

    // Check innovation path - eligible once an IP NFT is accepted
    for (const [, contribution] of this.innovationContributions) {
      if (contribution.address === address) {
        if (contribution.accepted) {
          return {
            eligible: true,
            path: 'innovation',
            monthlyAllocation: contribution.foodAllocation,
          };
        }
      }
    }

    return { eligible: false, path: '', monthlyAllocation: 0 };
  }

  /**
   * Get marketing contribution details
   */
  public getMarketingContribution(
    farmId: string,
    address: string
  ): MarketingContribution | undefined {
    return this.marketingContributions.get(`marketing-${farmId}-${address}`);
  }

  /**
   * Get innovation contribution details
   */
  public getInnovationContribution(
    farmId: string,
    address: string
  ): InnovationContribution | undefined {
    return this.innovationContributions.get(`innovation-${farmId}-${address}`);
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
    marketing: MarketingContribution[];
    innovation: InnovationContribution[];
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
    const marketing = Array.from(this.marketingContributions.values()).filter(
      (c) => c.farmId === farmId
    );
    const innovation = Array.from(this.innovationContributions.values()).filter(
      (c) => c.farmId === farmId
    );

    return { capital, land, labor, marketing, innovation };
  }

  /**
   * The five contribution path names supported by the protocol (L045).
   */
  public static readonly PATHS: ContributionPathName[] = [
    'capital',
    'land',
    'labor',
    'marketing',
    'innovation',
  ];
}

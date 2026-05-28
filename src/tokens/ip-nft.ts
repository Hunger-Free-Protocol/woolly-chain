/**
 * Woolly Chain - IP NFT with Royalty Enforcement
 * Non-fungible tokens for intellectual property with embedded creator royalties
 */

import { v4 as uuidv4 } from 'uuid';
import { TokenInfo, TokenType } from '../core/types';
import { WorldState } from '../core/state';

export interface IpNftMetadata {
  proofs: string[]; // References to proof of ownership/creation
  description: string;
  createdAt: number;
}

export interface IpNft {
  tokenId: string;
  creator: string;
  metadata: IpNftMetadata;
  royaltyPercent: number; // 2-5% typical range
}

export interface RoyaltyTransfer {
  tokenId: string;
  from: string;
  to: string;
  salePrice: number;
  royaltyPaid: number;
  timestamp: number;
}

export class IpNftToken {
  private nfts: Map<string, IpNft> = new Map();
  private royaltyHistory: Map<string, RoyaltyTransfer[]> = new Map();
  private minRoyalty = 0.02; // 2% minimum
  private maxRoyalty = 0.05; // 5% maximum

  /**
   * Mint an IP NFT with royalty enforcement
   * @param state - WorldState instance
   * @param creator - Creator address
   * @param metadata - NFT metadata (proofs, description)
   * @param royaltyPercent - Royalty percentage (2-5%)
   * @returns TokenInfo for the minted NFT
   */
  public mint(
    state: WorldState,
    creator: string,
    metadata: { proofs: string[]; description: string },
    royaltyPercent: number
  ): TokenInfo {
    // Validate royalty percentage
    if (royaltyPercent < this.minRoyalty || royaltyPercent > this.maxRoyalty) {
      throw new Error(`Royalty must be between ${this.minRoyalty * 100}% and ${this.maxRoyalty * 100}%`);
    }

    const tokenId = `IPNFT-${uuidv4()}`;

    const nftMetadata: IpNftMetadata = {
      proofs: metadata.proofs,
      description: metadata.description,
      createdAt: Math.floor(Date.now() / 1000),
    };

    // Create token info (supply = 1 for NFT)
    const tokenInfo: TokenInfo = {
      id: tokenId,
      type: TokenType.IP_NFT,
      name: `IP NFT - ${metadata.description.substring(0, 50)}`,
      totalSupply: 1,
      metadata: {
        creator,
        royaltyPercent,
        nftMetadata,
      },
    };

    state.registerToken(tokenInfo);

    // Store NFT info
    const nft: IpNft = {
      tokenId,
      creator,
      metadata: nftMetadata,
      royaltyPercent,
    };

    this.nfts.set(tokenId, nft);
    this.royaltyHistory.set(tokenId, []);

    // Mint to creator
    state.mintToken(tokenId, creator, 1);

    return tokenInfo;
  }

  /**
   * Transfer IP NFT with automatic royalty enforcement
   * @param state - WorldState instance
   * @param tokenId - Token identifier
   * @param from - Sender address
   * @param to - Recipient address
   * @param salePrice - Sale price (optional, for royalty calculation)
   * @returns Object with royalty paid amount
   */
  public transfer(
    state: WorldState,
    tokenId: string,
    from: string,
    to: string,
    salePrice?: number
  ): { royaltyPaid: number } {
    const nft = this.nfts.get(tokenId);
    if (!nft) {
      return { royaltyPaid: 0 };
    }

    const balance = state.getBalance(from, tokenId);
    if (balance < 1) {
      return { royaltyPaid: 0 };
    }

    // Calculate royalty
    let royaltyPaid = 0;
    if (salePrice && salePrice > 0) {
      royaltyPaid = salePrice * nft.royaltyPercent;
    }

    // Transfer the NFT
    if (!state.updateBalance(from, tokenId, -1)) {
      return { royaltyPaid: 0 };
    }

    if (!state.updateBalance(to, tokenId, 1)) {
      // Rollback
      state.updateBalance(from, tokenId, 1);
      return { royaltyPaid: 0 };
    }

    // Distribute royalty to creator if sale price provided
    if (royaltyPaid > 0) {
      // In practice, this would be handled by a payment channel
      // Here we record the royalty transfer
      const transfer: RoyaltyTransfer = {
        tokenId,
        from,
        to,
        salePrice: salePrice!,
        royaltyPaid,
        timestamp: Math.floor(Date.now() / 1000),
      };

      const history = this.royaltyHistory.get(tokenId) || [];
      history.push(transfer);
      this.royaltyHistory.set(tokenId, history);
    }

    return { royaltyPaid };
  }

  /**
   * Get the creator of an IP NFT
   * @param state - WorldState instance (unused but kept for interface consistency)
   * @param tokenId - Token identifier
   * @returns Creator address or empty string if not found
   */
  public getCreator(state: WorldState, tokenId: string): string {
    const nft = this.nfts.get(tokenId);
    return nft ? nft.creator : '';
  }

  /**
   * Get NFT information
   * @param tokenId - Token identifier
   * @returns IpNft data or undefined
   */
  public getNft(tokenId: string): IpNft | undefined {
    return this.nfts.get(tokenId);
  }

  /**
   * Get royalty history for an NFT
   * @param tokenId - Token identifier
   * @returns Array of royalty transfers
   */
  public getRoyaltyHistory(tokenId: string): RoyaltyTransfer[] {
    return this.royaltyHistory.get(tokenId) || [];
  }

  /**
   * Get total royalties paid for an NFT
   * @param tokenId - Token identifier
   * @returns Total royalties paid to creator
   */
  public getTotalRoyaltiesPaid(tokenId: string): number {
    const history = this.royaltyHistory.get(tokenId) || [];
    return history.reduce((sum, transfer) => sum + transfer.royaltyPaid, 0);
  }

  /**
   * Get royalty percentage for an NFT
   * @param tokenId - Token identifier
   * @returns Royalty percentage as decimal (0.02-0.05)
   */
  public getRoyaltyPercent(tokenId: string): number {
    const nft = this.nfts.get(tokenId);
    return nft ? nft.royaltyPercent : 0;
  }
}

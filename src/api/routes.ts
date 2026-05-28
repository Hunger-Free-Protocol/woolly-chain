/**
 * Woolly Chain - REST API Routes
 * Comprehensive REST endpoints for chain, transactions, accounts, validators, tokens, and contracts
 */

import { Router, Request, Response } from 'express';
import { WoollyChain } from '../core';
import { BlockProducer } from '../node/producer';
import { generateTransactionId, generateContractId } from '../core/crypto';
import { TransactionType } from '../core/types';
import { v4 as uuidv4 } from 'uuid';

export function createRoutes(chain: WoollyChain, producer: BlockProducer): Router {
  const router = Router();

  // ============================================================================
  // CHAIN ENDPOINTS
  // ============================================================================

  /**
   * GET /chain/info - Get chain information
   */
  router.get('/chain/info', (req: Request, res: Response) => {
    try {
      const latestBlock = chain.getLatestBlock();
      const pendingTxs = chain.getPendingTransactions();
      const state = chain.getState();

      // Count active validators
      const validatorCount = state.getActiveValidators?.().length ?? 0;

      res.json({
        height: chain.getChainLength() - 1,
        latestBlock: {
          index: latestBlock.index,
          hash: latestBlock.hash,
          timestamp: latestBlock.timestamp,
        },
        epoch: chain.getCurrentEpoch(),
        validatorCount,
        pendingTxCount: pendingTxs.length,
        timestamp: Math.floor(Date.now() / 1000),
      });
    } catch (error) {
      console.error('Error fetching chain info:', error);
      res.status(500).json({ error: 'Failed to fetch chain info' });
    }
  });

  /**
   * GET /chain/block/:index - Get block by index
   */
  router.get('/chain/block/:index', (req: Request, res: Response) => {
    try {
      const index = parseInt(req.params.index, 10);
      if (isNaN(index) || index < 0) {
        return res.status(400).json({ error: 'Invalid block index' });
      }

      const block = chain.getBlockByIndex(index);
      if (!block) {
        return res.status(404).json({ error: 'Block not found' });
      }

      res.json(block);
    } catch (error) {
      console.error('Error fetching block by index:', error);
      res.status(500).json({ error: 'Failed to fetch block' });
    }
  });

  /**
   * GET /chain/block/hash/:hash - Get block by hash
   */
  router.get('/chain/block/hash/:hash', (req: Request, res: Response) => {
    try {
      const { hash } = req.params;
      if (!hash || typeof hash !== 'string') {
        return res.status(400).json({ error: 'Invalid block hash' });
      }

      const block = chain.getBlockByHash(hash);
      if (!block) {
        return res.status(404).json({ error: 'Block not found' });
      }

      res.json(block);
    } catch (error) {
      console.error('Error fetching block by hash:', error);
      res.status(500).json({ error: 'Failed to fetch block' });
    }
  });

  /**
   * GET /chain/blocks - Get blocks by range
   */
  router.get('/chain/blocks', (req: Request, res: Response) => {
    try {
      const from = req.query.from ? parseInt(req.query.from as string, 10) : 0;
      const to = req.query.to ? parseInt(req.query.to as string, 10) : chain.getChainLength() - 1;

      if (isNaN(from) || isNaN(to) || from < 0 || to < from) {
        return res.status(400).json({ error: 'Invalid range parameters' });
      }

      const blocks = chain.getBlocks().slice(from, to + 1);
      res.json({
        range: { from, to },
        count: blocks.length,
        blocks,
      });
    } catch (error) {
      console.error('Error fetching blocks:', error);
      res.status(500).json({ error: 'Failed to fetch blocks' });
    }
  });

  // ============================================================================
  // TRANSACTION ENDPOINTS
  // ============================================================================

  /**
   * POST /tx/submit - Submit a transaction
   */
  router.post('/tx/submit', (req: Request, res: Response) => {
    try {
      const { type, from, to, amount, data } = req.body;

      if (!type || !from || !to) {
        return res.status(400).json({ error: 'Missing required fields: type, from, to' });
      }

      const txId = generateTransactionId();
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = `sig_${uuidv4()}`; // Simplified signature for MVP

      const tx = {
        id: txId,
        type,
        from,
        to,
        amount: amount ?? 0,
        data,
        timestamp,
        signature,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Transaction submitted: ${txId}`);
        res.status(201).json({
          txId,
          status: 'pending',
          timestamp,
        });
      } else {
        res.status(400).json({ error: 'Transaction rejected' });
      }
    } catch (error) {
      console.error('Error submitting transaction:', error);
      res.status(500).json({ error: 'Failed to submit transaction' });
    }
  });

  /**
   * GET /tx/:id - Get transaction by ID
   */
  router.get('/tx/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tx = chain.getTransactionById(id);

      if (!tx) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      // Check if transaction is in pending or confirmed
      const isPending = chain.getPendingTransactions().some((t) => t.id === id);

      res.json({
        ...tx,
        status: isPending ? 'pending' : 'confirmed',
      });
    } catch (error) {
      console.error('Error fetching transaction:', error);
      res.status(500).json({ error: 'Failed to fetch transaction' });
    }
  });

  /**
   * GET /tx/pending - List pending transactions
   */
  router.get('/tx/pending', (req: Request, res: Response) => {
    try {
      const pending = chain.getPendingTransactions();
      res.json({
        count: pending.length,
        transactions: pending,
      });
    } catch (error) {
      console.error('Error fetching pending transactions:', error);
      res.status(500).json({ error: 'Failed to fetch pending transactions' });
    }
  });

  // ============================================================================
  // ACCOUNT ENDPOINTS
  // ============================================================================

  /**
   * GET /account/:address - Get account state
   */
  router.get('/account/:address', (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const state = chain.getState();
      const account = state.getAccount(address);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      res.json({
        address: account.address,
        balances: Object.fromEntries(account.balances),
        nonce: account.nonce,
        isValidator: account.isValidator,
        validatorInfo: account.validatorInfo || null,
      });
    } catch (error) {
      console.error('Error fetching account:', error);
      res.status(500).json({ error: 'Failed to fetch account' });
    }
  });

  /**
   * POST /account/create - Create new account
   */
  router.post('/account/create', (req: Request, res: Response) => {
    try {
      const address = `addr_${uuidv4()}`;
      const state = chain.getState();

      // Initialize account
      state.getAccount(address);

      console.log(`Account created: ${address}`);
      res.status(201).json({
        address,
        timestamp: Math.floor(Date.now() / 1000),
      });
    } catch (error) {
      console.error('Error creating account:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  });

  // ============================================================================
  // VALIDATOR ENDPOINTS
  // ============================================================================

  /**
   * POST /validator/register - Register as validator
   */
  router.post('/validator/register', (req: Request, res: Response) => {
    try {
      const { address, farmId, location } = req.body;

      if (!address || !farmId || !location) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!location.lat || !location.lng) {
        return res.status(400).json({ error: 'Invalid location coordinates' });
      }

      // Create validator registration transaction
      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.VALIDATOR_REGISTER,
        from: address,
        to: address,
        amount: 0,
        data: { farmId, location },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Validator registration submitted: ${address}`);
        res.status(201).json({
          txId,
          address,
          farmId,
          status: 'pending',
        });
      } else {
        res.status(400).json({ error: 'Validator registration failed' });
      }
    } catch (error) {
      console.error('Error registering validator:', error);
      res.status(500).json({ error: 'Failed to register validator' });
    }
  });

  /**
   * POST /validator/telemetry - Submit telemetry data
   */
  router.post('/validator/telemetry', (req: Request, res: Response) => {
    try {
      const { farmId, soilMoisture, soilPH, soilEC, airTemp, humidity, lightIntensity, waterUsageLiters, co2Level, ndviScore, crossValidationScores } = req.body;

      if (!farmId) {
        return res.status(400).json({ error: 'Missing farmId' });
      }

      // Create telemetry submission transaction
      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.TELEMETRY_SUBMIT,
        from: 'telemetry_submitter',
        to: farmId,
        amount: 0,
        data: {
          farmId,
          timestamp: Math.floor(Date.now() / 1000),
          soilMoisture,
          soilPH,
          soilEC,
          airTemp,
          humidity,
          lightIntensity,
          waterUsageLiters,
          co2Level,
          ndviScore,
          crossValidationScores,
        },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Telemetry submitted for farm: ${farmId}`);
        res.status(201).json({
          txId,
          farmId,
          status: 'recorded',
        });
      } else {
        res.status(400).json({ error: 'Telemetry submission failed' });
      }
    } catch (error) {
      console.error('Error submitting telemetry:', error);
      res.status(500).json({ error: 'Failed to submit telemetry' });
    }
  });

  /**
   * GET /validator/:address - Get validator info
   */
  router.get('/validator/:address', (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const state = chain.getState();
      const account = state.getAccount(address);

      if (!account || !account.isValidator || !account.validatorInfo) {
        return res.status(404).json({ error: 'Validator not found' });
      }

      res.json(account.validatorInfo);
    } catch (error) {
      console.error('Error fetching validator:', error);
      res.status(500).json({ error: 'Failed to fetch validator' });
    }
  });

  /**
   * GET /validator/list - Get all active validators
   */
  router.get('/validator/list', (req: Request, res: Response) => {
    try {
      const state = chain.getState();
      const validators = state.getActiveValidators?.() ?? [];

      res.json({
        count: validators.length,
        validators,
      });
    } catch (error) {
      console.error('Error fetching validators:', error);
      res.status(500).json({ error: 'Failed to fetch validators' });
    }
  });

  /**
   * GET /validator/epoch - Get current epoch info
   */
  router.get('/validator/epoch', (req: Request, res: Response) => {
    try {
      const currentEpoch = chain.getCurrentEpoch();
      const state = chain.getState();
      const validators = state.getActiveValidators?.() ?? [];
      const config = chain.getConfig();

      const epochStartBlock = currentEpoch * config.epochLength;
      const epochEndBlock = epochStartBlock + config.epochLength - 1;

      res.json({
        epochNumber: currentEpoch,
        startBlock: epochStartBlock,
        endBlock: epochEndBlock,
        validators: validators.map((v) => ({
          address: v.address,
          farmId: v.farmId,
          ponWeight: v.ponWeight,
        })),
        totalValidators: validators.length,
      });
    } catch (error) {
      console.error('Error fetching epoch info:', error);
      res.status(500).json({ error: 'Failed to fetch epoch info' });
    }
  });

  // ============================================================================
  // TOKEN ENDPOINTS
  // ============================================================================

  /**
   * POST /token/transfer - Transfer tokens
   */
  router.post('/token/transfer', (req: Request, res: Response) => {
    try {
      const { tokenId, from, to, amount } = req.body;

      if (!tokenId || !from || !to || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.TRANSFER,
        from,
        to,
        amount,
        data: { tokenId },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Token transfer submitted: ${tokenId} from ${from} to ${to}`);
        res.status(201).json({
          txId,
          tokenId,
          amount,
          status: 'pending',
        });
      } else {
        res.status(400).json({ error: 'Token transfer failed' });
      }
    } catch (error) {
      console.error('Error transferring tokens:', error);
      res.status(500).json({ error: 'Failed to transfer tokens' });
    }
  });

  /**
   * GET /token/:tokenId - Get token info
   */
  router.get('/token/:tokenId', (req: Request, res: Response) => {
    try {
      const { tokenId } = req.params;
      const state = chain.getState();
      const token = state.getToken(tokenId);

      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }

      res.json(token);
    } catch (error) {
      console.error('Error fetching token:', error);
      res.status(500).json({ error: 'Failed to fetch token' });
    }
  });

  /**
   * GET /token/:tokenId/balance/:address - Get token balance
   */
  router.get('/token/:tokenId/balance/:address', (req: Request, res: Response) => {
    try {
      const { tokenId, address } = req.params;
      const balance = chain.getBalance(address, tokenId);

      res.json({
        tokenId,
        address,
        balance,
      });
    } catch (error) {
      console.error('Error fetching token balance:', error);
      res.status(500).json({ error: 'Failed to fetch token balance' });
    }
  });

  /**
   * POST /token/farm/create - Create farm equity token
   */
  router.post('/token/farm/create', (req: Request, res: Response) => {
    try {
      const { farmId, initialSupply } = req.body;

      if (!farmId || !initialSupply || initialSupply <= 0) {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const tokenId = `FARM-${farmId}`;
      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.TOKEN_MINT,
        from: 'token_issuer',
        to: farmId,
        amount: initialSupply,
        data: { tokenId, farmId, type: 'FARM_EQUITY' },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Farm equity token created: ${tokenId}`);
        res.status(201).json({
          txId,
          tokenId,
          farmId,
          initialSupply,
          status: 'pending',
        });
      } else {
        res.status(400).json({ error: 'Farm token creation failed' });
      }
    } catch (error) {
      console.error('Error creating farm token:', error);
      res.status(500).json({ error: 'Failed to create farm token' });
    }
  });

  /**
   * POST /token/carbon/mint - Mint carbon credits
   */
  router.post('/token/carbon/mint', (req: Request, res: Response) => {
    try {
      const { farmId, amount } = req.body;

      if (!farmId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CARBON_CREDIT,
        from: 'carbon_issuer',
        to: farmId,
        amount,
        data: { farmId, action: 'MINT' },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Carbon credits minted: ${amount} for ${farmId}`);
        res.status(201).json({
          txId,
          farmId,
          carbonCredits: amount,
          status: 'pending',
        });
      } else {
        res.status(400).json({ error: 'Carbon credit minting failed' });
      }
    } catch (error) {
      console.error('Error minting carbon credits:', error);
      res.status(500).json({ error: 'Failed to mint carbon credits' });
    }
  });

  /**
   * POST /token/carbon/retire - Retire carbon credits
   */
  router.post('/token/carbon/retire', (req: Request, res: Response) => {
    try {
      const { farmId, amount } = req.body;

      if (!farmId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CARBON_CREDIT,
        from: farmId,
        to: 'carbon_retirement',
        amount,
        data: { farmId, action: 'RETIRE' },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Carbon credits retired: ${amount} from ${farmId}`);
        res.status(201).json({
          txId,
          farmId,
          carbonCreditsRetired: amount,
          status: 'pending',
        });
      } else {
        res.status(400).json({ error: 'Carbon credit retirement failed' });
      }
    } catch (error) {
      console.error('Error retiring carbon credits:', error);
      res.status(500).json({ error: 'Failed to retire carbon credits' });
    }
  });

  /**
   * POST /token/crop/mint - Mint crop cycle yield tokens
   */
  router.post('/token/crop/mint', (req: Request, res: Response) => {
    try {
      const { farmId, cropCycleId, yieldAmount } = req.body;

      if (!farmId || !cropCycleId || !yieldAmount || yieldAmount <= 0) {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.TOKEN_MINT,
        from: 'crop_issuer',
        to: farmId,
        amount: yieldAmount,
        data: { farmId, cropCycleId, type: 'CROP_CYCLE_YIELD' },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Crop yield tokens minted: ${yieldAmount} for cycle ${cropCycleId}`);
        res.status(201).json({
          txId,
          farmId,
          cropCycleId,
          yieldAmount,
          status: 'pending',
        });
      } else {
        res.status(400).json({ error: 'Crop token minting failed' });
      }
    } catch (error) {
      console.error('Error minting crop tokens:', error);
      res.status(500).json({ error: 'Failed to mint crop tokens' });
    }
  });

  /**
   * POST /token/crop/redeem - Redeem crop cycle tokens
   */
  router.post('/token/crop/redeem', (req: Request, res: Response) => {
    try {
      const { farmId, cropCycleId, amount } = req.body;

      if (!farmId || !cropCycleId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.TOKEN_BURN,
        from: farmId,
        to: 'crop_redemption',
        amount,
        data: { farmId, cropCycleId, action: 'REDEEM' },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Crop tokens redeemed: ${amount} from cycle ${cropCycleId}`);
        res.status(201).json({
          txId,
          farmId,
          cropCycleId,
          amount,
          status: 'pending',
        });
      } else {
        res.status(400).json({ error: 'Crop token redemption failed' });
      }
    } catch (error) {
      console.error('Error redeeming crop tokens:', error);
      res.status(500).json({ error: 'Failed to redeem crop tokens' });
    }
  });

  // ============================================================================
  // CONTRACT ENDPOINTS
  // ============================================================================

  /**
   * POST /contract/build/create - Create build contract
   */
  router.post('/contract/build/create', (req: Request, res: Response) => {
    try {
      const { farmId, buildType, description, estimatedCost } = req.body;

      if (!farmId || !buildType || !description) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const contractId = generateContractId();
      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CONTRACT_CALL,
        from: farmId,
        to: 'contract_manager',
        amount: 0,
        data: {
          contractId,
          contractType: 'BUILD',
          farmId,
          buildType,
          description,
          estimatedCost: estimatedCost ?? 0,
        },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Build contract created: ${contractId}`);
        res.status(201).json({
          txId,
          contractId,
          farmId,
          buildType,
          status: 'pending',
        });
      } else {
        res.status(400).json({ error: 'Build contract creation failed' });
      }
    } catch (error) {
      console.error('Error creating build contract:', error);
      res.status(500).json({ error: 'Failed to create build contract' });
    }
  });

  /**
   * POST /contract/crop-cycle/create - Create crop cycle contract
   */
  router.post('/contract/crop-cycle/create', (req: Request, res: Response) => {
    try {
      const { farmId, cropType, plantingDate, expectedHarvestDate } = req.body;

      if (!farmId || !cropType || !plantingDate) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const contractId = generateContractId();
      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CONTRACT_CALL,
        from: farmId,
        to: 'contract_manager',
        amount: 0,
        data: {
          contractId,
          contractType: 'CROP_CYCLE',
          farmId,
          cropType,
          plantingDate,
          expectedHarvestDate: expectedHarvestDate ?? null,
        },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Crop cycle contract created: ${contractId}`);
        res.status(201).json({
          txId,
          contractId,
          farmId,
          cropType,
          status: 'active',
        });
      } else {
        res.status(400).json({ error: 'Crop cycle contract creation failed' });
      }
    } catch (error) {
      console.error('Error creating crop cycle contract:', error);
      res.status(500).json({ error: 'Failed to create crop cycle contract' });
    }
  });

  /**
   * POST /contract/crop-cycle/harvest - Record harvest for crop cycle
   */
  router.post('/contract/crop-cycle/harvest', (req: Request, res: Response) => {
    try {
      const { contractId, harvestDate, yieldAmount, quality } = req.body;

      if (!contractId || !harvestDate || !yieldAmount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CONTRACT_CALL,
        from: 'harvest_recorder',
        to: 'contract_manager',
        amount: 0,
        data: {
          contractId,
          action: 'RECORD_HARVEST',
          harvestDate,
          yieldAmount,
          quality: quality ?? 'standard',
        },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Harvest recorded for contract: ${contractId}`);
        res.status(201).json({
          txId,
          contractId,
          yieldAmount,
          status: 'recorded',
        });
      } else {
        res.status(400).json({ error: 'Harvest recording failed' });
      }
    } catch (error) {
      console.error('Error recording harvest:', error);
      res.status(500).json({ error: 'Failed to record harvest' });
    }
  });

  /**
   * POST /contract/crop-cycle/settle - Settle crop cycle contract
   */
  router.post('/contract/crop-cycle/settle', (req: Request, res: Response) => {
    try {
      const { contractId } = req.body;

      if (!contractId) {
        return res.status(400).json({ error: 'Missing contractId' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CONTRACT_CALL,
        from: 'contract_manager',
        to: 'contract_manager',
        amount: 0,
        data: {
          contractId,
          action: 'SETTLE',
        },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Crop cycle contract settled: ${contractId}`);
        res.status(201).json({
          txId,
          contractId,
          status: 'settled',
        });
      } else {
        res.status(400).json({ error: 'Contract settlement failed' });
      }
    } catch (error) {
      console.error('Error settling contract:', error);
      res.status(500).json({ error: 'Failed to settle contract' });
    }
  });

  /**
   * POST /contract/profit-sharing/create - Create profit sharing contract
   */
  router.post('/contract/profit-sharing/create', (req: Request, res: Response) => {
    try {
      const { farmId, partners, shares } = req.body;

      if (!farmId || !partners || !shares) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const contractId = generateContractId();
      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CONTRACT_CALL,
        from: farmId,
        to: 'contract_manager',
        amount: 0,
        data: {
          contractId,
          contractType: 'PROFIT_SHARING',
          farmId,
          partners,
          shares,
        },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Profit sharing contract created: ${contractId}`);
        res.status(201).json({
          txId,
          contractId,
          farmId,
          partnerCount: partners.length,
          status: 'active',
        });
      } else {
        res.status(400).json({ error: 'Profit sharing contract creation failed' });
      }
    } catch (error) {
      console.error('Error creating profit sharing contract:', error);
      res.status(500).json({ error: 'Failed to create profit sharing contract' });
    }
  });

  /**
   * POST /contract/profit-sharing/distribute - Distribute revenue from contract
   */
  router.post('/contract/profit-sharing/distribute', (req: Request, res: Response) => {
    try {
      const { contractId, revenue } = req.body;

      if (!contractId || !revenue || revenue <= 0) {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CONTRACT_CALL,
        from: 'revenue_distributor',
        to: 'contract_manager',
        amount: revenue,
        data: {
          contractId,
          action: 'DISTRIBUTE',
          revenue,
        },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Revenue distributed for contract: ${contractId}`);
        res.status(201).json({
          txId,
          contractId,
          revenue,
          status: 'distributed',
        });
      } else {
        res.status(400).json({ error: 'Revenue distribution failed' });
      }
    } catch (error) {
      console.error('Error distributing revenue:', error);
      res.status(500).json({ error: 'Failed to distribute revenue' });
    }
  });

  /**
   * POST /contract/contribution/capital - Register capital contribution
   */
  router.post('/contract/contribution/capital', (req: Request, res: Response) => {
    try {
      const { farmId, contributorAddress, amount } = req.body;

      if (!farmId || !contributorAddress || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CONTRIBUTION_REGISTER,
        from: contributorAddress,
        to: farmId,
        amount,
        data: {
          farmId,
          contributionType: 'CAPITAL',
          amount,
        },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Capital contribution registered: ${amount} from ${contributorAddress}`);
        res.status(201).json({
          txId,
          farmId,
          contributionType: 'CAPITAL',
          amount,
          status: 'registered',
        });
      } else {
        res.status(400).json({ error: 'Capital contribution registration failed' });
      }
    } catch (error) {
      console.error('Error registering capital contribution:', error);
      res.status(500).json({ error: 'Failed to register capital contribution' });
    }
  });

  /**
   * POST /contract/contribution/land - Register land contribution
   */
  router.post('/contract/contribution/land', (req: Request, res: Response) => {
    try {
      const { farmId, contributorAddress, areaHectares } = req.body;

      if (!farmId || !contributorAddress || !areaHectares || areaHectares <= 0) {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CONTRIBUTION_REGISTER,
        from: contributorAddress,
        to: farmId,
        amount: areaHectares,
        data: {
          farmId,
          contributionType: 'LAND',
          areaHectares,
        },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Land contribution registered: ${areaHectares} hectares from ${contributorAddress}`);
        res.status(201).json({
          txId,
          farmId,
          contributionType: 'LAND',
          areaHectares,
          status: 'registered',
        });
      } else {
        res.status(400).json({ error: 'Land contribution registration failed' });
      }
    } catch (error) {
      console.error('Error registering land contribution:', error);
      res.status(500).json({ error: 'Failed to register land contribution' });
    }
  });

  /**
   * POST /contract/contribution/labor - Register labor contribution
   */
  router.post('/contract/contribution/labor', (req: Request, res: Response) => {
    try {
      const { farmId, contributorAddress, hoursWorked } = req.body;

      if (!farmId || !contributorAddress || !hoursWorked || hoursWorked <= 0) {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const txId = generateTransactionId();
      const tx = {
        id: txId,
        type: TransactionType.CONTRIBUTION_REGISTER,
        from: contributorAddress,
        to: farmId,
        amount: hoursWorked,
        data: {
          farmId,
          contributionType: 'LABOR',
          hoursWorked,
        },
        timestamp: Math.floor(Date.now() / 1000),
        signature: `sig_${uuidv4()}`,
      };

      if (chain.addTransaction(tx)) {
        console.log(`Labor contribution registered: ${hoursWorked} hours from ${contributorAddress}`);
        res.status(201).json({
          txId,
          farmId,
          contributionType: 'LABOR',
          hoursWorked,
          status: 'registered',
        });
      } else {
        res.status(400).json({ error: 'Labor contribution registration failed' });
      }
    } catch (error) {
      console.error('Error registering labor contribution:', error);
      res.status(500).json({ error: 'Failed to register labor contribution' });
    }
  });

  /**
   * GET /contract/contribution/eligibility/:address - Check food eligibility
   */
  router.get('/contract/contribution/eligibility/:address', (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      // Simplified eligibility check based on account state
      const state = chain.getState();
      const account = state.getAccount(address);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const woollyBalance = account.balances.get('WOOLLY') || 0;
      const isEligible = woollyBalance > 0;

      res.json({
        address,
        isEligible,
        woollyBalance,
        eligibilityReasons: isEligible ? ['Active contributor', 'Has WOOLLY balance'] : ['No WOOLLY balance'],
      });
    } catch (error) {
      console.error('Error checking eligibility:', error);
      res.status(500).json({ error: 'Failed to check eligibility' });
    }
  });

  /**
   * GET /contract/:id - Get contract state
   */
  router.get('/contract/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // For MVP, return a mock contract state
      res.json({
        id,
        type: 'CONTRACT',
        status: 'ACTIVE',
        created: Math.floor(Date.now() / 1000) - 86400,
        updated: Math.floor(Date.now() / 1000),
        params: {
          message: 'Contract state retrieval not yet implemented in MVP',
        },
      });
    } catch (error) {
      console.error('Error fetching contract:', error);
      res.status(500).json({ error: 'Failed to fetch contract' });
    }
  });

  // ============================================================================
  // DASHBOARD/STATS ENDPOINTS
  // ============================================================================

  /**
   * GET /stats - Get chain statistics
   */
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const blocks = chain.getBlocks();
      const state = chain.getState();
      const validators = state.getActiveValidators?.() ?? [];

      let totalTransactions = 0;
      for (const block of blocks) {
        totalTransactions += block.transactions.length;
      }

      const woollyToken = state.getToken('WOOLLY');
      const woollySupply = woollyToken?.totalSupply ?? 1_000_000_000;

      res.json({
        totalTransactions,
        totalBlocks: blocks.length,
        totalValidators: validators.length,
        totalFarms: validators.length, // Simplified: one farm per validator
        totalCarbonRetired: 0, // To be implemented
        woollySupply,
        currentEpoch: chain.getCurrentEpoch(),
        blockTime: chain.getConfig().blockTime,
        timestamp: Math.floor(Date.now() / 1000),
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  return router;
}

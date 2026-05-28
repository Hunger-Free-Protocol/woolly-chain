/**
 * Woolly Chain - Node Entry Point
 * Initializes the blockchain node with all components and starts production
 */

import path from 'path';
import { WoollyChain, DEFAULT_CHAIN_CONFIG } from '../core';
import { ValidatorManager, WeightedBFT, EpochManager } from '../consensus';
import { createServer, startServer } from '../api';
import { BlockProducer } from './producer';
import { WoollyToken } from '../tokens/woolly';

/**
 * Parse command line arguments
 */
function parseArgs(): { port: number; dataDir: string } {
  const args = process.argv.slice(2);
  let port = 3000;
  let dataDir = path.join(process.cwd(), 'data');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--data-dir' && args[i + 1]) {
      dataDir = args[i + 1];
      i++;
    }
  }

  return { port, dataDir };
}

/**
 * Initialize and start the Woolly Chain node
 */
async function startNode(): Promise<void> {
  const { port, dataDir } = parseArgs();
  const chainFilePath = path.join(dataDir, 'chain.json');

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Woolly Chain MVP - Node Initialization`);
  console.log(`${'='.repeat(70)}\n`);

  console.log(`Configuration:`);
  console.log(`  Port: ${port}`);
  console.log(`  Data Directory: ${dataDir}`);
  console.log(`  Chain File: ${chainFilePath}\n`);

  try {
    // ========================================================================
    // INITIALIZE BLOCKCHAIN
    // ========================================================================

    console.log('Initializing blockchain...');

    let chain: WoollyChain;

    // Try to load existing chain
    try {
      const { readFileSync } = require('fs');
      readFileSync(chainFilePath, 'utf-8');
      console.log('Loading existing chain from file...');
      chain = WoollyChain.loadFromFile(chainFilePath, DEFAULT_CHAIN_CONFIG);
      console.log(`Chain loaded successfully`);
    } catch (error) {
      console.log('Creating new chain...');
      chain = new WoollyChain(DEFAULT_CHAIN_CONFIG);
      console.log('New chain created');
    }

    const state = chain.getState();
    const config = chain.getConfig();

    console.log(`\nBlockchain Status:`);
    console.log(`  Height: ${chain.getChainLength() - 1}`);
    console.log(`  Epoch: ${chain.getCurrentEpoch()}`);
    console.log(`  Block Time: ${config.blockTime}ms`);
    console.log(`  Epoch Length: ${config.epochLength} blocks\n`);

    // ========================================================================
    // INITIALIZE CONSENSUS MODULES
    // ========================================================================

    console.log('Initializing consensus modules...');

    const validatorManager = new ValidatorManager(config);
    const bft = new WeightedBFT(config);
    const epochManager = new EpochManager(config);

    console.log(`  Validator Manager: ready`);
    console.log(`  Weighted BFT Consensus: ready`);
    console.log(`  Epoch Manager: ready\n`);

    // ========================================================================
    // INITIALIZE TOKEN MANAGERS
    // ========================================================================

    console.log('Initializing token managers...');

    const woollyToken = new WoollyToken();
    woollyToken.initialize(state);

    console.log(`  WOOLLY Token: initialized (supply: ${config.blockTime === 6000 ? '1B' : 'custom'})`);
    console.log(`  Token Managers: ready\n`);

    // ========================================================================
    // INITIALIZE BLOCK PRODUCER
    // ========================================================================

    console.log('Initializing block producer...');

    const producer = new BlockProducer(chain, validatorManager, bft, epochManager);

    console.log(`  Block Producer: ready\n`);

    // ========================================================================
    // CREATE AND START EXPRESS SERVER
    // ========================================================================

    console.log('Setting up REST API server...');

    const app = createServer(chain, producer);

    await startServer(app, port);

    // ========================================================================
    // START BLOCK PRODUCTION
    // ========================================================================

    console.log('Starting block production...\n');

    producer.start();

    // ========================================================================
    // GRACEFUL SHUTDOWN
    // ========================================================================

    /**
     * Handle graceful shutdown
     */
    const handleShutdown = (signal: string) => {
      console.log(`\n\n${'='.repeat(70)}`);
      console.log(`Shutdown signal received: ${signal}`);
      console.log(`${'='.repeat(70)}\n`);

      console.log('Stopping block production...');
      producer.stop();

      console.log('Saving blockchain state to file...');
      try {
        chain.saveToFile(chainFilePath);
        console.log(`Chain saved to: ${chainFilePath}`);
      } catch (error) {
        console.error('Failed to save chain:', error);
      }

      console.log('\nShutdown complete. Goodbye!\n');
      process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    // ========================================================================
    // LOG STARTUP SUMMARY
    // ========================================================================

    console.log(`${'='.repeat(70)}`);
    console.log(`Woolly Chain Node Started Successfully`);
    console.log(`${'='.repeat(70)}\n`);

    console.log(`Node Status:`);
    console.log(`  Chain Height: ${chain.getChainLength() - 1}`);
    console.log(`  Current Epoch: ${chain.getCurrentEpoch()}`);
    console.log(`  Active Validators: ${validatorManager.getActiveValidators().length}`);
    console.log(`  Pending Transactions: ${chain.getPendingTransactions().length}\n`);

    console.log(`Services:`);
    console.log(`  REST API: http://localhost:${port}`);
    console.log(`  Health Check: http://localhost:${port}/health`);
    console.log(`  API Documentation: http://localhost:${port}/api/v1\n`);

    console.log(`Block Production:`);
    console.log(`  Status: Active`);
    console.log(`  Interval: ${config.blockTime}ms`);
    console.log(`  Epoch Duration: ${config.epochLength} blocks (~${(config.epochLength * config.blockTime / 1000 / 3600).toFixed(1)} hours)\n`);

    console.log(`Data:`);
    console.log(`  Chain File: ${chainFilePath}`);
    console.log(`  Data Directory: ${dataDir}\n`);

    console.log(`Press Ctrl+C to shutdown\n`);

  } catch (error) {
    console.error('\nFatal error during node startup:', error);
    console.error('\nShutting down...\n');
    process.exit(1);
  }
}

// ============================================================================
// START NODE
// ============================================================================

startNode().catch((error) => {
  console.error('Unhandled error in startNode:', error);
  process.exit(1);
});

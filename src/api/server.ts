/**
 * Woolly Chain - Express Server Setup
 * Configures and creates the REST API server with middleware and error handling
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WoollyChain } from '../core';
import { BlockProducer } from '../node/producer';
import { createRoutes } from './routes';

/**
 * Create and configure Express application
 * @param chain - WoollyChain instance
 * @param producer - BlockProducer instance
 * @returns Configured Express application
 */
export function createServer(chain: WoollyChain, producer: BlockProducer): Express {
  const app = express();

  // ============================================================================
  // MIDDLEWARE
  // ============================================================================

  /**
   * Request logging middleware
   */
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      const reset = '\x1b[0m';

      console.log(
        `${statusColor}${req.method} ${req.path} ${res.statusCode}${reset} - ${duration}ms`
      );
    });

    next();
  });

  /**
   * CORS middleware — explicit allow-list, fail-loud at boot.
   * CLAUDE.md §3.h: CORS_ORIGIN must be set, must not be '*'.
   */
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin || corsOrigin.trim() === '' || corsOrigin === '*') {
    throw new Error(
      "CORS_ORIGIN must be set to an explicit comma-separated origin list (wildcard '*' is forbidden). " +
      "See .env.example. For local dev: CORS_ORIGIN=http://localhost:3000"
    );
  }
  app.use(cors({
    origin: corsOrigin.split(',').map(o => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  }));

  /**
   * API Key authentication middleware for write endpoints
   * Set WOOLLY_API_KEY env var to enable; without it, all requests are allowed (dev mode)
   */
  const apiKey = process.env.WOOLLY_API_KEY;
  if (apiKey) {
    app.use('/api/v1', (req: Request, res: Response, next: NextFunction) => {
      // Allow GET requests without auth (read-only)
      if (req.method === 'GET') return next();
      // Require API key for POST/PUT/DELETE
      if (req.headers['x-api-key'] !== apiKey) {
        return res.status(401).json({ error: 'Unauthorized — invalid or missing X-API-Key header' });
      }
      next();
    });
  }

  /**
   * JSON body parser
   */
  app.use(express.json({ limit: '10mb' }));

  /**
   * URL-encoded body parser
   */
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  /**
   * Health check endpoint
   */
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: Math.floor(Date.now() / 1000),
      chain: {
        height: chain.getChainLength() - 1,
        epoch: chain.getCurrentEpoch(),
      },
      producer: {
        status: producer.getStatus(),
      },
    });
  });

  // ============================================================================
  // API ROUTES
  // ============================================================================

  /**
   * Mount API routes at /api/v1
   */
  const apiRoutes = createRoutes(chain, producer);
  app.use('/api/v1', apiRoutes);

  // ============================================================================
  // 404 HANDLER
  // ============================================================================

  /**
   * 404 Not Found handler
   */
  app.use((req: Request, res: Response) => {
    console.log(`404 Not Found: ${req.method} ${req.path}`);
    res.status(404).json({
      error: 'Not Found',
      path: req.path,
      method: req.method,
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  /**
   * Global error handling middleware
   */
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Server error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    // Handle JSON parsing errors
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        error: 'Invalid JSON',
        message: err.message,
      });
    }

    // Default error response
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
      timestamp: Math.floor(Date.now() / 1000),
    });
  });

  return app;
}

/**
 * Start the Express server
 * @param app - Express application
 * @param port - Port number to listen on
 * @returns Promise that resolves when server is listening
 */
export function startServer(app: Express, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Woolly Chain REST API Server`);
      console.log(`${'='.repeat(60)}`);
      console.log(`\nServer listening on http://localhost:${port}`);
      console.log(`\nAPI Documentation:`);
      console.log(`  - Chain Info:   GET  /api/v1/chain/info`);
      console.log(`  - Transactions: POST /api/v1/tx/submit`);
      console.log(`  - Validators:   GET  /api/v1/validator/list`);
      console.log(`  - Stats:        GET  /api/v1/stats`);
      console.log(`  - Health:       GET  /health`);
      console.log(`\n${'='.repeat(60)}\n`);

      resolve();
    });

    server.on('error', (error) => {
      console.error('Failed to start server:', error);
      reject(error);
    });
  });
}

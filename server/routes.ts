import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage.js";
import { createHyperliquidService } from "./services/hyperliquid.js";
import { SimulationService } from "./services/simulation.js";
import { TransactionReplayService } from "./services/TransactionReplay.js";
import { TransactionFormBuilder } from "./services/TransactionFormBuilder.js";
import { HyperEVMStateManager } from "./core/StateManager.js";
import { 
  simulationRequestSchema, 
  bundleSimulationSchema, 
  transactionSchema,
  type SimulationRequest,
  type BundleSimulationRequest 
} from "@shared/schema.js";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize services
  const hyperliquidService = createHyperliquidService();
  const simulationService = new SimulationService(hyperliquidService);
  
  // Initialize state manager and replay services
  const stateManager = new HyperEVMStateManager({
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    },
    rpcUrl: process.env.HYPERLIQUID_MAINNET_RPC || 'https://rpc.hyperliquid.xyz/evm',
    cacheSize: 10000,
    cacheTTL: 3600
  });
  
  const replayService = new TransactionReplayService(hyperliquidService, simulationService, stateManager);
  const formBuilder = new TransactionFormBuilder(hyperliquidService, replayService);
  
  // Initialize state manager
  await stateManager.initialize();

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Store connected clients
  const connectedClients = new Set<WebSocket>();
  
  wss.on('connection', (ws) => {
    connectedClients.add(ws);
    console.log('WebSocket client connected');
    
    // Send initial network state
    simulationService.getCurrentNetworkState().then(state => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'network_state',
          data: state
        }));
      }
    });
    
    ws.on('close', () => {
      connectedClients.delete(ws);
      console.log('WebSocket client disconnected');
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      connectedClients.delete(ws);
    });
  });

  // Broadcast to all connected clients
  const broadcast = (message: any) => {
    const data = JSON.stringify(message);
    connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  // Update network state every 30 seconds
  setInterval(async () => {
    try {
      const networkState = await simulationService.getCurrentNetworkState();
      broadcast({
        type: 'network_state',
        data: networkState
      });
    } catch (error) {
      console.error('Error updating network state:', error);
    }
  }, 30000);

  // API Routes

  // Get current network state
  app.get("/api/network/state", async (req, res) => {
    try {
      const state = await simulationService.getCurrentNetworkState();
      res.json(state);
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch network state",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Simulate single transaction
  app.post("/api/v1/simulate", async (req, res) => {
    try {
      // Step 1: Parse gasLimit as hex (0x...) or decimal, default to 21000 if invalid.
      let incomingGasLimit = req.body?.transaction?.gasLimit;
      let parsedGasLimit = 21000;
      if (typeof incomingGasLimit === "string") {
        if (incomingGasLimit.startsWith("0x")) {
          parsedGasLimit = parseInt(incomingGasLimit, 16) || 21000;
        } else if (!isNaN(Number(incomingGasLimit))) {
          parsedGasLimit = parseInt(incomingGasLimit, 10) || 21000;
        }
      } else if (typeof incomingGasLimit === "number") {
        parsedGasLimit = incomingGasLimit || 21000;
      }

      // Step 2: Allow executionMode in body and pass through
      const validatedRequest = simulationRequestSchema.parse({
        ...req.body,
        executionMode: req.body.executionMode || req.body.execution_mode || "rpc",
      });

      // Create simulation record
      const simulation = await storage.createSimulation({
        userId: null, // No user auth for now
        transactionData: validatedRequest,
        status: "pending",
        gasLimit: parsedGasLimit,
        blockNumber: validatedRequest.blockNumber,
      });

      // Execute simulation
      const result = await simulationService.simulateTransaction(validatedRequest);
      
      // Update simulation with results
      await storage.updateSimulationResult(simulation.id, result);
      
      // Broadcast simulation result
      broadcast({
        type: 'simulation_complete',
        data: {
          simulationId: simulation.id,
          result
        }
      });

      res.json({
        simulationId: simulation.id,
        result
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Simulation failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get gas estimate
  app.post("/api/v1/gas-estimate", async (req, res) => {
    try {
      const transaction = transactionSchema.parse(req.body);
      const estimate = await simulationService.getGasEstimate(transaction);
      console.log(estimate)
      res.json(estimate);
    } catch (error) {
      res.status(400).json({ 
        error: "Gas estimation failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Simulate transaction bundle
  app.post("/api/v1/bundle-simulate", async (req, res) => {
    try {
      const validatedRequest = bundleSimulationSchema.parse(req.body);
      const results = await simulationService.simulateBundle(validatedRequest);
      
      res.json({
        bundleResults: results,
        totalGasUsed: results.reduce((sum, r) => sum + r.gasUsed, 0),
        allSuccessful: results.every(r => r.success)
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Bundle simulation failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get recent simulations
  app.get("/api/simulations/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const simulations = await storage.getRecentSimulations(limit);
      res.json(simulations);
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch simulations",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get simulation by ID
  app.get("/api/simulations/:id", async (req, res) => {
    try {
      const simulation = await storage.getSimulation(req.params.id);
      if (!simulation) {
        return res.status(404).json({ error: "Simulation not found" });
      }
      res.json(simulation);
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch simulation",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get system metrics
  app.get("/api/admin/metrics", async (req, res) => {
    try {
      const metrics = await storage.getLatestMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch metrics",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get system health
  app.get("/api/admin/health", async (req, res) => {
    try {
      // Check HyperEVM connectivity
      const blockNumber = await hyperliquidService.getBlockNumber();
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          hyperevm: {
            status: "online",
            latestBlock: blockNumber
          },
          database: {
            status: "online"
          },
          websocket: {
            status: "online",
            connectedClients: connectedClients.size
          }
        }
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Enhanced simulation endpoints with advanced features
  
  // Simulate transaction with state overrides
  app.post("/api/v1/simulate/advanced", async (req, res) => {
    try {
      const request = req.body;
      
      // Add request ID if not provided
      if (!request.requestId) {
        request.requestId = `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      const result = await simulationService.simulateWithStateOverrides(request);
      
      broadcast({
        type: 'advanced_simulation_complete',
        data: {
          requestId: request.requestId,
          result
        }
      });

      res.json({
        success: true,
        requestId: request.requestId,
        result
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Advanced simulation failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Bundle simulation with dependency analysis
  app.post("/api/v1/simulate/bundle", async (req, res) => {
    try {
      const bundleRequest = req.body;
      const bundleResult = await simulationService.simulateBundle(bundleRequest);
      
      broadcast({
        type: 'bundle_simulation_complete',
        data: {
          bundleHash: bundleResult.bundleHash,
          results: bundleResult.results
        }
      });

      res.json({
        success: true,
        data: bundleResult
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Bundle simulation failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get HyperEVM precompile information
  app.get("/api/v1/hyperevm/precompiles", async (req, res) => {
    try {
      const precompiles = await simulationService.getPrecompileInfo();
      res.json({
        success: true,
        precompiles
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch precompile information",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get simulation statistics and performance metrics
  app.get("/api/v1/simulation/stats", async (req, res) => {
    try {
      const stats = await simulationService.getSimulationStats();
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch simulation statistics",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get cached simulation by request ID
  app.get("/api/v1/simulation/cache/:requestId", async (req, res) => {
    try {
      const { requestId } = req.params;
      const cachedResult = simulationService.getCachedSimulation(requestId);
      
      if (!cachedResult) {
        return res.status(404).json({
          success: false,
          error: "Simulation not found in cache"
        });
      }

      res.json({
        success: true,
        result: cachedResult
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch cached simulation",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Clear simulation cache (admin endpoint)
  app.post("/api/admin/cache/clear", async (req, res) => {
    try {
      simulationService.clearCache();
      res.json({
        success: true,
        message: "Simulation cache cleared successfully"
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to clear cache",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ================================
  // TRANSACTION REPLAY ENDPOINTS
  // ================================

  // Create simulation form from transaction hash
  app.post("/api/v1/replay/create-form", async (req, res) => {
    try {
      const { transactionHash } = req.body;
      
      if (!transactionHash || typeof transactionHash !== 'string') {
        return res.status(400).json({ 
          error: "Transaction hash is required",
          message: "Please provide a valid transaction hash"
        });
      }

      // Validate transaction hash format
      if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
        return res.status(400).json({ 
          error: "Invalid transaction hash format",
          message: "Transaction hash must be a 66-character hex string"
        });
      }

      const form = await formBuilder.createSimulationForm(transactionHash);
      
      broadcast({
        type: 'form_created',
        data: {
          formId: form.formId,
          transactionHash: form.transactionHash,
          title: form.title
        }
      });

      res.json({
        success: true,
        data: form
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Failed to create simulation form",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Replay transaction on forked mainnet
  app.post("/api/v1/replay/execute", async (req, res) => {
    try {
      const replayRequest = req.body;
      
      if (!replayRequest.transactionHash) {
        return res.status(400).json({ 
          error: "Transaction hash is required",
          message: "Please provide a valid transaction hash to replay"
        });
      }

      const result = await replayService.replayTransaction(replayRequest);
      
      broadcast({
        type: 'replay_complete',
        data: {
          requestId: result.requestId,
          transactionHash: result.originalTransaction.hash,
          accuracy: result.insights.replayAccuracy
        }
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Transaction replay failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get simulation form by ID
  app.get("/api/v1/replay/forms/:formId", async (req, res) => {
    try {
      const { formId } = req.params;
      const form = formBuilder.getForm(formId);
      
      if (!form) {
        return res.status(404).json({ 
          error: "Form not found",
          message: `No simulation form found with ID: ${formId}`
        });
      }

      res.json({
        success: true,
        data: form
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch form",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get all simulation forms
  app.get("/api/v1/replay/forms", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const forms = formBuilder.getAllForms().slice(0, limit);
      
      res.json({
        success: true,
        data: forms,
        count: forms.length
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch forms",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get replay result by request ID
  app.get("/api/v1/replay/results/:requestId", async (req, res) => {
    try {
      const { requestId } = req.params;
      const result = replayService.getReplayResult(requestId);
      
      if (!result) {
        return res.status(404).json({ 
          error: "Replay result not found",
          message: `No replay result found with ID: ${requestId}`
        });
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch replay result",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Create mainnet fork
  app.post("/api/v1/replay/forks", async (req, res) => {
    try {
      const { blockNumber, preserveContracts = true } = req.body;
      
      if (!blockNumber) {
        return res.status(400).json({ 
          error: "Block number is required",
          message: "Please specify the block number to fork from"
        });
      }

      const fork = await replayService.createMainnetFork(blockNumber);
      
      broadcast({
        type: 'fork_created',
        data: {
          forkId: fork.forkId,
          forkBlock: fork.forkBlock,
          contractCount: fork.contractCount
        }
      });

      res.json({
        success: true,
        data: {
          forkId: fork.forkId,
          forkBlock: fork.forkBlock,
          forkStateRoot: fork.forkStateRoot,
          contractCount: fork.contractCount,
          createdAt: fork.createdAt
        }
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Failed to create mainnet fork",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get active forks
  app.get("/api/v1/replay/forks", async (req, res) => {
    try {
      const forks = replayService.getActiveForks();
      
      res.json({
        success: true,
        data: forks,
        count: forks.length
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch forks",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Delete fork
  app.delete("/api/v1/replay/forks/:forkId", async (req, res) => {
    try {
      const { forkId } = req.params;
      const deleted = await replayService.deleteFork(forkId);
      
      if (!deleted) {
        return res.status(404).json({ 
          error: "Fork not found",
          message: `No fork found with ID: ${forkId}`
        });
      }

      broadcast({
        type: 'fork_deleted',
        data: { forkId }
      });

      res.json({
        success: true,
        message: "Fork deleted successfully"
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to delete fork",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get transaction details by hash (helper endpoint)
  app.get("/api/v1/replay/transaction/:txHash", async (req, res) => {
    try {
      const { txHash } = req.params;
      
      console.log(`[Routes] Getting transaction details for: ${txHash}`);
      
      const [transaction, receipt] = await Promise.all([
        hyperliquidService.getTransactionByHash(txHash),
        hyperliquidService.getTransactionReceipt(txHash)
      ]);

      if (!transaction) {
        return res.status(404).json({ 
          error: "Transaction not found",
          message: `No transaction found with hash: ${txHash}. Please verify the transaction exists on HyperEVM.`
        });
      }

      res.json({
        success: true,
        data: {
          transaction,
          receipt
        }
      });
    } catch (error) {
      console.error(`[Routes] Transaction fetch error for ${req.params.txHash}:`, error);
      res.status(400).json({ 
        error: "Failed to fetch transaction",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Debug endpoint to test RPC connectivity
  app.get("/api/v1/debug/rpc-test", async (req, res) => {
    try {
      console.log('[Debug] Testing HyperEVM RPC connectivity...');
      
      const [chainId, blockNumber, gasPrice] = await Promise.all([
        hyperliquidService.getChainId().catch(err => ({ error: err.message })),
        hyperliquidService.getBlockNumber().catch(err => ({ error: err.message })),
        hyperliquidService.getGasPrice().catch(err => ({ error: err.message }))
      ]);

      const rpcConfig = {
        rpcUrl: process.env.HYPERLIQUID_MAINNET_RPC || 'https://rpc.hyperliquid.xyz/evm',
        testRpcUrl: process.env.HYPERLIQUID_TESTNET_RPC || 'https://rpc.hyperliquid-testnet.xyz/evm'
      };

      res.json({
        success: true,
        rpcConfig,
        testResults: {
          chainId,
          blockNumber, 
          gasPrice
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Debug] RPC test failed:', error);
      res.status(500).json({
        success: false,
        error: "RPC test failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Batch transaction analysis (for analyzing multiple related transactions)
  app.post("/api/v1/replay/batch-analyze", async (req, res) => {
    try {
      const { transactionHashes } = req.body;
      
      if (!Array.isArray(transactionHashes) || transactionHashes.length === 0) {
        return res.status(400).json({ 
          error: "Transaction hashes array is required",
          message: "Please provide an array of transaction hashes to analyze"
        });
      }

      if (transactionHashes.length > 20) {
        return res.status(400).json({ 
          error: "Too many transactions",
          message: "Maximum 20 transactions can be analyzed in a single batch"
        });
      }

      const forms = await Promise.allSettled(
        transactionHashes.map(hash => formBuilder.createSimulationForm(hash))
      );

      const results = forms.map((result, index) => ({
        transactionHash: transactionHashes[index],
        success: result.status === 'fulfilled',
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason.message : null
      }));

      res.json({
        success: true,
        data: results,
        successCount: results.filter(r => r.success).length,
        totalCount: results.length
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Batch analysis failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get replay service statistics
  app.get("/api/v1/replay/stats", async (req, res) => {
    try {
      const stats = replayService.getStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch replay stats",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ================================
  // HYPEREVM-SPECIFIC ENDPOINTS
  // ================================

  // CoreWriter simulation endpoints
  app.post("/api/v1/hyperevm/corewriter/simulate", async (req, res) => {
    try {
      const { actions } = req.body;
      if (!Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({ error: "Actions array is required" });
      }

      const result = await simulationService.simulateCoreWriterActions(actions);
      
      broadcast({
        type: 'corewriter_simulation_complete',
        data: result
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({ 
        error: "CoreWriter simulation failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Oracle price analysis endpoints
  app.post("/api/v1/hyperevm/oracle/analyze", async (req, res) => {
    try {
      const { assetIndexes } = req.body;
      if (!Array.isArray(assetIndexes) || assetIndexes.length === 0) {
        return res.status(400).json({ error: "Asset indexes array is required" });
      }

      const result = await simulationService.analyzeOraclePrices(assetIndexes);
      
      // Convert Map to object for JSON serialization
      const pricesObject = Object.fromEntries(result.prices);
      
      res.json({
        success: true,
        data: {
          ...result,
          prices: pricesObject
        }
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Oracle price analysis failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // MEV analysis endpoint
  app.post("/api/v1/hyperevm/mev/analyze", async (req, res) => {
    try {
      const { transactions } = req.body;
      if (!Array.isArray(transactions) || transactions.length === 0) {
        return res.status(400).json({ error: "Transactions array is required" });
      }

      const result = await simulationService.analyzeMEVOpportunities(transactions);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({ 
        error: "MEV analysis failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Gas optimization endpoint
  app.post("/api/v1/hyperevm/gas/optimize", async (req, res) => {
    try {
      const { transaction } = req.body;
      if (!transaction) {
        return res.status(400).json({ error: "Transaction object is required" });
      }

      const result = await simulationService.optimizeTransactionGas(transaction);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({ 
        error: "Gas optimization failed",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Enhanced network state with HyperEVM metrics
  app.get("/api/v1/hyperevm/network/state", async (req, res) => {
    try {
      const state = await simulationService.getCurrentNetworkState();
      res.json({
        success: true,
        data: state
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch HyperEVM network state",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ================================
  // ADMIN DASHBOARD ENDPOINTS
  // ================================

  // Admin metrics endpoint
  app.get("/api/admin/metrics", async (req, res) => {
    try {
      const metrics = await simulationService.getSystemMetrics();
      console.log('📊 Admin metrics requested:', metrics);
      res.json(metrics);
    } catch (error) {
      console.error('❌ Failed to get admin metrics:', error);
      res.status(500).json({ 
        error: "Failed to fetch system metrics",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Recent simulations endpoint
  app.get("/api/simulations/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const recentSimulations = await simulationService.getRecentSimulations(limit);
      console.log('📝 Recent simulations requested:', recentSimulations.length, 'results');
      res.json(recentSimulations);
    } catch (error) {
      console.error('❌ Failed to get recent simulations:', error);
      res.status(500).json({ 
        error: "Failed to fetch recent simulations",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // JSON-RPC endpoint for EVM compatibility
  app.post("/rpc", async (req, res) => {
    const { method, params, id } = req.body;
    
    try {
      let result;
      
      switch (method) {
        case 'eth_call':
          // Handle eth_call requests
          if (!params || params.length < 1) {
            throw new Error('Missing transaction parameters');
          }
          // This would need to be implemented with actual RPC call
          result = await hyperliquidService.call(params[0], params[1] || 'latest');
          break;
          
        case 'eth_estimateGas':
          // Handle gas estimation
          if (!params || params.length < 1) {
            throw new Error('Missing transaction parameters');
          }
          result = await hyperliquidService.estimateGas(params[0]);
          break;
          
        case 'hyperevm_simulate':
          // Custom HyperEVM simulation endpoint
          if (!params || params.length < 1) {
            throw new Error('Missing simulation parameters');
          }
          const simResult = await simulationService.simulateTransaction({
            transaction: params[0],
            blockNumber: params[1] || 'latest',
            enableStateOverrides: false,
            simulationMode: 'fast',
            includePrecompiles: true,
            simulateCoreWriter: false,
          });
          result = {
            success: simResult.success,
            gasUsed: `0x${simResult.gasUsed.toString(16)}`,
            returnValue: simResult.returnValue,
            executionTrace: simResult.executionTrace
          };
          break;
          
        case 'hyperevm_getPrecompiles':
          // Get HyperEVM precompiles
          result = await simulationService.getPrecompileInfo();
          break;
          
        default:
          throw new Error(`Method ${method} not supported`);
      }
      
      res.json({
        jsonrpc: '2.0',
        id,
        result
      });
    } catch (error) {
      res.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  });

  return httpServer;
}

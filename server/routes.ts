import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage.js";
import { createHyperliquidService } from "./services/hyperliquid.js";
import { SimulationService } from "./services/simulation.js";
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

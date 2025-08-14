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
      const validatedRequest = simulationRequestSchema.parse(req.body);
      
      // Create simulation record
      const simulation = await storage.createSimulation({
        userId: null, // No user auth for now
        transactionData: validatedRequest,
        status: "pending",
        gasLimit: parseInt(validatedRequest.transaction.gasLimit, 16) || 21000,
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

  return httpServer;
}

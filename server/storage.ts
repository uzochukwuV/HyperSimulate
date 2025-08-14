import { 
  type User, 
  type InsertUser, 
  type Simulation, 
  type InsertSimulation,
  type SystemMetric,
  type InsertSystemMetric,
  type ApiKey,
  type InsertApiKey,
  type SimulationResult
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User management
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Simulation management
  createSimulation(simulation: InsertSimulation): Promise<Simulation>;
  getSimulation(id: string): Promise<Simulation | undefined>;
  getSimulationsByUser(userId: string, limit?: number): Promise<Simulation[]>;
  updateSimulationResult(id: string, result: SimulationResult): Promise<void>;
  getRecentSimulations(limit?: number): Promise<Simulation[]>;

  // System metrics
  createSystemMetric(metric: InsertSystemMetric): Promise<SystemMetric>;
  getSystemMetrics(metricType: string, limit?: number): Promise<SystemMetric[]>;
  getLatestMetrics(): Promise<{
    totalSimulations: number;
    successRate: number;
    avgResponseTime: number;
    apiRequests: number;
  }>;

  // API key management
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  getApiKey(keyValue: string): Promise<ApiKey | undefined>;
  getUserApiKeys(userId: string): Promise<ApiKey[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private simulations: Map<string, Simulation> = new Map();
  private systemMetrics: Map<string, SystemMetric> = new Map();
  private apiKeys: Map<string, ApiKey> = new Map();

  constructor() {
    // Initialize with some sample metrics
    this.seedMetrics();
  }

  private seedMetrics() {
    const metrics = [
      { metricType: "total_simulations", value: "1247852" },
      { metricType: "success_rate", value: "98.7" },
      { metricType: "avg_response_time", value: "245" },
      { metricType: "api_requests", value: "47582" },
    ];

    metrics.forEach(metric => {
      const id = randomUUID();
      this.systemMetrics.set(id, {
        id,
        metricType: metric.metricType,
        value: metric.value,
        timestamp: new Date(),
      });
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createSimulation(insertSimulation: InsertSimulation): Promise<Simulation> {
    const id = randomUUID();
    const simulation: Simulation = {
      id,
      ...insertSimulation,
      createdAt: new Date(),
    };
    this.simulations.set(id, simulation);
    return simulation;
  }

  async getSimulation(id: string): Promise<Simulation | undefined> {
    return this.simulations.get(id);
  }

  async getSimulationsByUser(userId: string, limit = 50): Promise<Simulation[]> {
    return Array.from(this.simulations.values())
      .filter(sim => sim.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
  }

  async updateSimulationResult(id: string, result: SimulationResult): Promise<void> {
    const simulation = this.simulations.get(id);
    if (simulation) {
      simulation.simulationResults = result;
      simulation.status = result.success ? "success" : "failed";
      simulation.gasUsed = result.gasUsed;
      simulation.errorMessage = result.errorMessage;
      this.simulations.set(id, simulation);
    }
  }

  async getRecentSimulations(limit = 10): Promise<Simulation[]> {
    return Array.from(this.simulations.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
  }

  async createSystemMetric(insertMetric: InsertSystemMetric): Promise<SystemMetric> {
    const id = randomUUID();
    const metric: SystemMetric = {
      id,
      ...insertMetric,
      timestamp: new Date(),
    };
    this.systemMetrics.set(id, metric);
    return metric;
  }

  async getSystemMetrics(metricType: string, limit = 100): Promise<SystemMetric[]> {
    return Array.from(this.systemMetrics.values())
      .filter(metric => metric.metricType === metricType)
      .sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0))
      .slice(0, limit);
  }

  async getLatestMetrics(): Promise<{
    totalSimulations: number;
    successRate: number;
    avgResponseTime: number;
    apiRequests: number;
  }> {
    const getLatestMetric = (type: string): number => {
      const metrics = Array.from(this.systemMetrics.values())
        .filter(m => m.metricType === type)
        .sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
      return metrics.length > 0 ? parseFloat(metrics[0].value) : 0;
    };

    return {
      totalSimulations: getLatestMetric("total_simulations"),
      successRate: getLatestMetric("success_rate"),
      avgResponseTime: getLatestMetric("avg_response_time"),
      apiRequests: getLatestMetric("api_requests"),
    };
  }

  async createApiKey(insertApiKey: InsertApiKey): Promise<ApiKey> {
    const id = randomUUID();
    const apiKey: ApiKey = {
      id,
      ...insertApiKey,
      createdAt: new Date(),
    };
    this.apiKeys.set(id, apiKey);
    return apiKey;
  }

  async getApiKey(keyValue: string): Promise<ApiKey | undefined> {
    return Array.from(this.apiKeys.values()).find(key => key.keyValue === keyValue);
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values()).filter(key => key.userId === userId);
  }
}

export const storage = new MemStorage();

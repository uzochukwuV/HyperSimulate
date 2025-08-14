import Redis from 'ioredis';
import pino from 'pino';
import { createPublicClient, http } from 'viem';

const logger = pino({ level: 'info' });

export interface StateConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  rpcUrl: string;
  cacheSize: number;
  cacheTTL: number;
}

export interface StateSnapshot {
  blockNumber: number;
  stateRoot: string;
  timestamp: number;
  accounts: Map<string, AccountState>;
  contracts: Map<string, ContractState>;
}

export interface AccountState {
  address: string;
  balance: string;
  nonce: number;
  codeHash?: string;
  storageRoot?: string;
}

export interface ContractState {
  address: string;
  code: string;
  storage: Map<string, string>;
  codeHash: string;
}

export interface ForkedState extends StateSnapshot {
  modifications: StateChange[];
  parentBlock: number;
  fork(): ForkedState;
  commit(): Promise<void>;
  revert(): void;
}

export interface StateChange {
  address: string;
  type: 'balance' | 'nonce' | 'code' | 'storage';
  key?: string;
  before: string;
  after: string;
  blockNumber: number;
  transactionHash?: string;
}

export class HyperEVMStateManager {
  private stateCache: Map<string, StateSnapshot>;
  private redis: Redis;
  private publicClient: any;
  private config: StateConfig;
  private maxCacheSize: number;

  constructor(config: StateConfig) {
    this.config = config;
    this.maxCacheSize = config.cacheSize || 1000;
    this.stateCache = new Map();
    
    // Initialize Redis connection
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      retryDelayOnFailover: 100,
      lazyConnect: true,
    });

    // Initialize RPC client for HyperEVM
    this.publicClient = createPublicClient({
      transport: http(config.rpcUrl),
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      logger.info('Connected to Redis for state caching');
    });

    this.redis.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });

    this.redis.on('ready', () => {
      logger.info('Redis connection ready for state management');
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.ping();
      logger.info('HyperEVM State Manager initialized successfully');
    } catch (error) {
      logger.warn('Redis not available, using memory-only caching');
    }
  }

  async getStateAtBlock(blockNumber: number): Promise<StateSnapshot> {
    const cacheKey = `state:${blockNumber}`;
    
    // Check memory cache first
    if (this.stateCache.has(cacheKey)) {
      logger.debug(`State cache hit for block ${blockNumber}`);
      return this.stateCache.get(cacheKey)!;
    }
    
    // Check Redis cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug(`Redis cache hit for block ${blockNumber}`);
        const state = this.deserializeState(JSON.parse(cached));
        this.addToMemoryCache(cacheKey, state);
        return state;
      }
    } catch (error) {
      logger.warn(`Redis cache miss for block ${blockNumber}:`, error);
    }
    
    // Fetch from HyperEVM node
    logger.info(`Fetching state from HyperEVM node for block ${blockNumber}`);
    const state = await this.fetchStateFromNode(blockNumber);
    
    // Cache the result
    await this.cacheState(cacheKey, state);
    
    return state;
  }

  async getCurrentState(): Promise<StateSnapshot> {
    try {
      const blockNumber = await this.publicClient.getBlockNumber();
      return await this.getStateAtBlock(Number(blockNumber));
    } catch (error) {
      logger.error('Failed to get current state:', error);
      throw new Error('Unable to fetch current blockchain state');
    }
  }

  async forkState(blockNumber: number): Promise<ForkedState> {
    const baseState = await this.getStateAtBlock(blockNumber);
    
    return new HyperEVMForkedState(baseState, {
      onStateChange: (change) => this.trackStateChange(change),
      maxMemoryUsage: 1024 * 1024 * 100, // 100MB limit
      stateManager: this,
    });
  }

  private async fetchStateFromNode(blockNumber: number): Promise<StateSnapshot> {
    try {
      // Get block data
      const block = await this.publicClient.getBlock({
        blockNumber: BigInt(blockNumber),
        includeTransactions: false,
      });

      if (!block) {
        throw new Error(`Block ${blockNumber} not found`);
      }

      // For a full implementation, we would need to fetch account states
      // This is a simplified version that creates a snapshot structure
      const stateSnapshot: StateSnapshot = {
        blockNumber: Number(block.number),
        stateRoot: block.stateRoot,
        timestamp: Number(block.timestamp),
        accounts: new Map(),
        contracts: new Map(),
      };

      logger.info(`Fetched state for block ${blockNumber} with state root ${block.stateRoot}`);
      return stateSnapshot;
    } catch (error) {
      logger.error(`Failed to fetch state for block ${blockNumber}:`, error);
      throw error;
    }
  }

  private async cacheState(cacheKey: string, state: StateSnapshot): Promise<void> {
    // Add to memory cache
    this.addToMemoryCache(cacheKey, state);
    
    // Add to Redis cache
    try {
      const serialized = JSON.stringify(this.serializeState(state));
      await this.redis.setex(cacheKey, this.config.cacheTTL || 3600, serialized);
      logger.debug(`Cached state for ${cacheKey} in Redis`);
    } catch (error) {
      logger.warn(`Failed to cache state in Redis for ${cacheKey}:`, error);
    }
  }

  private addToMemoryCache(cacheKey: string, state: StateSnapshot): void {
    // Implement LRU eviction if cache is full
    if (this.stateCache.size >= this.maxCacheSize) {
      const firstKey = this.stateCache.keys().next().value;
      this.stateCache.delete(firstKey);
    }
    
    this.stateCache.set(cacheKey, state);
  }

  private serializeState(state: StateSnapshot): any {
    return {
      blockNumber: state.blockNumber,
      stateRoot: state.stateRoot,
      timestamp: state.timestamp,
      accounts: Array.from(state.accounts.entries()),
      contracts: Array.from(state.contracts.entries()).map(([addr, contract]) => [
        addr,
        {
          ...contract,
          storage: Array.from(contract.storage.entries()),
        },
      ]),
    };
  }

  private deserializeState(data: any): StateSnapshot {
    return {
      blockNumber: data.blockNumber,
      stateRoot: data.stateRoot,
      timestamp: data.timestamp,
      accounts: new Map(data.accounts),
      contracts: new Map(
        data.contracts.map(([addr, contract]: [string, any]) => [
          addr,
          {
            ...contract,
            storage: new Map(contract.storage),
          },
        ])
      ),
    };
  }

  private async trackStateChange(change: StateChange): Promise<void> {
    logger.debug(`State change tracked: ${change.type} at ${change.address}`);
    
    // Store state changes for analysis
    const changeKey = `change:${change.blockNumber}:${change.address}:${change.type}`;
    try {
      await this.redis.setex(changeKey, 86400, JSON.stringify(change)); // 24h TTL
    } catch (error) {
      logger.warn('Failed to store state change:', error);
    }
  }

  async getRecentStateChanges(blockNumber: number, limit: number = 100): Promise<StateChange[]> {
    try {
      const pattern = `change:${blockNumber}:*`;
      const keys = await this.redis.keys(pattern);
      const changes: StateChange[] = [];
      
      for (const key of keys.slice(0, limit)) {
        try {
          const changeData = await this.redis.get(key);
          if (changeData) {
            changes.push(JSON.parse(changeData));
          }
        } catch (error) {
          logger.warn(`Failed to parse state change for key ${key}`);
        }
      }
      
      return changes.sort((a, b) => b.blockNumber - a.blockNumber);
    } catch (error) {
      logger.error('Failed to get recent state changes:', error);
      return [];
    }
  }

  async clearCache(): Promise<void> {
    this.stateCache.clear();
    try {
      const keys = await this.redis.keys('state:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      logger.info('State cache cleared');
    } catch (error) {
      logger.warn('Failed to clear Redis cache:', error);
    }
  }

  async getStats(): Promise<StateManagerStats> {
    const memoryCacheSize = this.stateCache.size;
    let redisCacheSize = 0;
    
    try {
      const keys = await this.redis.keys('state:*');
      redisCacheSize = keys.length;
    } catch (error) {
      logger.warn('Failed to get Redis stats');
    }
    
    return {
      memoryCacheSize,
      redisCacheSize,
      maxCacheSize: this.maxCacheSize,
      cacheHitRate: 0, // Would be calculated based on metrics
    };
  }
}

export interface StateManagerStats {
  memoryCacheSize: number;
  redisCacheSize: number;
  maxCacheSize: number;
  cacheHitRate: number;
}

class HyperEVMForkedState implements ForkedState {
  public blockNumber: number;
  public stateRoot: string;
  public timestamp: number;
  public accounts: Map<string, AccountState>;
  public contracts: Map<string, ContractState>;
  public modifications: StateChange[];
  public parentBlock: number;

  private options: any;
  private stateManager: HyperEVMStateManager;

  constructor(baseState: StateSnapshot, options: any) {
    this.blockNumber = baseState.blockNumber;
    this.stateRoot = baseState.stateRoot;
    this.timestamp = baseState.timestamp;
    this.accounts = new Map(baseState.accounts);
    this.contracts = new Map(baseState.contracts);
    this.modifications = [];
    this.parentBlock = baseState.blockNumber;
    this.options = options;
    this.stateManager = options.stateManager;
  }

  fork(): ForkedState {
    return new HyperEVMForkedState(this, this.options);
  }

  async commit(): Promise<void> {
    logger.info(`Committing ${this.modifications.length} state modifications`);
    
    // Apply modifications to the main state
    for (const modification of this.modifications) {
      await this.options.onStateChange(modification);
    }
    
    this.modifications = [];
  }

  revert(): void {
    logger.info(`Reverting ${this.modifications.length} state modifications`);
    this.modifications = [];
    
    // Reset to base state (simplified - would need to actually revert changes)
  }

  applyStateChange(change: StateChange): void {
    this.modifications.push(change);
    
    // Apply change to local state
    switch (change.type) {
      case 'balance':
        const account = this.accounts.get(change.address);
        if (account) {
          account.balance = change.after;
        }
        break;
      case 'nonce':
        const nonceAccount = this.accounts.get(change.address);
        if (nonceAccount) {
          nonceAccount.nonce = parseInt(change.after);
        }
        break;
      case 'storage':
        const contract = this.contracts.get(change.address);
        if (contract && change.key) {
          contract.storage.set(change.key, change.after);
        }
        break;
    }
  }
}
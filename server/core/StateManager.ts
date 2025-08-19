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

export interface MainnetFork extends ForkedState {
  forkId: string;
  preserveContracts: boolean;
  contractCache: Map<string, ContractState>;
  contractCodeCache: Map<string, string>;
  preloadedContracts: Set<string>;
  
  // Enhanced methods for mainnet fork
  loadContract(address: string): Promise<ContractState | null>;
  hasContract(address: string): boolean;
  getContractCode(address: string): Promise<string | null>;
  setContractCode(address: string, code: string): void;
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
      logger.warn('Redis connection error:', err.message || 'Connection failed');
      logger.info('Falling back to memory-only caching mode');
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

  /**
   * Create a mainnet fork with full contract state preservation
   */
  async createMainnetFork(blockNumber: number, options?: {
    preserveContracts?: boolean;
    cacheContracts?: boolean;
    maxContractSize?: number;
  }): Promise<MainnetFork> {
    logger.info(`Creating mainnet fork at block ${blockNumber}`);
    
    const forkOptions = {
      preserveContracts: true,
      cacheContracts: true,
      maxContractSize: 1024 * 1024, // 1MB max contract size
      ...options
    };

    try {
      // Get base state at the fork block
      const baseState = await this.getStateAtBlock(blockNumber);
      
      // Create enhanced forked state with contract preservation
      const forkedState = new MainnetForkedState(baseState, {
        onStateChange: (change) => this.trackStateChange(change),
        maxMemoryUsage: 1024 * 1024 * 500, // 500MB for mainnet fork
        stateManager: this,
        preserveContracts: forkOptions.preserveContracts,
        cacheContracts: forkOptions.cacheContracts,
        maxContractSize: forkOptions.maxContractSize
      });

      // Preload critical contracts if preserveContracts is enabled
      if (forkOptions.preserveContracts) {
        await this.preloadCriticalContracts(forkedState, blockNumber);
      }

      return forkedState as any;

    } catch (error) {
      logger.error(`Failed to create mainnet fork at block ${blockNumber}:`, error);
      throw error;
    }
  }

  /**
   * Preload critical smart contracts for fork simulation
   */
  private async preloadCriticalContracts(forkedState: any, blockNumber: number): Promise<void> {
    logger.info('Preloading critical contracts for mainnet fork');
    
    try {
      // Get block data to analyze transactions
      const block = await this.publicClient.getBlock({
        blockNumber: BigInt(blockNumber),
        includeTransactions: true,
      });

      if (!block || !block.transactions) {
        logger.warn('No block or transactions found for contract preloading');
        return;
      }

      const contractAddresses = new Set<string>();
      
      // Extract contract addresses from recent transactions
      const transactions = Array.isArray(block.transactions) ? block.transactions : [];
      
      for (const tx of transactions.slice(0, 100)) { // Limit to recent 100 txs
        if (typeof tx === 'object' && tx.to) {
          // Check if the target address is a contract
          const code = await this.publicClient.getBytecode({
            address: tx.to,
            blockTag: blockNumber.toString(16)
          });
          
          if (code && code !== '0x' && code.length > 2) {
            contractAddresses.add(tx.to);
          }
        }
      }

      // Preload contract state
      const contractArray = Array.from(contractAddresses).slice(0, 50); // Limit to 50 contracts
      logger.info(`Preloading ${contractArray.length} contracts`);

      for (const address of contractArray) {
        try {
          await this.preloadContractState(forkedState, address, blockNumber);
        } catch (error) {
          logger.warn(`Failed to preload contract ${address}:`, error);
        }
      }

      logger.info('Contract preloading completed');

    } catch (error) {
      logger.error('Failed to preload critical contracts:', error);
    }
  }

  /**
   * Preload individual contract state
   */
  private async preloadContractState(forkedState: any, address: string, blockNumber: number): Promise<void> {
    try {
      // Get contract code
      const code = await this.publicClient.getBytecode({
        address,
        blockTag: blockNumber.toString(16)
      });

      if (!code || code === '0x') {
        return;
      }

      // Get basic account state
      const [balance, nonce] = await Promise.all([
        this.publicClient.getBalance({
          address,
          blockTag: blockNumber.toString(16)
        }),
        this.publicClient.getTransactionCount({
          address,
          blockTag: blockNumber.toString(16)
        })
      ]);

      // Store in forked state
      const contractState: ContractState = {
        address,
        code,
        storage: new Map(),
        codeHash: this.calculateCodeHash(code)
      };

      const accountState: AccountState = {
        address,
        balance: balance.toString(),
        nonce: Number(nonce),
        codeHash: contractState.codeHash
      };

      // Add to forked state
      forkedState.contracts.set(address, contractState);
      forkedState.accounts.set(address, accountState);

      logger.debug(`Preloaded contract: ${address}`);

    } catch (error) {
      logger.debug(`Error preloading contract ${address}:`, error);
    }
  }

  /**
   * Calculate code hash for contract
   */
  private calculateCodeHash(code: string): string {
    const crypto = require('crypto');
    return '0x' + crypto.createHash('sha256').update(code).digest('hex');
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

/**
 * Enhanced forked state for mainnet with full contract preservation
 */
class MainnetForkedState extends HyperEVMForkedState implements MainnetFork {
  public forkId: string;
  public preserveContracts: boolean;
  public contractCache: Map<string, ContractState>;
  public contractCodeCache: Map<string, string>;
  public preloadedContracts: Set<string>;
  
  private maxContractSize: number;
  private publicClient: any;

  constructor(baseState: StateSnapshot, options: any) {
    super(baseState, options);
    
    this.forkId = require('uuid').v4();
    this.preserveContracts = options.preserveContracts || true;
    this.contractCache = new Map();
    this.contractCodeCache = new Map();
    this.preloadedContracts = new Set();
    this.maxContractSize = options.maxContractSize || 1024 * 1024; // 1MB default
    
    // Set up public client for on-demand contract loading
    this.publicClient = options.stateManager.publicClient;
  }

  /**
   * Load contract from mainnet if not already cached
   */
  async loadContract(address: string): Promise<ContractState | null> {
    // Check cache first
    if (this.contractCache.has(address)) {
      return this.contractCache.get(address)!;
    }

    // Check if already in contracts map
    if (this.contracts.has(address)) {
      const contract = this.contracts.get(address)!;
      this.contractCache.set(address, contract);
      return contract;
    }

    if (!this.preserveContracts) {
      return null;
    }

    try {
      // Load from mainnet at fork block
      const blockTag = '0x' + this.blockNumber.toString(16);
      
      const [code, balance, nonce] = await Promise.all([
        this.publicClient.getBytecode({
          address,
          blockTag
        }),
        this.publicClient.getBalance({
          address,
          blockTag
        }),
        this.publicClient.getTransactionCount({
          address,
          blockTag
        })
      ]);

      if (!code || code === '0x' || code.length <= 2) {
        return null; // Not a contract
      }

      // Check contract size limit
      if (code.length > this.maxContractSize * 2) { // *2 for hex encoding
        logger.warn(`Contract ${address} exceeds size limit, skipping`);
        return null;
      }

      // Create contract state
      const contractState: ContractState = {
        address,
        code,
        storage: new Map(),
        codeHash: this.stateManager.calculateCodeHash(code)
      };

      const accountState: AccountState = {
        address,
        balance: balance.toString(),
        nonce: Number(nonce),
        codeHash: contractState.codeHash
      };

      // Cache the contract
      this.contractCache.set(address, contractState);
      this.contractCodeCache.set(address, code);
      this.contracts.set(address, contractState);
      this.accounts.set(address, accountState);
      this.preloadedContracts.add(address);

      logger.debug(`Loaded contract from mainnet: ${address}`);
      return contractState;

    } catch (error) {
      logger.warn(`Failed to load contract ${address} from mainnet:`, error);
      return null;
    }
  }

  /**
   * Check if contract exists in fork
   */
  hasContract(address: string): boolean {
    return this.contracts.has(address) || 
           this.contractCache.has(address) ||
           this.preloadedContracts.has(address);
  }

  /**
   * Get contract code (loads on-demand if needed)
   */
  async getContractCode(address: string): Promise<string | null> {
    // Check code cache first
    if (this.contractCodeCache.has(address)) {
      return this.contractCodeCache.get(address)!;
    }

    // Try to load contract
    const contract = await this.loadContract(address);
    return contract ? contract.code : null;
  }

  /**
   * Set contract code (for debugging/testing scenarios)
   */
  setContractCode(address: string, code: string): void {
    this.contractCodeCache.set(address, code);
    
    const contractState: ContractState = {
      address,
      code,
      storage: new Map(),
      codeHash: this.stateManager.calculateCodeHash(code)
    };

    this.contracts.set(address, contractState);
    this.contractCache.set(address, contractState);

    // Track as modification
    this.applyStateChange({
      address,
      type: 'code',
      before: '0x',
      after: code,
      blockNumber: this.blockNumber
    });
  }

  /**
   * Override fork method to return MainnetForkedState
   */
  fork(): MainnetFork {
    return new MainnetForkedState(this, this.options);
  }

  /**
   * Get fork statistics
   */
  getForkStats(): {
    forkId: string;
    forkBlock: number;
    preloadedContracts: number;
    cachedContracts: number;
    totalModifications: number;
    memoryUsage: number;
  } {
    const memoryUsage = 
      (this.contractCache.size * 1000) + // Rough estimate
      (this.contractCodeCache.size * 50000) + // Code size estimate
      (this.modifications.length * 200); // Modification overhead

    return {
      forkId: this.forkId,
      forkBlock: this.blockNumber,
      preloadedContracts: this.preloadedContracts.size,
      cachedContracts: this.contractCache.size,
      totalModifications: this.modifications.length,
      memoryUsage
    };
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.contractCache.clear();
    this.contractCodeCache.clear();
    this.preloadedContracts.clear();
    this.modifications = [];
  }
}
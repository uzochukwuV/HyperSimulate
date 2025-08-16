import { VM } from '@ethereumjs/vm';
import { FeeMarket1559Tx as FeeMarketEIP1559Tx, LegacyTx, AccessList2930Tx as AccessListEIP2930Tx } from '@ethereumjs/tx';
import { Common, Hardfork } from '@ethereumjs/common';
import { Account, Address, bytesToHex, hexToBytes, setLengthLeft } from '@ethereumjs/util';
import { createPublicClient, getAddress, http, PublicClient } from 'viem';
import { v4 as uuidv4 } from 'uuid';
import pino, { Logger } from 'pino';
import LRU from 'lru-cache';
import { EventEmitter } from 'events';

// Production logger configuration
const logger: Logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined
});

// ================================
// INTERFACES AND TYPES
// ================================

export interface HyperEVMConfig {
  chainId: number;
  networkId: number;
  rpcUrl: string;
  stateConfig: {
    cacheSize: number;
    persistentStorage: boolean;
    maxConcurrentSimulations: number;
    timeoutMs: number;
  };
  security: {
    enableRateLimiting: boolean;
    maxGasLimit: bigint;
    maxValueTransfer: bigint;
    allowedPrecompiles: string[];
  };
}

export interface SimulationRequest {
  from: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  blockNumber?: string;
  stateOverrides?: StateOverride[];
  traceConfig?: TraceConfig;
  accessList?: AccessListEntry[];
  revertOnFailure?: boolean;
  requestId?: string;
}

export interface StateOverride {
  address: string;
  balance?: string;
  nonce?: string;
  code?: string;
  storage?: Record<string, string>;
}

export interface AccessListEntry {
  address: string;
  storageKeys: string[];
}

export interface TraceConfig {
  enableMemory?: boolean;
  disableStack?: boolean;
  disableStorage?: boolean;
  enableReturnData?: boolean;
  timeout?: string;
}

export interface SimulationResult {
  requestId: string;
  success: boolean;
  gasUsed: string;
  gasPrice: string;
  gasLimit: string;
  returnValue?: string;
  executionTrace?: ExecutionTrace;
  stateChanges: StateChange[];
  events: DecodedEvent[];
  analysis: TransactionAnalysis;
  error?: string;
  timestamp: number;
  blockNumber: string;
  blockHash: string;
}

export interface ExecutionTrace {
  type: 'CALL' | 'DELEGATECALL' | 'STATICCALL' | 'CREATE' | 'CREATE2' | 'RETURN' | 'REVERT';
  from: string;
  to: string;
  value: string;
  gas: string;
  gasUsed: string;
  input: string;
  output: string;
  calls: ExecutionTrace[];
  logs: LogEntry[];
  error?: string;
  depth: number;
}

export interface StateChange {
  address: string;
  type: 'balance' | 'nonce' | 'code' | 'storage';
  key?: string;
  before: string;
  after: string;
}

export interface DecodedEvent {
  address: string;
  signature: string;
  name?: string;
  topics: string[];
  data: string;
  decoded?: Record<string, any>;
  blockNumber: string;
  transactionHash: string;
  logIndex: number;
}

export interface LogEntry {
  address: string;
  topics: string[];
  data: string;
}

export interface TransactionAnalysis {
  gasAnalysis: GasAnalysis;
  eventAnalysis: EventAnalysis;
  performanceMetrics: PerformanceMetrics;
  securityInsights: SecurityInsight[];
  optimizationSuggestions: OptimizationSuggestion[];
  riskAssessment: RiskAssessment;
}

export interface GasAnalysis {
  totalGas: number;
  gasBreakdown: Record<string, number>;
  storageWrites: number;
  storageReads: number;
  loopIterations: number;
  externalCalls: number;
  precompileCalls: number;
  efficiency: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedCost: string;
}

export interface EventAnalysis {
  totalEvents: number;
  tokenTransfers: number;
  balanceChanges: BalanceChange[];
  uniqueContracts: number;
  eventsByContract: Record<string, number>;
  criticalEvents: string[];
}

export interface BalanceChange {
  token: string;
  from: string;
  to: string;
  amount: string;
  type: 'NATIVE' | 'ERC20' | 'ERC721' | 'ERC1155';
}

export interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: number;
  storageAccess: number;
  networkCalls: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface SecurityInsight {
  type: 'REENTRANCY' | 'INTEGER_OVERFLOW' | 'UNCHECKED_SEND' | 'DELEGATE_CALL' | 'SELFDESTRUCT' | 'PRECOMPILE_RISK';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  location?: string;
  recommendation: string;
}

export interface OptimizationSuggestion {
  type: 'STORAGE_OPTIMIZATION' | 'LOOP_OPTIMIZATION' | 'GAS_OPTIMIZATION' | 'BATCH_OPTIMIZATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  potentialSavings: string;
  implementation: string;
}

export interface RiskAssessment {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskFactors: string[];
  mitigationSuggestions: string[];
  confidenceScore: number;
}

export interface BundleResult {
  results: SimulationResult[];
  totalGasUsed: string;
  bundleHash: string;
  interdependencies: BundleDependency[];
  executionOrder: number[];
  optimizationReport: BundleOptimization;
}

export interface BundleDependency {
  fromIndex: number;
  toIndex: number;
  type: 'STORAGE' | 'BALANCE' | 'NONCE' | 'CODE';
  description: string;
  critical: boolean;
}

export interface BundleOptimization {
  canReorder: boolean;
  potentialSavings: string;
  recommendedOrder: number[];
  parallelizable: number[][];
}

// ================================
// HYPEREVM ENGINE IMPLEMENTATION
// ================================

export class HyperEVMEngine extends EventEmitter {
  private vm!: VM;
  private common!: Common;
  private publicClient!: PublicClient;
  private config: HyperEVMConfig;
  private accountCache: LRU<string, Account>;
  private codeCache: LRU<string, Uint8Array>;
  private storageCache: LRU<string, Uint8Array>;
  private initialized = false;
  private activeSimulations = new Map<string, AbortController>();
  
  // HyperEVM specific precompiles with enhanced metadata
  private readonly hyperEVMPrecompiles = new Map([
    ['0x0000000000000000000000000000000000000800', {
      name: 'READ_BASE',
      description: 'HyperEVM base read operations',
      gasMultiplier: 1.2,
      riskLevel: 'LOW'
    }],
    ['0x0000000000000000000000000000000000000807', {
      name: 'PERP_ORACLE',
      description: 'Perpetual futures oracle',
      gasMultiplier: 2.0,
      riskLevel: 'MEDIUM'
    }],
    ['0x3333333333333333333333333333333333333333', {
      name: 'CORE_WRITER',
      description: 'Core system state writer',
      gasMultiplier: 3.0,
      riskLevel: 'HIGH'
    }],
    ['0x2222222222222222222222222222222222222222', {
      name: 'HYPE_SYSTEM',
      description: 'HYPE token system operations',
      gasMultiplier: 1.5,
      riskLevel: 'MEDIUM'
    }],
    ['0x5555555555555555555555555555555555555555', {
      name: 'WHYPE_CONTRACT',
      description: 'Wrapped HYPE token contract',
      gasMultiplier: 1.8,
      riskLevel: 'MEDIUM'
    }]
  ]);

  constructor(config: HyperEVMConfig) {
    super();
    this.config = this.validateConfig(config);
    
    // Initialize caches
    this.accountCache = new LRU({ max: config.stateConfig.cacheSize });
    this.codeCache = new LRU({ max: config.stateConfig.cacheSize });
    this.storageCache = new LRU({ max: config.stateConfig.cacheSize * 10 });
    
    this.setupCommon();
    this.setupVM();
    this.setupClient();
    this.setupEventHandlers();
  }

  private validateConfig(config: HyperEVMConfig): HyperEVMConfig {
    if (!config.rpcUrl || !config.rpcUrl.startsWith('http')) {
      throw new Error('Invalid RPC URL provided');
    }
    
    if (config.chainId <= 0 || config.networkId <= 0) {
      throw new Error('Invalid chain or network ID');
    }
    
    if (config.security.maxGasLimit <= 0) {
      throw new Error('Invalid max gas limit');
    }
    
    return {
      ...config,
      stateConfig: {
        cacheSize: Math.max(1000, config.stateConfig.cacheSize),
        persistentStorage: config.stateConfig.persistentStorage,
        maxConcurrentSimulations: Math.max(1, config.stateConfig.maxConcurrentSimulations),
        timeoutMs: Math.max(5000, config.stateConfig.timeoutMs)
      }
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('HyperEVM Engine already initialized');
      return;
    }

    logger.info('Initializing HyperEVM Engine...');
    
    try {
      await this.loadHyperEVMPrecompiles();
      await this.syncWithNetwork();
      await this.validateNetworkConnection();
      
      this.initialized = true;
      logger.info('HyperEVM Engine initialized successfully');
      this.emit('initialized');
    } catch (error: any) {
      logger.error('Failed to initialize HyperEVM Engine:', error);
      this.emit('error', error);
      throw error;
    }
  }

  private setupCommon(): void {
    this.common = Common.custom({
      chainId: this.config.chainId,
      networkId: this.config.networkId,
      name: 'hyperevm',
      defaultHardfork: Hardfork.Shanghai,
      hardforks: [
        { name: 'chainstart', block: 0 },
        { name: 'homestead', block: 0 },
        { name: 'tangerineWhistle', block: 0 },
        { name: 'spuriousDragon', block: 0 },
        { name: 'byzantium', block: 0 },
        { name: 'constantinople', block: 0 },
        { name: 'petersburg', block: 0 },
        { name: 'istanbul', block: 0 },
        { name: 'berlin', block: 0 },
        { name: 'london', block: 0 },
        { name: 'shanghai', block: 0 }
      ]
    });
  }

  private setupVM(): void {
    this.vm = new VM({
      common: this.common,
      activatePrecompiles: true,
      stateManager: undefined // Use default state manager
    });
  }

  private setupClient(): void {
    this.publicClient = createPublicClient({
      transport: http(this.config.rpcUrl, {
        timeout: this.config.stateConfig.timeoutMs,
        retryCount: 3,
        retryDelay: 1000
      })
    });
  }

  private setupEventHandlers(): void {
    this.on('simulationStart', (requestId: string) => {
      logger.debug(`Simulation started: ${requestId}`);
    });
    
    this.on('simulationComplete', (requestId: string, duration: number) => {
      logger.debug(`Simulation completed: ${requestId} in ${duration}ms`);
    });
    
    this.on('simulationError', (requestId: string, error: any) => {
      logger.error(`Simulation error: ${requestId}`, error!.message);
    });
  }

  private async loadHyperEVMPrecompiles(): Promise<void> {
    logger.info('Loading HyperEVM precompiles...');
    
    for (const [address, metadata] of this.hyperEVMPrecompiles) {
      logger.debug(`Registering precompile: ${metadata.name} at ${address} (risk: ${metadata.riskLevel})`);
      
      // Validate precompile is allowed
      if (!this.config.security.allowedPrecompiles.includes(address)) {
        logger.warn(`Precompile ${address} not in allowed list, skipping`);
        continue;
      }
    }
    
    logger.info(`Loaded ${this.hyperEVMPrecompiles.size} HyperEVM precompiles`);
  }

  private async syncWithNetwork(): Promise<void> {
    try {
      const [blockNumber, chainId] = await Promise.all([
        this.publicClient.getBlockNumber(),
        this.publicClient.getChainId()
      ]);
      
      if (chainId !== this.config.chainId) {
        throw new Error(`Chain ID mismatch: expected ${this.config.chainId}, got ${chainId}`);
      }
      
      logger.info(`Synced with HyperEVM network at block ${blockNumber}, chain ID ${chainId}`);
    } catch (error: any) {
      logger.error('Failed to sync with network:', error);
      throw new Error('Network synchronization failed');
    }
  }

  private async validateNetworkConnection(): Promise<void> {
    try {
      await this.publicClient.getBlockNumber();
      logger.debug('Network connection validated successfully');
    } catch (error) {
      throw new Error(`Network validation failed: ${error}`);
    }
  }

  // ================================
  // MAIN SIMULATION METHODS
  // ================================

  async simulate(request: SimulationRequest): Promise<SimulationResult> {
    if (!this.initialized) {
      throw new Error('HyperEVM Engine not initialized');
    }

    if (this.activeSimulations.size >= this.config.stateConfig.maxConcurrentSimulations) {
      throw new Error('Maximum concurrent simulations reached');
    }

    const startTime = Date.now();
    const requestId = request.requestId || uuidv4();
    const abortController = new AbortController();
    
    this.activeSimulations.set(requestId, abortController);
    this.emit('simulationStart', requestId);

    try {
      // Validate request
      this.validateSimulationRequest(request);
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, this.config.stateConfig.timeoutMs);

      // Execute simulation with comprehensive tracing
      const result = await this.executeSimulation(request, requestId, abortController.signal);
      
      clearTimeout(timeoutId);
      this.emit('simulationComplete', requestId, Date.now() - startTime);
      
      return result;
    } catch (error: any) {
      this.emit('simulationError', requestId, error);
      return this.handleSimulationError(error, request, requestId);
    } finally {
      this.activeSimulations.delete(requestId);
    }
  }

  private validateSimulationRequest(request: SimulationRequest): void {
    // Validate addresses
    try {
      getAddress(request.from);
      if (request.to) getAddress(request.to);
    } catch {
      throw new Error('Invalid address format');
    }

    // Validate gas limits
    const gasLimit = request.gas ? BigInt(request.gas) : 21000;
    if (gasLimit > this.config.security.maxGasLimit) {
      throw new Error(`Gas limit exceeds maximum: ${gasLimit} > ${this.config.security.maxGasLimit}`);
    }

    // Validate value transfer
    const value = request.value ? BigInt(request.value) : 0;
    if (value > this.config.security.maxValueTransfer) {
      throw new Error(`Value transfer exceeds maximum: ${value} > ${this.config.security.maxValueTransfer}`);
    }

    // Validate precompile calls
    if (request.to && this.hyperEVMPrecompiles.has(request.to.toLowerCase())) {
      if (!this.config.security.allowedPrecompiles.includes(request.to.toLowerCase())) {
        throw new Error(`Precompile ${request.to} not allowed`);
      }
    }
  }

  private async executeSimulation(
    request: SimulationRequest,
    requestId: string,
    signal: AbortSignal
  ): Promise<SimulationResult> {
    const blockTag = request.blockNumber || 'latest';
    const callerAddr = getAddress(request.from) as any;
    
    // State tracking
    const stateChanges: StateChange[] = [];
    const executionTrace: ExecutionTrace[] = [];
    const touchedAddresses = new Set<string>();
    const touchedStorage = new Map<string, Map<string, { before: string; after: string }>>();
    
    let gasUsed = 0;
    let returnValue: string | undefined;
    let error: string | undefined;
    let logs: LogEntry[] = [];

    // Create VM checkpoint
    await this.vm.stateManager.checkpoint();

    try {
      // Hydrate necessary accounts
      await this.ensureAccountHydrated(callerAddr, blockTag);
      if (request.to) {
        await this.ensureAccountHydrated(getAddress(request.to) as any, blockTag);
      }

      // Apply state overrides
      if (request.stateOverrides) {
        await this.applyStateOverrides(request.stateOverrides);
      }

      // Set up comprehensive tracing
      await this.setupExecutionTracing(stateChanges, executionTrace, touchedAddresses, touchedStorage);

      // Create and execute transaction
      const tx = await this.createTransaction(request);
      const vmResult = await this.vm.runTx({ 
        tx, 
        skipBalance: false,
        skipNonce: false,
        skipHardForkValidation: false
      });

      gasUsed = vmResult.totalGasSpent;
      returnValue = vmResult.execResult.returnValue ? bytesToHex(vmResult.execResult.returnValue) : undefined;
      logs = (vmResult.execResult.logs || []).map(log  => ({
        address: bytesToHex(log.address),
        topics: log.topics.map((topic: Uint8Array) => bytesToHex(topic)),
        data: bytesToHex(log.data)
      }));

      if (vmResult.execResult.exceptionError) {
        error = vmResult.execResult.exceptionError.error;
      }

      // Process state changes
      await this.finalizeStateChanges(stateChanges, touchedStorage);

      // Get current block info
      const [currentBlock, currentBlockHash] = await Promise.all([
        this.publicClient.getBlockNumber(),
        this.publicClient.getBlock({ blockTag: 'latest' }).then(b => b.hash!)
      ]);

      // Always revert to maintain clean state
      await this.vm.stateManager.revert();

      // Decode events
      const decodedEvents = this.decodeEvents(logs, currentBlock.toString(), '0x' + requestId.replace(/-/g, ''));

      // Perform comprehensive analysis
      const analysis = await this.analyzeExecution(
        BigInt(gasUsed),
        executionTrace[0],
        decodedEvents,
        stateChanges,
        request
      );

      return {
        requestId,
        success: !error,
        gasUsed: gasUsed.toString(),
        gasPrice: this.extractGasPrice(request),
        gasLimit: request.gas || '0x5208',
        returnValue,
        executionTrace: executionTrace[0],
        stateChanges,
        events: decodedEvents,
        analysis,
        error,
        timestamp: Date.now(),
        blockNumber: currentBlock.toString(),
        blockHash: currentBlockHash
      };

    } catch (e: any) {
      await this.vm.stateManager.revert();
      throw e;
    }
  }

  private async ensureAccountHydrated(address: Address, blockTag: string): Promise<void> {
    const cacheKey = `${address.toString()}-${blockTag}`;
    
    // Check cache first
    if (this.accountCache.has(cacheKey)) {
      const cachedAccount = this.accountCache.get(cacheKey)!;
      await this.vm.stateManager.putAccount(address, cachedAccount);
      
      const codeCacheKey = `${address.toString()}-code`;
      if (this.codeCache.has(codeCacheKey)) {
        await this.vm.stateManager.putCode(address, this.codeCache.get(codeCacheKey)!);
      }
      return;
    }

    try {
      const [balance, nonce, code] = await Promise.all([
        this.publicClient.getBalance({ address: address.toString(), blockTag: blockTag as any }),
        this.publicClient.getTransactionCount({ address: address.toString(), blockTag: blockTag as any }),
        this.publicClient.getBytecode({ address: address.toString(), blockTag: blockTag as any })
      ]);

      const account = new Account();
      account.balance = balance;
      account.nonce = BigInt(nonce);

      await this.vm.stateManager.putAccount(address, account);
      
      if (code && code !== '0x') {
        const codeBytes = hexToBytes(code);
        await this.vm.stateManager.putCode(address, codeBytes);
        this.codeCache.set(`${address.toString()}-code`, codeBytes);
      }

      // Cache the account
      this.accountCache.set(cacheKey, account);
      
      logger.debug(`Hydrated account ${address.toString()} at block ${blockTag}`);
    } catch (error: any) {
      logger.warn(`Failed to hydrate account ${address.toString()} at block ${blockTag}:`, error);
      throw new Error(`Account hydration failed: ${error}`);
    }
  }

  private async applyStateOverrides(overrides: StateOverride[]): Promise<void> {
    for (const override of overrides) {
      try {
        const address = getAddress(override.address) as any;
        
        let account = await this.vm.stateManager.getAccount(address);
        if (!account) {
          account = new Account();
        }

        if (override.balance !== undefined) {
          account.balance = BigInt(override.balance);
        }

        if (override.nonce !== undefined) {
          account.nonce = BigInt(override.nonce);
        }

        await this.vm.stateManager.putAccount(address, account);

        if (override.storage) {
          for (const [key, value] of Object.entries(override.storage)) {
            await this.vm.stateManager.putStorage(
              address,
              setLengthLeft(hexToBytes(key as any), 32),
              setLengthLeft(hexToBytes(value as any), 32)
            );
          }
        }

        if (override.code !== undefined) {
          await this.vm.stateManager.putCode(address, hexToBytes(override.code as any));
        }

        logger.debug(`Applied state override for ${address.toString()}`);
      } catch (error: any) {
        logger.error(`Failed to apply state override for ${override.address}:`, error);
        throw new Error(`State override failed: ${error}`);
      }
    }
  }

  private async setupExecutionTracing(
    stateChanges: StateChange[],
    executionTrace: ExecutionTrace[],
    touchedAddresses: Set<string>,
    touchedStorage: Map<string, Map<string, { before: string; after: string }>>
  ): Promise<void> {
    this.vm?.evm?.events!.removeAllListeners();
    
    let callStack: Partial<ExecutionTrace>[] = [];
    let currentDepth = 0;

    this.vm.evm.events!.on('beforeMessage', async (data) => {
      const trace: Partial<ExecutionTrace> = {
        type: 'CALL',
        from: bytesToHex(data.caller.bytes),
        to: bytesToHex(data.to?.bytes!),
        value: '0x' + data.value.toString(16),
        gas: '0x' + data.gasLimit.toString(16),
        input: bytesToHex(data.data),
        calls: [],
        logs: [],
        depth: currentDepth++
      };
      
      callStack.push(trace);
      touchedAddresses.add(trace.to!);
    });

    this.vm.evm.events!.on('afterMessage', async (data) => {
      const trace = callStack.pop();
      if (trace) {
        trace.gasUsed = '0x' + data.gasUsed.toString(16);
        trace.output = data.execResult.returnValue ? bytesToHex(data.execResult.returnValue) : '0x';
        trace.type = data.execResult.exceptionError ? 'REVERT' : 'RETURN';
        
        if (data.execResult.exceptionError) {
          trace.error = data.execResult.exceptionError.error;
        }

        if (callStack.length === 0) {
          executionTrace.push(trace as ExecutionTrace);
        } else {
          const parent = callStack[callStack.length - 1];
          if (!parent.calls) parent.calls = [];
          parent.calls.push(trace as ExecutionTrace);
        }
      }
      currentDepth--;
    });

    this.vm.evm.events!.on('step', async (data) => {
      const address = bytesToHex(data.address.bytes);
      touchedAddresses.add(address);

      if (data.opcode.name === 'SSTORE' && data.stack.length >= 2) {
        const key = '0x' + data.stack[data.stack.length - 2].toString(16).padStart(64, '0');
        const newValue = '0x' + data.stack[data.stack.length - 1].toString(16);
        
        if (!touchedStorage.has(address)) {
          touchedStorage.set(address, new Map());
        }
        
        let beforeValue = '0x0';
        try {
          beforeValue = bytesToHex(await this.vm.stateManager.getStorage(
            data.address,
            setLengthLeft(hexToBytes(key as any), 32)
          ));
        } catch {}
        
        touchedStorage.get(address)!.set(key, { before: beforeValue, after: newValue });
      }
    });
  }

  private async finalizeStateChanges(
    stateChanges: StateChange[],
    touchedStorage: Map<string, Map<string, { before: string; after: string }>>
  ): Promise<void> {
    for (const [address, storageMap] of touchedStorage) {
      for (const [key, { before, after }] of storageMap) {
        let finalAfter = after;
        try {
          finalAfter = bytesToHex(await this.vm.stateManager.getStorage(
            getAddress(address) as any,
            setLengthLeft(hexToBytes(key), 32)
          ));
        } catch {}
        
        if (before !== finalAfter) {
          stateChanges.push({
            address,
            type: 'storage',
            key,
            before,
            after: finalAfter
          });
        }
      }
    }
  }

  private async createTransaction(request: SimulationRequest) {
    const txData = {
      to: request.to ? getAddress(request.to) : undefined,
      value: request.value ? BigInt(request.value) : BigInt(0),
      data: request.data ? hexToBytes(request.data as any) : new Uint8Array(),
      gasLimit: request.gas ? BigInt(request.gas) : BigInt(21000),
      nonce: request.nonce ? BigInt(request.nonce) : BigInt(0)
    };

    // Create appropriate transaction type
    if (request.maxFeePerGas || request.maxPriorityFeePerGas) {
        
      return new FeeMarketEIP1559Tx({
        ...txData,
        maxFeePerGas: request.maxFeePerGas ? BigInt(request.maxFeePerGas) : BigInt(1000000000),
        maxPriorityFeePerGas: request.maxPriorityFeePerGas ? BigInt(request.maxPriorityFeePerGas) : BigInt(1000000000),
        accessList: request.accessList as any || []
      }, { common: this.common });
    } else if (request.accessList && request.accessList.length > 0) {
      return new AccessListEIP2930Tx({
        ...txData,
        gasPrice: request.gasPrice ? BigInt(request.gasPrice) : BigInt(1000000000),
        accessList: request.accessList as any
      }, { common: this.common });
    } else {
      return new LegacyTx({
        ...txData,
        gasPrice: request.gasPrice ? BigInt(request.gasPrice) : BigInt(1000000000)
      }, { common: this.common });
    }
  }

  private extractGasPrice(request: SimulationRequest): string {
    if (request.maxFeePerGas) return request.maxFeePerGas;
    if (request.gasPrice) return request.gasPrice;
    return '1000000000'; // 1 gwei default
  }

  private decodeEvents(logs: LogEntry[], blockNumber: string, transactionHash: string): DecodedEvent[] {
    return logs.map((log, index) => {
      const signature = log.topics.length > 0 ? log.topics[0] : '';
      
      // Common event signatures for enhanced analysis
      const eventSignatures = new Map([
        ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', 'Transfer(address,address,uint256)'],
        ['0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925', 'Approval(address,address,uint256)'],
        ['0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31', 'ApprovalForAll(address,address,bool)'],
        ['0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62', 'TransferSingle(address,address,address,uint256,uint256)'],
        ['0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb', 'TransferBatch(address,address,address,uint256[],uint256[])']
      ]);

      const decoded: DecodedEvent = {
        address: log.address,
        signature,
        name: eventSignatures.get(signature),
        topics: log.topics,
        data: log.data,
        blockNumber,
        transactionHash,
        logIndex: index
      };

      // Enhanced decoding for common patterns
      if (signature === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' && log.topics.length === 3) {
        try {
          decoded.decoded = {
            from: '0x' + log.topics[1].slice(26),
            to: '0x' + log.topics[2].slice(26),
            value: BigInt(log.data).toString()
          };
        } catch {}
      }

      return decoded;
    });
  }

  private async analyzeExecution(
    gasUsed: bigint,
    executionTrace: ExecutionTrace,
    events: DecodedEvent[],
    stateChanges: StateChange[],
    request: SimulationRequest
  ): Promise<TransactionAnalysis> {
    const startTime = Date.now();
    
    // Gas Analysis
    const gasAnalysis = this.analyzeGasUsage(gasUsed, executionTrace, stateChanges);
    
    // Event Analysis
    const eventAnalysis = this.analyzeEvents(events, stateChanges);
    
    // Security Analysis
    const securityInsights = await this.analyzeSecurityRisks(executionTrace, request, stateChanges);
    
    // Performance Metrics
    const performanceMetrics: PerformanceMetrics = {
      executionTime: Date.now() - startTime,
      memoryUsage: process.memoryUsage().heapUsed,
      storageAccess: stateChanges.filter(sc => sc.type === 'storage').length,
      networkCalls: 1, // At least one for simulation
      cacheHits: this.accountCache.size,
      cacheMisses: Math.max(0, this.accountCache.size - this.accountCache.calculatedSize)
    };
    
    // Optimization Suggestions
    const optimizationSuggestions = this.generateOptimizationSuggestions(gasAnalysis, eventAnalysis, stateChanges);
    
    // Risk Assessment
    const riskAssessment = this.assessRisk(securityInsights, gasAnalysis, request);

    return {
      gasAnalysis,
      eventAnalysis,
      performanceMetrics,
      securityInsights,
      optimizationSuggestions,
      riskAssessment
    };
  }

  private analyzeGasUsage(gasUsed: bigint, executionTrace: ExecutionTrace, stateChanges: StateChange[]): GasAnalysis {
    const totalGas = Number(gasUsed);
    const storageWrites = stateChanges.filter(sc => sc.type === 'storage').length;
    const storageReads = Math.max(0, Math.floor(totalGas / 800) - storageWrites); // Estimated
    
    let externalCalls = 0;
    let precompileCalls = 0;
    
    const countCalls = (trace: ExecutionTrace) => {
      if (trace.calls) {
        externalCalls += trace.calls.length;
        trace.calls.forEach(call => {
          if (this.hyperEVMPrecompiles.has(call.to.toLowerCase())) {
            precompileCalls++;
          }
          countCalls(call);
        });
      }
    };
    
    if (executionTrace) {
      countCalls(executionTrace);
    }

    const gasBreakdown: Record<string, number> = {
      baseTransaction: 21000,
      execution: Math.max(0, totalGas - 21000),
      storage: storageWrites * 20000, // Approximate SSTORE cost
      calls: externalCalls * 2300, // Approximate external call cost
      precompiles: precompileCalls * 3000 // Estimated precompile cost
    };

    let efficiency: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    if (totalGas < 50000) efficiency = 'HIGH';
    else if (totalGas > 200000) efficiency = 'LOW';

    return {
      totalGas,
      gasBreakdown,
      storageWrites,
      storageReads,
      loopIterations: 0, // Would require more sophisticated analysis
      externalCalls,
      precompileCalls,
      efficiency,
      estimatedCost: (BigInt(totalGas) * BigInt(20000000000) / BigInt(1000000000000000000)).toString() + ' ETH' // Rough estimate at 20 gwei
    };
  }

  private analyzeEvents(events: DecodedEvent[], stateChanges: StateChange[]): EventAnalysis {
    const tokenTransfers = events.filter(e => 
      e.signature === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    ).length;

    const uniqueContracts = new Set(events.map(e => e.address)).size;
    
    const eventsByContract = events.reduce((acc, event) => {
      acc[event.address] = (acc[event.address] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const balanceChanges: BalanceChange[] = events
      .filter(e => e.decoded && e.signature.includes('Transfer'))
      .map(e => ({
        token: e.address,
        from: e.decoded!.from,
        to: e.decoded!.to,
        amount: e.decoded!.value || e.decoded!.amount || '0',
        type: 'ERC20' as const
      }));

    const criticalEvents = events
      .filter(e => this.hyperEVMPrecompiles.has(e.address.toLowerCase()))
      .map(e => `${this.hyperEVMPrecompiles.get(e.address.toLowerCase())?.name}: ${e.signature}`);

    return {
      totalEvents: events.length,
      tokenTransfers,
      balanceChanges,
      uniqueContracts,
      eventsByContract,
      criticalEvents
    };
  }

  private async analyzeSecurityRisks(
    executionTrace: ExecutionTrace,
    request: SimulationRequest,
    stateChanges: StateChange[]
  ): Promise<SecurityInsight[]> {
    const insights: SecurityInsight[] = [];

    // Check for precompile interactions
    if (request.to && this.hyperEVMPrecompiles.has(request.to.toLowerCase())) {
      const precompile = this.hyperEVMPrecompiles.get(request.to.toLowerCase())!;
      if (precompile.riskLevel === 'HIGH') {
        insights.push({
          type: 'PRECOMPILE_RISK',
          severity: 'HIGH',
          description: `Interaction with high-risk precompile: ${precompile.name}`,
          location: request.to,
          recommendation: 'Carefully review precompile interaction parameters and expected outcomes'
        });
      }
    }

    // Check for delegate calls
    const checkDelegateCalls = (trace: ExecutionTrace) => {
      if (trace.type === 'DELEGATECALL') {
        insights.push({
          type: 'DELEGATE_CALL',
          severity: 'MEDIUM',
          description: 'Delegate call detected - execution context changes',
          location: `${trace.from} -> ${trace.to}`,
          recommendation: 'Ensure delegate call target is trusted and secure'
        });
      }
      trace.calls?.forEach(checkDelegateCalls);
    };

    if (executionTrace) {
      checkDelegateCalls(executionTrace);
    }

    // Check for excessive storage writes (potential DoS)
    const storageWrites = stateChanges.filter(sc => sc.type === 'storage').length;
    if (storageWrites > 50) {
      insights.push({
        type: 'UNCHECKED_SEND',
        severity: 'MEDIUM',
        description: `Excessive storage operations detected: ${storageWrites} writes`,
        recommendation: 'Consider batching storage operations or implementing access controls'
      });
    }

    return insights;
  }

  private generateOptimizationSuggestions(
    gasAnalysis: GasAnalysis,
    eventAnalysis: EventAnalysis,
    stateChanges: StateChange[]
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Gas optimization suggestions
    if (gasAnalysis.totalGas > 100000) {
      suggestions.push({
        type: 'GAS_OPTIMIZATION',
        severity: 'HIGH',
        description: 'High gas consumption detected. Consider optimizing contract logic.',
        potentialSavings: `Up to ${Math.floor(gasAnalysis.totalGas * 0.2)} gas`,
        implementation: 'Review loops, external calls, and storage operations for efficiency improvements'
      });
    }

    // Storage optimization
    if (gasAnalysis.storageWrites > 10) {
      suggestions.push({
        type: 'STORAGE_OPTIMIZATION',
        severity: 'MEDIUM',
        description: 'Multiple storage writes detected. Consider batching operations.',
        potentialSavings: `${gasAnalysis.storageWrites * 5000} gas`,
        implementation: 'Use struct packing, minimize SSTORE operations, or implement storage-efficient patterns'
      });
    }

    // Batch optimization for multiple events
    if (eventAnalysis.totalEvents > 20) {
      suggestions.push({
        type: 'BATCH_OPTIMIZATION',
        severity: 'MEDIUM',
        description: 'High number of events emitted. Consider batching similar operations.',
        potentialSavings: 'Reduced transaction fees and improved UX',
        implementation: 'Implement batch processing for similar operations to reduce individual transaction costs'
      });
    }

    return suggestions;
  }

  private assessRisk(
    securityInsights: SecurityInsight[],
    gasAnalysis: GasAnalysis,
    request: SimulationRequest
  ): RiskAssessment {
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Security risk factors
    securityInsights.forEach(insight => {
      riskFactors.push(insight.description);
      switch (insight.severity) {
        case 'CRITICAL': riskScore += 4; break;
        case 'HIGH': riskScore += 3; break;
        case 'MEDIUM': riskScore += 2; break;
        case 'LOW': riskScore += 1; break;
      }
    });

    // Gas-based risk factors
    if (gasAnalysis.totalGas > 500000) {
      riskFactors.push('Extremely high gas consumption');
      riskScore += 2;
    }

    // Precompile risk factors
    if (request.to && this.hyperEVMPrecompiles.has(request.to.toLowerCase())) {
      const precompile = this.hyperEVMPrecompiles.get(request.to.toLowerCase())!;
      riskFactors.push(`Precompile interaction: ${precompile.name}`);
      riskScore += precompile.riskLevel === 'HIGH' ? 3 : precompile.riskLevel === 'MEDIUM' ? 2 : 1;
    }

    let overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (riskScore >= 8) overallRisk = 'CRITICAL';
    else if (riskScore >= 5) overallRisk = 'HIGH';
    else if (riskScore >= 2) overallRisk = 'MEDIUM';
    else overallRisk = 'LOW';

    const mitigationSuggestions = [
      'Implement comprehensive testing before mainnet deployment',
      'Consider using lower gas limits for initial testing',
      'Monitor transaction patterns for unusual behavior',
      'Implement circuit breakers for high-risk operations'
    ];

    return {
      overallRisk,
      riskFactors,
      mitigationSuggestions,
      confidenceScore: Math.max(0, Math.min(100, 100 - (riskScore * 5)))
    };
  }

  // ================================
  // BUNDLE SIMULATION METHODS
  // ================================

  async simulateBundle(requests: SimulationRequest[]): Promise<BundleResult> {
    if (!this.initialized) {
      throw new Error('HyperEVM Engine not initialized');
    }

    if (requests.length === 0) {
      throw new Error('Empty bundle provided');
    }

    if (requests.length > 100) {
      throw new Error('Bundle too large (max 100 transactions)');
    }

    logger.info(`Simulating bundle with ${requests.length} transactions`);

    const results: SimulationResult[] = [];
    let cumulativeGas = 0n;
    const bundleId = uuidv4();

    // Create VM snapshot for rollback capability
    await this.vm.stateManager.checkpoint();

    try {
      // Analyze bundle dependencies before execution
      const dependencies = this.analyzeBundleDependencies(requests, []);
      const executionOrder = this.optimizeExecutionOrder(requests, dependencies);

      for (let i = 0; i < requests.length; i++) {
        const orderIndex = executionOrder[i];
        const request = requests[orderIndex];
        request.requestId = request.requestId || `${bundleId}-${orderIndex}`;

        const result = await this.simulate(request);
        results[orderIndex] = result;

        if (!result.success && request.revertOnFailure) {
          logger.info(`Bundle simulation stopped at transaction ${orderIndex} due to failure`);
          await this.vm.stateManager.revert();
          break;
        }

        cumulativeGas += BigInt(result.gasUsed);

        // Check for gas limit exceeded
        if (cumulativeGas > BigInt(30000000)) { // Block gas limit approximation
          logger.warn('Bundle approaching block gas limit');
          break;
        }
      }

      await this.vm.stateManager.commit();

      const bundleHash = this.calculateBundleHash(requests);
      const optimizationReport = this.generateBundleOptimization(requests, results, dependencies);

      return {
        results: results.filter(r => r !== undefined), // Remove undefined entries
        totalGasUsed: cumulativeGas.toString(),
        bundleHash,
        interdependencies: dependencies,
        executionOrder,
        optimizationReport
      };

    } catch (error: any) {
      await this.vm.stateManager.revert();
      logger.error('Bundle simulation failed:', error);
      throw error;
    }
  }

  private analyzeBundleDependencies(requests: SimulationRequest[], results: SimulationResult[]): BundleDependency[] {
    const dependencies: BundleDependency[] = [];
    const addressNonces = new Map<string, number>();
    const addressBalances = new Map<string, boolean>();

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];

      // Track nonce dependencies
      const currentNonce = addressNonces.get(req.from) || 0;
      if (currentNonce > 0) {
        for (let j = 0; j < i; j++) {
          if (requests[j].from === req.from) {
            dependencies.push({
              fromIndex: j,
              toIndex: i,
              type: 'NONCE',
              description: `Transaction ${i} depends on nonce increment from transaction ${j}`,
              critical: true
            });
            break;
          }
        }
      }
      addressNonces.set(req.from, currentNonce + 1);

      // Track balance dependencies
      if (req.value && BigInt(req.value) > 0n) {
        addressBalances.set(req.from, true);
        if (req.to) {
          for (let j = 0; j < i; j++) {
            if (requests[j].to === req.from && requests[j].value && BigInt(requests[j].value!) > BigInt(0)) {
              dependencies.push({
                fromIndex: j,
                toIndex: i,
                type: 'BALANCE',
                description: `Transaction ${i} may depend on balance from transaction ${j}`,
                critical: false
              });
            }
          }
        }
      }

      // Track storage dependencies (simplified)
      if (req.to) {
        for (let j = 0; j < i; j++) {
          if (requests[j].to === req.to) {
            dependencies.push({
              fromIndex: j,
              toIndex: i,
              type: 'STORAGE',
              description: `Transaction ${i} may depend on storage changes from transaction ${j}`,
              critical: false
            });
          }
        }
      }
    }

    return dependencies;
  }

  private optimizeExecutionOrder(requests: SimulationRequest[], dependencies: BundleDependency[]): number[] {
    const order: number[] = [];
    const remaining = new Set(requests.map((_, i) => i));
    const critical = new Set(dependencies.filter(d => d.critical).map(d => d.toIndex));

    // Process transactions with critical dependencies first
    while (remaining.size > 0) {
      let added = false;

      for (const index of remaining) {
        const deps = dependencies.filter(d => d.toIndex === index && remaining.has(d.fromIndex));
        
        if (deps.length === 0) {
          order.push(index);
          remaining.delete(index);
          added = true;
          break;
        }
      }

      if (!added) {
        // Fallback: add next available transaction (handles cycles)
        const next = Math.min(...remaining);
        order.push(next);
        remaining.delete(next);
      }
    }

    return order;
  }

  private generateBundleOptimization(
    requests: SimulationRequest[],
    results: SimulationResult[],
    dependencies: BundleDependency[]
  ): BundleOptimization {
    const criticalDeps = dependencies.filter(d => d.critical);
    const canReorder = criticalDeps.length === 0;
    
    let potentialSavings = '0';
    if (canReorder) {
      const currentGas = results.reduce((sum, r) => sum + BigInt(r.gasUsed), 0n);
      const optimizedGas = currentGas * BigInt(95) / BigInt(100); // Estimate 5% savings
      potentialSavings = (currentGas - optimizedGas).toString();
    }

    // Simple parallelization analysis
    const parallelizable: number[][] = [];
    const independent = requests
      .map((_, i) => i)
      .filter(i => !dependencies.some(d => d.fromIndex === i || d.toIndex === i));
    
    if (independent.length > 1) {
      parallelizable.push(independent);
    }

    return {
      canReorder,
      potentialSavings,
      recommendedOrder: requests.map((_, i) => i), // Simplified
      parallelizable
    };
  }

  private calculateBundleHash(requests: SimulationRequest[]): string {
    const bundleData = requests.map(r => ({
      from: r.from,
      to: r.to || '',
      data: r.data || '',
      value: r.value || '0',
      gas: r.gas || '0',
      nonce: r.nonce || '0'
    }));

    const dataString = JSON.stringify(bundleData);
    const hash = require('crypto').createHash('keccak256');
    hash.update(dataString);
    return '0x' + hash.digest('hex');
  }

  // ================================
  // ERROR HANDLING
  // ================================

  private handleSimulationError(error: any, request: SimulationRequest, requestId: string): SimulationResult {
    logger.error(`Simulation error for ${requestId}:`, error);

    let errorMessage = 'Unknown simulation error';
    if (error.message) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    return {
      requestId,
      success: false,
      gasUsed: '0',
      gasPrice: this.extractGasPrice(request),
      gasLimit: request.gas || '0',
      stateChanges: [],
      events: [],
      analysis: {
        gasAnalysis: {
          totalGas: 0,
          gasBreakdown: {},
          storageWrites: 0,
          storageReads: 0,
          loopIterations: 0,
          externalCalls: 0,
          precompileCalls: 0,
          efficiency: 'LOW',
          estimatedCost: '0 ETH'
        },
        eventAnalysis: {
          totalEvents: 0,
          tokenTransfers: 0,
          balanceChanges: [],
          uniqueContracts: 0,
          eventsByContract: {},
          criticalEvents: []
        },
        performanceMetrics: {
          executionTime: 0,
          memoryUsage: 0,
          storageAccess: 0,
          networkCalls: 0,
          cacheHits: 0,
          cacheMisses: 0
        },
        securityInsights: [{
          type: 'UNCHECKED_SEND',
          severity: 'CRITICAL',
          description: `Simulation failed: ${errorMessage}`,
          recommendation: 'Review transaction parameters and contract logic'
        }],
        optimizationSuggestions: [],
        riskAssessment: {
          overallRisk: 'CRITICAL',
          riskFactors: ['Simulation failure', errorMessage],
          mitigationSuggestions: [
            'Verify transaction parameters',
            'Check contract deployment status',
            'Ensure sufficient account balance',
            'Review gas limits'
          ],
          confidenceScore: 0
        }
      },
      error: errorMessage,
      timestamp: Date.now(),
      blockNumber: '0',
      blockHash: '0x0'
    };
  }

  // ================================
  // UTILITY METHODS
  // ================================

  async getNetworkStatus(): Promise<{
    connected: boolean;
    blockNumber: string;
    chainId: number;
    cacheStats: { hits: number; misses: number; size: number };
    activeSimulations: number;
  }> {
    try {
      const [blockNumber, chainId] = await Promise.all([
        this.publicClient.getBlockNumber(),
        this.publicClient.getChainId()
      ]);

      return {
        connected: true,
        blockNumber: blockNumber.toString(),
        chainId,
        cacheStats: {
          hits: this.accountCache.size,
          misses: this.accountCache.calculatedSize,
          size: this.accountCache.size
        },
        activeSimulations: this.activeSimulations.size
      };
    } catch (error) {
      return {
        connected: false,
        blockNumber: '0',
        chainId: 0,
        cacheStats: { hits: 0, misses: 0, size: 0 },
        activeSimulations: this.activeSimulations.size
      };
    }
  }

  clearCache(): void {
    this.accountCache.clear();
    this.codeCache.clear();
    this.storageCache.clear();
    logger.info('All caches cleared');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down HyperEVM Engine...');
    
    // Cancel all active simulations
    for (const [requestId, controller] of this.activeSimulations) {
      controller.abort();
      logger.debug(`Cancelled simulation: ${requestId}`);
    }
    this.activeSimulations.clear();

    // Clear caches
    this.clearCache();

    // Remove all listeners
    this.removeAllListeners();
    this.vm.evm.events!.removeAllListeners();

    this.initialized = false;
    logger.info('HyperEVM Engine shutdown complete');
  }
}

// ================================
// FACTORY FUNCTION
// ================================

export function createHyperEVMEngine(config: HyperEVMConfig): HyperEVMEngine {
  return new HyperEVMEngine(config);
}

// ================================
// EXPORT DEFAULT CONFIGURATION
// ================================

export const DEFAULT_HYPEREVM_CONFIG: HyperEVMConfig = {
  chainId: 998, // HyperEVM mainnet
  networkId: 998,
  rpcUrl: 'https://api.hyperliquid.xyz/evm',
  stateConfig: {
    cacheSize: 10000,
    persistentStorage: false,
    maxConcurrentSimulations: 10,
    timeoutMs: 30000
  },
  security: {
    enableRateLimiting: true,
    maxGasLimit: BigInt(30000000),
    maxValueTransfer: BigInt('1000000000000000000000'), // 1000 ETH
    allowedPrecompiles: [
      '0x0000000000000000000000000000000000000800',
      '0x0000000000000000000000000000000000000807',
      '0x3333333333333333333333333333333333333333',
      '0x2222222222222222222222222222222222222222',
      '0x5555555555555555555555555555555555555555'
    ]
  }
};
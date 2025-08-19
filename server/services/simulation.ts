import { HyperliquidService } from './hyperliquid.js';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import { 
  type TransactionData, 
  type SimulationRequest, 
  type BundleSimulationRequest,
  type SimulationResult,
  type ExecutionTrace,
  type StateChange,
  type EventLog 
} from '@shared/schema.js';

// Import local engine and HyperEVM-specific components
import { HyperEVMEngine, DEFAULT_HYPEREVM_CONFIG, TESTNET_HYPEREVM_CONFIG } from '../core/HyperEVMEngine.js';
import { CoreWriterAction, CoreWriterSimulationResult } from '../core/CoreWriterSimulator.js';
import { OraclePrice, OracleAnalysis } from '../core/OraclePriceReader.js';

const logger = pino({ level: 'info' });

// Extended interfaces for advanced simulation features
export interface AdvancedSimulationRequest extends SimulationRequest {
  requestId?: string;
  stateOverrides?: StateOverride[];
  traceConfig?: TraceConfig;
  accessList?: AccessListEntry[];
  revertOnFailure?: boolean;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface StateOverride {
  address: string;
  balance?: string;
  nonce?: string;
  code?: string;
  storage?: Record<string, string>;
}

export interface TraceConfig {
  enableMemory?: boolean;
  disableStack?: boolean;
  disableStorage?: boolean;
  enableReturnData?: boolean;
  timeout?: string;
}

export interface AccessListEntry {
  address: string;
  storageKeys: string[];
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
  efficiency: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface EventAnalysis {
  totalEvents: number;
  tokenTransfers: number;
  balanceChanges: BalanceChange[];
  uniqueContracts: number;
  eventsByContract: Record<string, number>;
}

export interface BalanceChange {
  token: string;
  from: string;
  to: string;
  amount: string;
}

export interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: number;
  storageAccess: number;
  networkCalls: number;
}

export interface SecurityInsight {
  type: 'REENTRANCY' | 'INTEGER_OVERFLOW' | 'UNCHECKED_SEND' | 'DELEGATE_CALL';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  location?: string;
}

export interface OptimizationSuggestion {
  type: 'STORAGE_OPTIMIZATION' | 'LOOP_OPTIMIZATION' | 'GAS_OPTIMIZATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  potentialSavings: string;
}

export interface RiskAssessment {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  riskFactors: string[];
  mitigationSuggestions: string[];
}

export interface EnhancedSimulationResult extends SimulationResult {
  requestId: string;
  analysis?: TransactionAnalysis;
  timestamp: number;
}

export interface BundleResult {
  results: EnhancedSimulationResult[];
  totalGasUsed: string;
  bundleHash: string;
  interdependencies: BundleDependency[];
}

export interface BundleDependency {
  fromIndex: number;
  toIndex: number;
  type: 'STORAGE' | 'BALANCE' | 'NONCE';
  description: string;
}

export class SimulationService {
  private hyperliquid: HyperliquidService;
  private simulationCache: Map<string, EnhancedSimulationResult>;
  private precompileAddresses: Map<string, string>;

  // Step 2: Add local engine
  private engine?: HyperEVMEngine;
  private engineInitialized: boolean = false;

  // System metrics tracking
  private systemMetrics = {
    totalSimulations: 0,
    successfulSimulations: 0,
    totalResponseTime: 0,
    apiRequests: 0,
    lastReset: Date.now()
  };

  constructor(hyperliquid: HyperliquidService) {
    this.hyperliquid = hyperliquid;
    this.simulationCache = new Map();
    this.initializePrecompiles();
  }

  /**
   * Ensures local engine is initialized with correct Hyperliquid configuration
   */
  private async ensureEngine() {
    if (this.engineInitialized && this.engine) return;
    
    // Use environment variable to determine network (mainnet or testnet)
    const isTestnet = process.env.HYPEREVM_NETWORK === 'testnet';
    const config = isTestnet ? TESTNET_HYPEREVM_CONFIG : DEFAULT_HYPEREVM_CONFIG;
    
    // Override with environment variables if provided
    if (process.env.HYPERLIQUID_RPC_URL) {
      config.rpcUrl = process.env.HYPERLIQUID_RPC_URL;
    }
    
    if (process.env.HYPEREVM_CHAIN_ID) {
      config.chainId = Number(process.env.HYPEREVM_CHAIN_ID);
      config.networkId = Number(process.env.HYPEREVM_CHAIN_ID);
    }
    
    logger.info(`Initializing HyperEVM engine for ${isTestnet ? 'testnet' : 'mainnet'} (Chain ID: ${config.chainId})`);
    
    this.engine = new HyperEVMEngine(config);
    await this.engine.initialize();
    this.engineInitialized = true;
    
    logger.info('HyperEVM engine initialized successfully');
  }

  private initializePrecompiles(): void {
    // Updated HyperEVM-specific precompile addresses based on official documentation
    this.precompileAddresses = new Map([
      // HyperCore read precompiles
      ['0x0000000000000000000000000000000000000800', 'READ_BASE'],
      ['0x0000000000000000000000000000000000000801', 'PERP_POSITIONS'],
      ['0x0000000000000000000000000000000000000802', 'SPOT_BALANCES'],
      ['0x0000000000000000000000000000000000000803', 'VAULT_EQUITY'],
      ['0x0000000000000000000000000000000000000804', 'STAKING_DELEGATIONS'],
      ['0x0000000000000000000000000000000000000805', 'L1_BLOCK_NUMBER'],
      ['0x0000000000000000000000000000000000000807', 'ORACLE_PRICES'],
      ['0x000000000000000000000000000000000000080a', 'PERP_ASSET_INFO'],
      // CoreWriter and system contracts
      ['0x3333333333333333333333333333333333333333', 'CORE_WRITER'],
      ['0x2222222222222222222222222222222222222222', 'HYPE_TRANSFER'],
      ['0x5555555555555555555555555555555555555555', 'WRAPPED_HYPE'],
    ]);
  }

  async simulateTransaction(request: SimulationRequest | AdvancedSimulationRequest): Promise<EnhancedSimulationResult> {
    const startTime = Date.now();
    const requestId = ('requestId' in request && request.requestId) ? request.requestId : uuidv4();
    
    // Track metrics
    this.systemMetrics.totalSimulations++;
    this.systemMetrics.apiRequests++;
    
    logger.info(`Starting advanced simulation ${requestId}`);

    // Step 2: Accept executionMode ('rpc' (default), 'local', or 'hybrid')
    const executionMode = ('executionMode' in request && request.executionMode) ? request.executionMode : 'rpc';

    try {
      if (executionMode === 'rpc') {
        // --------------------- RPC MODE (existing) -----------------------------
        const { transaction, blockNumber, enableStateOverrides, simulationMode } = request;
        // Prepare transaction for simulation
        const txData = await this.prepareTransaction(transaction, blockNumber);
        // Get current network state
        const currentBlock = await this.hyperliquid.getBlockNumber();
        const gasPrice = simulationMode === 'large' 
          ? await this.hyperliquid.getBigBlockGasPrice()
          : await this.hyperliquid.getGasPrice();

        // Estimate gas if not provided
        let gasLimit = parseInt(transaction.gasLimit, 16);
        if (!transaction.gasLimit || transaction.gasLimit === '0x0') {
          const estimatedGas = await this.hyperliquid.estimateGas(txData);
          gasLimit = parseInt(estimatedGas, 16);
        }
        // Execute simulation
        const result = await this.executeSimulation(txData, blockNumber);
        const executionTime = Date.now() - startTime;
        // Generate execution trace
        const executionTrace = this.generateExecutionTrace(txData, result);
        // Calculate gas breakdown
        const gasBreakdown = this.calculateGasBreakdown(gasLimit, parseInt(result.gasUsed || '0', 16));
        // Calculate transaction fee
        const gasPriceDecimal = parseInt(gasPrice, 16);
        const gasUsedDecimal = parseInt(result.gasUsed || '0', 16);
        const transactionFee = (gasPriceDecimal * gasUsedDecimal / Math.pow(10, 18)).toFixed(8);
        // Perform comprehensive analysis
        const analysis = await this.analyzeTransaction({
          gasUsed: gasUsedDecimal,
          gasLimit,
          executionTrace,
          events: result.events || [],
          stateChanges: result.stateChanges || [],
          executionTime,
        });
        const enhancedResult: EnhancedSimulationResult = {
          requestId,
          success: result.success,
          gasUsed: gasUsedDecimal,
          gasLimit,
          transactionFee,
          executionTrace,
          stateChanges: result.stateChanges || [],
          events: result.events || [],
          gasBreakdown,
          errorMessage: result.errorMessage,
          returnValue: result.returnValue,
          analysis,
          timestamp: Date.now(),
        };
        // Cache successful simulations
        if (result.success) {
          this.cacheSimulation(requestId, enhancedResult);
        }
        logger.info(`Simulation ${requestId} completed in ${executionTime}ms`);
        return enhancedResult;
      } else {
        // --------------------- LOCAL/HYBRID MODE -----------------------------
        await this.ensureEngine();
        if (!this.engine) throw new Error("Local HyperEVM engine not available");
        const { transaction, blockNumber, stateOverrides, accessList, revertOnFailure } = request as any;

        // Debug log the incoming transaction data
        logger.debug('Incoming transaction data:', {
          from: transaction.from,
          to: transaction.to,
          value: transaction.value,
          gasLimit: transaction.gasLimit,
          data: transaction.data
        });

        // Normalize tx fields to hex for local engine
        const txReq = {
          from: transaction.from,
          to: transaction.to,
          value: toHex(transaction.value ?? '0x0'),
          data: transaction.data ?? '0x',
          gas: toHex(transaction.gasLimit ?? '0x5208'),
          gasPrice: toHex(transaction.gasPrice ?? '0x3B9ACA00'), // default 1gwei
          nonce: toHex(transaction.nonce ?? '0x0'),
          // Support EIP-1559 for local if present:
          maxFeePerGas: transaction.maxFeePerGas ? toHex(transaction.maxFeePerGas) : undefined,
          maxPriorityFeePerGas: transaction.maxPriorityFeePerGas ? toHex(transaction.maxPriorityFeePerGas) : undefined,
          accessList: accessList ?? [],
          stateOverrides: stateOverrides ?? [],
          blockNumber: blockNumber ?? "latest",
          revertOnFailure: revertOnFailure ?? false,
          requestId
        };
        
        logger.debug('Normalized transaction request:', txReq);
        console.log('🔄 SIMULATION START - Normalized transaction request:', txReq);
        
        // Call engine.simulate, map result to EnhancedSimulationResult
        const result = await this.engine.simulate(txReq);
        console.log('✅ SIMULATION RESULT from engine:', {
          success: result.success,
          gasUsed: result.gasUsed,
          gasLimit: result.gasLimit,
          gasPrice: result.gasPrice,
          error: result.error,
          returnValue: result.returnValue,
          stateChangesCount: result.stateChanges?.length || 0,
          eventsCount: result.events?.length || 0,
          hasExecutionTrace: !!result.executionTrace
        });
        
        // Use gasPrice from input or engine, parse to number for REST
        const gasPriceHex = txReq.gasPrice || result.gasPrice || "0x0";
        const gasUsedNum = hexOrDecToInt(result.gasUsed);
        const gasLimitNum = hexOrDecToInt(result.gasLimit);
        const transactionFee = ((hexOrDecToInt(gasPriceHex) * gasUsedNum) / 1e18).toFixed(8);
        
        console.log('💰 GAS CALCULATIONS:', {
          gasPriceHex,
          gasUsedNum,
          gasLimitNum,
          transactionFee,
          gasUsedHex: result.gasUsed,
          gasLimitHex: result.gasLimit
        });

        // Synthesize basic trace for now; can be expanded in next steps
        const executionTrace = [
          {
            type: 'CALL',
            depth: 0,
            from: txReq.from,
            to: txReq.to,
            value: txReq.value,
            gasUsed: gasUsedNum,
            gasRemaining: gasLimitNum - gasUsedNum,
          },
          {
            type: result.success ? 'RETURN' : 'REVERT',
            depth: 0,
            gasUsed: 0,
            gasRemaining: gasLimitNum - gasUsedNum,
            output: result.returnValue,
            error: result.error,
          }
        ];

        const enhancedResult: EnhancedSimulationResult = {
          requestId,
          success: result.success,
          gasUsed: gasUsedNum,
          gasLimit: gasLimitNum,
          transactionFee,
          executionTrace,
          stateChanges: result.stateChanges || [],
          events: result.events || [],
          gasBreakdown: this.calculateGasBreakdown(gasLimitNum, gasUsedNum),
          errorMessage: result.error,
          returnValue: result.returnValue,
          analysis: result.analysis || undefined,
          timestamp: Date.now(),
        };

        console.log('📊 FINAL ENHANCED RESULT:', {
          requestId,
          success: enhancedResult.success,
          gasUsed: enhancedResult.gasUsed,
          gasLimit: enhancedResult.gasLimit,
          transactionFee: enhancedResult.transactionFee,
          executionTraceLength: enhancedResult.executionTrace.length,
          stateChangesCount: enhancedResult.stateChanges.length,
          eventsCount: enhancedResult.events.length,
          hasAnalysis: !!enhancedResult.analysis,
          gasBreakdown: enhancedResult.gasBreakdown
        });

        // Update metrics
        const executionTime = Date.now() - startTime;
        this.systemMetrics.totalResponseTime += executionTime;
        if (result.success) {
          this.systemMetrics.successfulSimulations++;
          this.cacheSimulation(requestId, enhancedResult);
        }
        
        logger.info(`Local simulation ${requestId} completed in ${executionTime}ms`);
        return enhancedResult;
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        requestId,
        success: false,
        gasUsed: 0,
        gasLimit: parseInt(request.transaction.gasLimit, 16) || 21000,
        transactionFee: '0',
        executionTrace: [],
        stateChanges: [],
        events: [],
        gasBreakdown: {
          intrinsicGas: 0,
          executionGas: 0,
          storageGas: 0,
          memoryGas: 0,
        },
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
        analysis: {
          gasAnalysis: {
            totalGas: 0,
            gasBreakdown: {},
            storageWrites: 0,
            storageReads: 0,
            loopIterations: 0,
            externalCalls: 0,
            efficiency: 'LOW',
          },
          eventAnalysis: {
            totalEvents: 0,
            tokenTransfers: 0,
            balanceChanges: [],
            uniqueContracts: 0,
            eventsByContract: {},
          },
          performanceMetrics: {
            executionTime,
            memoryUsage: 0,
            storageAccess: 0,
            networkCalls: 0,
          },
          securityInsights: [],
          optimizationSuggestions: [],
          riskAssessment: {
            overallRisk: 'HIGH',
            riskFactors: ['Simulation failed'],
            mitigationSuggestions: ['Check transaction parameters'],
          },
        },
        timestamp: Date.now(),
      };
    }
  }

  async simulateBundle(request: BundleSimulationRequest): Promise<BundleResult> {
    const results: SimulationResult[] = [];
    
    for (const transaction of request.transactions) {
      const simulationRequest: SimulationRequest = {
        transaction,
        blockNumber: request.blockNumber,
        enableStateOverrides: request.enableStateOverrides,
        simulationMode: 'fast',
        includePrecompiles: false,
        simulateCoreWriter: false,
      };
      
      const result = await this.simulateTransaction(simulationRequest);
      results.push(result);
      
      // If any transaction fails, we might want to stop the bundle simulation
      if (!result.success) {
        break;
      }
    }
    
    // Calculate bundle metrics
    let totalGasUsed = BigInt(0);
    for (const result of results) {
      totalGasUsed += BigInt(result.gasUsed);
    }

    // Generate bundle hash
    const bundleHash = this.calculateBundleHash(request.transactions);
    
    // Analyze dependencies between transactions
    const interdependencies = this.analyzeBundleDependencies(request.transactions, results);

    return {
      results,
      totalGasUsed: totalGasUsed.toString(),
      bundleHash,
      interdependencies,
    };
  }

  private async analyzeTransaction(params: {
    gasUsed: number;
    gasLimit: number;
    executionTrace: ExecutionTrace[];
    events: EventLog[];
    stateChanges: StateChange[];
    executionTime: number;
  }): Promise<TransactionAnalysis> {
    const { gasUsed, gasLimit, executionTrace, events, stateChanges, executionTime } = params;

    // Gas analysis
    const gasAnalysis: GasAnalysis = {
      totalGas: gasUsed,
      gasBreakdown: {
        intrinsic: 21000,
        execution: Math.max(0, gasUsed - 21000),
        storage: Math.floor((gasUsed - 21000) * 0.4),
        memory: Math.floor((gasUsed - 21000) * 0.1),
      },
      storageWrites: stateChanges.filter(c => c.type === 'storage' && c.before !== c.after).length,
      storageReads: Math.floor(stateChanges.length * 0.6),
      loopIterations: Math.floor(gasUsed / 5000), // Rough estimate
      externalCalls: executionTrace.filter(t => t.type === 'CALL').length,
      efficiency: gasUsed < gasLimit * 0.7 ? 'HIGH' : gasUsed < gasLimit * 0.9 ? 'MEDIUM' : 'LOW',
    };

    // Event analysis
    const tokenTransferEvents = events.filter(e => 
      e.topics && e.topics.length > 0 && e.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    );

    const eventAnalysis: EventAnalysis = {
      totalEvents: events.length,
      tokenTransfers: tokenTransferEvents.length,
      balanceChanges: this.extractBalanceChanges(tokenTransferEvents),
      uniqueContracts: new Set(events.map(e => e.address)).size,
      eventsByContract: events.reduce((acc, event) => {
        acc[event.address] = (acc[event.address] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    // Performance metrics
    const performanceMetrics: PerformanceMetrics = {
      executionTime,
      memoryUsage: Math.floor(gasUsed * 0.001), // Rough estimate in KB
      storageAccess: gasAnalysis.storageReads + gasAnalysis.storageWrites,
      networkCalls: 1, // At least one call to the network
    };

    // Security insights
    const securityInsights: SecurityInsight[] = [];
    if (gasAnalysis.externalCalls > 5) {
      securityInsights.push({
        type: 'DELEGATE_CALL',
        severity: 'MEDIUM',
        description: 'Multiple external calls detected. Review for potential reentrancy.',
      });
    }

    // Optimization suggestions
    const optimizationSuggestions: OptimizationSuggestion[] = [];
    if (gasAnalysis.storageWrites > 3) {
      optimizationSuggestions.push({
        type: 'STORAGE_OPTIMIZATION',
        severity: 'MEDIUM',
        description: 'Consider batching storage operations to reduce gas costs.',
        potentialSavings: `${Math.floor(gasAnalysis.storageWrites * 2900)} gas`,
      });
    }

    if (gasUsed > gasLimit * 0.8) {
      optimizationSuggestions.push({
        type: 'GAS_OPTIMIZATION',
        severity: 'HIGH',
        description: 'Transaction uses significant portion of gas limit. Consider optimization.',
        potentialSavings: 'Up to 20% gas reduction possible',
      });
    }

    // Risk assessment
    const riskAssessment: RiskAssessment = {
      overallRisk: securityInsights.length > 2 ? 'HIGH' : securityInsights.length > 0 ? 'MEDIUM' : 'LOW',
      riskFactors: securityInsights.map(s => s.description),
      mitigationSuggestions: optimizationSuggestions.map(s => s.description),
    };

    return {
      gasAnalysis,
      eventAnalysis,
      performanceMetrics,
      securityInsights,
      optimizationSuggestions,
      riskAssessment,
    };
  }

  private extractBalanceChanges(transferEvents: EventLog[]): BalanceChange[] {
    return transferEvents.map(event => ({
      token: event.address,
      from: event.topics && event.topics[1] ? event.topics[1] : '0x0',
      to: event.topics && event.topics[2] ? event.topics[2] : '0x0',
      amount: event.data || '0x0',
    }));
  }

  private cacheSimulation(requestId: string, result: EnhancedSimulationResult): void {
    // Implement LRU cache with max 1000 entries
    if (this.simulationCache.size >= 1000) {
      const firstKey = this.simulationCache.keys().next().value;
      this.simulationCache.delete(firstKey);
    }
    
    this.simulationCache.set(requestId, result);
  }

  private calculateBundleHash(transactions: TransactionData[]): string {
    const bundleData = JSON.stringify(transactions.map(tx => ({
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    })));
    
    // Simple hash using buffer - in production use proper crypto
    return `0x${Buffer.from(bundleData).toString('hex').slice(0, 64)}`;
  }

  private analyzeBundleDependencies(transactions: TransactionData[], results: any[]): BundleDependency[] {
    const dependencies: BundleDependency[] = [];
    
    for (let i = 0; i < transactions.length; i++) {
      for (let j = i + 1; j < transactions.length; j++) {
        // Check if transaction j depends on transaction i
        if (transactions[i].to === transactions[j].from) {
          dependencies.push({
            fromIndex: i,
            toIndex: j,
            type: 'BALANCE',
            description: `Transaction ${j} may depend on balance changes from transaction ${i}`,
          });
        }
        
        // Check for storage dependencies (simplified)
        if (transactions[i].to === transactions[j].to && transactions[i].data && transactions[j].data) {
          dependencies.push({
            fromIndex: i,
            toIndex: j,
            type: 'STORAGE',
            description: `Transaction ${j} may depend on storage changes from transaction ${i}`,
          });
        }
      }
    }
    
    return dependencies;
  }

  // New comprehensive methods for enhanced functionality
  async getPrecompileInfo(): Promise<Record<string, string>> {
    const precompileInfo: Record<string, string> = {};
    
    for (const [address, name] of this.precompileAddresses) {
      precompileInfo[address] = name;
    }
    
    return precompileInfo;
  }

  async simulateWithStateOverrides(
    request: AdvancedSimulationRequest
  ): Promise<EnhancedSimulationResult> {
    // Enhanced simulation with state overrides
    logger.info(`Simulating with state overrides: ${request.stateOverrides?.length || 0} overrides`);
    
    // Apply state overrides (in a real implementation, this would modify the VM state)
    if (request.stateOverrides) {
      logger.debug('Applying state overrides:', request.stateOverrides);
    }
    
    return this.simulateTransaction(request);
  }

  async getSimulationStats(): Promise<{
    totalSimulations: number;
    cacheSize: number;
    averageGasUsed: number;
    successRate: number;
  }> {
    const cachedResults = Array.from(this.simulationCache.values());
    const successfulResults = cachedResults.filter(r => r.success);
    
    return {
      totalSimulations: cachedResults.length,
      cacheSize: this.simulationCache.size,
      averageGasUsed: successfulResults.length > 0 
        ? Math.floor(successfulResults.reduce((sum, r) => sum + r.gasUsed, 0) / successfulResults.length)
        : 0,
      successRate: cachedResults.length > 0 
        ? Math.round((successfulResults.length / cachedResults.length) * 100)
        : 0,
    };
  }

  clearCache(): void {
    this.simulationCache.clear();
    logger.info('Simulation cache cleared');
  }

  getCachedSimulation(requestId: string): EnhancedSimulationResult | undefined {
    return this.simulationCache.get(requestId);
  }

  /**
   * Step 1: Normalize transaction fields for RPC (all to hex string as expected by JSON-RPC).
   */
  private async prepareTransaction(transaction: TransactionData, blockNumber: string): Promise<any> {
    // Helper: normalize to hex string for RPC (accepts hex or decimal string/number).
    const normalizeHex = (val: string | number | undefined, fallback: string) => {
      if (val === undefined || val === null) return fallback;
      if (typeof val === "number") return toHex(val);
      if (typeof val === "string") return isHex(val) ? val : toHex(val);
      return fallback;
    };

    const txData: any = {
      from: transaction.from,
      value: normalizeHex(transaction.value, '0x0'),
      gas: normalizeHex(transaction.gasLimit, '0x5208'), // 21000 in hex
    };

    if (transaction.to) {
      txData.to = transaction.to;
    }
    if (transaction.data) {
      txData.data = transaction.data;
    }
    if (transaction.gasPrice) {
      txData.gasPrice = normalizeHex(transaction.gasPrice, '0x3B9ACA00'); // default 1gwei
    }

    // Set nonce (normalize to hex)
    if (!transaction.nonce) {
      const nonce = await this.hyperliquid.getTransactionCount(transaction.from, blockNumber);
      txData.nonce = normalizeHex(nonce, '0x0');
    } else {
      txData.nonce = normalizeHex(transaction.nonce, '0x0');
    }

    return txData;
  }

  private async executeSimulation(txData: any, blockNumber: string): Promise<{
    success: boolean;
    gasUsed?: string;
    returnValue?: string;
    errorMessage?: string;
    stateChanges?: StateChange[];
    events?: EventLog[];
  }> {
    try {
      // First, try to estimate gas to check if transaction would succeed
      const gasEstimate = await this.hyperliquid.estimateGas(txData);
      
      // Execute the call to get return value
      const callResult = await this.hyperliquid.call(txData, blockNumber);
      
      return {
        success: true,
        gasUsed: gasEstimate,
        returnValue: callResult,
        stateChanges: [], // Would need full trace to get actual state changes
        events: [], // Would need transaction receipt to get events
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Transaction would revert',
      };
    }
  }

  /**
   * Step 1: Use hexOrDecToInt for gas parsing in trace.
   */
  private generateExecutionTrace(txData: any, result: any): ExecutionTrace[] {
    const trace: ExecutionTrace[] = [];
    const gasUsedInt = hexOrDecToInt(result.gasUsed);
    const gasInt = hexOrDecToInt(txData.gas);

    // Add CALL trace
    trace.push({
      type: 'CALL',
      depth: 0,
      from: txData.from,
      to: txData.to,
      value: txData.value,
      gasUsed: gasUsedInt,
      gasRemaining: gasInt - gasUsedInt,
    });

    // Add RETURN or REVERT trace based on success
    trace.push({
      type: result.success ? 'RETURN' : 'REVERT',
      depth: 0,
      gasUsed: 0,
      gasRemaining: gasInt - gasUsedInt,
      output: result.returnValue,
      error: result.errorMessage,
    });

    return trace;
  }

  private calculateGasBreakdown(gasLimit: number, gasUsed: number) {
    // Basic gas breakdown estimation
    const intrinsicGas = 21000; // Base transaction cost
    const executionGas = Math.max(0, gasUsed - intrinsicGas);
    
    return {
      intrinsicGas,
      executionGas,
      storageGas: Math.floor(executionGas * 0.3), // Rough estimate
      memoryGas: Math.floor(executionGas * 0.1), // Rough estimate
    };
  }

  async getGasEstimate(transaction: TransactionData): Promise<{
    gasLimit: string;
    gasPrice: string;
    bigBlockGasPrice: string;
  }> {
    const txData = await this.prepareTransaction(transaction, 'latest');
    
    const [gasLimit, gasPrice, bigBlockGasPrice] = await Promise.all([
      this.hyperliquid.estimateGas(txData),
      this.hyperliquid.getGasPrice(),
      this.hyperliquid.getBigBlockGasPrice(),
    ]);

    return {
      gasLimit,
      gasPrice,
      bigBlockGasPrice,
    };
  }

  async getCurrentNetworkState(): Promise<{
    blockNumber: string;
    gasPrice: string;
    bigBlockGasPrice: string;
    chainId: string;
    hyperevmMetrics?: {
      precompileStatus: Record<string, boolean>;
      oraclePriceCount: number;
      engineStatus: string;
    };
  }> {
    const [blockNumber, gasPrice, bigBlockGasPrice, chainId] = await Promise.all([
      this.hyperliquid.getBlockNumber(),
      this.hyperliquid.getGasPrice(),
      this.hyperliquid.getBigBlockGasPrice(),
      this.hyperliquid.getChainId(),
    ]);

    let hyperevmMetrics;
    if (this.engineInitialized && this.engine) {
      try {
        const networkStatus = await this.engine.getNetworkStatus();
        hyperevmMetrics = {
          precompileStatus: Array.from(this.precompileAddresses.entries()).reduce((acc, [addr, name]) => {
            acc[name] = true; // Simplified - would check actual availability
            return acc;
          }, {} as Record<string, boolean>),
          oraclePriceCount: networkStatus.hyperevmMetrics.oracleCacheSize,
          engineStatus: networkStatus.connected ? 'online' : 'offline'
        };
      } catch (error) {
        logger.warn('Failed to get HyperEVM metrics:', error);
      }
    }

    return {
      blockNumber,
      gasPrice,
      bigBlockGasPrice,
      chainId,
      hyperevmMetrics,
    };
  }

  // ================================
  // HYPEREVM-SPECIFIC METHODS
  // ================================

  /**
   * Simulate CoreWriter actions
   */
  async simulateCoreWriterActions(actions: CoreWriterAction[]): Promise<{
    results: CoreWriterSimulationResult[];
    totalGasUsed: number;
    estimatedDelay: number;
    bundleAnalysis: {
      canOptimize: boolean;
      recommendations: string[];
    };
  }> {
    await this.ensureEngine();
    if (!this.engine) throw new Error("HyperEVM engine not available");

    const batchResult = await this.engine.simulateCoreWriterBatch(actions);
    
    // Analyze the batch for optimization opportunities
    const bundleAnalysis = {
      canOptimize: batchResult.results.length > 1,
      recommendations: [
        'Consider batching similar action types together',
        'Order actions by gas cost (lowest first)',
        'Validate all actions before submission to avoid failed transactions'
      ]
    };

    return {
      results: batchResult.results,
      totalGasUsed: batchResult.totalGasUsed,
      estimatedDelay: batchResult.estimatedBatchDelay,
      bundleAnalysis
    };
  }

  /**
   * Read and analyze oracle prices
   */
  async analyzeOraclePrices(assetIndexes: number[]): Promise<{
    prices: Map<number, OraclePrice>;
    analysis: OracleAnalysis;
    gasEstimate: number;
    recommendations: string[];
  }> {
    await this.ensureEngine();
    if (!this.engine) throw new Error("HyperEVM engine not available");

    const analysis = await this.engine.analyzeOraclePrices(assetIndexes);
    const gasEstimate = this.engine.estimateHyperEVMGas({
      type: 'oracle_read',
      actionCount: assetIndexes.length
    });

    const recommendations = [
      'Cache oracle prices to reduce gas costs',
      'Use batch reading for multiple assets',
      'Monitor price volatility for risk management'
    ];

    // Add specific recommendations based on analysis
    if (analysis.arbitrageOpportunities.length > 0) {
      recommendations.push('Arbitrage opportunities detected - consider automated trading');
    }

    if (analysis.volatilityMetrics.size > 0) {
      const highVolatilityAssets = Array.from(analysis.volatilityMetrics.values())
        .filter(metric => metric.volatilityScore === 'HIGH').length;
      
      if (highVolatilityAssets > 0) {
        recommendations.push(`${highVolatilityAssets} high-volatility assets detected - implement risk controls`);
      }
    }

    return {
      prices: analysis.currentPrices,
      analysis,
      gasEstimate,
      recommendations
    };
  }

  /**
   * Analyze MEV opportunities in transaction bundles
   */
  async analyzeMEVOpportunities(transactions: any[]): Promise<{
    mevAnalysis: {
      arbitrageOps: Array<{
        type: string;
        profitability: number;
        gasRequired: number;
        riskLevel: string;
        description: string;
      }>;
      frontRunningRisks: Array<{
        transactionIndex: number;
        vulnerability: string;
        mitigation: string;
      }>;
      bundleOptimization: {
        recommendedOrder: number[];
        gasOptimization: number;
        mevProtection: boolean;
      };
    };
    gasEstimate: number;
    recommendations: string[];
  }> {
    await this.ensureEngine();
    if (!this.engine) throw new Error("HyperEVM engine not available");

    const mevAnalysis = await this.engine.analyzeMEVOpportunities(transactions);
    const gasEstimate = transactions.reduce((sum, tx) => sum + (parseInt(tx.gasLimit || '21000', 16)), 0);

    const recommendations = [
      'Use private mempools to reduce MEV exposure',
      'Implement commit-reveal schemes for sensitive transactions',
      'Consider bundle optimization for gas savings'
    ];

    if (mevAnalysis.frontRunningRisks.length > 0) {
      recommendations.push('Front-running vulnerabilities detected - implement protection mechanisms');
    }

    if (mevAnalysis.arbitrageOps.length > 0) {
      recommendations.push('Arbitrage opportunities available - consider profit extraction');
    }

    return {
      mevAnalysis,
      gasEstimate,
      recommendations
    };
  }

  /**
   * Advanced gas optimization for HyperEVM transactions
   */
  async optimizeTransactionGas(transaction: any): Promise<{
    original: {
      gasLimit: number;
      estimatedCost: string;
    };
    optimized: {
      gasLimit: number;
      estimatedCost: string;
      savings: number;
    };
    optimizations: Array<{
      type: string;
      description: string;
      gasSavings: number;
    }>;
  }> {
    await this.ensureEngine();
    if (!this.engine) throw new Error("HyperEVM engine not available");

    const originalGasLimit = parseInt(transaction.gasLimit || '21000', 16);
    let optimizedGasLimit = originalGasLimit;
    const optimizations: any[] = [];

    // Check for HyperEVM-specific optimizations
    if (transaction.to && this.precompileAddresses.has(transaction.to.toLowerCase())) {
      const precompileName = this.precompileAddresses.get(transaction.to.toLowerCase())!;
      
      if (precompileName.includes('ORACLE') || precompileName.includes('READ')) {
        const optimalGas = this.engine.estimateHyperEVMGas({ type: 'oracle_read' });
        if (optimalGas < originalGasLimit) {
          optimizations.push({
            type: 'PRECOMPILE_OPTIMIZATION',
            description: `Optimized gas for ${precompileName} precompile`,
            gasSavings: originalGasLimit - optimalGas
          });
          optimizedGasLimit = optimalGas;
        }
      }
      
      if (precompileName === 'CORE_WRITER') {
        const optimalGas = this.engine.estimateHyperEVMGas({ type: 'core_writer' });
        if (optimalGas < originalGasLimit) {
          optimizations.push({
            type: 'CORE_WRITER_OPTIMIZATION',
            description: 'Optimized gas for CoreWriter action',
            gasSavings: originalGasLimit - optimalGas
          });
          optimizedGasLimit = optimalGas;
        }
      }
    }

    // Calculate costs (assuming 20 gwei gas price)
    const gasPriceWei = 20000000000; // 20 gwei
    const originalCost = (originalGasLimit * gasPriceWei) / 1e18;
    const optimizedCost = (optimizedGasLimit * gasPriceWei) / 1e18;
    const savings = ((originalGasLimit - optimizedGasLimit) / originalGasLimit) * 100;

    return {
      original: {
        gasLimit: originalGasLimit,
        estimatedCost: `${originalCost.toFixed(8)} HYPE`
      },
      optimized: {
        gasLimit: optimizedGasLimit,
        estimatedCost: `${optimizedCost.toFixed(8)} HYPE`,
        savings: Math.round(savings * 100) / 100
      },
      optimizations
    };
  }

  // ================================
  // ADMIN DASHBOARD METHODS
  // ================================

  /**
   * Get system metrics for admin dashboard
   */
  async getSystemMetrics(): Promise<{
    totalSimulations: number;
    successRate: number;
    avgResponseTime: number;
    apiRequests: number;
  }> {
    const avgResponseTime = this.systemMetrics.totalSimulations > 0 
      ? Math.round(this.systemMetrics.totalResponseTime / this.systemMetrics.totalSimulations)
      : 0;
    
    const successRate = this.systemMetrics.totalSimulations > 0
      ? (this.systemMetrics.successfulSimulations / this.systemMetrics.totalSimulations) * 100
      : 100;

    const metrics = {
      totalSimulations: this.systemMetrics.totalSimulations,
      successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
      avgResponseTime,
      apiRequests: this.systemMetrics.apiRequests
    };

    console.log('📊 System metrics generated:', metrics);
    return metrics;
  }

  /**
   * Get recent simulations for admin dashboard
   */
  async getRecentSimulations(limit: number = 10): Promise<Array<{
    id: string;
    transactionData: any;
    status: "success" | "failed" | "pending";
    gasUsed?: number;
    createdAt: Date;
  }>> {
    const recentSims = Array.from(this.simulationCache.entries())
      .sort(([, a], [, b]) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(([id, result]) => ({
        id,
        transactionData: {
          transaction: {
            from: '0x8AaE...4D35', // Simplified for display
            to: result.executionTrace?.[0]?.to || 'Unknown',
            data: result.executionTrace?.[0]?.input || '0x'
          }
        },
        status: result.success ? 'success' as const : 'failed' as const,
        gasUsed: result.gasUsed,
        createdAt: new Date(result.timestamp)
      }));

    console.log('📝 Recent simulations generated:', recentSims.length, 'items');
    return recentSims;
  }

  /**
   * Reset system metrics (for testing or daily reset)
   */
  resetMetrics(): void {
    this.systemMetrics = {
      totalSimulations: 0,
      successfulSimulations: 0,
      totalResponseTime: 0,
      apiRequests: 0,
      lastReset: Date.now()
    };
    console.log('🔄 System metrics reset');
  }
}

// ------------------------------------
// Step 1: Normalization helpers for hex/dec handling.
// ------------------------------------

// Returns true if value is a valid hex string (0x...)
function isHex(val: any): boolean {
  return typeof val === "string" && /^0x[0-9a-fA-F]*$/.test(val);
}

// Converts decimal string or number to 0x-prefixed hex string.
function toHex(val: string | number): string {
  if (typeof val === "number") return "0x" + val.toString(16);
  if (typeof val === "string") {
    if (isHex(val)) return val;
    const num = Number(val);
    if (!isNaN(num)) return "0x" + num.toString(16);
  }
  return "0x0";
}

// Converts a hex string or decimal string/number to integer.
function hexOrDecToInt(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    if (isHex(val)) return parseInt(val, 16);
    const num = Number(val);
    if (!isNaN(num)) return num;
  }
  return 0;
}

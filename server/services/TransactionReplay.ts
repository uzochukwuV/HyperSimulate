import { HyperliquidService } from './hyperliquid.js';
import { SimulationService } from './simulation.js';
import { HyperEVMStateManager, ForkedState } from '../core/StateManager.js';
import { HyperEVMEngine } from '../core/HyperEVMEngine.js';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

const logger = pino({ level: 'info' });

// Transaction data structure from RPC
export interface HyperEVMTransaction {
  hash: string;
  blockNumber: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice: string;
  gasUsed?: string;
  input: string;
  nonce: string;
  r: string;
  s: string;
  v: string;
  type?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  accessList?: Array<{
    address: string;
    storageKeys: string[];
  }>;
}

export interface TransactionReceipt {
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  blockNumber: string;
  from: string;
  to: string | null;
  cumulativeGasUsed: string;
  gasUsed: string;
  contractAddress: string | null;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    transactionIndex: string;
    blockHash: string;
    logIndex: string;
    removed: boolean;
  }>;
  status: string;
  effectiveGasPrice: string;
}

export interface ReplayRequest {
  transactionHash: string;
  forkFromBlock?: string; // Optional: specify block to fork from
  modifications?: {
    // Allow modifications to the original transaction
    from?: string;
    to?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
    input?: string;
    stateOverrides?: Array<{
      address: string;
      balance?: string;
      nonce?: string;
      code?: string;
      storage?: Record<string, string>;
    }>;
  };
  replayMode: 'exact' | 'modified' | 'debug';
}

export interface ReplayResult {
  requestId: string;
  originalTransaction: HyperEVMTransaction;
  originalReceipt: TransactionReceipt;
  replayTransaction: any;
  replayResult: any;
  forkInfo: {
    forkBlock: string;
    forkStateRoot: string;
    contractsAvailable: number;
  };
  comparison: {
    gasUsedDiff: number;
    stateDiff: Array<{
      address: string;
      type: 'balance' | 'nonce' | 'storage' | 'code';
      original: string;
      replay: string;
      key?: string;
    }>;
    eventsDiff: Array<{
      type: 'added' | 'removed' | 'modified';
      event: any;
    }>;
  };
  insights: {
    replayAccuracy: 'EXACT' | 'CLOSE' | 'DIVERGENT';
    possibleReasons: string[];
    recommendations: string[];
  };
  timestamp: number;
}

export interface MainnetFork {
  forkId: string;
  forkBlock: string;
  forkStateRoot: string;
  createdAt: number;
  contractCount: number;
  forkedState: ForkedState;
  engine: HyperEVMEngine;
}

export class TransactionReplayService {
  private hyperliquid: HyperliquidService;
  private simulationService: SimulationService;
  private stateManager: HyperEVMStateManager;
  private activeForks: Map<string, MainnetFork> = new Map();
  private replayCache: Map<string, ReplayResult> = new Map();

  constructor(
    hyperliquid: HyperliquidService,
    simulationService: SimulationService,
    stateManager: HyperEVMStateManager
  ) {
    this.hyperliquid = hyperliquid;
    this.simulationService = simulationService;
    this.stateManager = stateManager;
  }

  /**
   * Replay a transaction by its hash on a forked mainnet
   */
  async replayTransaction(request: ReplayRequest): Promise<ReplayResult> {
    const requestId = uuidv4();
    logger.info(`Starting transaction replay: ${request.transactionHash}`);

    try {
      // Step 1: Fetch original transaction and receipt
      const [originalTx, originalReceipt] = await Promise.all([
        this.fetchTransaction(request.transactionHash),
        this.fetchTransactionReceipt(request.transactionHash)
      ]);

      // Step 2: Determine fork block (use transaction block - 1 for pre-state)
      const forkBlock = request.forkFromBlock || 
        '0x' + (BigInt(originalTx.blockNumber) - 1n).toString(16);

      // Step 3: Create lightweight simulation environment instead of full fork
      console.log(`[TransactionReplay] Creating lightweight simulation for block ${forkBlock}`);
      const simulationEnv = await this.createLightweightSimulation(forkBlock, originalTx);

      // Step 4: Prepare replay transaction with any modifications
      const replayTx = this.prepareReplayTransaction(originalTx, request.modifications);

      // Step 5: Execute replay using lightweight simulation
      const replayResult = await this.executeLightweightReplay(simulationEnv, replayTx);

      // Step 6: Compare results and generate insights
      const comparison = this.compareResults(originalReceipt, replayResult);
      const insights = this.generateInsights(comparison, originalTx, replayResult);

      const result: ReplayResult = {
        requestId,
        originalTransaction: originalTx,
        originalReceipt,
        replayTransaction: replayTx,
        replayResult,
        forkInfo: {
          forkBlock: simulationEnv.blockNumber,
          forkStateRoot: simulationEnv.stateRoot || 'lightweight',
          contractsAvailable: simulationEnv.contractCount
        },
        comparison,
        insights,
        timestamp: Date.now()
      };

      // Cache the result
      this.replayCache.set(requestId, result);
      
      logger.info(`Transaction replay completed: ${requestId}`);
      return result;

    } catch (error) {
      logger.error(`Transaction replay failed: ${request.transactionHash}`, error);
      throw error;
    }
  }

  /**
   * Create a new mainnet fork at a specific block
   */
  async createMainnetFork(blockNumber: string): Promise<MainnetFork> {
    const forkId = uuidv4();
    logger.info(`Creating mainnet fork at block ${blockNumber}`);

    try {
      // Get block state
      const blockNum = parseInt(blockNumber, 16);
      const forkedState = await this.stateManager.forkState(blockNum);

      // Get block info
      const block = await this.hyperliquid.getBlockByNumber(blockNumber);
      if (!block) {
        throw new Error(`Block ${blockNumber} not found`);
      }

      // Create a new HyperEVM engine instance for this fork
      const forkEngine = await this.createForkEngine(blockNumber);

      // Count contracts in the fork (estimated)
      const contractCount = await this.estimateContractCount(blockNumber);

      const fork: MainnetFork = {
        forkId,
        forkBlock: blockNumber,
        forkStateRoot: block.stateRoot,
        createdAt: Date.now(),
        contractCount,
        forkedState,
        engine: forkEngine
      };

      this.activeForks.set(forkId, fork);
      
      logger.info(`Mainnet fork created: ${forkId} at block ${blockNumber}`);
      return fork;

    } catch (error) {
      logger.error(`Failed to create mainnet fork at block ${blockNumber}:`, error);
      throw error;
    }
  }

  /**
   * Fetch transaction details from RPC
   */
  private async fetchTransaction(txHash: string): Promise<HyperEVMTransaction> {
    const response = await this.hyperliquid.rpcCall({
      method: 'eth_getTransactionByHash',
      params: [txHash]
    });

    if (!response.result) {
      throw new Error(`Transaction not found: ${txHash}`);
    }

    return response.result as HyperEVMTransaction;
  }

  /**
   * Fetch transaction receipt from RPC
   */
  private async fetchTransactionReceipt(txHash: string): Promise<TransactionReceipt> {
    const response = await this.hyperliquid.rpcCall({
      method: 'eth_getTransactionReceipt',
      params: [txHash]
    });

    if (!response.result) {
      throw new Error(`Transaction receipt not found: ${txHash}`);
    }

    return response.result as TransactionReceipt;
  }

  /**
   * Get existing fork or create new one
   */
  private async getOrCreateMainnetFork(blockNumber: string): Promise<MainnetFork> {
    // Check if we already have a fork for this block
    for (const fork of this.activeForks.values()) {
      if (fork.forkBlock === blockNumber) {
        logger.debug(`Using existing fork: ${fork.forkId}`);
        return fork;
      }
    }

    // Create new fork
    return await this.createMainnetFork(blockNumber);
  }

  /**
   * Prepare replay transaction with optional modifications
   */
  private prepareReplayTransaction(originalTx: HyperEVMTransaction, modifications?: any) {
    const replayTx = {
      from: modifications?.from || originalTx.from,
      to: modifications?.to || originalTx.to,
      value: modifications?.value || originalTx.value,
      gas: modifications?.gas || originalTx.gas,
      gasPrice: modifications?.gasPrice || originalTx.gasPrice,
      input: modifications?.input || originalTx.input,
      nonce: originalTx.nonce,
      // Include EIP-1559 fields if present
      ...(originalTx.maxFeePerGas && {
        maxFeePerGas: modifications?.maxFeePerGas || originalTx.maxFeePerGas,
        maxPriorityFeePerGas: modifications?.maxPriorityFeePerGas || originalTx.maxPriorityFeePerGas
      }),
      ...(originalTx.accessList && { accessList: originalTx.accessList }),
      // State overrides for advanced replay scenarios
      ...(modifications?.stateOverrides && { stateOverrides: modifications.stateOverrides })
    };

    return replayTx;
  }

  /**
   * Execute replay transaction on the forked state
   */
  private async executeReplayOnFork(fork: MainnetFork, replayTx: any) {
    try {
      // Convert to simulation request format
      const simulationRequest = {
        transaction: {
          from: replayTx.from,
          to: replayTx.to,
          value: replayTx.value,
          gasLimit: replayTx.gas,
          gasPrice: replayTx.gasPrice,
          data: replayTx.input,
          nonce: replayTx.nonce,
          maxFeePerGas: replayTx.maxFeePerGas,
          maxPriorityFeePerGas: replayTx.maxPriorityFeePerGas
        },
        blockNumber: fork.forkBlock,
        enableStateOverrides: true,
        stateOverrides: replayTx.stateOverrides || [],
        executionMode: 'local' as const,
        simulationMode: 'exact' as const,
        includePrecompiles: true,
        simulateCoreWriter: true
      };

      // Execute simulation on the forked engine
      const result = await this.simulationService.simulateTransaction(simulationRequest);
      
      return result;

    } catch (error) {
      logger.error('Failed to execute replay on fork:', error);
      throw error;
    }
  }

  /**
   * Compare original and replay results
   */
  private compareResults(originalReceipt: TransactionReceipt, replayResult: any) {
    const gasUsedDiff = parseInt(replayResult.gasUsed) - parseInt(originalReceipt.gasUsed);
    
    const stateDiff: any[] = [];
    const eventsDiff: any[] = [];

    // Compare gas usage
    if (Math.abs(gasUsedDiff) > 100) { // Allow small differences
      stateDiff.push({
        address: 'SYSTEM',
        type: 'gas',
        original: originalReceipt.gasUsed,
        replay: replayResult.gasUsed.toString()
      });
    }

    // Compare events/logs (simplified)
    const originalLogCount = originalReceipt.logs.length;
    const replayLogCount = replayResult.events?.length || 0;
    
    if (originalLogCount !== replayLogCount) {
      eventsDiff.push({
        type: 'modified',
        event: {
          description: `Log count mismatch: original=${originalLogCount}, replay=${replayLogCount}`
        }
      });
    }

    // Compare state changes (would need more detailed implementation)
    if (replayResult.stateChanges) {
      replayResult.stateChanges.forEach((change: any) => {
        stateDiff.push({
          address: change.address,
          type: change.type,
          original: change.before,
          replay: change.after,
          key: change.key
        });
      });
    }

    return {
      gasUsedDiff,
      stateDiff,
      eventsDiff
    };
  }

  /**
   * Generate insights about the replay accuracy
   */
  private generateInsights(comparison: any, originalTx: HyperEVMTransaction, replayResult: any) {
    let accuracy: 'EXACT' | 'CLOSE' | 'DIVERGENT' = 'EXACT';
    const possibleReasons: string[] = [];
    const recommendations: string[] = [];

    // Analyze gas difference
    if (Math.abs(comparison.gasUsedDiff) > 1000) {
      accuracy = 'DIVERGENT';
      possibleReasons.push('Significant gas usage difference detected');
      recommendations.push('Check for state differences or nonce issues');
    } else if (Math.abs(comparison.gasUsedDiff) > 100) {
      accuracy = 'CLOSE';
      possibleReasons.push('Minor gas usage difference');
    }

    // Analyze state changes
    if (comparison.stateDiff.length > 0) {
      if (accuracy === 'EXACT') accuracy = 'CLOSE';
      possibleReasons.push('State changes detected during replay');
      recommendations.push('Review state overrides and account balances');
    }

    // Analyze events
    if (comparison.eventsDiff.length > 0) {
      if (accuracy === 'EXACT') accuracy = 'CLOSE';
      possibleReasons.push('Event emission differences detected');
      recommendations.push('Check contract state and external dependencies');
    }

    // Success vs failure status
    if (replayResult.success !== (originalTx.status !== '0x0')) {
      accuracy = 'DIVERGENT';
      possibleReasons.push('Transaction success status mismatch');
      recommendations.push('Verify account balances and contract state at fork block');
    }

    // Add general recommendations
    if (accuracy !== 'EXACT') {
      recommendations.push('Consider using state overrides to match exact conditions');
      recommendations.push('Verify the fork block contains accurate pre-state');
    }

    return {
      replayAccuracy: accuracy,
      possibleReasons,
      recommendations
    };
  }

  /**
   * Create a specialized HyperEVM engine for fork simulation
   */
  private async createForkEngine(blockNumber: string): Promise<HyperEVMEngine> {
    // Import the engine configuration
    const { DEFAULT_HYPEREVM_CONFIG, HyperEVMEngine } = await import('../core/HyperEVMEngine.js');
    
    // Create engine config for the fork
    const forkConfig = {
      ...DEFAULT_HYPEREVM_CONFIG,
      // Use forked state for this specific block
      stateConfig: {
        ...DEFAULT_HYPEREVM_CONFIG.stateConfig,
        forkBlock: blockNumber,
        persistentStorage: false, // Don't persist fork state
        maxConcurrentSimulations: 5 // Lower for forks
      }
    };

    const engine = new HyperEVMEngine(forkConfig);
    await engine.initialize();
    
    return engine;
  }

  /**
   * Estimate number of contracts deployed at a given block
   */
  private async estimateContractCount(blockNumber: string): Promise<number> {
    // This is a simplified estimation
    // In production, you might maintain a contract registry or query an indexer
    const blockNum = parseInt(blockNumber, 16);
    
    // Rough estimation based on block number (HyperEVM specific)
    if (blockNum < 1000) return 10;
    if (blockNum < 10000) return 100;
    if (blockNum < 100000) return 500;
    return 1000;
  }

  /**
   * Get all active forks
   */
  getActiveForks(): Array<{
    forkId: string;
    forkBlock: string;
    createdAt: number;
    contractCount: number;
  }> {
    return Array.from(this.activeForks.values()).map(fork => ({
      forkId: fork.forkId,
      forkBlock: fork.forkBlock,
      createdAt: fork.createdAt,
      contractCount: fork.contractCount
    }));
  }

  /**
   * Delete a fork to free up resources
   */
  async deleteFork(forkId: string): Promise<boolean> {
    const fork = this.activeForks.get(forkId);
    if (!fork) {
      return false;
    }

    try {
      // Clean up fork resources
      await fork.engine.shutdown();
      fork.forkedState.revert();
      
      this.activeForks.delete(forkId);
      logger.info(`Fork deleted: ${forkId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete fork ${forkId}:`, error);
      return false;
    }
  }

  /**
   * Get cached replay result
   */
  getReplayResult(requestId: string): ReplayResult | undefined {
    return this.replayCache.get(requestId);
  }

  /**
   * Clear old replay results
   */
  clearOldReplays(maxAge: number = 3600000): void { // 1 hour default
    const now = Date.now();
    for (const [requestId, result] of this.replayCache.entries()) {
      if (now - result.timestamp > maxAge) {
        this.replayCache.delete(requestId);
      }
    }
  }

  /**
   * Create a lightweight simulation environment (faster than full forking)
   */
  private async createLightweightSimulation(blockNumber: string, originalTx: HyperEVMTransaction): Promise<{
    blockNumber: string;
    stateRoot?: string;
    contractCount: number;
    timestamp: number;
  }> {
    try {
      logger.info(`Creating lightweight simulation environment for block ${blockNumber}`);
      
      // Get basic block info without full state
      const block = await this.hyperliquid.getBlockByNumber(blockNumber);
      
      return {
        blockNumber,
        stateRoot: block?.stateRoot,
        contractCount: 1, // We'll just simulate the immediate contracts involved
        timestamp: Date.now()
      };
    } catch (error) {
      logger.warn(`Failed to get block info for ${blockNumber}, using defaults:`, error);
      return {
        blockNumber,
        contractCount: 0,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Execute lightweight replay (much faster than full fork simulation)
   */
  private async executeLightweightReplay(simulationEnv: any, replayTx: any) {
    try {
      logger.info('Executing lightweight transaction replay');
      
      // Convert to simulation request format
      const simulationRequest = {
        transaction: {
          from: replayTx.from,
          to: replayTx.to,
          value: replayTx.value,
          gasLimit: replayTx.gas,
          gasPrice: replayTx.gasPrice,
          data: replayTx.input,
          nonce: replayTx.nonce,
          maxFeePerGas: replayTx.maxFeePerGas,
          maxPriorityFeePerGas: replayTx.maxPriorityFeePerGas
        },
        blockNumber: simulationEnv.blockNumber,
        enableStateOverrides: true,
        stateOverrides: replayTx.stateOverrides || [],
        executionMode: 'rpc' as const, // Use RPC mode instead of local simulation
        simulationMode: 'fast' as const,
        includePrecompiles: true,
        simulateCoreWriter: false // Disable heavy CoreWriter simulation
      };

      // Execute simulation using existing service (much lighter than forking)
      const result = await this.simulationService.simulateTransaction(simulationRequest);
      
      logger.info('Lightweight replay completed successfully');
      return result;

    } catch (error) {
      logger.error('Lightweight replay failed:', error);
      
      // Return a mock result to prevent total failure
      return {
        success: false,
        gasUsed: 21000,
        errorMessage: error instanceof Error ? error.message : 'Simulation failed',
        returnValue: '0x',
        events: [],
        stateChanges: []
      };
    }
  }

  /**
   * Get statistics about the replay service
   */
  getStats(): {
    activeForks: number;
    cachedReplays: number;
    totalReplaysExecuted: number;
    memoryUsage: number;
  } {
    return {
      activeForks: this.activeForks.size,
      cachedReplays: this.replayCache.size,
      totalReplaysExecuted: this.replayCache.size, // Simplified
      memoryUsage: process.memoryUsage().heapUsed
    };
  }
}
import { HyperliquidService } from './hyperliquid.js';
import { 
  type TransactionData, 
  type SimulationRequest, 
  type BundleSimulationRequest,
  type SimulationResult,
  type ExecutionTrace,
  type StateChange,
  type EventLog 
} from '@shared/schema.js';

export class SimulationService {
  private hyperliquid: HyperliquidService;

  constructor(hyperliquid: HyperliquidService) {
    this.hyperliquid = hyperliquid;
  }

  async simulateTransaction(request: SimulationRequest): Promise<SimulationResult> {
    const startTime = Date.now();
    
    try {
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

      return {
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
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
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
      };
    }
  }

  async simulateBundle(request: BundleSimulationRequest): Promise<SimulationResult[]> {
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
    
    return results;
  }

  private async prepareTransaction(transaction: TransactionData, blockNumber: string): Promise<any> {
    const txData: any = {
      from: transaction.from,
      value: transaction.value || '0x0',
      gas: transaction.gasLimit || '0x5208', // 21000 in hex
    };

    if (transaction.to) {
      txData.to = transaction.to;
    }

    if (transaction.data) {
      txData.data = transaction.data;
    }

    if (transaction.gasPrice) {
      txData.gasPrice = transaction.gasPrice;
    }

    // Set nonce if not provided
    if (!transaction.nonce) {
      const nonce = await this.hyperliquid.getTransactionCount(transaction.from, blockNumber);
      txData.nonce = nonce;
    } else {
      txData.nonce = transaction.nonce;
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

  private generateExecutionTrace(txData: any, result: any): ExecutionTrace[] {
    const trace: ExecutionTrace[] = [];
    
    // Add CALL trace
    trace.push({
      type: 'CALL',
      depth: 0,
      from: txData.from,
      to: txData.to,
      value: txData.value,
      gasUsed: parseInt(result.gasUsed || '0', 16),
      gasRemaining: parseInt(txData.gas || '0', 16) - parseInt(result.gasUsed || '0', 16),
    });

    // Add RETURN or REVERT trace based on success
    trace.push({
      type: result.success ? 'RETURN' : 'REVERT',
      depth: 0,
      gasUsed: 0,
      gasRemaining: parseInt(txData.gas || '0', 16) - parseInt(result.gasUsed || '0', 16),
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
  }> {
    const [blockNumber, gasPrice, bigBlockGasPrice, chainId] = await Promise.all([
      this.hyperliquid.getBlockNumber(),
      this.hyperliquid.getGasPrice(),
      this.hyperliquid.getBigBlockGasPrice(),
      this.hyperliquid.getChainId(),
    ]);

    return {
      blockNumber,
      gasPrice,
      bigBlockGasPrice,
      chainId,
    };
  }
}

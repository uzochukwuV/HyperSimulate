import { HyperliquidService } from './hyperliquid.js';
import { TransactionReplayService, HyperEVMTransaction, TransactionReceipt } from './TransactionReplay.js';
import pino from 'pino';

const logger = pino({ level: 'info' });

// Pre-filled simulation form interfaces
export interface SimulationForm {
  formId: string;
  transactionHash: string;
  title: string;
  description: string;
  prefilledData: PrefilledTransactionData;
  suggestedModifications: ModificationSuggestion[];
  debuggingHints: DebuggingHint[];
  relatedContracts: ContractInfo[];
  estimatedComplexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
  tags: string[];
  createdAt: number;
}

export interface PrefilledTransactionData {
  // Basic transaction fields
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice: string;
  input: string;
  nonce: string;
  
  // EIP-1559 fields
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  accessList?: Array<{
    address: string;
    storageKeys: string[];
  }>;
  
  // Additional metadata
  blockNumber: string;
  blockHash: string;
  originalStatus: 'success' | 'failed' | 'reverted';
  originalGasUsed: string;
  originalLogs: any[];
  
  // HyperEVM specific
  isPrecompileCall: boolean;
  precompileType?: string;
  decodedInput?: any;
  decodedLogs?: any[];
}

export interface ModificationSuggestion {
  type: 'gas' | 'value' | 'input' | 'stateOverride' | 'blockNumber';
  field: string;
  currentValue: string;
  suggestedValue: string;
  reason: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  category: 'optimization' | 'debugging' | 'testing' | 'security';
}

export interface DebuggingHint {
  type: 'gas_estimation' | 'revert_reason' | 'state_dependency' | 'timing' | 'precompile';
  title: string;
  description: string;
  actionable: boolean;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  relatedField?: string;
  suggestedAction?: string;
}

export interface ContractInfo {
  address: string;
  name?: string;
  type: 'EOA' | 'Contract' | 'Precompile' | 'Unknown';
  verified: boolean;
  sourceCode?: string;
  abi?: any[];
  functions?: string[];
  events?: string[];
  role: 'primary' | 'secondary' | 'dependency';
}

export class TransactionFormBuilder {
  private hyperliquid: HyperliquidService;
  private replayService: TransactionReplayService;
  private formCache: Map<string, SimulationForm> = new Map();

  // Contract name registry for better UX
  private knownContracts = new Map([
    // HyperEVM precompiles
    ['0x0000000000000000000000000000000000000800', 'HyperCore Read Base'],
    ['0x0000000000000000000000000000000000000801', 'Perpetual Positions'],
    ['0x0000000000000000000000000000000000000802', 'Spot Balances'],
    ['0x0000000000000000000000000000000000000803', 'Vault Equity'],
    ['0x0000000000000000000000000000000000000804', 'Staking Delegations'],
    ['0x0000000000000000000000000000000000000805', 'L1 Block Number'],
    ['0x0000000000000000000000000000000000000807', 'Oracle Prices'],
    ['0x000000000000000000000000000000000000080a', 'Perpetual Asset Info'],
    ['0x3333333333333333333333333333333333333333', 'CoreWriter'],
    ['0x2222222222222222222222222222222222222222', 'HYPE Transfer'],
    ['0x5555555555555555555555555555555555555555', 'Wrapped HYPE'],
    
    // Common DeFi contracts (examples)
    ['0xa0b86a33e6a55b430362f7ab2e07ccdab6e2e64a', 'HyperSwap Router'],
    ['0xb12c15de3e9b7e3e4a8f123456789abcdef12345', 'HyperLend Protocol'],
  ]);

  constructor(hyperliquid: HyperliquidService, replayService: TransactionReplayService) {
    this.hyperliquid = hyperliquid;
    this.replayService = replayService;
  }

  /**
   * Create a pre-filled simulation form from a transaction hash
   */
  async createSimulationForm(transactionHash: string): Promise<SimulationForm> {
    logger.info(`Creating simulation form for transaction: ${transactionHash}`);

    try {
      // Validate transaction hash format first
      if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
        throw new Error(`Invalid transaction hash format: ${transactionHash}. Expected 64 hex characters with 0x prefix.`);
      }

      // Check if this might be a HyperCore transaction vs HyperEVM transaction
      console.log(`[TransactionFormBuilder] Analyzing transaction type for: ${transactionHash}`);

      logger.info(`Fetching transaction data for: ${transactionHash}`);
      console.log(`[TransactionFormBuilder] Processing transaction: ${transactionHash}`);
      
      // Fetch transaction and receipt
      const [transaction, receipt] = await Promise.all([
        this.hyperliquid.getTransactionByHash(transactionHash).catch(err => {
          console.error(`[TransactionFormBuilder] Error fetching transaction:`, err);
          return null;
        }),
        this.hyperliquid.getTransactionReceipt(transactionHash).catch(err => {
          console.error(`[TransactionFormBuilder] Error fetching receipt:`, err);
          return null;
        })
      ]);
      
      logger.info(`Transaction result:`, transaction);
      logger.info(`Receipt result:`, receipt);
      console.log(`[TransactionFormBuilder] Transaction:`, transaction);
      console.log(`[TransactionFormBuilder] Receipt:`, receipt);

      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionHash}. Please verify the transaction hash exists on HyperEVM.`);
      }

      // Build prefilled data
      const prefilledData = await this.buildPrefilledData(transaction, receipt);
      
      // Generate modification suggestions
      const suggestedModifications = await this.generateModificationSuggestions(
        transaction, 
        receipt, 
        prefilledData
      );
      
      // Generate debugging hints
      const debuggingHints = await this.generateDebuggingHints(
        transaction, 
        receipt, 
        prefilledData
      );
      
      // Analyze related contracts
      const relatedContracts = await this.analyzeRelatedContracts(transaction, receipt);
      
      // Determine complexity and tags
      const estimatedComplexity = this.estimateComplexity(transaction, receipt, relatedContracts);
      const tags = this.generateTags(transaction, receipt, prefilledData);

      const form: SimulationForm = {
        formId: this.generateFormId(transactionHash),
        transactionHash,
        title: this.generateFormTitle(transaction, prefilledData),
        description: this.generateFormDescription(transaction, receipt, prefilledData),
        prefilledData,
        suggestedModifications,
        debuggingHints,
        relatedContracts,
        estimatedComplexity,
        tags,
        createdAt: Date.now()
      };

      // Cache the form
      this.formCache.set(form.formId, form);
      
      logger.info(`Simulation form created: ${form.formId}`);
      return form;

    } catch (error) {
      logger.error(`Failed to create simulation form for ${transactionHash}:`, error);
      throw error;
    }
  }

  /**
   * Build prefilled transaction data
   */
  private async buildPrefilledData(
    transaction: HyperEVMTransaction, 
    receipt?: TransactionReceipt
  ): Promise<PrefilledTransactionData> {
    
    const isPrecompileCall = this.isHyperEVMPrecompile(transaction.to);
    let precompileType: string | undefined;
    let decodedInput: any;
    let decodedLogs: any[] = [];

    if (isPrecompileCall && transaction.to) {
      precompileType = this.knownContracts.get(transaction.to.toLowerCase()) || 'Unknown Precompile';
      decodedInput = this.decodePrecompileInput(transaction.to, transaction.input);
    }

    if (receipt?.logs) {
      decodedLogs = await this.decodeLogs(receipt.logs);
    }

    return {
      from: transaction.from,
      to: transaction.to,
      value: transaction.value,
      gas: transaction.gas,
      gasPrice: transaction.gasPrice,
      input: transaction.input,
      nonce: transaction.nonce,
      maxFeePerGas: transaction.maxFeePerGas,
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
      accessList: transaction.accessList,
      blockNumber: transaction.blockNumber,
      blockHash: transaction.blockHash,
      originalStatus: receipt ? (receipt.status === '0x1' ? 'success' : 'failed') : 'unknown' as any,
      originalGasUsed: receipt?.gasUsed || '0x0',
      originalLogs: receipt?.logs || [],
      isPrecompileCall,
      precompileType,
      decodedInput,
      decodedLogs
    };
  }

  /**
   * Generate modification suggestions for debugging/testing
   */
  private async generateModificationSuggestions(
    transaction: HyperEVMTransaction,
    receipt: TransactionReceipt | undefined,
    prefilledData: PrefilledTransactionData
  ): Promise<ModificationSuggestion[]> {
    const suggestions: ModificationSuggestion[] = [];

    // Gas optimization suggestions
    if (receipt) {
      const gasUsed = parseInt(receipt.gasUsed, 16);
      const gasLimit = parseInt(transaction.gas, 16);
      const gasEfficiency = gasUsed / gasLimit;

      if (gasEfficiency < 0.3) {
        suggestions.push({
          type: 'gas',
          field: 'gas',
          currentValue: transaction.gas,
          suggestedValue: `0x${Math.floor(gasUsed * 1.2).toString(16)}`,
          reason: 'Gas limit is much higher than actual usage. Reduce for efficiency.',
          impact: 'LOW',
          category: 'optimization'
        });
      }

      if (gasEfficiency > 0.95) {
        suggestions.push({
          type: 'gas',
          field: 'gas',
          currentValue: transaction.gas,
          suggestedValue: `0x${Math.floor(gasLimit * 1.5).toString(16)}`,
          reason: 'Transaction used almost all gas. Increase limit to prevent out-of-gas.',
          impact: 'HIGH',
          category: 'debugging'
        });
      }
    }

    // Value modifications for testing
    if (transaction.value !== '0x0') {
      const currentValue = BigInt(transaction.value);
      const doubleValue = currentValue * 2n;
      const halfValue = currentValue / 2n;

      suggestions.push({
        type: 'value',
        field: 'value',
        currentValue: transaction.value,
        suggestedValue: `0x${doubleValue.toString(16)}`,
        reason: 'Test with double the transfer amount to see impact on execution.',
        impact: 'MEDIUM',
        category: 'testing'
      });

      if (halfValue > 0n) {
        suggestions.push({
          type: 'value',
          field: 'value',
          currentValue: transaction.value,
          suggestedValue: `0x${halfValue.toString(16)}`,
          reason: 'Test with half the transfer amount.',
          impact: 'MEDIUM',
          category: 'testing'
        });
      }
    }

    // Precompile-specific suggestions
    if (prefilledData.isPrecompileCall && transaction.to) {
      if (transaction.to.toLowerCase() === '0x3333333333333333333333333333333333333333') {
        suggestions.push({
          type: 'gas',
          field: 'gas',
          currentValue: transaction.gas,
          suggestedValue: '0xB71B', // ~47000 gas for CoreWriter
          reason: 'CoreWriter calls typically need ~47,000 gas.',
          impact: 'MEDIUM',
          category: 'optimization'
        });
      }

      if (transaction.to.toLowerCase().startsWith('0x00000000000000000000000000000000000008')) {
        suggestions.push({
          type: 'gas',
          field: 'gas',
          currentValue: transaction.gas,
          suggestedValue: '0x1388', // ~5000 gas for oracle reads
          reason: 'Oracle read calls typically need ~5,000 gas.',
          impact: 'LOW',
          category: 'optimization'
        });
      }
    }

    // State override suggestions for failed transactions
    if (receipt?.status === '0x0') {
      suggestions.push({
        type: 'stateOverride',
        field: 'stateOverrides',
        currentValue: '[]',
        suggestedValue: `[{"address": "${transaction.from}", "balance": "0x56BC75E2D630E0000"}]`,
        reason: 'Add balance override to ensure sender has sufficient funds.',
        impact: 'HIGH',
        category: 'debugging'
      });
    }

    return suggestions;
  }

  /**
   * Generate debugging hints based on transaction analysis
   */
  private async generateDebuggingHints(
    transaction: HyperEVMTransaction,
    receipt: TransactionReceipt | undefined,
    prefilledData: PrefilledTransactionData
  ): Promise<DebuggingHint[]> {
    const hints: DebuggingHint[] = [];

    // Failed transaction hints
    if (receipt?.status === '0x0') {
      hints.push({
        type: 'revert_reason',
        title: 'Transaction Failed',
        description: 'This transaction reverted. Use trace functionality to identify the exact revert reason.',
        actionable: true,
        priority: 'HIGH',
        suggestedAction: 'Enable detailed tracing and check for revert messages'
      });

      hints.push({
        type: 'state_dependency',
        title: 'Check State Dependencies',
        description: 'Verify that all required state (balances, allowances, etc.) was correct at the time of execution.',
        actionable: true,
        priority: 'HIGH',
        suggestedAction: 'Use state overrides to test with known good state'
      });
    }

    // Gas-related hints
    if (receipt) {
      const gasUsed = parseInt(receipt.gasUsed, 16);
      const gasLimit = parseInt(transaction.gas, 16);

      if (gasUsed === gasLimit) {
        hints.push({
          type: 'gas_estimation',
          title: 'Out of Gas Suspected',
          description: 'Transaction used exactly the gas limit, indicating possible out-of-gas condition.',
          actionable: true,
          priority: 'HIGH',
          relatedField: 'gas',
          suggestedAction: 'Increase gas limit and retry simulation'
        });
      }
    }

    // Precompile-specific hints
    if (prefilledData.isPrecompileCall) {
      hints.push({
        type: 'precompile',
        title: 'HyperEVM Precompile Call',
        description: `This transaction calls the ${prefilledData.precompileType} precompile. Ensure input data is correctly formatted.`,
        actionable: true,
        priority: 'MEDIUM',
        relatedField: 'input',
        suggestedAction: 'Verify precompile input encoding and expected output'
      });

      if (transaction.to?.toLowerCase() === '0x3333333333333333333333333333333333333333') {
        hints.push({
          type: 'timing',
          title: 'CoreWriter Delay',
          description: 'CoreWriter actions have a ~3 second execution delay. This affects the transaction timing.',
          actionable: false,
          priority: 'MEDIUM'
        });
      }
    }

    // Complex transaction hints
    if (transaction.input && transaction.input.length > 1000) {
      hints.push({
        type: 'gas_estimation',
        title: 'Large Input Data',
        description: 'This transaction has substantial input data. Consider the data gas costs in your analysis.',
        actionable: true,
        priority: 'LOW',
        relatedField: 'input',
        suggestedAction: 'Review input data encoding for potential optimizations'
      });
    }

    return hints;
  }

  /**
   * Analyze contracts involved in the transaction
   */
  private async analyzeRelatedContracts(
    transaction: HyperEVMTransaction,
    receipt?: TransactionReceipt
  ): Promise<ContractInfo[]> {
    const contracts: ContractInfo[] = [];
    const addressesAnalyzed = new Set<string>();

    // Analyze target contract
    if (transaction.to && !addressesAnalyzed.has(transaction.to)) {
      const contractInfo = await this.analyzeContract(transaction.to, 'primary');
      contracts.push(contractInfo);
      addressesAnalyzed.add(transaction.to);
    }

    // Analyze contracts from logs
    if (receipt?.logs) {
      for (const log of receipt.logs) {
        if (!addressesAnalyzed.has(log.address)) {
          const contractInfo = await this.analyzeContract(log.address, 'secondary');
          contracts.push(contractInfo);
          addressesAnalyzed.add(log.address);
        }
      }
    }

    return contracts;
  }

  /**
   * Analyze individual contract
   */
  private async analyzeContract(address: string, role: 'primary' | 'secondary' | 'dependency'): Promise<ContractInfo> {
    const contractInfo: ContractInfo = {
      address,
      name: this.knownContracts.get(address.toLowerCase()),
      type: 'Unknown',
      verified: false,
      role
    };

    try {
      // Check if it's a precompile
      if (this.isHyperEVMPrecompile(address)) {
        contractInfo.type = 'Precompile';
        contractInfo.verified = true;
        return contractInfo;
      }

      // Get contract code
      const code = await this.hyperliquid.getCode(address);
      
      if (!code || code === '0x') {
        contractInfo.type = 'EOA';
      } else {
        contractInfo.type = 'Contract';
        
        // Try to identify common function signatures
        contractInfo.functions = this.identifyCommonFunctions(code);
        contractInfo.events = this.identifyCommonEvents(code);
      }

    } catch (error) {
      logger.warn(`Failed to analyze contract ${address}:`, error);
    }

    return contractInfo;
  }

  /**
   * Helper methods for analysis
   */
  private isHyperEVMPrecompile(address: string | null): boolean {
    if (!address) return false;
    return this.knownContracts.has(address.toLowerCase());
  }

  private decodePrecompileInput(address: string, input: string): any {
    // Simplified precompile input decoding
    switch (address.toLowerCase()) {
      case '0x0000000000000000000000000000000000000807': // Oracle prices
        if (input.length >= 66) {
          const assetIndex = parseInt(input.slice(-8), 16);
          return { assetIndex };
        }
        break;
      case '0x3333333333333333333333333333333333333333': // CoreWriter
        return { actionData: input, length: input.length };
    }
    return { rawInput: input };
  }

  private async decodeLogs(logs: any[]): Promise<any[]> {
    // Basic log decoding - in production, use ABI decoder
    return logs.map(log => ({
      address: log.address,
      topics: log.topics,
      data: log.data,
      decoded: this.basicLogDecode(log)
    }));
  }

  private basicLogDecode(log: any): any {
    // Common event signatures
    const signatures = {
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef': 'Transfer',
      '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925': 'Approval'
    };

    if (log.topics && log.topics.length > 0) {
      const signature = log.topics[0];
      return {
        eventName: signatures[signature] || 'Unknown',
        signature
      };
    }

    return null;
  }

  private identifyCommonFunctions(code: string): string[] {
    const functions: string[] = [];
    
    // Common function selectors
    const selectors = {
      '0xa9059cbb': 'transfer',
      '0x23b872dd': 'transferFrom',
      '0x095ea7b3': 'approve',
      '0x70a08231': 'balanceOf',
      '0x18160ddd': 'totalSupply'
    };

    for (const [selector, name] of Object.entries(selectors)) {
      if (code.includes(selector.slice(2))) {
        functions.push(name);
      }
    }

    return functions;
  }

  private identifyCommonEvents(code: string): string[] {
    const events: string[] = [];
    
    // Common event signatures in code
    if (code.includes('ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef')) {
      events.push('Transfer');
    }
    if (code.includes('8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925')) {
      events.push('Approval');
    }

    return events;
  }

  private estimateComplexity(
    transaction: HyperEVMTransaction,
    receipt: TransactionReceipt | undefined,
    contracts: ContractInfo[]
  ): 'SIMPLE' | 'MODERATE' | 'COMPLEX' {
    let complexityScore = 0;

    // Input data size
    if (transaction.input.length > 1000) complexityScore += 2;
    else if (transaction.input.length > 100) complexityScore += 1;

    // Number of contracts involved
    complexityScore += contracts.length;

    // Number of logs/events
    if (receipt?.logs) {
      if (receipt.logs.length > 10) complexityScore += 2;
      else if (receipt.logs.length > 3) complexityScore += 1;
    }

    // Gas usage
    if (receipt) {
      const gasUsed = parseInt(receipt.gasUsed, 16);
      if (gasUsed > 500000) complexityScore += 2;
      else if (gasUsed > 100000) complexityScore += 1;
    }

    // Precompile calls add complexity
    if (this.isHyperEVMPrecompile(transaction.to)) {
      complexityScore += 1;
    }

    if (complexityScore >= 6) return 'COMPLEX';
    if (complexityScore >= 3) return 'MODERATE';
    return 'SIMPLE';
  }

  private generateTags(
    transaction: HyperEVMTransaction,
    receipt: TransactionReceipt | undefined,
    prefilledData: PrefilledTransactionData
  ): string[] {
    const tags: string[] = [];

    // Status tags
    if (receipt?.status === '0x1') tags.push('successful');
    else if (receipt?.status === '0x0') tags.push('failed');

    // Transaction type tags
    if (transaction.value !== '0x0') tags.push('value-transfer');
    if (transaction.input && transaction.input.length > 2) tags.push('contract-call');
    if (!transaction.to) tags.push('contract-creation');

    // HyperEVM specific tags
    if (prefilledData.isPrecompileCall) {
      tags.push('precompile');
      if (transaction.to?.toLowerCase() === '0x3333333333333333333333333333333333333333') {
        tags.push('corewriter');
      }
      if (transaction.to?.toLowerCase().startsWith('0x00000000000000000000000000000000000008')) {
        tags.push('oracle');
      }
    }

    // Gas tags
    if (receipt) {
      const gasUsed = parseInt(receipt.gasUsed, 16);
      if (gasUsed > 1000000) tags.push('high-gas');
      else if (gasUsed < 30000) tags.push('low-gas');
    }

    // EIP-1559 tag
    if (transaction.maxFeePerGas) tags.push('eip-1559');

    return tags;
  }

  private generateFormTitle(transaction: HyperEVMTransaction, prefilledData: PrefilledTransactionData): string {
    if (prefilledData.isPrecompileCall && prefilledData.precompileType) {
      return `${prefilledData.precompileType} Call`;
    }
    
    if (!transaction.to) {
      return 'Contract Creation';
    }
    
    if (transaction.value !== '0x0') {
      return 'Value Transfer Transaction';
    }
    
    return 'Contract Interaction';
  }

  private generateFormDescription(
    transaction: HyperEVMTransaction,
    receipt: TransactionReceipt | undefined,
    prefilledData: PrefilledTransactionData
  ): string {
    let description = `Transaction ${transaction.hash} `;
    
    if (receipt?.status === '0x1') {
      description += 'executed successfully';
    } else if (receipt?.status === '0x0') {
      description += 'failed during execution';
    } else {
      description += 'from block ' + transaction.blockNumber;
    }
    
    if (prefilledData.isPrecompileCall) {
      description += ` and called the ${prefilledData.precompileType} precompile`;
    }
    
    if (receipt?.gasUsed) {
      const gasUsed = parseInt(receipt.gasUsed, 16);
      description += ` using ${gasUsed.toLocaleString()} gas`;
    }
    
    return description + '.';
  }

  private generateFormId(transactionHash: string): string {
    return `form-${transactionHash.slice(2, 10)}-${Date.now()}`;
  }

  /**
   * Public methods for form management
   */
  getForm(formId: string): SimulationForm | undefined {
    return this.formCache.get(formId);
  }

  getAllForms(): SimulationForm[] {
    return Array.from(this.formCache.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  deleteForm(formId: string): boolean {
    return this.formCache.delete(formId);
  }

  clearOldForms(maxAge: number = 86400000): void { // 24 hours default
    const now = Date.now();
    for (const [formId, form] of this.formCache.entries()) {
      if (now - form.createdAt > maxAge) {
        this.formCache.delete(formId);
      }
    }
  }
}
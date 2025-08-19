import axios, { AxiosInstance } from 'axios';

export interface HyperliquidConfig {
  mainnetRpcUrl: string;
  testnetRpcUrl: string;
  apiUrl: string;
  apiKey?: string;
}

export class HyperliquidService {
  private client: AxiosInstance;
  private rpcClient: AxiosInstance;
  private config: HyperliquidConfig;

  constructor(config: HyperliquidConfig) {
    this.config = config;
    
    // Main API client
    this.client = axios.create({
      baseURL: config.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
      },
      timeout: 30000,
    });

    // RPC client for HyperEVM
    this.rpcClient = axios.create({
      baseURL: config.mainnetRpcUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async getChainId(): Promise<string> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_chainId',
      params: [],
      id: 1,
    });
    return response.data.result;
  }

  async getBlockNumber(): Promise<string> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1,
    });
    return response.data.result;
  }

  async getGasPrice(): Promise<string> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_gasPrice',
      params: [],
      id: 1,
    });
    return response.data.result;
  }

  async getBigBlockGasPrice(): Promise<string> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_bigBlockGasPrice',
      params: [],
      id: 1,
    });
    return response.data.result;
  }

  async getBalance(address: string, blockNumber = 'latest'): Promise<string> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, blockNumber],
      id: 1,
    });
    return response.data.result;
  }

  async getTransactionCount(address: string, blockNumber = 'latest'): Promise<string> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [address, blockNumber],
      id: 1,
    });
    return response.data.result;
  }

  async estimateGas(transaction: any): Promise<string> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_estimateGas',
      params: [transaction],
      id: 1,
    });
    return response.data.result;
  }

  async call(transaction: any, blockNumber = 'latest'): Promise<string> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [transaction, blockNumber],
      id: 1,
    });
    return response.data.result;
  }

  async getCode(address: string, blockNumber = 'latest'): Promise<string> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_getCode',
      params: [address, blockNumber],
      id: 1,
    });
    return response.data.result;
  }

  async getStorageAt(address: string, position: string, blockNumber = 'latest'): Promise<string> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_getStorageAt',
      params: [address, position, blockNumber],
      id: 1,
    });
    return response.data.result;
  }

  // HyperCore precompile interactions
  async queryPrecompile(precompileAddress: string, data: string): Promise<string> {
    return this.call({
      to: precompileAddress,
      data: data,
    });
  }

  // Get perp oracle price (precompile 0x0000000000000000000000000000000000000807)
  async getPerpOraclePrice(assetIndex: number): Promise<string> {
    const precompileAddress = '0x0000000000000000000000000000000000000807';
    const data = '0x' + assetIndex.toString(16).padStart(64, '0');
    return this.queryPrecompile(precompileAddress, data);
  }

  // CoreWriter contract interaction (0x3333333333333333333333333333333333333333)
  async simulateCoreWriterAction(actionData: string): Promise<any> {
    const coreWriterAddress = '0x3333333333333333333333333333333333333333';
    return this.call({
      to: coreWriterAddress,
      data: actionData,
    });
  }

  // Additional RPC methods for transaction replay functionality
  async getTransactionByHash(txHash: string): Promise<any> {
    try {
      console.log(`[HyperliquidService] Fetching transaction: ${txHash}`);
      console.log(`[HyperliquidService] RPC URL: ${this.config.mainnetRpcUrl}`);
      
      const response = await this.rpcClient.post('', {
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [txHash],
        id: 1,
      });
      
      console.log(`[HyperliquidService] RPC Response Status: ${response.status}`);
      console.log(`[HyperliquidService] Response Data:`, JSON.stringify(response.data, null, 2));
      
      if (response.data.error) {
        console.error(`[HyperliquidService] RPC Error:`, response.data.error);
        throw new Error(`RPC Error: ${response.data.error.message || response.data.error}`);
      }
      
      if (response.data.result === null) {
        console.log(`[HyperliquidService] Transaction not found: ${txHash}`);
        return null;
      }
      
      return response.data.result;
    } catch (error) {
      console.error(`[HyperliquidService] Failed to get transaction ${txHash}:`, error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  async getTransactionReceipt(txHash: string): Promise<any> {
    try {
      console.log(`[HyperliquidService] Fetching transaction receipt: ${txHash}`);
      
      const response = await this.rpcClient.post('', {
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: 1,
      });
      
      console.log(`[HyperliquidService] Receipt Response Status: ${response.status}`);
      console.log(`[HyperliquidService] Receipt Response Data:`, JSON.stringify(response.data, null, 2));
      
      if (response.data.error) {
        console.error(`[HyperliquidService] RPC Error for receipt:`, response.data.error);
        throw new Error(`RPC Error: ${response.data.error.message || response.data.error}`);
      }
      
      if (response.data.result === null) {
        console.log(`[HyperliquidService] Transaction receipt not found: ${txHash}`);
        return null;
      }
      
      return response.data.result;
    } catch (error) {
      console.error(`[HyperliquidService] Failed to get receipt ${txHash}:`, error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  async getBlockByNumber(blockNumber: string, includeTransactions = false): Promise<any> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: [blockNumber, includeTransactions],
      id: 1,
    });
    return response.data.result;
  }

  async getBlockByHash(blockHash: string, includeTransactions = false): Promise<any> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: 'eth_getBlockByHash',
      params: [blockHash, includeTransactions],
      id: 1,
    });
    return response.data.result;
  }

  // Generic RPC call method for custom requests
  async rpcCall(request: { method: string; params: any[]; id?: number }): Promise<any> {
    const response = await this.rpcClient.post('', {
      jsonrpc: '2.0',
      method: request.method,
      params: request.params,
      id: request.id || 1,
    });
    return response.data;
  }

  // Get multiple transactions in batch for efficiency
  async getTransactionsBatch(txHashes: string[]): Promise<any[]> {
    console.log(txHashes)
    const requests = txHashes.map((hash, index) => ({
      jsonrpc: '2.0',
      method: 'eth_getTransactionByHash',
      params: [hash],
      id: index + 1,
    }));
    
    const response = await this.rpcClient.post('', requests);
    
    return Array.isArray(response.data) ? response.data : [response.data];
  }

  // Get trace for transaction (if supported by RPC)
  async traceTransaction(txHash: string): Promise<any> {
    try {
      const response = await this.rpcClient.post('', {
        jsonrpc: '2.0',
        method: 'debug_traceTransaction',
        params: [txHash, { tracer: 'callTracer' }],
        id: 1,
      });
      return response.data.result;
    } catch (error) {
      // Fallback if tracing not supported
      return null;
    }
  }
}

// Factory function to create HyperliquidService with environment config
export function createHyperliquidService(): HyperliquidService {
  const config: HyperliquidConfig = {
    mainnetRpcUrl: process.env.HYPERLIQUID_MAINNET_RPC || 'https://rpc.hyperliquid.xyz/evm',
    testnetRpcUrl: process.env.HYPERLIQUID_TESTNET_RPC || 'https://rpc.hyperliquid-testnet.xyz/evm',
    apiUrl: process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz',
    apiKey: process.env.HYPERLIQUID_API_KEY,
  };

  return new HyperliquidService(config);
}

// Export additional utility functions for HyperEVM integration
export class HyperliquidUtils {
  /**
   * Validate HyperEVM address format
   */
  static isValidHyperEVMAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Check if address is a known HyperEVM precompile
   */
  static isHyperEVMPrecompile(address: string): boolean {
    const precompiles = [
      '0x0000000000000000000000000000000000000800', // READ_BASE
      '0x0000000000000000000000000000000000000801', // PERP_POSITIONS
      '0x0000000000000000000000000000000000000802', // SPOT_BALANCES
      '0x0000000000000000000000000000000000000803', // VAULT_EQUITY
      '0x0000000000000000000000000000000000000804', // STAKING_DELEGATIONS
      '0x0000000000000000000000000000000000000805', // L1_BLOCK_NUMBER
      '0x0000000000000000000000000000000000000807', // ORACLE_PRICES
      '0x000000000000000000000000000000000000080a', // PERP_ASSET_INFO
      '0x3333333333333333333333333333333333333333', // CORE_WRITER
      '0x2222222222222222222222222222222222222222', // HYPE_TRANSFER
      '0x5555555555555555555555555555555555555555'  // WRAPPED_HYPE
    ];
    
    return precompiles.includes(address.toLowerCase());
  }

  /**
   * Get precompile name by address
   */
  static getPrecompileName(address: string): string | null {
    const precompileNames: Record<string, string> = {
      '0x0000000000000000000000000000000000000800': 'READ_BASE',
      '0x0000000000000000000000000000000000000801': 'PERP_POSITIONS',
      '0x0000000000000000000000000000000000000802': 'SPOT_BALANCES',
      '0x0000000000000000000000000000000000000803': 'VAULT_EQUITY',
      '0x0000000000000000000000000000000000000804': 'STAKING_DELEGATIONS',
      '0x0000000000000000000000000000000000000805': 'L1_BLOCK_NUMBER',
      '0x0000000000000000000000000000000000000807': 'ORACLE_PRICES',
      '0x000000000000000000000000000000000000080a': 'PERP_ASSET_INFO',
      '0x3333333333333333333333333333333333333333': 'CORE_WRITER',
      '0x2222222222222222222222222222222222222222': 'HYPE_TRANSFER',
      '0x5555555555555555555555555555555555555555': 'WRAPPED_HYPE'
    };
    
    return precompileNames[address.toLowerCase()] || null;
  }

  /**
   * Convert HYPE amount to wei (18 decimals)
   */
  static hyipeToWei(hype: string): bigint {
    const [whole, fractional = ''] = hype.split('.');
    const paddedFractional = fractional.padEnd(18, '0').slice(0, 18);
    return BigInt(whole) * BigInt(10 ** 18) + BigInt(paddedFractional);
  }

  /**
   * Convert wei to HYPE (18 decimals)
   */
  static weiToHype(wei: bigint): string {
    const divisor = BigInt(10 ** 18);
    const wholePart = wei / divisor;
    const fractionalPart = wei % divisor;
    return `${wholePart.toString()}.${fractionalPart.toString().padStart(18, '0')}`;
  }
}

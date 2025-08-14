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

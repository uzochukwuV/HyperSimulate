import { Logger } from 'pino';
import { Address, bytesToHex, hexToBytes, setLengthLeft } from '@ethereumjs/util';
import { createPublicClient, http, PublicClient } from 'viem';

// CoreWriter action types based on Hyperliquid documentation
export interface CoreWriterAction {
  actionType: 'order' | 'cancel' | 'transfer' | 'withdraw' | 'stake' | 'unstake' | 'vault_transfer';
  encodingVersion: number; // Currently only version 1 is supported
  actionId: number; // Unique action ID (bytes 2-4)
  data: Uint8Array; // Action-specific encoded data
}

export interface LimitOrderAction extends CoreWriterAction {
  actionType: 'order';
  asset: number;
  isBuy: boolean;
  limitPx: bigint;
  sz: bigint;
  cloid?: string;
  orderType?: 'Limit' | 'Market' | 'Stop' | 'StopLimit';
}

export interface CancelOrderAction extends CoreWriterAction {
  actionType: 'cancel';
  asset: number;
  cloid: string;
}

export interface TransferAction extends CoreWriterAction {
  actionType: 'transfer';
  destination: string;
  amount: bigint;
  token: string;
}

export interface VaultTransferAction extends CoreWriterAction {
  actionType: 'vault_transfer';
  vaultAddress: string;
  isDeposit: boolean;
  amount: bigint;
}

export interface CoreWriterSimulationResult {
  success: boolean;
  gasUsed: number;
  actionEncoded: string;
  estimatedDelay: number; // In seconds
  log?: {
    address: string;
    topics: string[];
    data: string;
  };
  error?: string;
  hyperCoreEffect?: {
    type: string;
    description: string;
    estimatedExecution: number; // Timestamp
  };
}

export class CoreWriterSimulator {
  private readonly CORE_WRITER_ADDRESS = '0x3333333333333333333333333333333333333333';
  private readonly BASE_GAS_COST = 47000;
  private readonly ACTION_DELAY_SECONDS = 3;
  
  private publicClient: PublicClient;
  private logger: Logger;

  constructor(rpcUrl: string, logger: Logger) {
    this.logger = logger;
    this.publicClient = createPublicClient({
      transport: http(rpcUrl, {
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
      })
    });
  }

  /**
   * Simulate a CoreWriter action without executing it
   */
  async simulateAction(action: CoreWriterAction): Promise<CoreWriterSimulationResult> {
    try {
      // Encode the action according to Hyperliquid specification
      const encodedAction = this.encodeAction(action);
      
      // Estimate gas for the CoreWriter call
      const gasEstimate = await this.estimateGas(encodedAction);
      
      // Calculate estimated execution time (current time + delay)
      const estimatedExecution = Date.now() + (this.ACTION_DELAY_SECONDS * 1000);
      
      // Generate expected log emission
      const expectedLog = this.generateExpectedLog(action, encodedAction);
      
      return {
        success: true,
        gasUsed: gasEstimate,
        actionEncoded: bytesToHex(encodedAction),
        estimatedDelay: this.ACTION_DELAY_SECONDS,
        log: expectedLog,
        hyperCoreEffect: {
          type: action.actionType,
          description: this.getActionDescription(action),
          estimatedExecution
        }
      };
    } catch (error) {
      this.logger.error('CoreWriter simulation failed:', error);
      return {
        success: false,
        gasUsed: this.BASE_GAS_COST,
        actionEncoded: '0x',
        estimatedDelay: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Encode action according to Hyperliquid specification
   * Byte 1: Encoding version (currently only version 1)
   * Bytes 2-4: Unique action ID
   * Remaining bytes: Action-specific data
   */
  private encodeAction(action: CoreWriterAction): Uint8Array {
    const version = new Uint8Array([action.encodingVersion]);
    const actionId = new Uint8Array(3);
    
    // Encode action ID as 3 bytes (big endian)
    actionId[0] = (action.actionId >> 16) & 0xFF;
    actionId[1] = (action.actionId >> 8) & 0xFF;
    actionId[2] = action.actionId & 0xFF;
    
    // Combine version, action ID, and action data
    const encoded = new Uint8Array(1 + 3 + action.data.length);
    encoded.set(version, 0);
    encoded.set(actionId, 1);
    encoded.set(action.data, 4);
    
    return encoded;
  }

  /**
   * Create a limit order action
   */
  createLimitOrderAction(params: {
    asset: number;
    isBuy: boolean;
    limitPx: string; // Price as string to avoid precision issues
    sz: string; // Size as string
    cloid?: string;
  }): LimitOrderAction {
    // Encode limit order data (simplified - would need full Hyperliquid encoding)
    const data = new Uint8Array(64); // Placeholder size
    const dataView = new DataView(data.buffer);
    
    // Asset index (4 bytes)
    dataView.setUint32(0, params.asset, false);
    
    // Buy/sell flag (1 byte)
    dataView.setUint8(4, params.isBuy ? 1 : 0);
    
    // Price (8 bytes) - simplified encoding
    const price = BigInt(params.limitPx);
    dataView.setBigUint64(8, price, false);
    
    // Size (8 bytes)
    const size = BigInt(params.sz);
    dataView.setBigUint64(16, size, false);
    
    // Client order ID (16 bytes) - simplified
    if (params.cloid) {
      const cloidBytes = new TextEncoder().encode(params.cloid.slice(0, 16));
      data.set(cloidBytes, 24);
    }
    
    return {
      actionType: 'order',
      encodingVersion: 1,
      actionId: 1001, // Limit order action ID
      data,
      asset: params.asset,
      isBuy: params.isBuy,
      limitPx: price,
      sz: size,
      cloid: params.cloid
    };
  }

  /**
   * Create a cancel order action
   */
  createCancelOrderAction(params: {
    asset: number;
    cloid: string;
  }): CancelOrderAction {
    const data = new Uint8Array(32);
    const dataView = new DataView(data.buffer);
    
    // Asset index
    dataView.setUint32(0, params.asset, false);
    
    // Client order ID
    const cloidBytes = new TextEncoder().encode(params.cloid.slice(0, 16));
    data.set(cloidBytes, 4);
    
    return {
      actionType: 'cancel',
      encodingVersion: 1,
      actionId: 1002, // Cancel order action ID
      data,
      asset: params.asset,
      cloid: params.cloid
    };
  }

  /**
   * Create a vault transfer action
   */
  createVaultTransferAction(params: {
    vaultAddress: string;
    isDeposit: boolean;
    amount: string;
  }): VaultTransferAction {
    const data = new Uint8Array(64);
    const dataView = new DataView(data.buffer);
    
    // Vault address (20 bytes)
    const vaultBytes = hexToBytes(params.vaultAddress as any);
    data.set(vaultBytes, 0);
    
    // Deposit/withdraw flag
    dataView.setUint8(20, params.isDeposit ? 1 : 0);
    
    // Amount (8 bytes)
    const amount = BigInt(params.amount);
    dataView.setBigUint64(24, amount, false);
    
    return {
      actionType: 'vault_transfer',
      encodingVersion: 1,
      actionId: 1003, // Vault transfer action ID
      data,
      vaultAddress: params.vaultAddress,
      isDeposit: params.isDeposit,
      amount
    };
  }

  /**
   * Estimate gas for CoreWriter action
   */
  private async estimateGas(encodedAction: Uint8Array): Promise<number> {
    try {
      const txData = {
        to: this.CORE_WRITER_ADDRESS,
        data: bytesToHex(encodedAction)
      };
      
      const gasEstimate = await this.publicClient.estimateGas(txData as any);
      return Number(gasEstimate);
    } catch (error) {
      this.logger.warn('Gas estimation failed, using base cost:', error);
      return this.BASE_GAS_COST;
    }
  }

  /**
   * Generate expected log emission for CoreWriter action
   */
  private generateExpectedLog(action: CoreWriterAction, encodedAction: Uint8Array) {
    return {
      address: this.CORE_WRITER_ADDRESS,
      topics: [
        '0x' + action.actionType.padEnd(64, '0'), // Action type topic
        '0x' + action.actionId.toString(16).padStart(64, '0') // Action ID topic
      ],
      data: bytesToHex(encodedAction)
    };
  }

  /**
   * Get human-readable description of action
   */
  private getActionDescription(action: CoreWriterAction): string {
    switch (action.actionType) {
      case 'order':
        const orderAction = action as LimitOrderAction;
        return `${orderAction.isBuy ? 'Buy' : 'Sell'} order for asset ${orderAction.asset}`;
      case 'cancel':
        const cancelAction = action as CancelOrderAction;
        return `Cancel order ${cancelAction.cloid} for asset ${cancelAction.asset}`;
      case 'vault_transfer':
        const vaultAction = action as VaultTransferAction;
        return `${vaultAction.isDeposit ? 'Deposit to' : 'Withdraw from'} vault ${vaultAction.vaultAddress}`;
      default:
        return `${action.actionType} action`;
    }
  }

  /**
   * Batch simulate multiple CoreWriter actions
   */
  async simulateActionBatch(actions: CoreWriterAction[]): Promise<{
    results: CoreWriterSimulationResult[];
    totalGasUsed: number;
    estimatedBatchDelay: number;
  }> {
    const results: CoreWriterSimulationResult[] = [];
    let totalGasUsed = 0;
    
    for (const action of actions) {
      const result = await this.simulateAction(action);
      results.push(result);
      totalGasUsed += result.gasUsed;
    }
    
    // Batch delay is the same as individual action delay
    const estimatedBatchDelay = this.ACTION_DELAY_SECONDS;
    
    return {
      results,
      totalGasUsed,
      estimatedBatchDelay
    };
  }

  /**
   * Validate CoreWriter action parameters
   */
  validateAction(action: CoreWriterAction): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (action.encodingVersion !== 1) {
      errors.push('Only encoding version 1 is supported');
    }
    
    if (action.actionId < 1000 || action.actionId > 9999) {
      errors.push('Action ID must be between 1000 and 9999');
    }
    
    if (!action.data || action.data.length === 0) {
      errors.push('Action data cannot be empty');
    }
    
    // Action-specific validation
    switch (action.actionType) {
      case 'order':
        const orderAction = action as LimitOrderAction;
        if (orderAction.asset < 0) {
          errors.push('Asset index must be non-negative');
        }
        if (orderAction.limitPx <= 0n) {
          errors.push('Limit price must be positive');
        }
        if (orderAction.sz <= 0n) {
          errors.push('Order size must be positive');
        }
        break;
        
      case 'vault_transfer':
        const vaultAction = action as VaultTransferAction;
        if (!vaultAction.vaultAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
          errors.push('Invalid vault address format');
        }
        if (vaultAction.amount <= 0n) {
          errors.push('Transfer amount must be positive');
        }
        break;
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
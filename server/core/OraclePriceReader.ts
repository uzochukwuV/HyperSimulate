import { Logger } from 'pino';
import { createPublicClient, http, PublicClient } from 'viem';
import { bytesToHex, hexToBytes } from '@ethereumjs/util';

// Oracle and asset info interfaces based on Hyperliquid documentation
export interface PerpAssetInfo {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
}

export interface OraclePrice {
  price: bigint;
  convertedPrice: bigint; // Price converted to 18 decimals
  assetIndex: number;
  timestamp: number;
}

export interface OracleAnalysis {
  currentPrices: Map<number, OraclePrice>;
  priceHistory: Map<number, OraclePrice[]>;
  volatilityMetrics: Map<number, VolatilityMetric>;
  arbitrageOpportunities: ArbitrageOpportunity[];
}

export interface VolatilityMetric {
  assetIndex: number;
  averagePrice: bigint;
  priceStdDev: number;
  volatilityScore: 'LOW' | 'MEDIUM' | 'HIGH';
  lastUpdated: number;
}

export interface ArbitrageOpportunity {
  asset1: number;
  asset2: number;
  priceDifference: bigint;
  percentageDiff: number;
  profitability: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedGasRequired: number;
}

export class OraclePriceReader {
  private readonly ORACLE_PRICE_PRECOMPILE = '0x0000000000000000000000000000000000000807';
  private readonly PERP_ASSET_INFO_PRECOMPILE = '0x000000000000000000000000000000000000080a';
  private readonly BASE_GAS_COST = 2000;
  private readonly OUTPUT_GAS_MULTIPLIER = 65;
  
  private publicClient: PublicClient;
  private logger: Logger;
  private priceCache: Map<number, OraclePrice> = new Map();
  private assetInfoCache: Map<number, PerpAssetInfo> = new Map();

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
   * Read oracle price for a specific asset
   */
  async readOraclePrice(assetIndex: number): Promise<OraclePrice> {
    try {
      // Check cache first
      const cached = this.priceCache.get(assetIndex);
      if (cached && Date.now() - cached.timestamp < 5000) { // 5 second cache
        return cached;
      }

      // Encode asset index as 32-byte parameter
      const encodedIndex = this.encodeAssetIndex(assetIndex);
      
      // Call oracle price precompile
      const result = await this.publicClient.call({
        to: this.ORACLE_PRICE_PRECOMPILE,
        data: bytesToHex(encodedIndex)
      });

      if (!result.data) {
        throw new Error('No data returned from oracle precompile');
      }

      // Decode the returned price (assuming 8-byte uint64)
      const priceBytes = hexToBytes(result.data as any);
      const rawPrice = this.decodeUint64(priceBytes);
      
      // Get asset info for price conversion
      const assetInfo = await this.readPerpAssetInfo(assetIndex);
      
      // Convert price to 18 decimals: (rawPrice * 1e18) / (10 ** (6 - szDecimals))
      const divisor = BigInt(10 ** (6 - assetInfo.szDecimals));
      const convertedPrice = (rawPrice * BigInt(1e18)) / divisor;
      
      const oraclePrice: OraclePrice = {
        price: rawPrice,
        convertedPrice,
        assetIndex,
        timestamp: Date.now()
      };
      
      // Cache the result
      this.priceCache.set(assetIndex, oraclePrice);
      
      this.logger.debug(`Oracle price for asset ${assetIndex}: ${convertedPrice.toString()}`);
      
      return oraclePrice;
    } catch (error) {
      this.logger.error(`Failed to read oracle price for asset ${assetIndex}:`, error);
      throw error;
    }
  }

  /**
   * Read perpetual asset information
   */
  async readPerpAssetInfo(perpIndex: number): Promise<PerpAssetInfo> {
    try {
      // Check cache first
      const cached = this.assetInfoCache.get(perpIndex);
      if (cached) {
        return cached;
      }

      // Encode perp index as 32-byte parameter
      const encodedIndex = this.encodeAssetIndex(perpIndex);
      
      // Call perp asset info precompile
      const result = await this.publicClient.call({
        to: this.PERP_ASSET_INFO_PRECOMPILE,
        data: bytesToHex(encodedIndex)
      });

      if (!result.data) {
        throw new Error('No data returned from perp asset info precompile');
      }

      // Decode asset info (simplified - would need actual encoding spec)
      const infoBytes = hexToBytes(result.data as any);
      const assetInfo = this.decodePerpAssetInfo(infoBytes, perpIndex);
      
      // Cache the result
      this.assetInfoCache.set(perpIndex, assetInfo);
      
      return assetInfo;
    } catch (error) {
      this.logger.error(`Failed to read perp asset info for ${perpIndex}:`, error);
      // Return default values if we can't read from precompile
      return {
        name: `Asset_${perpIndex}`,
        szDecimals: 5, // Default value based on docs
        maxLeverage: 20,
        onlyIsolated: false
      };
    }
  }

  /**
   * Read multiple oracle prices efficiently
   */
  async readMultiplePrices(assetIndexes: number[]): Promise<Map<number, OraclePrice>> {
    const prices = new Map<number, OraclePrice>();
    
    // Read prices in parallel
    const pricePromises = assetIndexes.map(async (index) => {
      try {
        const price = await this.readOraclePrice(index);
        return { index, price };
      } catch (error) {
        this.logger.warn(`Failed to read price for asset ${index}:`, error);
        return null;
      }
    });
    
    const results = await Promise.allSettled(pricePromises);
    
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        prices.set(result.value.index, result.value.price);
      }
    });
    
    return prices;
  }

  /**
   * Analyze oracle prices for insights
   */
  async analyzeOraclePrices(assetIndexes: number[]): Promise<OracleAnalysis> {
    const currentPrices = await this.readMultiplePrices(assetIndexes);
    const priceHistory = new Map<number, OraclePrice[]>();
    const volatilityMetrics = new Map<number, VolatilityMetric>();
    const arbitrageOpportunities: ArbitrageOpportunity[] = [];
    
    // Calculate basic volatility metrics (simplified)
    for (const [assetIndex, price] of currentPrices) {
      const metric: VolatilityMetric = {
        assetIndex,
        averagePrice: price.convertedPrice,
        priceStdDev: 0, // Would need historical data
        volatilityScore: 'MEDIUM', // Simplified
        lastUpdated: price.timestamp
      };
      volatilityMetrics.set(assetIndex, metric);
    }
    
    // Look for arbitrage opportunities (simplified example)
    const priceArray = Array.from(currentPrices.entries());
    for (let i = 0; i < priceArray.length; i++) {
      for (let j = i + 1; j < priceArray.length; j++) {
        const [asset1, price1] = priceArray[i];
        const [asset2, price2] = priceArray[j];
        
        const priceDiff = price1.convertedPrice > price2.convertedPrice 
          ? price1.convertedPrice - price2.convertedPrice
          : price2.convertedPrice - price1.convertedPrice;
        
        const avgPrice = (price1.convertedPrice + price2.convertedPrice) / 2n;
        const percentageDiff = Number((priceDiff * 100n) / avgPrice);
        
        if (percentageDiff > 0.1) { // 0.1% difference threshold
          arbitrageOpportunities.push({
            asset1,
            asset2,
            priceDifference: priceDiff,
            percentageDiff,
            profitability: percentageDiff > 1 ? 'HIGH' : percentageDiff > 0.5 ? 'MEDIUM' : 'LOW',
            estimatedGasRequired: 150000 // Estimated gas for arbitrage transaction
          });
        }
      }
    }
    
    return {
      currentPrices,
      priceHistory,
      volatilityMetrics,
      arbitrageOpportunities
    };
  }

  /**
   * Simulate oracle price changes and their effects
   */
  async simulatePriceImpact(assetIndex: number, priceChangePercent: number): Promise<{
    originalPrice: OraclePrice;
    simulatedPrice: bigint;
    impactAnalysis: {
      liquidationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
      marginRequirements: bigint;
      estimatedVolume: bigint;
    };
  }> {
    const originalPrice = await this.readOraclePrice(assetIndex);
    const priceChange = (originalPrice.convertedPrice * BigInt(Math.abs(priceChangePercent * 100))) / 10000n;
    
    const simulatedPrice = priceChangePercent > 0 
      ? originalPrice.convertedPrice + priceChange
      : originalPrice.convertedPrice - priceChange;
    
    // Simplified impact analysis
    const impactAnalysis = {
      liquidationRisk: Math.abs(priceChangePercent) > 10 ? 'HIGH' : 
                      Math.abs(priceChangePercent) > 5 ? 'MEDIUM' : 'LOW',
      marginRequirements: simulatedPrice / 20n, // Simplified 5% margin requirement
      estimatedVolume: BigInt(Math.floor(Math.abs(priceChangePercent) * 1000000)) // Simplified volume estimation
    } as const;
    
    return {
      originalPrice,
      simulatedPrice,
      impactAnalysis
    };
  }

  /**
   * Get estimated gas cost for oracle price reading
   */
  getOracleGasCost(outputLength: number = 8): number {
    return this.BASE_GAS_COST + (this.OUTPUT_GAS_MULTIPLIER * outputLength);
  }

  /**
   * Clear price cache
   */
  clearCache(): void {
    this.priceCache.clear();
    this.assetInfoCache.clear();
  }

  /**
   * Get cached prices
   */
  getCachedPrices(): Map<number, OraclePrice> {
    return new Map(this.priceCache);
  }

  // Private helper methods
  
  private encodeAssetIndex(index: number): Uint8Array {
    const encoded = new Uint8Array(32);
    const view = new DataView(encoded.buffer);
    view.setUint32(28, index, false); // Big endian, last 4 bytes
    return encoded;
  }

  private decodeUint64(bytes: Uint8Array): bigint {
    if (bytes.length < 8) {
      throw new Error('Insufficient bytes for uint64 decoding');
    }
    
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    return view.getBigUint64(0, false); // Big endian
  }

  private decodePerpAssetInfo(bytes: Uint8Array, index: number): PerpAssetInfo {
    // Simplified decoding - would need actual specification
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    
    return {
      name: `PERP_${index}`, // Would decode actual name
      szDecimals: bytes.length > 4 ? view.getUint8(4) : 5,
      maxLeverage: bytes.length > 8 ? view.getUint32(8, false) : 20,
      onlyIsolated: bytes.length > 12 ? view.getUint8(12) !== 0 : false
    };
  }
}

// Utility functions for price formatting and conversion
export class PriceUtils {
  /**
   * Format price for display
   */
  static formatPrice(price: bigint, decimals: number = 18): string {
    const divisor = BigInt(10 ** decimals);
    const wholePart = price / divisor;
    const fractionalPart = price % divisor;
    
    return `${wholePart.toString()}.${fractionalPart.toString().padStart(decimals, '0')}`;
  }

  /**
   * Convert price from human-readable string to bigint
   */
  static parsePrice(priceString: string, decimals: number = 18): bigint {
    const [whole, fractional = ''] = priceString.split('.');
    const paddedFractional = fractional.padEnd(decimals, '0').slice(0, decimals);
    
    return BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFractional);
  }

  /**
   * Calculate percentage change between two prices
   */
  static calculatePercentageChange(oldPrice: bigint, newPrice: bigint): number {
    if (oldPrice === 0n) return 0;
    
    const change = newPrice - oldPrice;
    const percentageChange = (Number(change) / Number(oldPrice)) * 100;
    
    return Math.round(percentageChange * 10000) / 10000; // Round to 4 decimal places
  }
}
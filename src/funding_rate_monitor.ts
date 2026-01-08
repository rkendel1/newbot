import { Hyperliquid } from 'hyperliquid';
import { Spot } from '@binance/connector';
import * as dotenv from 'dotenv';
import { DEFAULTS, SpreadHistoryEntry } from './config';

dotenv.config();

export interface FundingRates {
  hlRate: number;
  binRate: number;
}

export interface Opportunity {
  sideHl: 'LONG' | 'SHORT';
  sideBin: 'LONG' | 'SHORT';
  spread: number;
  dynamicThreshold: number;
}

export const DEFAULT_FUNDING_THRESHOLD = DEFAULTS.MIN_FUNDING_SPREAD;

export class FundingRateMonitor {
  private hlClient: Hyperliquid;
  private binanceClient: any;
  private symbol = 'BTC';  // Hyperliquid uses BTC, not BTCUSDT
  private spreadHistory: SpreadHistoryEntry[] = [];
  private useDynamicSpread: boolean = false;

  constructor(useDynamicSpread: boolean = false) {
    this.useDynamicSpread = useDynamicSpread;
    
    const hlPrivateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (!hlPrivateKey) {
      throw new Error('HYPERLIQUID_PRIVATE_KEY not found in environment variables');
    }

    const binApiKey = process.env.BINANCE_API_KEY;
    const binSecretKey = process.env.BINANCE_SECRET_KEY;
    
    if (!binApiKey || !binSecretKey) {
      console.warn('⚠️  Warning: BINANCE_API_KEY or BINANCE_SECRET_KEY not set');
      console.warn('Binance funding rates may not be available');
    }

    // Initialize Hyperliquid client
    this.hlClient = new Hyperliquid({
      privateKey: hlPrivateKey,
      testnet: false // false = mainnet, true = testnet
    });
    
    // Initialize Binance client
    this.binanceClient = new Spot(binApiKey || '', binSecretKey || '');
  }

  async getFundingRates(): Promise<FundingRates> {
    try {
      // Hyperliquid: Get funding rate from meta and asset context
      const [meta, assetCtxs] = await this.hlClient.info.perpetuals.getMetaAndAssetCtxs();
      const btcIndex = meta.universe.findIndex((u: any) => u.name === this.symbol);
      const hlRate = btcIndex >= 0 && assetCtxs[btcIndex] ? parseFloat(assetCtxs[btcIndex].funding) : 0;

      // Binance: Get funding rate for BTCUSDT perpetual
      const binResponse = await this.binanceClient.fundingRate({ symbol: 'BTCUSDT', limit: 1 });
      const binRate = binResponse.data && binResponse.data.length > 0 
        ? parseFloat(binResponse.data[0].fundingRate) 
        : 0;

      return { hlRate, binRate };
    } catch (error: any) {
      console.error('Error fetching funding rates:', error.message);
      return { hlRate: 0, binRate: 0 };
    }
  }

  async detectOpportunity(threshold: number = DEFAULT_FUNDING_THRESHOLD): Promise<Opportunity | null> {
    try {
      const { hlRate, binRate } = await this.getFundingRates();
      
      if (hlRate === 0 || binRate === 0) {
        return null; // Invalid rates
      }

      const spread = hlRate - binRate;
      
      // Store spread in history for volatility calculation
      this.addSpreadToHistory(spread);
      
      // Calculate dynamic threshold if enabled
      const dynamicThreshold = this.useDynamicSpread 
        ? this.calculateDynamicThreshold(threshold)
        : threshold;
      
      if (Math.abs(spread) > dynamicThreshold) {
        // If HL rate > Bin rate, long HL (collect positive funding), short Bin
        if (spread > 0) {
          return { 
            sideHl: 'LONG', 
            sideBin: 'SHORT',
            spread,
            dynamicThreshold
          };
        } else {
          return { 
            sideHl: 'SHORT', 
            sideBin: 'LONG',
            spread,
            dynamicThreshold
          };
        }
      }
      
      return null;
    } catch (error: any) {
      console.error('Error detecting opportunity:', error.message);
      return null;
    }
  }

  /**
   * Add spread to history for volatility tracking
   */
  private addSpreadToHistory(spread: number): void {
    const now = new Date();
    this.spreadHistory.push({ timestamp: now, spread });
    
    // Clean up old entries beyond lookback period
    const cutoffTime = new Date(now.getTime() - DEFAULTS.VOLATILITY_LOOKBACK * 1000);
    this.spreadHistory = this.spreadHistory.filter(
      entry => entry.timestamp >= cutoffTime
    );
  }

  /**
   * Calculate realized volatility of funding spread over lookback period
   */
  private calculateVolatility(): number {
    if (this.spreadHistory.length < 2) {
      return 0;
    }

    const spreads = this.spreadHistory.map(entry => entry.spread);
    const mean = spreads.reduce((sum, val) => sum + val, 0) / spreads.length;
    
    const squaredDiffs = spreads.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / spreads.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate dynamic spread threshold based on market volatility
   */
  private calculateDynamicThreshold(baseThreshold: number): number {
    const volatility = this.calculateVolatility();
    const dynamicThreshold = baseThreshold + (volatility * DEFAULTS.SPREAD_BUFFER_MULTIPLIER);
    
    return dynamicThreshold;
  }

  /**
   * Get spread history for logging/analysis
   */
  public getSpreadHistory(): SpreadHistoryEntry[] {
    return [...this.spreadHistory];
  }

  /**
   * Get current volatility metric
   */
  public getCurrentVolatility(): number {
    return this.calculateVolatility();
  }
}

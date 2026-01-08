/**
 * Apex Omni ↔ Coinbase Funding Rate Monitor
 * 
 * This module monitors funding rates for Apex Omni exchange and Coinbase Perpetual Futures,
 * detecting arbitrage opportunities between the two U.S.-legal exchanges.
 * 
 * Uses official Apex TypeScript connector for WebSocket connections.
 */

import EventEmitter from 'events';
import * as dotenv from 'dotenv';
import { ApexExchange, ApexConfig } from './apex_exchange';
import { CoinbasePerps, CoinbasePerpsConfig } from './coinbase_perps';
import { DEFAULTS, SpreadHistoryEntry } from './config';

dotenv.config();

export interface FundingRates {
  apexRate: number;
  coinbaseRate: number;
}

export interface Opportunity {
  sideApex: 'LONG' | 'SHORT';
  sideCoinbase: 'LONG' | 'SHORT';
  spread: number;
  dynamicThreshold: number;
}

export const DEFAULT_FUNDING_THRESHOLD = DEFAULTS.MIN_FUNDING_SPREAD;

export class FundingRateMonitor extends EventEmitter {
  private apexClient: ApexExchange;
  private coinbaseClient: CoinbasePerps;
  private symbol: string;
  private apexSymbol: string; // Apex uses different symbol format (e.g., BTC-USDC)
  private coinbaseSymbol: string; // Coinbase uses different format (e.g., BTC-PERP)
  private spreadHistory: SpreadHistoryEntry[] = [];
  private useDynamicSpread: boolean = false;
  private currentApexRate: number = 0;
  private currentCoinbaseRate: number = 0;

  constructor(useDynamicSpread: boolean = false) {
    super();
    this.useDynamicSpread = useDynamicSpread;
    
    const symbol = process.env.SYMBOL || 'BTCUSDT';
    this.symbol = symbol;
    
    // Convert Binance symbol format to Apex format
    // BTCUSDT -> BTC-USDC (Apex typically uses USDC)
    this.apexSymbol = this.convertToApexSymbol(symbol);
    
    // Convert to Coinbase format
    // BTCUSDT -> BTC-PERP
    this.coinbaseSymbol = this.convertToCoinbaseSymbol(symbol);

    // Load Apex credentials from environment
    const apexBaseUrl = process.env.APEX_BASE_URL || 'https://omni.apex.exchange';
    const starkPrivateKey = process.env.APEX_STARK_PRIVATE_KEY;
    const starkPublicKey = process.env.APEX_STARK_PUBLIC_KEY;
    const accountId = process.env.APEX_ACCOUNT_ID;
    const positionId = process.env.APEX_POSITION_ID;
    
    if (!starkPrivateKey || !starkPublicKey) {
      throw new Error('APEX_STARK_PRIVATE_KEY and APEX_STARK_PUBLIC_KEY not found in environment variables');
    }
    
    if (!accountId || !positionId) {
      throw new Error('APEX_ACCOUNT_ID and APEX_POSITION_ID not found in environment variables');
    }

    const coinbaseApiKey = process.env.COINBASE_API_KEY;
    const coinbaseApiSecret = process.env.COINBASE_API_SECRET;
    const coinbasePassphrase = process.env.COINBASE_API_PASSPHRASE;
    
    if (!coinbaseApiKey || !coinbaseApiSecret || !coinbasePassphrase) {
      console.warn('⚠️  Notice: COINBASE_API_KEY, COINBASE_API_SECRET, or COINBASE_API_PASSPHRASE not set');
      console.warn('   Public endpoints (like funding rates) will work without credentials.');
      console.warn('   Trading functionality will require valid API credentials.');
    }

    // Initialize Apex client
    const apexConfig: ApexConfig = {
      baseUrl: apexBaseUrl,
      starkPrivateKey,
      starkPublicKey,
      accountId,
      positionId,
    };

    this.apexClient = new ApexExchange(apexConfig);

    // Initialize Coinbase client
    const coinbaseConfig: CoinbasePerpsConfig = {
      apiKey: coinbaseApiKey || '',
      apiSecret: coinbaseApiSecret || '',
      passphrase: coinbasePassphrase || '',
    };
    this.coinbaseClient = new CoinbasePerps(coinbaseConfig);
  }

  /**
   * Convert Binance symbol format to Coinbase format
   * 
   * Coinbase uses hyphenated format with -PERP suffix:
   * - BTCUSDT -> BTC-PERP
   * - ETHUSDT -> ETH-PERP
   * 
   * @param binanceSymbol - Symbol in Binance format (e.g., 'BTCUSDT')
   * @returns Symbol in Coinbase format (e.g., 'BTC-PERP')
   */
  private convertToCoinbaseSymbol(binanceSymbol: string): string {
    // Mapping table for known pairs
    const symbolMap: Record<string, string> = {
      'BTCUSDT': 'BTC-PERP',
      'ETHUSDT': 'ETH-PERP',
    };
    
    // Check if we have an explicit mapping
    if (symbolMap[binanceSymbol]) {
      return symbolMap[binanceSymbol];
    }
    
    // Fallback: Try to extract base currency from USDT pair
    if (binanceSymbol.endsWith('USDT')) {
      const base = binanceSymbol.replace(/USDT$/, '');
      console.warn(
        `⚠️  No explicit mapping for ${binanceSymbol}, using fallback conversion: ${base}-PERP`
      );
      console.warn(
        `   Verify this is correct on Coinbase. Add to symbolMap if needed.`
      );
      return `${base}-PERP`;
    }
    
    // If it doesn't end with USDT, we can't convert it
    throw new Error(
      `Cannot convert symbol ${binanceSymbol} to Coinbase format. ` +
      `Coinbase uses PERP suffix (e.g., BTC-PERP). ` +
      `Please add ${binanceSymbol} to the symbol mapping table in apex_funding_monitor.ts`
    );
  }

  /**
   * Convert Binance symbol format to Apex format
   * 
   * Apex uses hyphenated format with USDC as quote currency:
   * - BTCUSDT -> BTC-USDC
   * - ETHUSDT -> ETH-USDC
   * - SOLUSDT -> SOL-USDC
   * 
   * @param binanceSymbol - Symbol in Binance format (e.g., 'BTCUSDT')
   * @returns Symbol in Apex format (e.g., 'BTC-USDC')
   */
  private convertToApexSymbol(binanceSymbol: string): string {
    // Mapping table for known pairs
    const symbolMap: Record<string, string> = {
      'BTCUSDT': 'BTC-USDT',
      'ETHUSDT': 'ETH-USDT',
      'SOLUSDT': 'SOL-USDT',
      'AVAXUSDT': 'AVAX-USDT',
      'BNBUSDT': 'BNB-USDT',
      'ADAUSDT': 'ADA-USDT',
      'DOTUSDT': 'DOT-USDT',
      'MATICUSDT': 'MATIC-USDT',
    };
    
    // Check if we have an explicit mapping
    if (symbolMap[binanceSymbol]) {
      return symbolMap[binanceSymbol];
    }
    
    // Fallback: Try to extract base currency from USDT pair
    if (binanceSymbol.endsWith('USDT')) {
      const base = binanceSymbol.replace(/USDT$/, '');
      console.warn(
        `⚠️  No explicit mapping for ${binanceSymbol}, using fallback conversion: ${base}-USDT`
      );
      console.warn(
        `   Verify this is correct on Apex exchange. Add to symbolMap if needed.`
      );
      return `${base}-USDT`;
    }
    
    // If it doesn't end with USDT, we can't convert it
    throw new Error(
      `Cannot convert symbol ${binanceSymbol} to Apex format. ` +
      `Apex uses USDT pairs (e.g., BTC-USDT). ` +
      `Please add ${binanceSymbol} to the symbol mapping table in apex_funding_monitor.ts`
    );
  }

  start() {
    console.log(`🔌 Starting Apex funding rate monitoring for ${this.apexSymbol}...`);
    
    // Apex doesn't have WebSocket for funding rates in the provided spec
    // We'll use polling instead
    this.startApexPolling();
    
    // Start Coinbase polling as well
    this.subscribeCoinbase();
  }

  /**
   * Poll Apex API for funding rates
   * Since the provided spec doesn't mention WebSocket support for funding rates,
   * we'll poll the REST API periodically
   */
  private startApexPolling() {
    const pollInterval = 60000; // Poll every 60 seconds
    
    console.log(`✅ Apex polling started (every ${pollInterval / 1000}s)`);
    
    // Initial fetch
    this.fetchApexFundingRate();
    
    // Set up periodic polling
    setInterval(() => {
      this.fetchApexFundingRate();
    }, pollInterval);
  }

  /**
   * Fetch funding rate from Apex REST API
   */
  private async fetchApexFundingRate() {
    try {
      const rate = await this.apexClient.getFundingRate(this.apexSymbol);
      this.currentApexRate = rate;
      this.emit('apex_funding', rate);
    } catch (error: any) {
      // Only log error if it's not a "not found" or "no funding rate" error
      if (!error.message.includes('No funding rate') && !error.message.includes('404')) {
        console.error('Error fetching Apex funding rate:', error.message);
      }
      // Keep the last known rate instead of resetting to 0
    }
  }

  /**
   * Poll Coinbase API for funding rates
   * Coinbase doesn't provide WebSocket for funding rates, so we poll periodically
   */
  private subscribeCoinbase() {
    const pollInterval = 60000; // Poll every 60 seconds
    
    console.log(`✅ Coinbase polling started (every ${pollInterval / 1000}s)`);
    
    // Initial fetch
    this.fetchCoinbaseFundingRate();
    
    // Set up periodic polling
    setInterval(() => {
      this.fetchCoinbaseFundingRate();
    }, pollInterval);
  }

  /**
   * Fetch funding rate from Coinbase REST API
   */
  private async fetchCoinbaseFundingRate() {
    try {
      const rate = await this.coinbaseClient.getFundingRate(this.coinbaseSymbol);
      this.currentCoinbaseRate = rate;
      this.emit('coinbase_funding', rate);
    } catch (error: any) {
      // Only log error if it's not a "not found" or "no funding rate" error
      if (!error.message.includes('No funding rate') && !error.message.includes('404')) {
        console.error('Error fetching Coinbase funding rate:', error.message);
      }
      // Keep the last known rate instead of resetting to 0
    }
  }

  /**
   * Get current funding rates for both Apex and Coinbase
   */
  async getFundingRates(): Promise<FundingRates> {
    try {
      // If we have recent data from polling, use it
      if (this.currentApexRate !== 0 && this.currentCoinbaseRate !== 0) {
        return { apexRate: this.currentApexRate, coinbaseRate: this.currentCoinbaseRate };
      }

      // Otherwise fetch from REST APIs as fallback
      const apexRate = await this.apexClient.getFundingRate(this.apexSymbol);
      const coinbaseRate = await this.coinbaseClient.getFundingRate(this.coinbaseSymbol);

      return { apexRate, coinbaseRate };
    } catch (error: any) {
      // Don't log error here since it's already logged in the individual fetch methods
      return { apexRate: this.currentApexRate, coinbaseRate: this.currentCoinbaseRate };
    }
  }

  /**
   * Detect arbitrage opportunity between Apex and Coinbase
   * 
   * @param threshold - Minimum funding spread to consider an opportunity
   * @returns Opportunity object or null if no opportunity exists
   */
  async detectOpportunity(threshold: number = DEFAULT_FUNDING_THRESHOLD): Promise<Opportunity | null> {
    try {
      const { apexRate, coinbaseRate } = await this.getFundingRates();
      
      if (apexRate === 0 || coinbaseRate === 0) {
        return null; // Invalid rates
      }

      const spread = apexRate - coinbaseRate;
      
      // Store spread in history for volatility calculation
      this.addSpreadToHistory(spread);
      
      // Calculate dynamic threshold if enabled
      const dynamicThreshold = this.useDynamicSpread 
        ? this.calculateDynamicThreshold(threshold)
        : threshold;
      
      if (Math.abs(spread) > dynamicThreshold) {
        // If Apex rate > Coinbase rate, long Apex (collect positive funding), short Coinbase
        if (spread > 0) {
          return { 
            sideApex: 'LONG', 
            sideCoinbase: 'SHORT',
            spread,
            dynamicThreshold
          };
        } else {
          return { 
            sideApex: 'SHORT', 
            sideCoinbase: 'LONG',
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

  /**
   * Get the Apex client instance for direct API access
   */
  public getApexClient(): ApexExchange {
    return this.apexClient;
  }

  /**
   * Clean up connections
   */
  public async close(): Promise<void> {
    // Nothing to close for polling-based connections
  }
}

/**
 * Apex Funding Rate Monitor
 * 
 * This module monitors funding rates for Apex Omni exchange and detects
 * arbitrage opportunities when combined with Binance.
 * 
 * Similar to the Bybit monitor but adapted for Apex's API structure.
 */

import EventEmitter from 'events';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import { ApexExchange, ApexConfig } from './apex_exchange';
import { DEFAULTS, SpreadHistoryEntry } from './config';

dotenv.config();

export interface FundingRates {
  apexRate: number;
  binRate: number;
}

export interface Opportunity {
  sideApex: 'LONG' | 'SHORT';
  sideBin: 'LONG' | 'SHORT';
  spread: number;
  dynamicThreshold: number;
}

export const DEFAULT_FUNDING_THRESHOLD = DEFAULTS.MIN_FUNDING_SPREAD;

export class ApexFundingMonitor extends EventEmitter {
  private apexClient: ApexExchange;
  private binanceWS: WebSocket | null = null;
  private symbol: string;
  private apexSymbol: string; // Apex uses different symbol format (e.g., BTC-USDC)
  private spreadHistory: SpreadHistoryEntry[] = [];
  private useDynamicSpread: boolean = false;
  private currentApexRate: number = 0;
  private currentBinanceRate: number = 0;

  constructor(useDynamicSpread: boolean = false) {
    super();
    this.useDynamicSpread = useDynamicSpread;
    
    const symbol = process.env.SYMBOL || 'BTCUSDT';
    this.symbol = symbol;
    
    // Convert Binance symbol format to Apex format
    // BTCUSDT -> BTC-USDC (Apex typically uses USDC)
    this.apexSymbol = this.convertToApexSymbol(symbol);

    // Load Apex credentials from environment
    const apexBaseUrl = process.env.APEX_BASE_URL || 'https://api.apex.exchange/v1';
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

    const binApiKey = process.env.BINANCE_API_KEY;
    const binSecretKey = process.env.BINANCE_SECRET_KEY;
    
    if (!binApiKey || !binSecretKey) {
      console.warn('⚠️  Warning: BINANCE_API_KEY or BINANCE_SECRET_KEY not set');
      console.warn('Binance funding rates may not be available');
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
      'BTCUSDT': 'BTC-USDC',
      'ETHUSDT': 'ETH-USDC',
      'SOLUSDT': 'SOL-USDC',
      'AVAXUSDT': 'AVAX-USDC',
      'BNBUSDT': 'BNB-USDC',
      'ADAUSDT': 'ADA-USDC',
      'DOTUSDT': 'DOT-USDC',
      'MATICUSDT': 'MATIC-USDC',
    };
    
    // Check if we have an explicit mapping
    if (symbolMap[binanceSymbol]) {
      return symbolMap[binanceSymbol];
    }
    
    // Fallback: Try to extract base currency from USDT pair
    if (binanceSymbol.endsWith('USDT')) {
      const base = binanceSymbol.replace(/USDT$/, '');
      console.warn(
        `⚠️  No explicit mapping for ${binanceSymbol}, using fallback conversion: ${base}-USDC`
      );
      console.warn(
        `   Verify this is correct on Apex exchange. Add to symbolMap if needed.`
      );
      return `${base}-USDC`;
    }
    
    // If it doesn't end with USDT, we can't convert it
    throw new Error(
      `Cannot convert symbol ${binanceSymbol} to Apex format. ` +
      `Apex uses USDC pairs (e.g., BTC-USDC). ` +
      `Please add ${binanceSymbol} to the symbol mapping table in apex_funding_monitor.ts`
    );
  }

  start() {
    console.log(`🔌 Starting Apex funding rate monitoring for ${this.apexSymbol}...`);
    
    // Apex doesn't have WebSocket for funding rates in the provided spec
    // We'll use polling instead
    this.startApexPolling();
    
    // Start Binance WebSocket as before
    this.subscribeBinance();
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
      console.error('Error fetching Apex funding rate:', error.message);
    }
  }

  /**
   * Subscribe to Binance funding rate updates via WebSocket
   */
  private subscribeBinance() {
    const wsUrl = `wss://fstream.binance.com/ws/${this.symbol.toLowerCase()}@markPrice`;
    this.binanceWS = new WebSocket(wsUrl);

    this.binanceWS.on('open', () => console.log('✅ Binance WS connected.'));
    
    this.binanceWS.on('message', (msg: any) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.r) { // 'r' is the funding rate field in mark price stream
          const rate = parseFloat(data.r);
          this.currentBinanceRate = rate;
          this.emit('binance_funding', rate);
        }
      } catch (error: any) {
        console.error('Error processing Binance message:', error.message);
      }
    });

    this.binanceWS.on('error', (err: any) => {
      console.error('Binance WS error:', err);
    });

    this.binanceWS.on('close', () => {
      console.log('Binance WS closed, reconnecting...');
      setTimeout(() => this.subscribeBinance(), 5000);
    });
  }

  /**
   * Get current funding rates for both Apex and Binance
   */
  async getFundingRates(): Promise<FundingRates> {
    try {
      // If we have recent data from polling/WebSocket, use it
      if (this.currentApexRate !== 0 && this.currentBinanceRate !== 0) {
        return { apexRate: this.currentApexRate, binRate: this.currentBinanceRate };
      }

      // Otherwise fetch from REST APIs as fallback
      const apexRate = await this.apexClient.getFundingRate(this.apexSymbol);
      const binRate = this.currentBinanceRate;

      return { apexRate, binRate };
    } catch (error: any) {
      console.error('Error fetching funding rates:', error.message);
      return { apexRate: 0, binRate: 0 };
    }
  }

  /**
   * Detect arbitrage opportunity between Apex and Binance
   * 
   * @param threshold - Minimum funding spread to consider an opportunity
   * @returns Opportunity object or null if no opportunity exists
   */
  async detectOpportunity(threshold: number = DEFAULT_FUNDING_THRESHOLD): Promise<Opportunity | null> {
    try {
      const { apexRate, binRate } = await this.getFundingRates();
      
      if (apexRate === 0 || binRate === 0) {
        return null; // Invalid rates
      }

      const spread = apexRate - binRate;
      
      // Store spread in history for volatility calculation
      this.addSpreadToHistory(spread);
      
      // Calculate dynamic threshold if enabled
      const dynamicThreshold = this.useDynamicSpread 
        ? this.calculateDynamicThreshold(threshold)
        : threshold;
      
      if (Math.abs(spread) > dynamicThreshold) {
        // If Apex rate > Binance rate, long Apex (collect positive funding), short Binance
        if (spread > 0) {
          return { 
            sideApex: 'LONG', 
            sideBin: 'SHORT',
            spread,
            dynamicThreshold
          };
        } else {
          return { 
            sideApex: 'SHORT', 
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
    if (this.binanceWS) {
      this.binanceWS.close();
    }
  }
}

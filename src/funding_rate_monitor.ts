import { RestClientV5, WebsocketClient } from 'bybit-api';
import EventEmitter from 'events';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import { DEFAULTS, SpreadHistoryEntry } from './config';

dotenv.config();

export interface FundingRates {
  bybitRate: number;
  binRate: number;
}

export interface Opportunity {
  sideBybit: 'LONG' | 'SHORT';
  sideBin: 'LONG' | 'SHORT';
  spread: number;
  dynamicThreshold: number;
}

export const DEFAULT_FUNDING_THRESHOLD = DEFAULTS.MIN_FUNDING_SPREAD;

export class FundingRateMonitor extends EventEmitter {
  private bybitWS: WebsocketClient;
  private bybitRest: RestClientV5;
  private binanceWS: WebSocket | null = null;
  private symbol: string;
  private spreadHistory: SpreadHistoryEntry[] = [];
  private useDynamicSpread: boolean = false;
  private currentBybitRate: number = 0;
  private currentBinanceRate: number = 0;

  constructor(useDynamicSpread: boolean = false) {
    super();
    this.useDynamicSpread = useDynamicSpread;
    
    const symbol = process.env.SYMBOL || 'BTCUSDT';
    this.symbol = symbol;

    const bybitApiKey = process.env.BYBIT_API_KEY;
    const bybitApiSecret = process.env.BYBIT_API_SECRET;
    
    if (!bybitApiKey || !bybitApiSecret) {
      throw new Error('BYBIT_API_KEY and BYBIT_API_SECRET not found in environment variables');
    }

    const binApiKey = process.env.BINANCE_API_KEY;
    const binSecretKey = process.env.BINANCE_SECRET_KEY;
    
    if (!binApiKey || !binSecretKey) {
      console.warn('⚠️  Warning: BINANCE_API_KEY or BINANCE_SECRET_KEY not set');
      console.warn('Binance funding rates may not be available');
    }

    // Initialize Bybit REST client
    this.bybitRest = new RestClientV5({
      key: bybitApiKey,
      secret: bybitApiSecret,
    });

    // Initialize Bybit WebSocket client
    this.bybitWS = new WebsocketClient({
      key: bybitApiKey,
      secret: bybitApiSecret,
      market: 'v5',
    });
  }

  start() {
    this.subscribeBybit();
    this.subscribeBinance();
  }

  private subscribeBybit() {
    this.bybitWS.on('open', () => console.log('✅ Bybit WS connected.'));
    
    this.bybitWS.on('update', (data: any) => {
      try {
        if (data.topic && data.topic.includes('tickers')) {
          const tickerData = data.data;
          if (tickerData && tickerData.symbol === this.symbol) {
            const rate = parseFloat(tickerData.fundingRate || '0');
            this.currentBybitRate = rate;
            this.emit('bybit_funding', rate);
          }
        }
      } catch (error: any) {
        console.error('Error processing Bybit update:', error.message);
      }
    });

    this.bybitWS.on('error', (err: any) => {
      console.error('Bybit WS error:', err);
    });

    // Subscribe to ticker updates which include funding rate
    this.bybitWS.subscribe([`tickers.${this.symbol}`]);
  }

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

  async getFundingRates(): Promise<FundingRates> {
    try {
      // If we have recent WebSocket data, use it
      if (this.currentBybitRate !== 0 && this.currentBinanceRate !== 0) {
        return { bybitRate: this.currentBybitRate, binRate: this.currentBinanceRate };
      }

      // Otherwise fetch via REST API as fallback
      const bybitResponse = await this.bybitRest.getTickers({
        category: 'linear',
        symbol: this.symbol,
      });
      
      const bybitRate = bybitResponse.result?.list?.[0]?.fundingRate 
        ? parseFloat(bybitResponse.result.list[0].fundingRate) 
        : 0;

      // For Binance, we rely on WebSocket data or need to make REST call
      // Using current value from WebSocket if available
      const binRate = this.currentBinanceRate;

      return { bybitRate, binRate };
    } catch (error: any) {
      console.error('Error fetching funding rates:', error.message);
      return { bybitRate: 0, binRate: 0 };
    }
  }

  async detectOpportunity(threshold: number = DEFAULT_FUNDING_THRESHOLD): Promise<Opportunity | null> {
    try {
      const { bybitRate, binRate } = await this.getFundingRates();
      
      if (bybitRate === 0 || binRate === 0) {
        return null; // Invalid rates
      }

      const spread = bybitRate - binRate;
      
      // Store spread in history for volatility calculation
      this.addSpreadToHistory(spread);
      
      // Calculate dynamic threshold if enabled
      const dynamicThreshold = this.useDynamicSpread 
        ? this.calculateDynamicThreshold(threshold)
        : threshold;
      
      if (Math.abs(spread) > dynamicThreshold) {
        // If Bybit rate > Bin rate, long Bybit (collect positive funding), short Bin
        if (spread > 0) {
          return { 
            sideBybit: 'LONG', 
            sideBin: 'SHORT',
            spread,
            dynamicThreshold
          };
        } else {
          return { 
            sideBybit: 'SHORT', 
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
   * Clean up connections
   */
  public async close(): Promise<void> {
    if (this.binanceWS) {
      this.binanceWS.close();
    }
    // Bybit WS client will be closed automatically
  }
}

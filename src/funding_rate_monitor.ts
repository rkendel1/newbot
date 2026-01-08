import { RestClientV5, WebsocketClient } from 'bybit-api';
import EventEmitter from 'events';
import * as dotenv from 'dotenv';
import { DEFAULTS, SpreadHistoryEntry } from './config';
import { CoinbasePerps, CoinbasePerpsConfig } from './coinbase_perps';

dotenv.config();

export interface FundingRates {
  bybitRate: number;
  coinbaseRate: number;
}

export interface Opportunity {
  sideBybit: 'LONG' | 'SHORT';
  sideCoinbase: 'LONG' | 'SHORT';
  spread: number;
  dynamicThreshold: number;
}

export const DEFAULT_FUNDING_THRESHOLD = DEFAULTS.MIN_FUNDING_SPREAD;

export class FundingRateMonitor extends EventEmitter {
  private bybitWS: WebsocketClient;
  private bybitRest: RestClientV5;
  private coinbaseClient: CoinbasePerps;
  private symbol: string;
  private coinbaseSymbol: string; // Coinbase uses different format (e.g., BTC-PERP)
  private spreadHistory: SpreadHistoryEntry[] = [];
  private useDynamicSpread: boolean = false;
  private currentBybitRate: number = 0;
  private currentCoinbaseRate: number = 0;

  constructor(useDynamicSpread: boolean = false) {
    super();
    this.useDynamicSpread = useDynamicSpread;
    
    const symbol = process.env.SYMBOL || 'BTCUSDT';
    this.symbol = symbol;
    
    // Convert to Coinbase format (e.g., BTCUSDT -> BTC-PERP)
    this.coinbaseSymbol = this.convertToCoinbaseSymbol(symbol);

    const bybitApiKey = process.env.BYBIT_API_KEY;
    const bybitApiSecret = process.env.BYBIT_API_SECRET;
    
    if (!bybitApiKey || !bybitApiSecret) {
      throw new Error('BYBIT_API_KEY and BYBIT_API_SECRET not found in environment variables');
    }

    const coinbaseApiKey = process.env.COINBASE_API_KEY;
    const coinbaseApiSecret = process.env.COINBASE_API_SECRET;
    const coinbasePassphrase = process.env.COINBASE_API_PASSPHRASE;
    
    if (!coinbaseApiKey || !coinbaseApiSecret || !coinbasePassphrase) {
      console.warn('⚠️  Warning: COINBASE_API_KEY, COINBASE_API_SECRET, or COINBASE_API_PASSPHRASE not set');
      console.warn('Coinbase funding rates may not be available');
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

    // Initialize Coinbase client
    const coinbaseConfig: CoinbasePerpsConfig = {
      apiKey: coinbaseApiKey || '',
      apiSecret: coinbaseApiSecret || '',
      passphrase: coinbasePassphrase || '',
    };
    this.coinbaseClient = new CoinbasePerps(coinbaseConfig);
  }

  /**
   * Convert Binance/Bybit symbol format to Coinbase format
   * 
   * Coinbase uses hyphenated format with -PERP suffix:
   * - BTCUSDT -> BTC-PERP
   * - ETHUSDT -> ETH-PERP
   * 
   * @param symbol - Symbol in Binance/Bybit format (e.g., 'BTCUSDT')
   * @returns Symbol in Coinbase format (e.g., 'BTC-PERP')
   */
  private convertToCoinbaseSymbol(symbol: string): string {
    // Mapping table for known pairs
    const symbolMap: Record<string, string> = {
      'BTCUSDT': 'BTC-PERP',
      'ETHUSDT': 'ETH-PERP',
    };
    
    // Check if we have an explicit mapping
    if (symbolMap[symbol]) {
      return symbolMap[symbol];
    }
    
    // Fallback: Try to extract base currency from USDT pair
    if (symbol.endsWith('USDT')) {
      const base = symbol.replace(/USDT$/, '');
      console.warn(
        `⚠️  No explicit mapping for ${symbol}, using fallback conversion: ${base}-PERP`
      );
      console.warn(
        `   Verify this is correct on Coinbase. Add to symbolMap if needed.`
      );
      return `${base}-PERP`;
    }
    
    // If it doesn't end with USDT, we can't convert it
    throw new Error(
      `Cannot convert symbol ${symbol} to Coinbase format. ` +
      `Coinbase uses PERP suffix (e.g., BTC-PERP). ` +
      `Please add ${symbol} to the symbol mapping table in funding_rate_monitor.ts`
    );
  }

  start() {
    this.subscribeBybit();
    this.subscribeCoinbase();
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
      console.error('Error fetching Coinbase funding rate:', error.message);
    }
  }

  async getFundingRates(): Promise<FundingRates> {
    try {
      // If we have recent WebSocket/polling data, use it
      if (this.currentBybitRate !== 0 && this.currentCoinbaseRate !== 0) {
        return { bybitRate: this.currentBybitRate, coinbaseRate: this.currentCoinbaseRate };
      }

      // Otherwise fetch via REST API as fallback
      const bybitResponse = await this.bybitRest.getTickers({
        category: 'linear',
        symbol: this.symbol,
      });
      
      const bybitRate = bybitResponse.result?.list?.[0]?.fundingRate 
        ? parseFloat(bybitResponse.result.list[0].fundingRate) 
        : 0;

      // For Coinbase, fetch from REST API
      const coinbaseRate = await this.coinbaseClient.getFundingRate(this.coinbaseSymbol);

      return { bybitRate, coinbaseRate };
    } catch (error: any) {
      console.error('Error fetching funding rates:', error.message);
      return { bybitRate: 0, coinbaseRate: 0 };
    }
  }

  async detectOpportunity(threshold: number = DEFAULT_FUNDING_THRESHOLD): Promise<Opportunity | null> {
    try {
      const { bybitRate, coinbaseRate } = await this.getFundingRates();
      
      if (bybitRate === 0 || coinbaseRate === 0) {
        return null; // Invalid rates
      }

      const spread = bybitRate - coinbaseRate;
      
      // Store spread in history for volatility calculation
      this.addSpreadToHistory(spread);
      
      // Calculate dynamic threshold if enabled
      const dynamicThreshold = this.useDynamicSpread 
        ? this.calculateDynamicThreshold(threshold)
        : threshold;
      
      if (Math.abs(spread) > dynamicThreshold) {
        // If Bybit rate > Coinbase rate, long Bybit (collect positive funding), short Coinbase
        if (spread > 0) {
          return { 
            sideBybit: 'LONG', 
            sideCoinbase: 'SHORT',
            spread,
            dynamicThreshold
          };
        } else {
          return { 
            sideBybit: 'SHORT', 
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
   * Clean up connections
   */
  public async close(): Promise<void> {
    // Bybit WS client will be closed automatically
  }
}

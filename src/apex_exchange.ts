/**
 * Apex Omni Exchange Adapter
 * 
 * This module provides a TypeScript adapter for Apex Omni decentralized exchange.
 * It implements the same interface as other exchange adapters to allow drop-in replacement.
 * 
 * Key differences from Bybit:
 * - Decentralized (StarkEx L2)
 * - No KYC required
 * - All orders require StarkEx signing
 * - Non-custodial (user controls private keys)
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as crypto from 'crypto';

export interface ApexConfig {
  baseUrl: string;
  starkPrivateKey: string;
  starkPublicKey: string;
  accountId: string;
  positionId: string;
  timeout?: number;
}

export interface ApexMarket {
  symbol: string;
  tickSize: string;
  stepSize: string;
  minOrderSize: string;
  maxOrderSize: string;
  [key: string]: any;
}

export interface ApexPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  [key: string]: any;
}

export interface ApexOrder {
  symbol: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  type: 'LIMIT' | 'MARKET';
  timeInForce?: string;
  accountId: string;
  positionId: string;
  nonce: number;
  expiration: number;
  reduceOnly?: boolean;
  clientId?: string;
  signature?: string;
  publicKey?: string;
}

export interface ApexOrderResponse {
  orderId?: string;
  clientOrderId?: string;
  status?: string;
  error?: string;
  [key: string]: any;
}

export class ApexAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApexAPIError';
  }
}

export class ApexExchange {
  private client: AxiosInstance;
  private baseUrl: string;
  private starkPrivateKey: string;
  private starkPublicKey: string;
  private accountId: string;
  private positionId: string;
  private timeout: number;

  constructor(config: ApexConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.starkPrivateKey = config.starkPrivateKey;
    this.starkPublicKey = config.starkPublicKey;
    this.accountId = config.accountId;
    this.positionId = config.positionId;
    this.timeout = config.timeout || 10000;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // -------------------------------------------------------------------------
  // HTTP Helper Methods
  // -------------------------------------------------------------------------

  private async handleResponse<T>(response: AxiosResponse): Promise<T> {
    if (response.status >= 400) {
      throw new ApexAPIError(
        `HTTP ${response.status}: ${JSON.stringify(response.data)}`
      );
    }

    const data = response.data;
    
    if (data && typeof data === 'object' && data.error) {
      throw new ApexAPIError(String(data.error));
    }

    return data as T;
  }

  private async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    try {
      const response = await this.client.get(path, { params });
      return this.handleResponse<T>(response);
    } catch (error: any) {
      if (error instanceof ApexAPIError) {
        throw error;
      }
      throw new ApexAPIError(
        `GET ${path} failed: ${error.message || String(error)}`
      );
    }
  }

  private async post<T>(path: string, data?: Record<string, any>): Promise<T> {
    try {
      const response = await this.client.post(path, data);
      return this.handleResponse<T>(response);
    } catch (error: any) {
      if (error instanceof ApexAPIError) {
        throw error;
      }
      throw new ApexAPIError(
        `POST ${path} failed: ${error.message || String(error)}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // StarkEx Signing (Placeholder - MUST BE IMPLEMENTED FOR PRODUCTION)
  // -------------------------------------------------------------------------

  /**
   * Get current timestamp in milliseconds
   */
  private getTimestamp(): number {
    return Date.now();
  }

  /**
   * Sign an order using StarkEx protocol
   * 
   * ⚠️ IMPORTANT: This is a PLACEHOLDER implementation using HMAC-SHA256.
   * 
   * For PRODUCTION use, you MUST:
   * 1. Implement proper StarkEx signing according to Apex's specification
   * 2. Use the correct hash function (Pedersen hash)
   * 3. Follow the exact field ordering and serialization format
   * 4. Use StarkEx signature libraries (e.g., starkex-lib, starknet.js)
   * 
   * The current implementation is for STRUCTURAL PURPOSES ONLY and will NOT
   * work with the live Apex API.
   * 
   * @param order - Order object to sign
   * @returns Signature string (currently HMAC-SHA256, needs to be StarkEx signature)
   */
  private signOrder(order: Record<string, any>): string {
    // TODO: Replace with actual StarkEx signing implementation
    // This is a placeholder that generates a deterministic signature
    // for testing and development purposes only
    
    const sortedKeys = Object.keys(order).sort();
    const serialized = sortedKeys
      .map(key => `${key}=${String(order[key])}`)
      .join('|');
    
    const signature = crypto
      .createHmac('sha256', this.starkPrivateKey)
      .update(serialized)
      .digest('hex');
    
    console.warn('⚠️  WARNING: Using placeholder signature - NOT for production use');
    
    return signature;
  }

  // -------------------------------------------------------------------------
  // Public Market Data
  // -------------------------------------------------------------------------

  /**
   * Get all available markets with details (tick size, step size, etc.)
   */
  async getMarkets(): Promise<ApexMarket[]> {
    return this.get<ApexMarket[]>('/markets');
  }

  /**
   * Get data for a single market
   * @param symbol - Market symbol (e.g., 'ETH-USDC')
   */
  async getMarket(symbol: string): Promise<ApexMarket> {
    const markets = await this.getMarkets();
    const market = markets.find(m => m.symbol === symbol);
    
    if (!market) {
      throw new ApexAPIError(`Market not found: ${symbol}`);
    }
    
    return market;
  }

  /**
   * Get the current funding rate for a perpetual market
   * @param symbol - Market symbol (e.g., 'ETH-USDC', 'BTC-USDC')
   * @returns Funding rate as a decimal (e.g., 0.0001 = 0.01%)
   */
  async getFundingRate(symbol: string): Promise<number> {
    try {
      const data = await this.get<any>('/funding', { symbol });
      
      // Try different possible field names in Apex API response
      const rate = data.currentFundingRate ?? data.fundingRate ?? data.rate;
      
      if (rate === undefined || rate === null) {
        console.error(`No funding rate field found in Apex API response for ${symbol}`);
        console.error('Response structure:', JSON.stringify(data, null, 2));
        throw new ApexAPIError(
          `No funding rate in response for ${symbol}. Expected fields: currentFundingRate, fundingRate, or rate`
        );
      }
      
      const parsedRate = parseFloat(String(rate));
      
      if (isNaN(parsedRate)) {
        throw new ApexAPIError(
          `Invalid funding rate value for ${symbol}: ${rate}`
        );
      }
      
      return parsedRate;
    } catch (error: any) {
      if (error instanceof ApexAPIError) {
        throw error;
      }
      throw new ApexAPIError(
        `Failed to fetch funding rate for ${symbol}: ${error.message || String(error)}`
      );
    }
  }

  /**
   * Get order book for a market
   * @param symbol - Market symbol
   */
  async getOrderBook(symbol: string): Promise<{ bids: [string, string][]; asks: [string, string][] }> {
    return this.get<{ bids: [string, string][]; asks: [string, string][] }>(
      '/orderbook',
      { symbol }
    );
  }

  /**
   * Calculate mid price from order book
   * @param symbol - Market symbol
   */
  async getMidPrice(symbol: string): Promise<number> {
    const orderBook = await this.getOrderBook(symbol);
    
    if (!orderBook.bids || !orderBook.bids.length || 
        !orderBook.asks || !orderBook.asks.length) {
      throw new ApexAPIError(
        `No liquidity for ${symbol}: ${JSON.stringify(orderBook)}`
      );
    }
    
    const bestBid = parseFloat(orderBook.bids[0][0]);
    const bestAsk = parseFloat(orderBook.asks[0][0]);
    
    return (bestBid + bestAsk) / 2.0;
  }

  // -------------------------------------------------------------------------
  // Account & Positions
  // -------------------------------------------------------------------------

  /**
   * Fetch account balances for this StarkEx account
   */
  async getBalance(): Promise<Record<string, any>> {
    return this.get<Record<string, any>>('/balances', {
      accountId: this.accountId,
    });
  }

  /**
   * Fetch open positions, optionally filtered by symbol
   * @param symbol - Optional symbol to filter positions
   */
  async getPositions(symbol?: string): Promise<ApexPosition[]> {
    const params: Record<string, any> = {
      accountId: this.accountId,
    };
    
    if (symbol) {
      params.symbol = symbol;
    }
    
    return this.get<ApexPosition[]>('/positions', params);
  }

  /**
   * Get a single position for a specific symbol
   * @param symbol - Market symbol
   * @returns Position object or null if no position exists
   */
  async getPosition(symbol: string): Promise<ApexPosition | null> {
    const positions = await this.getPositions(symbol);
    
    if (!positions || positions.length === 0) {
      return null;
    }
    
    // Assuming one position per symbol
    return positions[0];
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  /**
   * Place a perpetual futures order on Apex
   * 
   * @param params - Order parameters
   * @returns Order response from Apex API
   */
  async placeOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    size: number;
    price: number;
    orderType?: 'LIMIT' | 'MARKET';
    reduceOnly?: boolean;
    timeInForce?: string;
    clientId?: string;
  }): Promise<ApexOrderResponse> {
    const {
      symbol,
      side,
      size,
      price,
      orderType = 'LIMIT',
      reduceOnly = false,
      timeInForce = 'GTC',
      clientId,
    } = params;

    const nonce = this.getTimestamp();
    const expiration = nonce + 60_000 * 5; // 5 minutes from now

    const order: ApexOrder = {
      symbol,
      side: side.toUpperCase() as 'BUY' | 'SELL',
      size: String(size),
      price: String(price),
      type: orderType.toUpperCase() as 'LIMIT' | 'MARKET',
      timeInForce: timeInForce.toUpperCase(),
      accountId: this.accountId,
      positionId: this.positionId,
      nonce,
      expiration,
      reduceOnly,
    };

    if (clientId) {
      order.clientId = clientId;
    }

    // Sign the order
    const signature = this.signOrder(order);
    order.signature = signature;
    order.publicKey = this.starkPublicKey;

    console.log(`📤 Placing Apex order: ${side} ${size} ${symbol} @ ${price}`);
    
    return this.post<ApexOrderResponse>('/orders', order);
  }

  /**
   * Cancel a single order by ID
   * @param orderId - Order ID to cancel
   */
  async cancelOrder(orderId: string): Promise<Record<string, any>> {
    const payload: Record<string, any> = {
      orderId,
      accountId: this.accountId,
      nonce: this.getTimestamp(),
    };

    payload.signature = this.signOrder(payload);
    payload.publicKey = this.starkPublicKey;

    return this.post<Record<string, any>>('/orders/cancel', payload);
  }

  /**
   * Cancel all open orders, optionally for a specific symbol
   * @param symbol - Optional symbol to cancel orders for
   */
  async cancelAllOrders(symbol?: string): Promise<Record<string, any>> {
    const payload: Record<string, any> = {
      accountId: this.accountId,
      nonce: this.getTimestamp(),
    };

    if (symbol) {
      payload.symbol = symbol;
    }

    payload.signature = this.signOrder(payload);
    payload.publicKey = this.starkPublicKey;

    return this.post<Record<string, any>>('/orders/cancel_all', payload);
  }

  /**
   * Get open orders for this account, optionally filtered by symbol
   * @param symbol - Optional symbol to filter orders
   */
  async getOpenOrders(symbol?: string): Promise<Record<string, any>[]> {
    const params: Record<string, any> = {
      accountId: this.accountId,
    };

    if (symbol) {
      params.symbol = symbol;
    }

    return this.get<Record<string, any>[]>('/orders/open', params);
  }

  // -------------------------------------------------------------------------
  // Convenience Methods
  // -------------------------------------------------------------------------

  /**
   * Place a market buy order
   * @param symbol - Market symbol
   * @param size - Order size in base units
   */
  async marketBuy(symbol: string, size: number): Promise<ApexOrderResponse> {
    return this.placeOrder({
      symbol,
      side: 'BUY',
      size,
      price: 0, // Ignored for market orders
      orderType: 'MARKET',
    });
  }

  /**
   * Place a market sell order
   * @param symbol - Market symbol
   * @param size - Order size in base units
   */
  async marketSell(symbol: string, size: number): Promise<ApexOrderResponse> {
    return this.placeOrder({
      symbol,
      side: 'SELL',
      size,
      price: 0, // Ignored for market orders
      orderType: 'MARKET',
    });
  }
}

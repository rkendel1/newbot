/**
 * Coinbase Perpetual Futures Exchange Adapter
 * 
 * This module provides a TypeScript adapter for Coinbase Perpetual Futures.
 * It implements the same interface as other exchange adapters to allow drop-in replacement.
 * 
 * Key features:
 * - U.S.-regulated and CFTC-compliant
 * - Supports BTC-PERP, ETH-PERP, and nano contracts
 * - Funding rate mechanism identical to offshore perps
 * - HMAC SHA-256 authentication
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as crypto from 'crypto';

export interface CoinbasePerpsConfig {
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  baseUrl?: string;
  timeout?: number;
}

export interface CoinbaseProduct {
  id: string;
  base_currency: string;
  quote_currency: string;
  base_min_size: string;
  base_max_size: string;
  quote_increment: string;
  [key: string]: any;
}

export interface CoinbasePosition {
  product_id: string;
  side: 'long' | 'short';
  size: string;
  entry_price: string;
  mark_price: string;
  unrealized_pnl: string;
  [key: string]: any;
}

export interface CoinbaseOrder {
  product_id: string;
  side: 'buy' | 'sell';
  size: string;
  price?: string;
  type: 'limit' | 'market';
  time_in_force?: string;
  client_order_id?: string;
  [key: string]: any;
}

export interface CoinbaseOrderResponse {
  id?: string;
  client_order_id?: string;
  status?: string;
  message?: string;
  [key: string]: any;
}

export class CoinbasePerpsAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoinbasePerpsAPIError';
  }
}

export class CoinbasePerps {
  private client: AxiosInstance;
  private publicClient: AxiosInstance;
  private baseUrl: string;
  private apiKey?: string;
  private apiSecret?: string;
  private passphrase?: string;
  private timeout: number;

  constructor(config: CoinbasePerpsConfig) {
    this.baseUrl = process.env.COINBASE_BASE_URL || config.baseUrl || 'https://api-public.international.coinbase.com';
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.passphrase = config.passphrase;
    this.timeout = config.timeout || 10000;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
    });

    this.publicClient = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
    });
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  /**
   * Create HMAC SHA-256 signature for Coinbase API
   * @param timestamp - Current timestamp as string
   * @param method - HTTP method (GET, POST, DELETE)
   * @param requestPath - API endpoint path
   * @param body - Request body (empty string for GET/DELETE)
   * @returns Base64-encoded signature
   */
  private sign(timestamp: string, method: string, requestPath: string, body: string = ''): string {
    if (!this.apiSecret) {
      throw new CoinbasePerpsAPIError('API secret is required for authenticated requests');
    }
    const message = timestamp + method + requestPath + body;
    const hmacKey = Buffer.from(this.apiSecret, 'base64');
    const signature = crypto.createHmac('sha256', hmacKey).update(message).digest('base64');
    return signature;
  }

  /**
   * Generate authentication headers for Coinbase API requests
   * @param method - HTTP method
   * @param path - API endpoint path
   * @param body - Request body (empty string for GET/DELETE)
   * @returns Headers object with authentication
   */
  private getHeaders(method: string, path: string, body: string = ''): Record<string, string> {
    if (!this.apiKey || !this.apiSecret || !this.passphrase) {
      throw new CoinbasePerpsAPIError(
        'API credentials (apiKey, apiSecret, passphrase) are required for authenticated requests. ' +
        'For public data only, credentials are not needed.'
      );
    }
    const timestamp = (Date.now() / 1000).toFixed(3);
    return {
      'CB-ACCESS-KEY': this.apiKey,
      'CB-ACCESS-SIGN': this.sign(timestamp, method, path, body),
      'CB-ACCESS-TIMESTAMP': timestamp,
      'CB-ACCESS-PASSPHRASE': this.passphrase,
      'Content-Type': 'application/json',
    };
  }

  // -------------------------------------------------------------------------
  // HTTP Helper Methods
  // -------------------------------------------------------------------------

  private async handleResponse<T>(response: AxiosResponse): Promise<T> {
    if (response.status >= 400) {
      throw new CoinbasePerpsAPIError(
        `HTTP ${response.status}: ${JSON.stringify(response.data)}`
      );
    }

    const data = response.data;

    if (data && typeof data === 'object' && data.message) {
      // Coinbase returns error messages in 'message' field
      throw new CoinbasePerpsAPIError(String(data.message));
    }

    return data as T;
  }

  private async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    try {
      const fullPath = params 
        ? `${path}?${new URLSearchParams(params).toString()}`
        : path;
      
      const response = await this.client.get(fullPath, {
        headers: this.getHeaders('GET', path),
      });
      return this.handleResponse<T>(response);
    } catch (error: any) {
      if (error instanceof CoinbasePerpsAPIError) {
        throw error;
      }
      throw new CoinbasePerpsAPIError(
        `GET ${path} failed: ${error.message || String(error)}`
      );
    }
  }

  private async post<T>(path: string, data?: Record<string, any>): Promise<T> {
    try {
      const body = data ? JSON.stringify(data) : '';
      const response = await this.client.post(path, body, {
        headers: this.getHeaders('POST', path, body),
      });
      return this.handleResponse<T>(response);
    } catch (error: any) {
      if (error instanceof CoinbasePerpsAPIError) {
        throw error;
      }
      throw new CoinbasePerpsAPIError(
        `POST ${path} failed: ${error.message || String(error)}`
      );
    }
  }

  private async delete<T>(path: string): Promise<T> {
    try {
      const response = await this.client.delete(path, {
        headers: this.getHeaders('DELETE', path),
      });
      return this.handleResponse<T>(response);
    } catch (error: any) {
      if (error instanceof CoinbasePerpsAPIError) {
        throw error;
      }
      throw new CoinbasePerpsAPIError(
        `DELETE ${path} failed: ${error.message || String(error)}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Market Data
  // -------------------------------------------------------------------------

  /**
   * Get all available products
   */
  async getProducts(): Promise<CoinbaseProduct[]> {
    return this.get<CoinbaseProduct[]>('/products');
  }

  /**
   * Get data for a single product
   * @param symbol - Product ID (e.g., 'ETH-PERP', 'BTC-PERP')
   */
  async getProduct(symbol: string): Promise<CoinbaseProduct> {
    return this.get<CoinbaseProduct>(`/products/${symbol}`);
  }

  /**
   * Public GET request without authentication (for market data)
   */
  private async publicGet<T>(path: string, params?: Record<string, any>): Promise<T> {
    try {
      const fullPath = params 
        ? `${path}?${new URLSearchParams(params).toString()}`
        : path;
      
      const response = await this.publicClient.get(fullPath);
      return this.handleResponse<T>(response);
    } catch (error: any) {
      if (error instanceof CoinbasePerpsAPIError) {
        throw error;
      }
      throw new CoinbasePerpsAPIError(
        `Public GET ${path} failed: ${error.message || String(error)}`
      );
    }
  }

  /**
   * Get the current funding rate for a perpetual product
   * 
   * Uses Coinbase International Exchange API (public endpoint, no auth needed).
   * Funding rate is in product details as 'predicted_funding_rate' (next 8h rate).
   * 
   * @param symbol - Product ID (e.g., 'BTC-PERP', 'ETH-PERP')
   * @returns Funding rate as a decimal (e.g., -0.000125 = -0.0125%)
   */
  async getFundingRate(symbol: string = 'BTC-PERP'): Promise<number> {
    try {
      // Public endpoint for product details
      const data = await this.publicGet<any>(`/products/${symbol}`);
      
      // Parse predicted_funding_rate (next funding rate)
      const rate = data.predicted_funding_rate;
      
      if (rate === undefined || rate === null) {
        console.error(`No predicted_funding_rate found in Coinbase International API response for ${symbol}`);
        console.error('Response structure:', JSON.stringify(data, null, 2));
        throw new CoinbasePerpsAPIError(
          `No funding rate in response for ${symbol}`
        );
      }
      
      const parsedRate = parseFloat(String(rate));
      
      if (isNaN(parsedRate)) {
        throw new CoinbasePerpsAPIError(
          `Invalid funding rate value for ${symbol}: ${rate}`
        );
      }
      
      return parsedRate;
    } catch (error: any) {
      console.warn(`⚠️  Could not fetch funding rate from Coinbase International API for ${symbol}`);
      console.warn(`⚠️  Endpoint: /products/${symbol}`);
      console.warn(`⚠️  Error:`, error.message || String(error));
      console.warn(`⚠️  Note: Perpetual futures are only available on Coinbase International (non-U.S.).`);
      console.warn(`⚠️  For US users, consider alternative exchanges or check eligibility.`);
      console.warn(`⚠️  Returning 0 for funding rate to allow bot to continue.`);
      return 0; // Return 0 instead of throwing error
    }
  }

  /**
   * Get ticker data for a product
   * @param symbol - Product ID (e.g., 'ETH-PERP')
   */
  async getTicker(symbol: string = 'ETH-PERP'): Promise<any> {
    return this.get<any>(`/products/${symbol}/ticker`);
  }

  /**
   * Get order book for a product
   * @param symbol - Product ID
   * @param level - Order book depth level (1, 2, or 3)
   */
  async getOrderBook(symbol: string, level: number = 2): Promise<{ bids: [string, string][]; asks: [string, string][] }> {
    return this.get<{ bids: [string, string][]; asks: [string, string][] }>(
      `/products/${symbol}/book`,
      { level: String(level) }
    );
  }

  /**
   * Calculate mid price from order book
   * @param symbol - Product ID
   */
  async getMidPrice(symbol: string): Promise<number> {
    const orderBook = await this.getOrderBook(symbol, 1);
    
    if (!orderBook.bids || !orderBook.bids.length || 
        !orderBook.asks || !orderBook.asks.length) {
      throw new CoinbasePerpsAPIError(
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
   * Get account information
   */
  async getAccounts(): Promise<any[]> {
    return this.get<any[]>('/accounts');
  }

  /**
   * Fetch open positions
   */
  async getPositions(): Promise<CoinbasePosition[]> {
    const path = '/positions';
    return this.get<CoinbasePosition[]>(path);
  }

  /**
   * Get a single position for a specific product
   * @param symbol - Product ID
   * @returns Position object or null if no position exists
   */
  async getPosition(symbol: string): Promise<CoinbasePosition | null> {
    const positions = await this.getPositions();
    
    if (!positions || positions.length === 0) {
      return null;
    }
    
    // Find position for the specific product
    const position = positions.find(p => p.product_id === symbol);
    return position || null;
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  /**
   * Place a perpetual futures order on Coinbase
   * 
   * @param params - Order parameters
   * @returns Order response from Coinbase API
   */
  async placeOrder(params: {
    symbol: string;
    side: 'buy' | 'sell';
    size: number;
    price?: number;
    orderType?: 'limit' | 'market';
    timeInForce?: string;
    clientOrderId?: string;
  }): Promise<CoinbaseOrderResponse> {
    const {
      symbol,
      side,
      size,
      price,
      orderType = 'limit',
      timeInForce = 'GTC',
      clientOrderId,
    } = params;

    const order: CoinbaseOrder = {
      product_id: symbol,
      side: side.toLowerCase() as 'buy' | 'sell',
      size: String(size),
      type: orderType.toLowerCase() as 'limit' | 'market',
    };

    if (price && orderType === 'limit') {
      order.price = String(price);
    }

    if (timeInForce) {
      order.time_in_force = timeInForce;
    }

    if (clientOrderId) {
      order.client_order_id = clientOrderId;
    }

    console.log(`📤 Placing Coinbase order: ${side} ${size} ${symbol}${price ? ` @ ${price}` : ' (market)'}`);
    
    return this.post<CoinbaseOrderResponse>('/orders', order);
  }

  /**
   * Cancel a single order by ID
   * @param orderId - Order ID to cancel
   */
  async cancelOrder(orderId: string): Promise<any> {
    const path = `/orders/${orderId}`;
    return this.delete<any>(path);
  }

  /**
   * Cancel all open orders, optionally for a specific product
   * @param symbol - Optional product ID to cancel orders for
   */
  async cancelAllOrders(symbol?: string): Promise<any[]> {
    const params = symbol ? { product_id: symbol } : {};
    return this.delete<any[]>('/orders');
  }

  /**
   * Get open orders, optionally filtered by product
   * @param symbol - Optional product ID to filter orders
   */
  async getOpenOrders(symbol?: string): Promise<any[]> {
    const params = symbol ? { product_id: symbol } : {};
    return this.get<any[]>('/orders', params);
  }

  /**
   * Get a specific order by ID
   * @param orderId - Order ID
   */
  async getOrder(orderId: string): Promise<any> {
    return this.get<any>(`/orders/${orderId}`);
  }

  // -------------------------------------------------------------------------
  // Convenience Methods
  // -------------------------------------------------------------------------

  /**
   * Place a market buy order
   * @param symbol - Product ID
   * @param size - Order size in base units
   */
  async marketBuy(symbol: string, size: number): Promise<CoinbaseOrderResponse> {
    return this.placeOrder({
      symbol,
      side: 'buy',
      size,
      orderType: 'market',
    });
  }

  /**
   * Place a market sell order
   * @param symbol - Product ID
   * @param size - Order size in base units
   */
  async marketSell(symbol: string, size: number): Promise<CoinbaseOrderResponse> {
    return this.placeOrder({
      symbol,
      side: 'sell',
      size,
      orderType: 'market',
    });
  }
}

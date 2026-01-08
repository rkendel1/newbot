/**
 * Configuration defaults for the Funding Rate Arbitrage Bot
 * 
 * This file contains all risk management parameters, thresholds, and
 * operational settings for executing delta-neutral funding rate arbitrage
 * between Bybit and Binance.
 */

export const DEFAULTS = {
  // Minimum funding rate spread (per 8h interval) to open trades
  // 0.02% covers typical fees and slippage
  MIN_FUNDING_SPREAD: 0.0002, // 0.02%

  // Maximum notional value per single trade (USDT)
  // Keeps slippage low and reduces exposure per position
  MAX_POSITION_NOTIONAL: 10000,

  // Maximum total notional exposure per day (USDT)
  // Limits overall risk from multiple positions
  MAX_DAILY_NOTIONAL: 50000,

  // Maximum allowed price divergence between exchanges (%)
  // Triggers auto-close if basis risk exceeds this threshold
  MAX_BASIS_DIVERGENCE: 0.01, // 1%

  // Leverage multiplier for positions
  // Conservative 2x to reduce liquidation risk
  LEVERAGE: 2,

  // Auto-close interval (seconds)
  // Force-close positions after 8 hours (one funding period)
  AUTO_CLOSE_INTERVAL: 8 * 60 * 60, // 8 hours in seconds

  // Stop-loss threshold (%)
  // Close position if realized loss from basis divergence exceeds this
  STOP_LOSS_SPREAD: -0.0001, // -0.01%

  // Volatility lookback period (seconds)
  // Window for calculating realized volatility of funding spreads
  VOLATILITY_LOOKBACK: 24 * 60 * 60, // 24 hours in seconds

  // Spread buffer multiplier for dynamic threshold
  // Multiplier applied to volatility when setting dynamic min spread
  SPREAD_BUFFER_MULTIPLIER: 1.2,

  // Default trade amount (USDT) if not specified
  DEFAULT_TRADE_AMOUNT: 1000,

  // Check interval for funding rate monitoring (milliseconds)
  FUNDING_CHECK_INTERVAL: 3600000, // 1 hour

  // Retry configuration for API calls
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000, // 2 seconds

  // Timeout for API requests (milliseconds)
  API_TIMEOUT: 10000, // 10 seconds
};

/**
 * Parse command-line arguments for strategy configuration
 */
export interface StrategyConfig {
  minSpread?: number;
  maxPosition?: number;
  maxDailyNotional?: number;
  leverage?: number;
  dynamicSpread?: boolean;
  backtestDays?: number;
}

export function parseCliArgs(args: string[]): StrategyConfig {
  const config: StrategyConfig = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--min-spread' && args[i + 1]) {
      config.minSpread = parseFloat(args[i + 1]);
      i++;
    } else if (arg === '--max-position' && args[i + 1]) {
      config.maxPosition = parseFloat(args[i + 1]);
      i++;
    } else if (arg === '--max-daily-notional' && args[i + 1]) {
      config.maxDailyNotional = parseFloat(args[i + 1]);
      i++;
    } else if (arg === '--leverage' && args[i + 1]) {
      config.leverage = parseFloat(args[i + 1]);
      i++;
    } else if (arg === '--dynamic-spread') {
      config.dynamicSpread = true;
    } else if (arg === '--backtest' && args[i + 1]) {
      config.backtestDays = parseInt(args[i + 1]);
      i++;
    }
  }

  return config;
}

/**
 * Position tracking interface
 */
export interface Position {
  id: string;
  symbol: string;
  bybitSide: 'LONG' | 'SHORT';
  coinbaseSide: 'LONG' | 'SHORT';
  notional: number;
  leverage: number;
  entryTime: Date;
  bybitEntryPrice: number;
  coinbaseEntryPrice: number;
  bybitFundingRate: number;
  coinbaseFundingRate: number;
  spreadAtEntry: number;
  status: 'active' | 'closed';
  closeTime?: Date;
  realizedPnl?: number;
  realizedFunding?: number;
}

/**
 * Spread history entry for volatility calculation
 */
export interface SpreadHistoryEntry {
  timestamp: Date;
  spread: number;
}

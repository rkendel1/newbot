
## Features

- 🎯 **Automated Funding Rate Arbitrage**: Cross-exchange arbitrage between Hyperliquid and Binance perpetuals
- 💰 **Delta-Neutral Trading**: Hedge positions across exchanges for low-risk fixed yields (15-50% APR)
- 📊 **Real-time Funding Rate Monitoring**: Continuous monitoring of funding rate spreads
- 🔄 **Dynamic Spread Threshold**: Volatility-adjusted spread calculation to maximize APR efficiency
- 🛡️ **Risk Management**: Position limits, daily notional caps, basis divergence checks
- ⏰ **Auto-Close Logic**: Automatic position closing after funding period or on risk triggers
- 🤖 **Automated Opportunity Detection**: Triggers trades when spread exceeds configurable threshold
- 📈 **Comprehensive Logging**: Detailed logs for funding rates, positions, and realized payments

![Screenshot](./run.png)

![Screenshot](./tx.png)

## Strategy Overview

### Funding Rate Arbitrage
Exploits funding rate differences between Hyperliquid (DEX perps) and Binance (CEX perps):
- **Long** on the exchange with higher funding rate (collect positive funding)
- **Short** on the exchange with lower funding rate (avoid paying funding)
- **Delta-neutral**: Net zero market exposure, profit from rate spread
- **Expected APR**: 15-50% depending on market conditions and volatility
- **Risk Profile**: Low (hedged positions, no directional exposure)

### Risk Management Features

The bot includes comprehensive risk management with configurable defaults:

| Parameter | Default | Description |
|-----------|---------|-------------|
| MIN_FUNDING_SPREAD | 0.02% | Minimum funding rate difference per 8h interval before opening trades |
| MAX_POSITION_NOTIONAL | $10,000 | Max trade size to reduce slippage |
| MAX_DAILY_NOTIONAL | $50,000 | Max total exposure per day |
| MAX_BASIS_DIVERGENCE | 1% | Max allowed price divergence; triggers auto-close |
| LEVERAGE | 2x | Conservative leverage to reduce liquidation risk |
| AUTO_CLOSE_INTERVAL | 8h | Force-close positions after funding period |
| STOP_LOSS_SPREAD | -0.01% | Close if realized loss exceeds threshold |
| VOLATILITY_LOOKBACK | 24h | Period for volatility calculation |
| SPREAD_BUFFER_MULTIPLIER | 1.2x | Multiplier for volatility-adjusted threshold |

### Dynamic Spread Threshold

To maximize profitability while avoiding marginal trades, the bot adapts the minimum spread threshold to market volatility:

```typescript
// Calculate realized volatility of funding spread
const volatility = calculateVolatility(spreadHistory, VOLATILITY_LOOKBACK);

// Set dynamic spread threshold
const dynamicMinSpread = MIN_FUNDING_SPREAD + volatility * SPREAD_BUFFER_MULTIPLIER;

// Only enter trades if spread exceeds dynamic threshold
if (currentSpread < dynamicMinSpread) return;
```

**Benefit**: Avoids entering trades when markets are stable and funding differences are trivial, maximizing APR efficiency.

## Installation

```bash
# Install dependencies
npm install

# Create .env file with your credentials
# See Configuration section below
```

## Configuration

Edit `.env` file:

```env
# Funding Arbitrage Configuration
HYPERLIQUID_PRIVATE_KEY=your_hyperliquid_private_key
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key
```

## Usage

### Run Funding Arbitrage Bot

**Basic usage:**
```bash
npm run auto-trade
```

**With custom parameters:**
```bash
npm run auto-trade -- --min-spread 0.0003 \
    --max-position 15000 \
    --leverage 2 \
    --dynamic-spread
```

**CLI Arguments:**
- `--min-spread <value>` - Minimum funding spread threshold (e.g., 0.0003 for 0.03%)
- `--max-position <value>` - Maximum position size in USDT (e.g., 15000)
- `--max-daily-notional <value>` - Maximum daily notional in USDT (e.g., 50000)
- `--leverage <value>` - Leverage multiplier (e.g., 2)
- `--dynamic-spread` - Enable volatility-based dynamic spread threshold

### Build for Production

```bash
# Compile TypeScript
npm run build

# Run compiled version
npm start
```

## Project Structure

```
funding-rate-arb-bot/
├── src/
│   ├── auto_trading_bot.ts      # Main bot with funding arb strategy
│   ├── funding_rate_monitor.ts  # Funding rate fetching and opportunity detection
│   ├── config.ts                # Configuration defaults and risk parameters
│   └── [legacy files...]        # Legacy Polymarket files (not used)
├── .env                         # Environment variables (private)
├── package.json                 # Dependencies and scripts
└── README.md                    # This file
```

## How It Works

### 1. Rate Monitoring
Fetches real-time funding rates from Hyperliquid and Binance APIs every hour.

### 2. Opportunity Detection
Triggers when `|Hyperliquid Rate - Binance Rate| > threshold` (with optional dynamic adjustment).

### 3. Delta-Neutral Position
- **Long** on exchange with higher funding rate (collect positive funding)
- **Short** on exchange with lower funding rate (minimize funding payment)
- Equal notional value on both sides = net zero market exposure

### 4. Profit Source
Funding rate spread paid every 8 hours.

### 5. Auto-Close Conditions
Positions automatically close when:
- Funding interval passed (8 hours)
- Spread converges below threshold
- Basis divergence exceeds MAX_BASIS_DIVERGENCE
- Stop-loss triggered

### Example Trade

```
Hyperliquid Funding Rate: +0.15% (8-hour)
Binance Funding Rate:     +0.05% (8-hour)
Spread:                   0.10% (exceeds 0.02% threshold)

Action:
- LONG  $10,000 BTC on Hyperliquid (collect +0.15% = +$15.00)
- SHORT $10,000 BTC on Binance    (pay    -0.05% = -$5.00)

Net profit per 8h: $10.00 (0.10%)
Annualized APR: ~44%

Risk: Delta-neutral (hedged against BTC price movement)
```

## Safety Features

- ✅ Position size limits (per trade and daily)
- ✅ Auto-close after funding period (8 hours)
- ✅ Basis divergence monitoring
- ✅ Stop-loss protection
- ✅ Dynamic spread threshold (optional)
- ✅ Comprehensive logging and position tracking
- ✅ Private keys never exposed in logs

## Development

```bash
# Watch mode (auto-reload)
npm run dev

# Type checking
npx tsc --noEmit
```

## Security Notes

⚠️ **IMPORTANT:**
- Never commit your `.env` file
- Keep your private keys secure
- Test with small amounts first
- Review configuration before running in production
- Monitor positions actively

## Dependencies

- `hyperliquid` - Hyperliquid DEX SDK for perpetual trading
- `@binance/connector` - Official Binance API connector
- `dotenv` - Environment variable management
- `typescript` - Type safety and modern JavaScript

## Expected Performance

- **Conservatively optimized**: 15-25% APR under normal market conditions
- **Volatile periods**: Potential spikes to 40-50% APR
- **Dynamic threshold**: Ensures profitable trades are prioritized
- **Auto-close**: Minimizes risk from unexpected price moves or funding rate flips

## Future Enhancements

Optional improvements for scaling:
- Multi-pair batching (BTC, ETH, etc.) to scale APR
- Volatility-adjusted position sizing
- Alert system for abnormal spreads or API failures
- Backtesting mode for historical analysis
- Advanced P&L tracking and reporting

## License

ISC

## Support

For issues or questions, please refer to the repository issues page.

---

**Disclaimer**: Use at your own risk. This software is provided as-is without warranties. Cryptocurrency trading carries significant risk. Always test with small amounts first and never trade with funds you cannot afford to lose.


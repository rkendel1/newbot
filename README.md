# Polymarket Copy Trading Bot
# Donation 0xCBAcAf95cde23F6050e7EB05337Fad542B1597bE

# [telegram: blategold](https://t.me/blategold) lets connect.
A professional TypeScript-based trading bot featuring **cross-exchange funding rate arbitrage** as the primary strategy, with legacy Polymarket trading capabilities.

## Features

- 🎯 **Funding Rate Arbitrage (PRIMARY)**: Automated cross-exchange arbitrage between Hyperliquid and Binance perpetuals
- 💰 **Delta-Neutral Trading**: Hedge positions across exchanges for low-risk fixed yields (20-50% APR)
- 📊 **Real-time Funding Rate Monitoring**: Continuous monitoring of funding rate spreads
- 🤖 **Automated Opportunity Detection**: Triggers trades when spread exceeds configurable threshold
- 🔐 **Credential Management**: Secure private key handling and API authentication
- 💼 **Legacy Polymarket Support**: Original arbitrage trading features available as fallback
- 📈 **Price Tracking**: Real-time price updates from multiple exchanges

![Screenshot](./run.png)

![Screenshot](./tx.png)

## Two Trading Strategies

### 1. Funding Rate Arbitrage (PRIMARY - Recommended)
Exploits funding rate differences between Hyperliquid (DEX perps) and Binance (CEX perps):
- **Long** on the exchange with higher funding rate (collect positive funding)
- **Short** on the exchange with lower funding rate (avoid paying funding)
- **Delta-neutral**: Net zero market exposure, profit from rate spread
- **Expected APR**: 20-50% depending on market conditions
- **Risk Profile**: Low (hedged positions, no directional exposure)

### 2. Polymarket Arbitrage (LEGACY - Fallback)
Original functionality for Polymarket prediction market trading:
- Monitors price differences between software oracle and market
- Executes trades when profitable opportunities detected
- Automatically sets take profit and stop loss orders

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
# Ethereum/Polygon wallet (for Polymarket legacy mode)
PRIVATE_KEY=your_private_key_here
CLOB_API_URL=https://clob.polymarket.com
POLYGON_CHAIN_ID=137

# Funding Arbitrage Configuration (PRIMARY STRATEGY)
HYPERLIQUID_PRIVATE_KEY=your_hyperliquid_private_key
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key
FUNDING_THRESHOLD=0.001  # Minimum spread to trigger trade (0.1%)
DEFAULT_TRADE_AMOUNT=1000  # USDT notional per side

# Legacy Polymarket Parameters (optional)
SOFTWARE_WS_URL=ws://45.130.166.119:5001
PRICE_DIFFERENCE_THRESHOLD=0.015
STOP_LOSS_AMOUNT=0.005
TAKE_PROFIT_AMOUNT=0.01
TRADE_COOLDOWN=30
```

## Usage

### Run Funding Arbitrage Bot (PRIMARY STRATEGY)

```bash
npm run auto-trade -- --strategy=funding-arb
```

This starts the funding rate arbitrage bot that:
- Monitors BTC funding rates on Hyperliquid and Binance every hour
- Detects opportunities when spread exceeds threshold
- Provides framework for executing delta-neutral hedged positions
- Targets 20-50% APR through funding rate collection

### Run Legacy Polymarket Bot (FALLBACK)

```bash
npm run auto-trade
# or
npm run dev
```

This runs the original Polymarket arbitrage strategy.

### Generate CLOB Credentials (For Polymarket Mode)

```bash
npm run gen-creds
```

### Individual Scripts

```bash
# Check credentials
npm run credentials

# Check allowance
npm run allowance

# Find current Bitcoin market
npm run market

# Get bid/ask prices (requires token ID as argument)
npm run bid-ask <token_id>

# Place orders (interactive)
npm run order
```

### Build for Production

```bash
# Compile TypeScript
npm run build

# Run compiled version
npm start
```

## Project Structure

```
polymarket-ts-bot/
├── src/
│   ├── auto_trading_bot.ts      # Main bot with funding arb + Polymarket strategies
│   ├── funding_rate_monitor.ts  # Funding rate fetching and opportunity detection
│   ├── market_order.ts          # Order execution (multi-exchange support)
│   ├── main.ts                  # Interactive CLI trading interface
│   ├── _gen_credential.ts       # Credential management
│   ├── allowance.ts             # Token allowance management
│   ├── bid_asker.ts             # Bid/ask price fetching
│   ├── market_finder.ts         # Market discovery
│   └── generate_credentials.ts  # Credential generation utility
├── .env                         # Environment variables (private)
├── .credentials.json            # Generated API credentials
├── package.json                 # Dependencies and scripts
└── README.md                    # This file
```

## Funding Arbitrage Strategy Details

### How It Works

The bot exploits funding rate differences between perpetual futures exchanges:

1. **Rate Monitoring**: Fetches real-time funding rates from Hyperliquid and Binance APIs
2. **Opportunity Detection**: Triggers when `|Hyperliquid Rate - Binance Rate| > threshold`
3. **Delta-Neutral Position**: 
   - Long on exchange with higher funding rate (collect positive funding)
   - Short on exchange with lower funding rate (minimize funding payment)
   - Equal notional value on both sides = net zero market exposure
4. **Profit Source**: Funding rate spread paid every 8 hours
5. **Exit Strategy**: Close positions when rates converge or target profit reached

### Example Trade

```
Hyperliquid Funding Rate: +0.15% (8-hour)
Binance Funding Rate:     +0.05% (8-hour)
Spread:                   0.10% (exceeds 0.001 threshold)

Action:
- LONG  $1000 BTC on Hyperliquid (collect +0.15% = +$1.50)
- SHORT $1000 BTC on Binance    (pay    -0.05% = -$0.50)
Net profit per 8h: $1.00 (0.10%)
Annualized APR: ~44%

Risk: Delta-neutral (hedged against BTC price movement)
```

### Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| FUNDING_THRESHOLD | 0.001 | Minimum rate spread (0.1%) to trigger trade |
| DEFAULT_TRADE_AMOUNT | 1000 | USDT notional value per side |
| Check Interval | 3600s | How often to check for opportunities (1 hour) |

### Fees and Considerations

- **Hyperliquid**: Dynamic maker/taker fees (typically low)
- **Binance**: ~0.02% per trade (0.04% round trip)
- **Gas Fees**: Minimal on Arbitrum (Hyperliquid)
- **Net APR**: Typically 20-50% after fees, varies with market conditions

## Modules

### 1. Credential Generator (`_gen_credential.ts`)

Manages wallet credentials and API authentication.

```typescript
import { CredentialGenerator } from './_gen_credential';

const generator = new CredentialGenerator();
generator.displayInfo();
```

### 2. Allowance Manager (`allowance.ts`)

Control USDC token allowances for trading.

```typescript
import { AllowanceManager } from './allowance';

const manager = new AllowanceManager();
await manager.checkAllowance();
await manager.setAllowance('1000'); // Set 1000 USDC allowance
```

### 3. Bid/Ask Pricer (`bid_asker.ts`)

Get real-time order book data.

```typescript
import { BidAsker } from './bid_asker';

const bidAsker = new BidAsker();
const data = await bidAsker.getPriceData(tokenId);
console.log(data.bidAsk.midpoint);
```

### 4. Market Order Executor (`market_order.ts`)

Place and manage orders.

```typescript
import { MarketOrderExecutor } from './market_order';

const executor = new MarketOrderExecutor();
await executor.placeMarketOrder({
    tokenId: 'TOKEN_ID',
    side: 'BUY',
    amount: 10 // 10 USDC
});
```

### 5. Market Finder (`market_finder.ts`)

Auto-detect and search for markets.

```typescript
import { MarketFinder } from './market_finder';

const finder = new MarketFinder();
const market = await finder.findCurrentBitcoinMarket();
console.log(market.tokens); // UP and DOWN tokens
```

## Safety Features

- ✅ Confirmation prompts before placing orders
- ✅ Price validation and sanity checks
- ✅ Automatic market price buffers
- ✅ Private key never exposed in logs
- ✅ Error handling and recovery

## Development

```bash
start-bot.ps1

```bash
# Watch mode (auto-reload)
npm run dev

# Type checking
npx tsc --noEmit

# Lint
npx eslint src/
```

## Security Notes

⚠️ **IMPORTANT:**
- Never commit your `.env` file
- Keep your private key secure
- Test with small amounts first
- Review all transactions before confirming

## Dependencies

- `hyperliquid` - Hyperliquid DEX SDK for perpetual trading
- `@binance/connector` - Official Binance API connector
- `@polymarket/clob-client` - Polymarket CLOB client (legacy)
- `ethers` - Ethereum wallet and cryptography
- `axios` - HTTP requests
- `dotenv` - Environment variable management
- `typescript` - Type safety and modern JavaScript

## License

ISC

## Support

For issues or questions, please refer to:
- [Polymarket Documentation](https://docs.polymarket.com)
- [CLOB API Documentation](https://docs.polymarket.com/#clob-api)

---

**Disclaimer**: Use at your own risk. This software is provided as-is without warranties. Always test with small amounts first.


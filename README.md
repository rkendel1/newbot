# Funding Rate Arbitrage Bot

A fully automated trading bot that exploits funding rate differences between perpetual futures markets to generate consistent returns through delta-neutral arbitrage.

## 🆕 New: Apex Omni Support

**You can now choose between two Exchange A options:**

- **Bybit** (Centralized Exchange) - Traditional CEX with KYC
- **Apex Omni** (Decentralized Exchange) - DEX on StarkEx L2, no KYC required

Both work seamlessly with **Binance** as Exchange B.

➡️ **[See Apex Omni Setup Guide](./APEX_SETUP.md)** for detailed instructions on switching to the decentralized option.

## 📊 What This Bot Does

The bot monitors funding rates on BTC perpetual futures across two exchanges:
- **Exchange A**: Bybit (CEX) or Apex Omni (DEX)
- **Exchange B**: Binance (CEX)

When the funding rate spread exceeds a threshold, it opens **delta-neutral positions**:
- Long on the exchange with higher funding rate (collect funding)
- Short on the exchange with lower funding rate (minimize funding payment)

This creates a market-neutral position that profits from the rate difference while being hedged against price movements.

## 💰 Expected Returns

- **Conservative**: 15-25% APR in normal market conditions
- **Volatile Markets**: 40-50% APR during high spread periods
- **Risk Profile**: Low (delta-neutral, hedged positions)
- **Capital Efficiency**: 2x leverage recommended

### Example Trade

```
Bybit Funding Rate: +0.15% per 8 hours
Binance Funding Rate:     +0.05% per 8 hours
Spread:                   0.10% (exceeds 0.02% threshold)

Action:
- LONG  $10,000 BTC on Bybit (collect +$15.00)
- SHORT $10,000 BTC on Binance    (pay    -$5.00)

Net profit per 8h: $10.00 (0.10% return)
Annualized APR: ~44%
Risk: Market-neutral (hedged)
```

## 🚀 Features

- ✅ **Automated Funding Rate Monitoring**: Checks rates every hour
- ✅ **Delta-Neutral Strategy**: Zero directional market exposure
- ✅ **Dynamic Spread Threshold**: Volatility-adjusted entry criteria
- ✅ **Risk Management**: Position limits, daily caps, auto-close
- ✅ **Real-time Logging**: Detailed trade and position tracking
- ✅ **Performance Tested**: 25,000+ decisions/second capability
- ✅ **Apex Omni Support**: Trade on decentralized exchange (no KYC, non-custodial)

![Screenshot](./run.png)

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Account Setup](#account-setup)
   - [Bybit Setup](#1-bybit-account-setup)
   - [Apex Omni Setup](#apex-omni-alternative) (Alternative to Bybit)
   - [Binance Setup](#2-binance-account-setup)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Running the Bot](#running-the-bot)
6. [Understanding the Strategy](#understanding-the-strategy)
7. [Risk Management](#risk-management)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Do I Need a Crypto Wallet?

**NO** - Both exchanges are centralized and only require API keys. No crypto wallet needed.

**For Bybit (CEX):**
- ❌ No crypto wallet needed
- ✅ Just a Bybit account with API keys
- ✅ Funds stored on Bybit (centralized)

**For Binance (CEX):**
- ❌ No crypto wallet needed
- ✅ Just a Binance account with API keys
- ✅ Funds stored on Binance (centralized)

### Required Knowledge
- Basic understanding of cryptocurrency trading
- Familiarity with perpetual futures
- Command line/terminal usage
- Understanding of API key security

### Required Software
- **Node.js** v16 or higher ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Git** (optional, for cloning repository)

### Required Capital

**Minimum to Start:**
- **Bybit**: $500 USDC
- **Binance**: $500 USDT  
- **Total**: $1,000 minimum

**Recommended for Better Performance:**
- **Bybit**: $2,500 USDC
- **Binance**: $2,500 USDT
- **Total**: $5,000

**Optimal for Serious Trading:**
- **Bybit**: $10,000+ USDC
- **Binance**: $10,000+ USDT
- **Total**: $20,000+

> **Why these amounts?** 
> - Bot default max position is $10,000 per trade
> - 2x leverage means you need $5,000 per exchange minimum for one full position
> - Multiple positions throughout the day require higher capital
> - Smaller amounts will limit the bot's ability to capture opportunities

---

---

## Account Setup

### 1. Bybit Account Setup

Bybit is a centralized exchange. You need to create an account and enable derivatives trading.

#### Step 1: Create Bybit Account

1. Go to https://www.bybit.com
2. Sign up with email
3. Complete KYC verification (required for derivatives trading)
   - Provide ID (passport/driver's license)
   - Take selfie
   - Verification usually takes 15 minutes to 24 hours

#### Step 2: Enable Derivatives Trading

1. Log into Bybit
2. Navigate to **Derivatives → USDT Perpetual**
3. Complete Futures Trading Quiz (if prompted)
4. Accept Terms of Service for Derivatives

#### Step 3: Create API Keys

**IMPORTANT: Follow these steps exactly for security**

1. Go to **Account → API Management**
2. Click **Create New Key**
3. Choose **System Generated API Key**
4. Label it: "Funding Arb Bot"
5. Complete 2FA verification
6. **Save both keys immediately:**
   - API Key: `xxxxxxxxxxxxx`
   - Secret Key: `xxxxxxxxxxxxx`
   - ⚠️ Secret key is only shown ONCE - save it now!

7. **Configure API Permissions:**
   - ✅ **Enable Read**
   - ✅ **Enable Contract Trade** (for derivatives)
   - ❌ Disable Spot Trading
   - ❌ Disable Withdrawals (for security)
   
8. **IP Access (Optional but Recommended):**
   - Select "Restrict access to trusted IPs"
   - Add your server/home IP address
   - This prevents API key use from other locations

9. Click **Confirm**

#### Step 4: Fund Your Bybit Derivatives Account

**Deposit USDT:**
1. Navigate to **Assets → Deposit**
2. Select **USDT**
3. Choose network (TRC20 for lowest fees, ERC20 for Ethereum)
4. Copy your deposit address
5. Send USDT from your exchange/wallet
6. Wait for confirmations (5-10 minutes)

**Transfer to Derivatives Wallet:**
1. Go to **Assets → Transfer**
2. From: Spot Wallet → To: Derivatives
3. Select USDT
4. Amount: Enter USDT amount
5. Confirm transfer

**Required Amounts:**
- **Minimum**: $500 USDT (allows ~$1,000 position with 2x leverage)
- **Recommended**: $2,500 USDT (allows $5,000 positions)
- **Optimal**: $5,000+ USDT (allows full $10,000 positions)

#### Step 5: Verify API Setup

Test your API keys work:
```bash
curl -X GET "https://api.bybit.com/v5/account/wallet-balance?accountType=CONTRACT" \
  -H "X-BAPI-API-KEY: your_api_key_here"
```

Should return your derivatives account balance.

---

### Apex Omni (Alternative)

**Don't want to use Bybit?** You can use **Apex Omni** instead!

Apex Omni is a **decentralized exchange** (DEX) on StarkEx L2 that offers:
- ✅ No KYC required
- ✅ Non-custodial (you control your funds)
- ✅ Accessible to US users
- ✅ Low L2 gas fees
- ✅ Perpetual futures with funding rates

**➡️ [Complete Apex Omni Setup Guide](./APEX_SETUP.md)**

The Apex setup guide covers:
1. Generating StarkEx key pairs
2. Creating an Apex account
3. Funding your L2 wallet
4. Configuring the bot for Apex

**Quick Start:**
1. Generate StarkEx keys at [https://pro.apex.exchange](https://pro.apex.exchange)
2. Deposit USDC to your L2 wallet
3. Update `.env`:
   ```bash
   USE_APEX=true
   APEX_STARK_PRIVATE_KEY=0x...
   APEX_STARK_PUBLIC_KEY=0x...
   APEX_ACCOUNT_ID=12345
   APEX_POSITION_ID=0
   ```
4. Run with `npm run auto-trade-apex`

---

### 2. Binance Account Setup

Binance is a centralized exchange. You need to create an account and enable futures trading.

#### Step 1: Create Binance Account

1. Go to https://www.binance.com
2. Sign up with email
3. Complete KYC verification (required for futures trading)
   - Provide ID (passport/driver's license)
   - Take selfie
   - Verification usually takes 15 minutes to 24 hours

#### Step 2: Enable Futures Trading

1. Log into Binance
2. Navigate to **Derivatives → USDⓈ-M Futures**
3. Complete Futures Trading Quiz (if prompted)
4. Accept Terms of Service for Futures

#### Step 3: Create API Keys

**IMPORTANT: Follow these steps exactly for security**

1. Go to **Profile Icon → API Management**
2. Click **Create API**
3. Choose **System Generated** (not editable)
4. Label it: "Funding Arb Bot"
5. Complete 2FA verification
6. **Save both keys immediately:**
   - API Key: `xxxxxxxxxxxxx`
   - Secret Key: `xxxxxxxxxxxxx`
   - ⚠️ Secret key is only shown ONCE - save it now!

7. **Configure API Restrictions:**
   - ✅ **Enable Reading**
   - ✅ **Enable Futures** 
   - ❌ Disable Spot & Margin
   - ❌ Disable Withdrawals (for security)
   
8. **IP Access (Optional but Recommended):**
   - Select "Restrict access to trusted IPs"
   - Add your server/home IP address
   - This prevents API key use from other locations

9. Click **Save**

#### Step 4: Fund Your Binance Futures Account

**Deposit USDT:**
1. Navigate to **Wallet → Fiat and Spot**
2. Click **Deposit**
3. Select **USDT**
4. Choose network (TRC20 for lowest fees, ERC20 for Ethereum)
5. Copy your deposit address
6. Send USDT from your exchange/wallet
7. Wait for confirmations (5-10 minutes)

**Transfer to Futures Wallet:**
1. Go to **Wallet → Futures**
2. Click **Transfer**
3. From: Spot Wallet → To: USDⓈ-M Futures
4. Amount: Enter USDT amount
5. Confirm transfer

**Required Amounts:**
- **Minimum**: $500 USDT (allows ~$1,000 position with 2x leverage)
- **Recommended**: $2,500 USDT (allows $5,000 positions)
- **Optimal**: $5,000+ USDT (allows full $10,000 positions)

#### Step 5: Verify API Setup

Test your API keys work:
```bash
curl -X GET "https://fapi.binance.com/fapi/v2/balance" \
  -H "X-MBX-APIKEY: your_api_key_here"
```

Should return your futures account balance.

---

### 3. Funding Requirements Summary

| Capital Level | Bybit (USDC) | Binance (USDT) | Max Position Size | Positions/Day |
|---------------|-------------------|----------------|-------------------|---------------|
| **Minimum**   | $500              | $500           | $2,000            | 1-2           |
| **Recommended** | $2,500          | $2,500         | $10,000           | 2-3           |
| **Optimal**   | $5,000+           | $5,000+        | $20,000+          | 5+            |

**Why Equal Funding?**
The bot opens equal positions on both exchanges. If Bybit has $5,000 and Binance has $1,000, the bot can only trade up to $2,000 total (limited by the smaller account).

**Leverage Calculation:**
- Default leverage: 2x
- $5,000 capital at 2x leverage = $10,000 position size
- Both exchanges need equal capital for balanced positions

---

## Installation

### 1. Clone or Download the Repository

```bash
# Option 1: Clone with Git
git clone https://github.com/rkendel1/bot.git
cd bot

# Option 2: Download ZIP
# Download from GitHub and extract, then:
cd bot
```

### 2. Install Dependencies

```bash
npm install
```

This installs:
- TypeScript compiler
- Bybit SDK
- Binance Connector
- Required type definitions

### 3. Verify Installation

```bash
npm run build
```

Should output: No errors, creates `dist/` folder

---

## Configuration

### 1. Create Environment File

```bash
# Copy the example file
cp .env.example .env
```

### 2. Edit .env File

Open `.env` in a text editor and fill in your credentials:

```env
# Bybit API
BYBIT_API_KEY=your_bybit_api_key
BYBIT_API_SECRET=your_bybit_secret

# Binance API
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key

# Trading config
SYMBOL=BTCUSDT
LEVERAGE=2
MIN_FUNDING_SPREAD=0.0002
POSITION_QTY=0.01
```

**Finding Your Keys:**

**Bybit API Keys:**
- Login → Account → API Management
- Copy both API Key and Secret Key
- Example API Key: `xxxxxxxxxxxxxxxxxxxxxxxx`
- Example Secret: `yyyyyyyyyyyyyyyyyyyyyyyy`

**Binance API Keys:**
- Login → Profile → API Management
- Copy both API Key and Secret Key
- Example API Key: `vwxyz1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdef`
- Example Secret: `abc1234567890def1234567890ghi1234567890jkl1234567890mno`

### 3. Secure Your Keys

⚠️ **CRITICAL SECURITY STEPS:**

```bash
# Set proper permissions (Unix/Mac)
chmod 600 .env

# Verify .env is in .gitignore
cat .gitignore | grep .env
```

**Never:**
- Share your `.env` file
- Commit `.env` to Git
- Post API keys online
- Email API keys
- Store keys in cloud drives unencrypted

**Recommended:**
- Enable IP restrictions on both Bybit and Binance API keys
- Enable 2FA on both exchange accounts
- Store majority of funds in separate accounts or cold storage
- Monitor API key activity regularly

---

## Running the Bot

### 1. Choose Your Exchange Pair

The bot supports two configurations:

**Option A: Bybit + Binance (Default)**
```bash
# In .env:
# USE_BYBIT=true (or leave USE_APEX commented out)

npm run auto-trade
```

**Option B: Apex + Binance**
```bash
# In .env:
USE_APEX=true

npm run auto-trade-apex
```

### 2. Test Run (Recommended First)

Before running with real funds, do a dry run to verify everything works:

**With Bybit:**
```bash
npm run auto-trade
```

You should see:
```
============================================================
🚀 Funding Rate Arbitrage Bot
============================================================
Strategy: Delta-Neutral Funding Rate Arbitrage
Exchanges: Bybit (CEX) ↔ Binance (CEX)
Asset: BTC Perpetual Futures
============================================================
```

**With Apex:**
```bash
npm run auto-trade-apex
```

You should see:
```
============================================================
🚀 Funding Rate Arbitrage Bot
============================================================
Strategy: Delta-Neutral Funding Rate Arbitrage
Exchanges: Apex Omni (DEX) ↔ Binance (CEX)
Asset: BTC Perpetual Futures
============================================================

🔷 Apex Omni Features:
  • Decentralized (StarkEx L2)
  • No KYC required
  • Non-custodial
  • Accessible to US users
  • All orders require StarkEx signing
============================================================
```

**Common Configuration Output:**
```
📊 Configuration:
  Min Funding Spread:     0.020%
  Max Position Size:      $10,000
  Max Daily Notional:     $50,000
  Leverage:               2x
  Dynamic Spread:         Disabled
  Auto-Close Interval:    8 hours
  Max Basis Divergence:   1.00%
  Stop-Loss Spread:       -0.010%
============================================================

🔍 Performing initial funding rate check...
```

**If you see errors:**
- "BYBIT_API_KEY not found" → Check your `.env` file (for Bybit mode)
- "APEX_STARK_PRIVATE_KEY not found" → Check your `.env` file (for Apex mode)
- "Invalid API key" → Verify API keys are correct
- "Binance API error" → Verify Binance API keys are correct and Futures is enabled

### 3. Start Bot (Production)

Once verified, run the bot:

```bash
# Basic usage (default settings)
npm run auto-trade

# Keep running in background (Linux/Mac)
nohup npm run auto-trade > bot.log 2>&1 &

# Keep running in background (Windows)
start-bot.bat
```

### 3. Advanced Configuration

Override defaults with CLI arguments:

```bash
# Lower spread threshold for more trades
npm run auto-trade -- --min-spread 0.00015

# Larger position sizes
npm run auto-trade -- --max-position 20000 --max-daily-notional 100000

# Enable dynamic spread threshold
npm run auto-trade -- --dynamic-spread

# Combination
npm run auto-trade -- --min-spread 0.0002 --max-position 15000 --leverage 3 --dynamic-spread
```

**Available Arguments:**
- `--min-spread <value>` - Minimum funding spread (default: 0.0002 = 0.02%)
- `--max-position <value>` - Max position size in USDT (default: 10000)
- `--max-daily-notional <value>` - Max daily exposure (default: 50000)
- `--leverage <value>` - Leverage multiplier (default: 2, max: 5)
- `--dynamic-spread` - Enable volatility-based threshold adjustment

---

## Understanding the Strategy

### How Funding Rates Work

Perpetual futures have no expiry date. To keep futures prices near spot prices, exchanges charge/pay **funding rates** every 8 hours.

**Example:**
- BTC spot price: $45,000
- BTC futures trading at $45,100 (premium)
- Funding rate: +0.15%

**What happens:**
- **Long traders** (bullish) pay 0.15% to short traders
- **Short traders** (bearish) receive 0.15% from long traders
- Payment occurs every 8 hours

### The Arbitrage Opportunity

Different exchanges can have different funding rates at the same time:

| Exchange | Funding Rate | Direction |
|----------|--------------|-----------|
| Bybit | +0.20% | Positive (longs pay) |
| Binance | +0.05% | Positive (longs pay) |
| **Spread** | **0.15%** | **Arbitrage opportunity!** |

**Bot's Strategy:**
1. Go **LONG on Bybit** (receive +0.20% funding)
2. Go **SHORT on Binance** (pay only -0.05% funding)
3. Net profit: 0.15% every 8 hours

**Delta-Neutral:**
- Long $10,000 BTC at $45,000 = +0.222 BTC exposure
- Short $10,000 BTC at $45,000 = -0.222 BTC exposure
- **Net exposure: 0 BTC** (price movements cancel out)

### Risk Profile

✅ **Low Risk:**
- Market neutral (hedged)
- No directional exposure
- Fixed returns from funding rates

⚠️ **Potential Risks:**
- **Basis divergence**: Prices between exchanges drift apart
- **Liquidation**: If leverage too high and prices gap
- **Execution slippage**: Large orders may move the market
- **API failures**: Exchange downtime can prevent trades

**Bot's Risk Mitigation:**
- Auto-close if basis exceeds 1%
- Conservative 2x leverage (reduces liquidation risk)
- Position size limits ($10k default)
- Daily exposure caps ($50k default)
- Stop-loss on adverse spread movements

---

## Risk Management

### Default Safety Parameters

All configurable in `src/config.ts`:

```typescript
MIN_FUNDING_SPREAD: 0.0002        // 0.02% minimum spread
MAX_POSITION_NOTIONAL: 10000      // $10k max per trade
MAX_DAILY_NOTIONAL: 50000         // $50k daily limit
LEVERAGE: 2                       // 2x leverage
AUTO_CLOSE_INTERVAL: 28800        // 8 hours (one funding period)
MAX_BASIS_DIVERGENCE: 0.01        // 1% max price divergence
STOP_LOSS_SPREAD: -0.0001         // -0.01% stop loss
```

### Position Monitoring

The bot automatically:
1. **Checks funding rates** every hour
2. **Monitors active positions** every minute
3. **Auto-closes positions** after 8 hours
4. **Enforces daily limits** to prevent overexposure

### Emergency Stop

To stop the bot immediately:

```bash
# Press Ctrl+C in the terminal

# Or if running in background, find and kill process:
ps aux | grep auto_trading
kill <process_id>
```

**Existing Positions:**
- Bot stopping does NOT close positions
- You must manually close positions on both exchanges
- Or restart the bot to let it manage them

---

## Troubleshooting

### Common Issues

**"Could not find a declaration file for module '@binance/connector'"**
- Solution: Type declarations are included. Run `npm install` again.

**"BYBIT_API_KEY not found in environment variables"**
- Check `.env` file exists in project root
- Verify the line starts with `BYBIT_API_KEY=` (no spaces)
- Restart the bot after editing `.env`

**"Invalid API key or signature"**
- Ensure both BYBIT_API_KEY and BYBIT_API_SECRET are correct
- Copy-paste directly from Bybit API Management page
- No extra spaces or quotes in `.env` file

**"Binance API error: Invalid API key"**
- Verify API key is correct (copy-paste from Binance)
- Check API restrictions: Futures must be enabled
- Verify IP restrictions (if set) include your current IP

**"Error fetching funding rates: No response received"**
- Check internet connection
- Exchange might be down (check status pages)
- Firewall might be blocking API requests

**"No opportunity detected" (always)**
- Funding spreads might be below threshold
- Try lowering `--min-spread` to 0.00010
- Or enable `--dynamic-spread`

**Bot crashes or exits unexpectedly**
- Check logs for errors
- Ensure sufficient funds on both exchanges
- Verify API keys have correct permissions

### Testing

Run the comprehensive test suite:

```bash
npm test
```

Should show all tests passing:
```
✅ Basic opportunity detection
✅ No opportunity when spread is too small
✅ Dynamic spread threshold
✅ Position management
✅ Auto-close conditions
✅ Performance stress test
🎉 All tests completed successfully!
```

---

## Project Structure

```
funding-rate-arb-bot/
├── src/
│   ├── auto_trading_bot.ts       # Main bot logic
│   ├── funding_rate_monitor.ts   # Funding rate fetching
│   ├── config.ts                 # Configuration defaults
│   ├── test_funding_arb.ts       # Test suite
│   └── binance__connector.d.ts   # Type declarations
├── .env                          # Your credentials (DO NOT COMMIT)
├── .env.example                  # Template for .env
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
└── README.md                     # This file
```

---

## Performance Metrics

Based on test results:

| Metric | Performance |
|--------|-------------|
| Decision Speed | < 1ms average |
| Throughput | 25,000+ decisions/second |
| Opportunity Detection | < 10ms |
| Full Trade Cycle | < 150ms |

---

## FAQ

**Q: How much can I make?**
A: Depends on capital and market conditions. With $10,000 total capital:
- Conservative: $150-250/month (15-25% APR)
- Active markets: $400-500/month (40-50% APR)

**Q: Is this risk-free?**
A: No trading is risk-free. This strategy is LOW risk (delta-neutral), but risks include basis divergence, liquidation, and execution failures.

**Q: Do I need to monitor the bot 24/7?**
A: No, but recommended to check daily. The bot auto-manages positions.

**Q: What if one exchange goes down?**
A: You'll have unhedged exposure. The bot will log errors but can't close positions on the offline exchange.

**Q: Can I run this on multiple pairs (BTC, ETH, SOL)?**
A: Currently only BTC. Multi-pair support is a future enhancement.

**Q: What are the fees?**
A: 
- Bybit: ~0.02% maker, 0.05% taker
- Binance: ~0.02% maker, 0.04% taker
- Funding rates more than cover fees when spread is sufficient

**Q: Can I use different leverage?**
A: Yes, use `--leverage <value>`. But higher leverage = higher liquidation risk.

**Q: How do I withdraw profits?**
A: Manually withdraw from each exchange:
- Bybit: Withdraw USDT directly from the exchange
- Binance: Withdraw USDT directly from the exchange

---

## Security Best Practices

✅ **DO:**
- Start with small amounts to test
- Enable IP restrictions on both Bybit and Binance API keys
- Enable 2FA on both exchange accounts
- Keep `.env` file secure (chmod 600)
- Monitor positions daily
- Regularly check API key activity logs

❌ **DON'T:**
- Share your API keys
- Enable Withdrawals permission on API keys
- Store all funds on exchanges - keep only trading capital
- Run on untrusted servers
- Commit `.env` to Git
- Use public WiFi when managing bot

---

## Support & Updates

- **Issues**: https://github.com/rkendel1/bot/issues
- **Documentation**: This README
- **Testing Guide**: See [TESTING.md](./TESTING.md)

---

## License

ISC

---

## Disclaimer

**⚠️ IMPORTANT - READ CAREFULLY:**

This software is provided as-is without warranties of any kind. Cryptocurrency trading carries significant financial risk. You can lose money.

- NOT financial advice
- NOT guaranteed profits
- USE AT YOUR OWN RISK
- Test with small amounts first
- Only trade funds you can afford to lose
- Past performance does not guarantee future results

By using this bot, you acknowledge:
1. You understand cryptocurrency trading risks
2. You are responsible for your own trades
3. The developers are not liable for any losses
4. You have tested the bot with small amounts
5. You understand how the strategy works

**Start small. Test thoroughly. Never risk more than you can afford to lose.**

---

**Version:** 2.0.0  
**Last Updated:** January 8, 2026
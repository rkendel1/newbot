# Apex Omni Setup Guide

This guide explains how to switch your funding rate arbitrage bot from Bybit to **Apex Omni**, a decentralized perpetual futures exchange.

## Why Apex Omni?

Apex Omni offers several advantages over centralized exchanges:

- ✅ **No KYC required** - Start trading immediately
- ✅ **Non-custodial** - You control your funds and private keys
- ✅ **US-accessible** - Available to US users
- ✅ **Low fees** - Minimal gas fees on StarkEx L2
- ✅ **High liquidity** - Built on dYdX v3 technology
- ✅ **Funding rates** - Supports perpetual futures with funding

## Key Differences from Bybit

| Feature | Bybit | Apex Omni |
|---------|-------|-----------|
| **Type** | Centralized (CEX) | Decentralized (DEX) |
| **KYC** | Required | Not required |
| **Custody** | Exchange holds funds | You hold funds (L2 wallet) |
| **API Authentication** | API Key + Secret | StarkEx Private Key signing |
| **Order Signing** | Server-side | Client-side (every order) |
| **Withdrawals** | 24-hour wait | Instant L2 → L1 bridge |

## Prerequisites

Before you can use Apex Omni, you need:

1. **StarkEx Key Pair**  
   - Private key (hex string)
   - Public key (hex string)
   
2. **Apex Account**
   - L2 account ID
   - Position ID for perpetual futures

3. **Funded Apex Account**
   - USDC on StarkEx L2
   - Minimum $500 recommended

## Step 1: Generate StarkEx Keys

Apex uses **StarkEx** for L2 operations. You need to generate a StarkEx key pair.

### Option A: Using Official Apex Web Interface

1. Go to [https://pro.apex.exchange](https://pro.apex.exchange)
2. Click "Connect Wallet"
3. Follow prompts to generate your StarkEx keys
4. **Save your private key securely** - you'll need it for the bot

### Option B: Using StarkEx Libraries (Advanced)

```typescript
import { ec } from 'starkware-crypto';

// Generate a new key pair
const keyPair = ec.genKeyPair();
const privateKey = keyPair.getPrivate('hex');
const publicKey = ec.keyFromPrivate(privateKey, 'hex').getPublic('hex');

console.log('Private Key:', privateKey);
console.log('Public Key:', publicKey);
```

⚠️ **SECURITY WARNING**: Never share your StarkEx private key. Store it securely like you would a wallet seed phrase.

## Step 2: Create Apex Account

1. Visit [https://pro.apex.exchange](https://pro.apex.exchange)
2. Connect your wallet (MetaMask, WalletConnect, etc.)
3. Complete the onboarding process
4. Note your **Account ID** and **Position ID**

### Finding Your Account ID

Your Account ID can be found in:
- Apex Pro dashboard → Settings → API Keys
- Or via the Apex API: `GET /v1/account`

### Finding Your Position ID

Your Position ID is generated when you:
- Open your first perpetual position
- Or manually create a position via the API

For most users, the Position ID is `0` by default.

## Step 3: Fund Your Apex Account

Apex operates on StarkEx L2, which uses **USDC** as the primary collateral.

### Deposit USDC to Apex

1. Go to Apex Pro → Deposit
2. Select USDC amount
3. Approve transaction in your wallet
4. Wait for L1 → L2 bridge confirmation (5-15 minutes)

**Minimum Recommended**: $500 USDC

**Optimal**: $5,000+ USDC for full $10,000 position sizes

## Step 4: Configure Your Bot

Update your `.env` file with Apex credentials:

```bash
# Exchange Selection
USE_APEX=true          # Use Apex instead of Bybit
# USE_BYBIT=true       # Comment this out

# Apex Omni Configuration
APEX_BASE_URL=https://api.apex.exchange/v1
APEX_STARK_PRIVATE_KEY=0x1234567890abcdef...  # Your StarkEx private key
APEX_STARK_PUBLIC_KEY=0xabcdef1234567890...   # Your StarkEx public key
APEX_ACCOUNT_ID=12345                          # Your Apex account ID
APEX_POSITION_ID=0                             # Your position ID (usually 0)

# Binance (unchanged)
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key

# Trading Configuration
SYMBOL=BTCUSDT
LEVERAGE=2
```

## Step 5: Run the Bot with Apex

```bash
# Run bot with Apex + Binance
npm run auto-trade-apex

# Or run the default (Bybit + Binance) if USE_APEX is not set
npm run auto-trade
```

The bot will automatically:
1. Monitor funding rates on Apex (BTC-USDC) and Binance (BTCUSDT)
2. Detect arbitrage opportunities
3. Sign and submit orders to Apex using your StarkEx key
4. Execute delta-neutral positions

## Symbol Mapping

The bot automatically converts symbol formats:

| Binance | Apex Omni |
|---------|-----------|
| BTCUSDT | BTC-USDC |
| ETHUSDT | ETH-USDC |
| SOLUSDT | SOL-USDC |

## Important Notes

### ⚠️ StarkEx Signing

The current implementation uses a **placeholder signing method**. For production use, you **MUST** implement proper StarkEx signing.

The placeholder is located in `src/apex_exchange.ts`:

```typescript
private signOrder(order: Record<string, any>): string {
  // TODO: Replace with actual StarkEx signing implementation
  // This is a placeholder that generates a deterministic signature
  // for testing and development purposes only
  
  // For production, use:
  // - starkex-lib
  // - starknet.js
  // - Apex's official signing SDK
}
```

### Security Best Practices

1. **Never commit your `.env` file**
   ```bash
   # Already in .gitignore, but double-check:
   git status  # .env should NOT appear
   ```

2. **Use separate keys for testing**
   - Generate a test key pair for development
   - Use a production key pair only when going live

3. **Limit funds**
   - Start with small amounts ($500-$1,000)
   - Only deposit what you're willing to risk

4. **Monitor regularly**
   - Check positions daily
   - Monitor API key activity on Apex dashboard

### Withdrawing Funds

To withdraw from Apex:

1. Go to Apex Pro → Withdraw
2. Select USDC amount
3. Initiate L2 → L1 withdrawal
4. Wait for finalization (~4 hours)
5. Withdraw to your Ethereum wallet

## Troubleshooting

### "APEX_STARK_PRIVATE_KEY not found"

Make sure your `.env` file contains:
```bash
APEX_STARK_PRIVATE_KEY=0x...
```

Check that you're running from the project root directory.

### "Invalid signature"

This means StarkEx signing isn't working properly. Possible causes:

1. Using the placeholder implementation (expected for development)
2. Incorrect private key format
3. Wrong key pair for your Apex account

**Solution**: Implement proper StarkEx signing using Apex's official SDK or starknet.js library.

### "No funding rate in response"

Apex's API structure might differ from the specification. Check:

1. API endpoint: `/v1/funding?symbol=BTC-USDC`
2. Response structure (adjust field names in `src/apex_exchange.ts` if needed)

### Position not opening

1. Check your USDC balance on Apex
2. Verify Position ID is correct
3. Check bot logs for API errors
4. Ensure StarkEx signature is valid

## Performance Considerations

### Polling vs WebSocket

Unlike Bybit, Apex funding rate monitor uses **polling** (fetching every 60 seconds) instead of WebSocket. This is because:

- Apex's WebSocket documentation doesn't specify funding rate streams
- Polling every 60s is sufficient for funding rate arbitrage
- Reduces complexity and potential connection issues

You can adjust the polling interval in `src/apex_funding_monitor.ts`:

```typescript
const pollInterval = 60000; // 60 seconds (default)
```

### Latency

Apex L2 operations are fast:
- Order placement: < 100ms
- Position updates: Near-instant
- Funding collection: Every 8 hours (same as Bybit/Binance)

## Next Steps

1. ✅ Configure `.env` with Apex credentials
2. ✅ Run bot with small test amount
3. ✅ Monitor first funding cycle (8 hours)
4. ✅ Verify funding collection
5. ✅ Implement production StarkEx signing
6. ✅ Scale up position sizes

## Support & Resources

- **Apex Documentation**: https://docs.apex.exchange
- **Apex Discord**: https://discord.gg/apex
- **StarkEx Resources**: https://docs.starkware.co/starkex/
- **Bot Issues**: https://github.com/rkendel1/newbot/issues

## FAQ

**Q: Can I use both Bybit and Apex?**  
A: Currently, the bot is configured for one exchange at a time (either Bybit OR Apex). You can switch by changing `USE_APEX` in `.env`.

**Q: What are the fees on Apex?**  
A: Apex has:
- Maker fee: ~0.02%
- Taker fee: ~0.05%
- L2 gas fees: Minimal (< $0.01 per trade)

**Q: Is Apex safe?**  
A: Apex is non-custodial (you control your keys), but carries smart contract risk. Only trade with funds you can afford to lose.

**Q: Can I use other assets besides BTC?**  
A: Yes, Apex supports ETH, SOL, and other perpetual markets. Update `SYMBOL` in `.env` and the bot will convert the symbol format automatically.

**Q: How do I implement proper StarkEx signing?**  
A: Use Apex's official SDK or libraries like:
- `@apexprotocol/starkex-sdk` (if available)
- `starknet.js`
- `starkware-crypto`

Replace the placeholder in `src/apex_exchange.ts → signOrder()`.

---

**Version**: 1.0.0  
**Last Updated**: January 8, 2026

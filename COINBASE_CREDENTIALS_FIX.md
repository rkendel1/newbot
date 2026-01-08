# Coinbase API Credentials Fix - Summary

## Problem

Users reported the error: **"I don't have a coinbase passphrase. Can't set one."**

The bot required Coinbase API credentials (`COINBASE_API_KEY`, `COINBASE_API_SECRET`, `COINBASE_API_PASSPHRASE`) even for public data endpoints like funding rates, preventing users from running the bot in monitoring mode.

## Solution

Made Coinbase API credentials optional for public endpoints while keeping them required for trading operations.

### Changes Made

1. **Updated `CoinbasePerpsConfig` interface** (`src/coinbase_perps.ts`)
   - Made `apiKey`, `apiSecret`, and `passphrase` optional fields
   - Changed from `string` to `string | undefined`

2. **Updated `CoinbasePerps` class** (`src/coinbase_perps.ts`)
   - Changed credential properties to optional types
   - Added validation in `sign()` and `getHeaders()` methods
   - Throw clear error messages only when credentials are needed but missing

3. **Improved warning messages** (`src/funding_rate_monitor.ts`)
   - Changed from "Warning" to "Notice" for missing credentials
   - Added clear explanation that public endpoints work without credentials
   - Specified that credentials are only needed for trading

4. **Updated `.env.example`**
   - Added prominent notes that credentials are optional
   - Commented out the credential examples
   - Clarified when credentials are needed vs. not needed

5. **Added test coverage** (`src/test_optional_creds.ts`)
   - Test client initialization without credentials
   - Test client initialization with empty credentials
   - Test public endpoint usage without credentials

## Testing

### Before Fix
```
❌ Bot crashes with "COINBASE_API_PASSPHRASE not set" error
```

### After Fix
```
✅ Bot runs successfully with clear informative message:
   "⚠️  Notice: COINBASE_API_KEY, COINBASE_API_SECRET, or COINBASE_API_PASSPHRASE not set
    Public endpoints (like funding rates) will work without credentials.
    Trading functionality will require valid API credentials."
```

### Test Results
- ✅ Client initializes without credentials
- ✅ Client initializes with empty credentials
- ✅ Public endpoints work without credentials
- ✅ Private endpoints properly report when credentials are missing
- ✅ No security vulnerabilities introduced

## Usage

### For Monitoring Only (No Credentials Needed)
```bash
# In .env file, just set:
COINBASE_BASE_URL=https://api-public.international.coinbase.com

# Leave these commented out or unset:
# COINBASE_API_KEY=
# COINBASE_API_SECRET=
# COINBASE_API_PASSPHRASE=
```

### For Trading (Credentials Required)
```bash
# In .env file, set all three:
COINBASE_BASE_URL=https://api-public.international.coinbase.com
COINBASE_API_KEY=your_actual_key
COINBASE_API_SECRET=your_actual_secret
COINBASE_API_PASSPHRASE=your_actual_passphrase
```

## Security

- ✅ No vulnerabilities introduced (verified with CodeQL)
- ✅ Credentials are still required for authenticated operations
- ✅ Clear error messages prevent accidental API calls without proper auth
- ✅ .env file properly excluded from version control

## Related Files

- `src/coinbase_perps.ts` - Main Coinbase API client
- `src/funding_rate_monitor.ts` - Funding rate monitoring
- `.env.example` - Configuration template
- `src/test_optional_creds.ts` - Test coverage

## Impact

Users can now:
1. Run the bot without Coinbase credentials for monitoring funding rates
2. See clear messages about what works with/without credentials
3. Add credentials later when ready to trade
4. Understand the optional nature of credentials from the `.env.example` file

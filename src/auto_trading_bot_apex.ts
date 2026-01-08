/**
 * Auto Trading Bot with Apex Omni Support
 * 
 * This version of the bot supports using Apex Omni as Exchange A
 * instead of Bybit, while keeping Binance as Exchange B.
 * 
 * To use:
 * - Set USE_APEX=true in .env to use Apex
 * - Set USE_BYBIT=true in .env to use Bybit (default)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { FundingRateMonitor } from './funding_rate_monitor';
import { ApexFundingMonitor } from './apex_funding_monitor';
import { DEFAULTS, parseCliArgs, StrategyConfig, Position } from './config';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

class AutoTradingBot {
  private fundingMonitor: FundingRateMonitor | ApexFundingMonitor;
  private config: StrategyConfig;
  private activePositions: Position[] = [];
  private dailyNotionalUsed: number = 0;
  private lastDailyReset: Date = new Date();
  private isRunning: boolean = false;
  private minFundingSpread: number;
  private maxPositionNotional: number;
  private maxDailyNotional: number;
  private leverage: number;
  private useDynamicSpread: boolean;
  private useApex: boolean;
  private exchangeName: string;

  constructor() {
    // Parse CLI arguments
    const args = process.argv.slice(2);
    this.config = parseCliArgs(args);

    // Determine which exchange to use
    this.useApex = process.env.USE_APEX === 'true';
    this.exchangeName = this.useApex ? 'Apex Omni' : 'Bybit';

    // Initialize configuration with CLI overrides or defaults
    this.minFundingSpread = this.config.minSpread || DEFAULTS.MIN_FUNDING_SPREAD;
    this.maxPositionNotional = this.config.maxPosition || DEFAULTS.MAX_POSITION_NOTIONAL;
    this.maxDailyNotional = this.config.maxDailyNotional || DEFAULTS.MAX_DAILY_NOTIONAL;
    this.leverage = this.config.leverage || DEFAULTS.LEVERAGE;
    this.useDynamicSpread = this.config.dynamicSpread || false;

    // Initialize appropriate funding monitor
    try {
      if (this.useApex) {
        console.log('🔷 Initializing Apex Omni exchange adapter...');
        this.fundingMonitor = new ApexFundingMonitor(this.useDynamicSpread);
      } else {
        console.log('🟦 Initializing Bybit exchange adapter...');
        this.fundingMonitor = new FundingRateMonitor(this.useDynamicSpread);
      }
    } catch (error: any) {
      console.error(`❌ Failed to initialize funding monitor: ${error.message}`);
      throw error;
    }
  }

  async start() {
    console.log('='.repeat(60));
    console.log('🚀 Funding Rate Arbitrage Bot');
    console.log('='.repeat(60));
    console.log('Strategy: Delta-Neutral Funding Rate Arbitrage');
    console.log(`Exchanges: ${this.exchangeName} ${this.useApex ? '(DEX)' : '(CEX)'} ↔ Binance (CEX)`);
    console.log('Asset: BTC Perpetual Futures');
    console.log('='.repeat(60));
    console.log('\n📊 Configuration:');
    console.log(`  Exchange A:             ${this.exchangeName}`);
    console.log(`  Exchange B:             Binance`);
    console.log(`  Min Funding Spread:     ${(this.minFundingSpread * 100).toFixed(3)}%`);
    console.log(`  Max Position Size:      $${this.maxPositionNotional.toLocaleString()}`);
    console.log(`  Max Daily Notional:     $${this.maxDailyNotional.toLocaleString()}`);
    console.log(`  Leverage:               ${this.leverage}x`);
    console.log(`  Dynamic Spread:         ${this.useDynamicSpread ? 'Enabled' : 'Disabled'}`);
    console.log(`  Auto-Close Interval:    ${DEFAULTS.AUTO_CLOSE_INTERVAL / 3600} hours`);
    console.log(`  Max Basis Divergence:   ${(DEFAULTS.MAX_BASIS_DIVERGENCE * 100).toFixed(2)}%`);
    console.log(`  Stop-Loss Spread:       ${(DEFAULTS.STOP_LOSS_SPREAD * 100).toFixed(3)}%`);
    
    if (this.useApex) {
      console.log('\n🔷 Apex Omni Features:');
      console.log('  • Decentralized (StarkEx L2)');
      console.log('  • No KYC required');
      console.log('  • Non-custodial');
      console.log('  • Accessible to US users');
      console.log('  • All orders require StarkEx signing');
    }
    
    console.log('='.repeat(60));
    
    this.isRunning = true;

    // Start monitoring
    console.log('\n🔌 Starting real-time funding rate monitoring...\n');
    this.fundingMonitor.start();

    // Initial funding rate check
    console.log('\n🔍 Performing initial funding rate check...\n');
    await this.checkFundingOpportunity();

    // Set up periodic checks
    const checkInterval = DEFAULTS.FUNDING_CHECK_INTERVAL;
    console.log(`⏰ Monitoring active - checking every ${checkInterval / 60000} minutes\n`);
    
    setInterval(async () => {
      if (!this.isRunning) return;
      await this.checkFundingOpportunity();
    }, checkInterval);

    // Set up position monitoring for auto-close
    setInterval(() => {
      if (!this.isRunning) return;
      this.monitorPositions();
    }, 60000); // Check positions every minute

    // Daily reset of notional limits
    setInterval(() => {
      this.resetDailyLimits();
    }, 3600000); // Check every hour
  }

  private async checkFundingOpportunity() {
    try {
      let rates: any;
      let spread: number;
      
      if (this.useApex) {
        const apexMonitor = this.fundingMonitor as ApexFundingMonitor;
        const { apexRate, binRate } = await apexMonitor.getFundingRates();
        rates = { exchangeARate: apexRate, binRate };
        spread = apexRate - binRate;
      } else {
        const bybitMonitor = this.fundingMonitor as FundingRateMonitor;
        const { bybitRate, binRate } = await bybitMonitor.getFundingRates();
        rates = { exchangeARate: bybitRate, binRate };
        spread = bybitRate - binRate;
      }
      
      const spreadPct = (Math.abs(spread) * 100).toFixed(4);
      
      console.log('─'.repeat(60));
      console.log(`[${new Date().toISOString()}] Funding Rate Check`);
      console.log(`  ${this.exchangeName}:${' '.repeat(Math.max(1, 13 - this.exchangeName.length))}${(rates.exchangeARate * 100).toFixed(4)}%`);
      console.log(`  Binance:     ${(rates.binRate * 100).toFixed(4)}%`);
      console.log(`  Spread:      ${(spread * 100).toFixed(4)}% (${spreadPct}%)`);
      
      if (this.useDynamicSpread) {
        const volatility = this.fundingMonitor.getCurrentVolatility();
        console.log(`  Volatility:  ${(volatility * 100).toFixed(4)}%`);
      }
      
      const opportunity = await this.fundingMonitor.detectOpportunity(this.minFundingSpread);
      
      if (opportunity) {
        console.log(`  Threshold:   ${(opportunity.dynamicThreshold * 100).toFixed(4)}%`);
        console.log('🎯 OPPORTUNITY DETECTED!');
        console.log('─'.repeat(60));
        
        // Check if we can open a new position
        if (this.canOpenPosition()) {
          await this.executeFundingArb(opportunity);
        } else {
          console.log('⚠️  Cannot open position: Daily notional limit reached');
          console.log(`  Used: $${this.dailyNotionalUsed.toLocaleString()} / $${this.maxDailyNotional.toLocaleString()}`);
          console.log('─'.repeat(60));
        }
      } else {
        console.log(`  Threshold:   ${(this.minFundingSpread * 100).toFixed(4)}%`);
        console.log('  Status:      No opportunity - spread below threshold');
        console.log('─'.repeat(60));
      }
    } catch (error: any) {
      console.error('❌ Error in funding rate check:', error.message);
      console.log('─'.repeat(60));
    }
  }

  private canOpenPosition(): boolean {
    const remainingNotional = this.maxDailyNotional - this.dailyNotionalUsed;
    return remainingNotional >= this.maxPositionNotional;
  }

  private calculatePositionSize(): number {
    const remainingNotional = this.maxDailyNotional - this.dailyNotionalUsed;
    return Math.min(this.maxPositionNotional, remainingNotional);
  }

  private resetDailyLimits(): void {
    const now = new Date();
    const hoursSinceReset = (now.getTime() - this.lastDailyReset.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceReset >= 24) {
      console.log('\n🔄 Resetting daily notional limits');
      console.log(`  Previous usage: $${this.dailyNotionalUsed.toLocaleString()}`);
      this.dailyNotionalUsed = 0;
      this.lastDailyReset = now;
      console.log('  Limits reset ✅\n');
    }
  }

  private monitorPositions(): void {
    const now = new Date();
    
    for (const position of this.activePositions) {
      if (position.status !== 'active') continue;
      
      const ageSeconds = (now.getTime() - position.entryTime.getTime()) / 1000;
      
      // Check auto-close interval
      if (ageSeconds >= DEFAULTS.AUTO_CLOSE_INTERVAL) {
        console.log(`\n⏰ Position ${position.id} reached auto-close interval`);
        this.closePosition(position, 'auto-close-timeout');
        continue;
      }
    }
  }

  private closePosition(position: Position, reason: string): void {
    console.log('─'.repeat(60));
    console.log(`🔒 Closing Position: ${position.id}`);
    console.log(`  Reason: ${reason}`);
    console.log(`  Entry Time: ${position.entryTime.toISOString()}`);
    
    if (this.useApex) {
      console.log(`  Apex Side: ${position.bybitSide}, Bin Side: ${position.binSide}`);
    } else {
      console.log(`  Bybit Side: ${position.bybitSide}, Bin Side: ${position.binSide}`);
    }
    
    console.log(`  Notional: $${position.notional.toLocaleString()}`);
    console.log('─'.repeat(60));
    
    // Mark position as closed
    position.status = 'closed';
    position.closeTime = new Date();
    
    console.log('⚠️  IMPLEMENTATION NOTE:');
    console.log('To complete position closing, implement:');
    
    if (this.useApex) {
      console.log('1. Close Apex position via ApexExchange.placeOrder() with reduceOnly=true');
    } else {
      console.log('1. Close Bybit position via SDK');
    }
    
    console.log('2. Close Binance position via API');
    console.log('3. Calculate realized P&L and funding payments');
    console.log('4. Log final position metrics');
    console.log('─'.repeat(60) + '\n');
  }

  private async executeFundingArb(opportunity: any) {
    console.log('\n' + '='.repeat(60));
    console.log('💰 EXECUTING FUNDING ARBITRAGE TRADE');
    console.log('='.repeat(60));
    
    const positionSize = this.calculatePositionSize();
    
    console.log(`Strategy:          Delta-neutral hedged position`);
    
    if (this.useApex) {
      console.log(`Apex:              ${opportunity.sideApex}`);
      console.log(`Binance:           ${opportunity.sideBin}`);
    } else {
      console.log(`Bybit:             ${opportunity.sideBybit}`);
      console.log(`Binance:           ${opportunity.sideBin}`);
    }
    
    console.log(`Notional Size:     $${positionSize.toLocaleString()}`);
    console.log(`Leverage:          ${this.leverage}x`);
    console.log(`Spread at Entry:   ${(opportunity.spread * 100).toFixed(4)}%`);
    console.log(`Dynamic Threshold: ${(opportunity.dynamicThreshold * 100).toFixed(4)}%`);
    console.log('='.repeat(60));
    
    // Create position record
    const position: Position = {
      id: `pos-${Date.now()}`,
      symbol: process.env.SYMBOL || 'BTCUSDT',
      bybitSide: this.useApex ? opportunity.sideApex : opportunity.sideBybit,
      binSide: opportunity.sideBin,
      notional: positionSize,
      leverage: this.leverage,
      entryTime: new Date(),
      bybitEntryPrice: 0,
      binEntryPrice: 0,
      bybitFundingRate: 0,
      binFundingRate: 0,
      spreadAtEntry: opportunity.spread,
      status: 'active'
    };
    
    this.activePositions.push(position);
    this.dailyNotionalUsed += positionSize;
    
    console.log(`\n📊 Position Status:`);
    console.log(`  Active Positions:  ${this.activePositions.filter(p => p.status === 'active').length}`);
    console.log(`  Daily Notional:    $${this.dailyNotionalUsed.toLocaleString()} / $${this.maxDailyNotional.toLocaleString()}`);
    
    console.log('\n⚠️  IMPLEMENTATION NOTE:');
    console.log('This framework tracks positions for risk management.');
    console.log('To enable actual trading, implement the following:');
    console.log('');
    console.log('1. Fetch current BTC/USDT (or BTC/USDC for Apex) price from both exchanges');
    console.log('2. Calculate contract sizes for equal notional value');
    
    if (this.useApex) {
      console.log('3. Place orders on Apex:');
      console.log('   - Use apexClient.placeOrder() or marketBuy()/marketSell()');
      console.log('   - Orders will be signed with StarkEx private key');
      console.log('   ⚠️  IMPORTANT: Verify StarkEx signing is properly implemented');
    } else {
      console.log('3. Place market orders on Bybit:');
      console.log('   - Use bybitRest.submitOrder()');
    }
    
    console.log('4. Place market orders on Binance:');
    console.log('   - Use binanceClient.futuresOrder()');
    console.log('5. Store actual entry prices and funding rates');
    console.log('6. Monitor position for P&L tracking');
    console.log('7. Implement auto-close when conditions are met');
    console.log('');
    console.log('Expected APR: 15-50% depending on funding rate spreads');
    console.log('Risks: Execution slippage, fees, basis divergence, liquidation');
    
    if (this.useApex) {
      console.log('');
      console.log('Apex-specific considerations:');
      console.log('• All orders require StarkEx signature');
      console.log('• Gas fees on L2 are minimal');
      console.log('• Non-custodial (you control private keys)');
      console.log('• No KYC, accessible to US users');
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }

  stop() {
    this.isRunning = false;
    console.log('\n🛑 Shutting down bot...');
    console.log(`Active positions: ${this.activePositions.filter(p => p.status === 'active').length}`);
    this.fundingMonitor.close();
    console.log('Bot stopped');
  }
}

async function main() {
  const bot = new AutoTradingBot();
  
  process.on('SIGINT', () => {
    console.log('\n\nReceived shutdown signal...');
    bot.stop();
    process.exit(0);
  });

  await bot.start();
}

main().catch(console.error);

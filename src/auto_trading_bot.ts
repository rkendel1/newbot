import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { BalanceChecker, BalanceInfo } from './balance_checker';
import { FundingRateMonitor } from './funding_rate_monitor';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface PriceData {
    UP: number;
    DOWN: number;
}

interface Trade {
    tokenType: string;
    tokenId: string;
    buyOrderId: string;
    takeProfitOrderId: string;
    stopLossOrderId: string;
    buyPrice: number;
    targetPrice: number;
    stopPrice: number;
    amount: number;
    timestamp: Date;
    status: string;
}

interface TradeOpportunity {
    tokenType: string;
    tokenId: string;
    softwarePrice: number;
    polymarketPrice: number;
    difference: number;
}

class AutoTradingBot {
    private wallet: Wallet;
    private client: ClobClient;
    private balanceChecker: BalanceChecker;
    private fundingMonitor: FundingRateMonitor | null = null;
    private tokenIdUp: string | null = null;
    private tokenIdDown: string | null = null;
    
    private softwarePrices: PriceData = { UP: 0, DOWN: 0 };
    private polymarketPrices: Map<string, number> = new Map();
    
    private activeTrades: Trade[] = [];
    private lastTradeTime: number = 0;
    private lastBalanceCheck: number = 0;
    private balanceCheckInterval: number = 60000;
    
    private priceThreshold: number;
    private stopLossAmount: number;
    private takeProfitAmount: number;
    private tradeCooldown: number;
    private tradeAmount: number;
    
    private softwareWs: WebSocket | null = null;
    private polymarketWs: WebSocket | null = null;
    private isRunning: boolean = false;
    
    private useFundingArbStrategy: boolean = false;

    constructor() {
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey || privateKey.length < 64) {
            console.error('❌ PRIVATE_KEY not found or invalid in environment variables');
            console.error('Please add your private key to the .env file:');
            console.error('PRIVATE_KEY=0xYourPrivateKeyHere');
            throw new Error('PRIVATE_KEY not found in .env');
        }

        this.wallet = new Wallet(privateKey);
        this.client = new ClobClient(
            process.env.CLOB_API_URL || 'https://clob.polymarket.com',
            137,
            this.wallet
        );
        this.balanceChecker = new BalanceChecker();

        this.priceThreshold = parseFloat(process.env.PRICE_DIFFERENCE_THRESHOLD || '0.015');
        this.stopLossAmount = parseFloat(process.env.STOP_LOSS_AMOUNT || '0.005');
        this.takeProfitAmount = parseFloat(process.env.TAKE_PROFIT_AMOUNT || '0.01');
        this.tradeCooldown = parseInt(process.env.TRADE_COOLDOWN || '30') * 1000;
        this.tradeAmount = parseFloat(process.env.DEFAULT_TRADE_AMOUNT || '5.0');

        // Check for funding arbitrage strategy flag
        this.useFundingArbStrategy = this.isFundingArbStrategyEnabled();
        
        // Initialize funding monitor if strategy is enabled
        if (this.useFundingArbStrategy) {
            try {
                this.fundingMonitor = new FundingRateMonitor();
            } catch (error: any) {
                console.warn(`⚠️  Funding monitor initialization failed: ${error.message}`);
                console.warn('Falling back to default Polymarket strategy');
                this.useFundingArbStrategy = false;
            }
        }
    }

    private isFundingArbStrategyEnabled(): boolean {
        const args = process.argv.slice(2);
        return args.includes('--strategy=funding-arb');
    }

    async start() {
        console.log('='.repeat(60));
        console.log('Starting Auto Trading Bot...');
        console.log('='.repeat(60));
        console.log(`Wallet: ${this.wallet.address}`);
        
        // Prioritize funding arbitrage strategy
        if (this.useFundingArbStrategy && this.fundingMonitor) {
            console.log('Strategy: Funding Rate Arbitrage (PRIMARY MODE)');
            console.log('='.repeat(60));
            await this.startFundingArbStrategy();
            return;
        }
        
        // Legacy Polymarket strategy (fallback)
        console.log('Strategy: Polymarket Arbitrage (LEGACY MODE)');
        console.log(`Threshold: $${this.priceThreshold.toFixed(4)}`);
        console.log(`Take Profit: +$${this.takeProfitAmount.toFixed(4)}`);
        console.log(`Stop Loss: -$${this.stopLossAmount.toFixed(4)}`);
        console.log(`Trade Amount: $${this.tradeAmount.toFixed(2)}`);
        console.log(`Cooldown: ${this.tradeCooldown / 1000}s`);
        console.log('='.repeat(60));
        console.log('✅ RPC is valid');
        console.log('\n💰 Checking wallet balances...');
        const balances = await this.checkAndDisplayBalances();
        
        // Require minimum $500 USDC for trading
        const minimumBalance = 500.0;
        const check = this.balanceChecker.checkSufficientBalance(balances, minimumBalance, 0.05);
        console.log('\n📊 Balance Check (Minimum $500 required for trading):');
        check.warnings.forEach(w => console.log(`  ${w}`));
        
        if (!check.sufficient) {
            console.log('\n❌ Insufficient funds to start trading!');
            console.log('Please fund your wallet:');
            console.log(`  - USDC: At least $${minimumBalance.toFixed(2)}`);
            console.log(`  - MATIC: At least 0.05 for gas fees`);
            throw new Error('Insufficient balance');
        }
        
        console.log('\n✅ Balances sufficient!');
        
        await this.initializeMarket();
        
        console.log('\n📡 Connecting to data feeds...');
        await this.connectSoftwareWebSocket();
        await this.connectPolymarketWebSocket();
        
        console.log('⏳ Waiting for initial price data...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        this.isRunning = true;
        this.startMonitoring();
        
        console.log('\n✅ Bot started successfully!');
        console.log('🚀 Starting automatic trading immediately...\n');
        
        // Immediately start checking for trade opportunities
        this.startImmediateTrading();
    }

    private async checkAndDisplayBalances(): Promise<BalanceInfo> {
        const balances = await this.balanceChecker.checkBalances(this.wallet);
        this.balanceChecker.displayBalances(balances);
        return balances;
    }

    private async initializeMarket() {
        console.log('Finding current Bitcoin market...');
        
        const now = new Date();
        const month = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const day = now.getDate();
        const hour = now.getHours();
        const timeStr = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
        const slug = `bitcoin-up-or-down-${month}-${day}-${timeStr}-et`;
        
        console.log(`Searching for market: ${slug}`);
        
        const response = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
        const data: any = await response.json();
        
        let market = null;
        if (Array.isArray(data) && data.length > 0) {
            market = data[0];
        } else if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            market = data.data[0];
        }
        
        if (!market) {
            console.log('Market not found by slug, searching active markets...');
            const activeResponse = await fetch('https://gamma-api.polymarket.com/markets?active=true&limit=50&closed=false');
            const activeData: any = await activeResponse.json();
            const markets = Array.isArray(activeData) ? activeData : (activeData.data || []);
            
            market = markets.find((m: any) => {
                const q = (m.question || '').toLowerCase();
                return (q.includes('bitcoin') || q.includes('btc')) && q.includes('up') && q.includes('down');
            });
            
            if (!market) {
                throw new Error('No active Bitcoin market found');
            }
        }

        let tokenIds = market.clobTokenIds || [];
        if (typeof tokenIds === 'string') {
            tokenIds = JSON.parse(tokenIds);
        }
        
        let outcomes = market.outcomes || [];
        if (typeof outcomes === 'string') {
            outcomes = JSON.parse(outcomes);
        }

        if (tokenIds.length < 2) {
            throw new Error('Market must have at least 2 tokens');
        }

        let upIndex = outcomes.findIndex((o: string) => o.toLowerCase().includes('up') || o.toLowerCase().includes('yes'));
        let downIndex = outcomes.findIndex((o: string) => o.toLowerCase().includes('down') || o.toLowerCase().includes('no'));

        if (upIndex === -1) upIndex = 0;
        if (downIndex === -1) downIndex = 1;

        this.tokenIdUp = String(tokenIds[upIndex]);
        this.tokenIdDown = String(tokenIds[downIndex]);

        console.log(`Market found: ${market.question}`);
        console.log(`UP Token: ${this.tokenIdUp.substring(0, 20)}...`);
        console.log(`DOWN Token: ${this.tokenIdDown.substring(0, 20)}...`);
    }

    private async connectSoftwareWebSocket() {
        const url = process.env.SOFTWARE_WS_URL || 'ws://45.130.166.119:5001';
        
        const connect = () => {
            if (!this.isRunning) return;
            
            this.softwareWs = new WebSocket(url);
            
            this.softwareWs.on('open', () => {
                console.log('✅ Software WebSocket connected');
            });

            this.softwareWs.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    const probUp = message.prob_up || 0;
                    const probDown = message.prob_down || 0;

                    this.softwarePrices.UP = probUp / 100.0;
                    this.softwarePrices.DOWN = probDown / 100.0;
                } catch (error) {
                }
            });

            this.softwareWs.on('error', (error) => {
                console.error('Software WebSocket error:', error.message);
            });

            this.softwareWs.on('close', () => {
                console.log('Software WebSocket closed');
                if (this.isRunning) {
                    console.log('Reconnecting in 5 seconds...');
                    setTimeout(connect, 5000);
                }
            });
        };
        
        connect();
    }

    private async connectPolymarketWebSocket() {
        const url = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
        
        const connect = () => {
            if (!this.isRunning) return;
            
            this.polymarketWs = new WebSocket(url);
            
            this.polymarketWs.on('open', () => {
                console.log('✅ Polymarket WebSocket connected');
                
                const subscribeMessage = {
                    action: 'subscribe',
                    subscriptions: [{
                        topic: 'clob_market',
                        type: '*',
                        filters: JSON.stringify([this.tokenIdUp, this.tokenIdDown])
                    }]
                };
                
                this.polymarketWs?.send(JSON.stringify(subscribeMessage));
            });

            this.polymarketWs.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.processPolymarketMessage(message);
                } catch (error) {
                }
            });

            this.polymarketWs.on('error', (error) => {
                console.error('Polymarket WebSocket error:', error.message);
            });

            this.polymarketWs.on('close', () => {
                console.log('Polymarket WebSocket closed');
                if (this.isRunning) {
                    console.log('Reconnecting in 5 seconds...');
                    setTimeout(connect, 5000);
                }
            });
        };
        
        connect();
    }

    private processPolymarketMessage(data: any) {
        try {
            const topic = data.topic;
            const payload = data.payload || {};

            if (topic === 'clob_market') {
                const assetId = payload.asset_id || '';
                
                if (payload.price) {
                    const price = parseFloat(payload.price);
                    if (price > 0) {
                        this.polymarketPrices.set(assetId, price);
                    }
                }

                const bids = payload.bids || [];
                const asks = payload.asks || [];
                if (bids.length > 0 && asks.length > 0) {
                    const bestBid = parseFloat(bids[0].price);
                    const bestAsk = parseFloat(asks[0].price);
                    const midPrice = (bestBid + bestAsk) / 2.0;
                    this.polymarketPrices.set(assetId, midPrice);
                }
            }
        } catch (error) {
        }
    }

    private startImmediateTrading() {
        // Start actively trading immediately
        const immediateTradingLoop = async () => {
            if (!this.isRunning) return;
            
            try {
                const opportunity = await this.checkTradeOpportunity();
                if (opportunity) {
                    console.log('\n' + '='.repeat(60));
                    console.log('🎯 TRADE OPPORTUNITY DETECTED!');
                    console.log('='.repeat(60));
                    console.log(`Token: ${opportunity.tokenType}`);
                    console.log(`Software Price: $${opportunity.softwarePrice.toFixed(4)}`);
                    console.log(`Polymarket Price: $${opportunity.polymarketPrice.toFixed(4)}`);
                    console.log(`Difference: $${opportunity.difference.toFixed(4)} (threshold: $${this.priceThreshold.toFixed(4)})`);
                    console.log('='.repeat(60));
                    
                    await this.executeTrade(opportunity);
                }
            } catch (error: any) {
                console.error('Error in immediate trading loop:', error.message);
            }
            
            // Continue checking every second
            setTimeout(immediateTradingLoop, 1000);
        };
        
        // Start the loop immediately
        immediateTradingLoop();
    }

    private startMonitoring() {
        let lastLogTime = 0;
        const logInterval = 30000;
        
        setInterval(async () => {
            if (!this.isRunning) return;

            const now = Date.now();
            
            if (now - this.lastBalanceCheck >= this.balanceCheckInterval) {
                console.log('\n💰 Periodic balance check...');
                const balances = await this.checkAndDisplayBalances();
                // Check against minimum $500 requirement
                const minimumBalance = 500.0;
                const check = this.balanceChecker.checkSufficientBalance(balances, minimumBalance, 0.02);
                
                if (!check.sufficient) {
                    console.log('⚠️  WARNING: Low balance detected! Trading requires at least $500 USDC');
                    check.warnings.forEach(w => console.log(`  ${w}`));
                    console.log('⚠️  Bot will continue monitoring but may not execute trades until balance is sufficient.');
                }
                
                this.lastBalanceCheck = now;
                console.log('');
            }
            
            if (now - lastLogTime >= logInterval) {
                const upSoft = this.softwarePrices.UP.toFixed(4);
                const downSoft = this.softwarePrices.DOWN.toFixed(4);
                const upMarket = (this.polymarketPrices.get(this.tokenIdUp!) || 0).toFixed(4);
                const downMarket = (this.polymarketPrices.get(this.tokenIdDown!) || 0).toFixed(4);
                
                console.log(`[Monitor] Software: UP=$${upSoft} DOWN=$${downSoft} | Market: UP=$${upMarket} DOWN=$${downMarket}`);
                lastLogTime = now;
            }
        }, 1000);
    }

    private async checkTradeOpportunity(): Promise<TradeOpportunity | null> {
        const currentTime = Date.now();
        const remainingCooldown = this.tradeCooldown - (currentTime - this.lastTradeTime);

        if (remainingCooldown > 0) {
            return null;
        }

        // Check balance before trading - require minimum $500
        const balances = await this.balanceChecker.checkBalances(this.wallet);
        const minimumBalance = 500.0;
        if (balances.usdc < minimumBalance) {
            return null; // Skip trading if balance is below minimum
        }

        for (const tokenType of ['UP', 'DOWN']) {
            const softwarePrice = this.softwarePrices[tokenType as keyof PriceData];
            const tokenId = tokenType === 'UP' ? this.tokenIdUp : this.tokenIdDown;
            
            if (!tokenId) continue;

            const polyPrice = this.polymarketPrices.get(tokenId) || 0;
            const diff = softwarePrice - polyPrice;

            if (diff >= this.priceThreshold && softwarePrice > 0 && polyPrice > 0) {
                return {
                    tokenType,
                    tokenId,
                    softwarePrice,
                    polymarketPrice: polyPrice,
                    difference: diff
                };
            }
        }

        return null;
    }

    private async executeTrade(opportunity: TradeOpportunity) {
        console.log('\n📊 Executing trade...');
        this.lastTradeTime = Date.now();

        try {
            const buyPrice = opportunity.polymarketPrice;
            const shares = this.tradeAmount / buyPrice;

            console.log(`💰 Buying ${shares.toFixed(4)} shares at $${buyPrice.toFixed(4)}`);
            console.log(`⏳ Placing orders...`);

            const buyResult = await this.client.createAndPostOrder(
                {
                    tokenID: opportunity.tokenId,
                    price: buyPrice * 1.01,
                    size: shares,
                    side: Side.BUY
                },
                { tickSize: '0.001', negRisk: false },
                OrderType.GTC
            );

            console.log(`✅ Buy order placed: ${buyResult.orderID}`);

            const actualBuyPrice = buyPrice;
            const takeProfitPrice = Math.min(actualBuyPrice + this.takeProfitAmount, 0.99);
            const stopLossPrice = Math.max(actualBuyPrice - this.stopLossAmount, 0.01);

            console.log(`⏳ Waiting 2 seconds for position to settle...`);
            await new Promise(resolve => setTimeout(resolve, 2000));

            const takeProfitResult = await this.client.createAndPostOrder(
                {
                    tokenID: opportunity.tokenId,
                    price: takeProfitPrice,
                    size: shares,
                    side: Side.SELL
                },
                { tickSize: '0.001', negRisk: false },
                OrderType.GTC
            );

            const stopLossResult = await this.client.createAndPostOrder(
                {
                    tokenID: opportunity.tokenId,
                    price: stopLossPrice,
                    size: shares,
                    side: Side.SELL
                },
                { tickSize: '0.001', negRisk: false },
                OrderType.GTC
            );

            console.log(`✅ Take Profit order: ${takeProfitResult.orderID} @ $${takeProfitPrice.toFixed(4)}`);
            console.log(`✅ Stop Loss order: ${stopLossResult.orderID} @ $${stopLossPrice.toFixed(4)}`);

            const trade: Trade = {
                tokenType: opportunity.tokenType,
                tokenId: opportunity.tokenId,
                buyOrderId: buyResult.orderID,
                takeProfitOrderId: takeProfitResult.orderID,
                stopLossOrderId: stopLossResult.orderID,
                buyPrice: actualBuyPrice,
                targetPrice: takeProfitPrice,
                stopPrice: stopLossPrice,
                amount: this.tradeAmount,
                timestamp: new Date(),
                status: 'active'
            };

            this.activeTrades.push(trade);
            
            console.log('='.repeat(60));
            console.log('✅ TRADE EXECUTION COMPLETE!');
            console.log(`Total trades: ${this.activeTrades.length}`);
            console.log('='.repeat(60));
            console.log(`⏰ Next trade available in ${this.tradeCooldown / 1000} seconds\n`);

        } catch (error: any) {
            console.error('='.repeat(60));
            console.error('❌ TRADE EXECUTION FAILED!');
            console.error(`Error: ${error.message}`);
            console.error('='.repeat(60));
        }
    }

    private async startFundingArbStrategy() {
        if (!this.fundingMonitor) {
            console.error('❌ Funding monitor not initialized');
            return;
        }

        const threshold = parseFloat(process.env.FUNDING_THRESHOLD || '0.001');
        console.log('✅ Funding arbitrage strategy active (PRIMARY MODE)');
        console.log(`Funding Rate Threshold: ${(threshold * 100).toFixed(3)}%`);
        console.log(`Trade Amount: ${this.tradeAmount} USDT per side`);
        console.log('Exchange Pair: Hyperliquid <-> Binance');
        console.log('Asset: BTC Perpetuals');
        console.log('\n🔄 Starting funding rate monitoring...\n');

        this.isRunning = true;

        // Initial check immediately
        await this.checkFundingOpportunity(threshold);

        const checkInterval = 3600000; // Check every hour (funding typically pays every 8h)
        
        setInterval(async () => {
            if (!this.isRunning || !this.fundingMonitor) return;
            await this.checkFundingOpportunity(threshold);
        }, checkInterval);

        console.log('⏰ Monitoring active - checking every hour for opportunities...\n');
    }

    private async checkFundingOpportunity(threshold: number) {
        if (!this.fundingMonitor) {
            console.error('Funding monitor not available');
            return;
        }

        try {
            const { hlRate, binRate } = await this.fundingMonitor.getFundingRates();
            const spread = hlRate - binRate;
            const spreadPct = (Math.abs(spread) * 100).toFixed(4);
            
            console.log('─'.repeat(60));
            console.log(`[${new Date().toISOString()}] Funding Rate Check`);
            console.log(`Hyperliquid: ${(hlRate * 100).toFixed(4)}%`);
            console.log(`Binance:     ${(binRate * 100).toFixed(4)}%`);
            console.log(`Spread:      ${spreadPct}% (threshold: ${(threshold * 100).toFixed(3)}%)`);
            
            const opportunity = await this.fundingMonitor.detectOpportunity(threshold);
            
            if (opportunity) {
                console.log('🎯 OPPORTUNITY DETECTED!');
                console.log('─'.repeat(60));
                await this.executeFundingArb(opportunity);
            } else {
                console.log('Status: No opportunity - spread within threshold');
                console.log('─'.repeat(60));
            }
        } catch (error: any) {
            console.error('Error in funding rate check:', error.message);
        }
    }

    private async executeFundingArb(opportunity: { sideHl: 'LONG' | 'SHORT', sideBin: 'LONG' | 'SHORT' }) {
        console.log('\n' + '='.repeat(60));
        console.log('💰 EXECUTING FUNDING ARBITRAGE TRADE');
        console.log('='.repeat(60));
        console.log(`Strategy: Delta-neutral hedged position`);
        console.log(`Hyperliquid Position: ${opportunity.sideHl}`);
        console.log(`Binance Position:     ${opportunity.sideBin}`);
        console.log(`Notional Size:        ${this.tradeAmount} USDT per side`);
        console.log('='.repeat(60));
        
        console.log('\n⚠️  IMPLEMENTATION NOTE:');
        console.log('This is a framework for the funding arbitrage strategy.');
        console.log('To enable actual trading, implement the following:');
        console.log('');
        console.log('1. Fetch current BTC/USDT price from both exchanges');
        console.log('2. Calculate contract sizes for equal notional value');
        console.log('3. Place market orders on Hyperliquid using the SDK:');
        console.log('   - Use hlClient.exchange.placeOrder()');
        console.log('4. Place market orders on Binance using futures API:');
        console.log('   - Use binanceClient.futuresMarketOrder()');
        console.log('5. Implement position monitoring for P&L tracking');
        console.log('6. Add risk management (stop-loss, take-profit, rate convergence)');
        console.log('7. Implement position closing logic when spread narrows');
        console.log('');
        console.log('Expected APR: 20-50% depending on funding rate spreads');
        console.log('Risks: Execution slippage, exchange fees, position liquidation');
        console.log('\n' + '='.repeat(60) + '\n');
    }

    stop() {
        this.isRunning = false;
        this.softwareWs?.close();
        this.polymarketWs?.close();
        console.log('Bot stopped');
    }
}

async function main() {
    const bot = new AutoTradingBot();
    
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        bot.stop();
        process.exit(0);
    });

    await bot.start();
}

main().catch(console.error);


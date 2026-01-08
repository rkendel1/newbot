import { Hyperliquid } from 'hyperliquid';
import { Spot } from '@binance/connector';
import * as dotenv from 'dotenv';

dotenv.config();

export interface FundingRates {
  hlRate: number;
  binRate: number;
}

export interface Opportunity {
  sideHl: 'LONG' | 'SHORT';
  sideBin: 'LONG' | 'SHORT';
}

export const DEFAULT_FUNDING_THRESHOLD = 0.001; // 0.1% minimum spread

export class FundingRateMonitor {
  private hlClient: Hyperliquid;
  private binanceClient: any;
  private symbol = 'BTC';  // Hyperliquid uses BTC, not BTCUSDT

  constructor() {
    const hlPrivateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (!hlPrivateKey) {
      throw new Error('HYPERLIQUID_PRIVATE_KEY not found in environment variables');
    }

    const binApiKey = process.env.BINANCE_API_KEY;
    const binSecretKey = process.env.BINANCE_SECRET_KEY;
    
    if (!binApiKey || !binSecretKey) {
      console.warn('⚠️  Warning: BINANCE_API_KEY or BINANCE_SECRET_KEY not set');
      console.warn('Binance funding rates may not be available');
    }

    // Initialize Hyperliquid client
    this.hlClient = new Hyperliquid({
      privateKey: hlPrivateKey,
      testnet: false // false = mainnet, true = testnet
    });
    
    // Initialize Binance client
    this.binanceClient = new Spot(binApiKey || '', binSecretKey || '');
  }

  async getFundingRates(): Promise<FundingRates> {
    try {
      // Hyperliquid: Get funding rate from meta and asset context
      const [meta, assetCtxs] = await this.hlClient.info.perpetuals.getMetaAndAssetCtxs();
      const btcIndex = meta.universe.findIndex((u: any) => u.name === this.symbol);
      const hlRate = btcIndex >= 0 && assetCtxs[btcIndex] ? parseFloat(assetCtxs[btcIndex].funding) : 0;

      // Binance: Get funding rate for BTCUSDT perpetual
      const binResponse = await this.binanceClient.fundingRate({ symbol: 'BTCUSDT', limit: 1 });
      const binRate = binResponse.data && binResponse.data.length > 0 
        ? parseFloat(binResponse.data[0].fundingRate) 
        : 0;

      return { hlRate, binRate };
    } catch (error: any) {
      console.error('Error fetching funding rates:', error.message);
      return { hlRate: 0, binRate: 0 };
    }
  }

  async detectOpportunity(threshold: number = DEFAULT_FUNDING_THRESHOLD): Promise<Opportunity | null> {
    try {
      const { hlRate, binRate } = await this.getFundingRates();
      
      if (hlRate === 0 || binRate === 0) {
        return null; // Invalid rates
      }

      const spread = hlRate - binRate;
      
      if (Math.abs(spread) > threshold) {
        // If HL rate > Bin rate, long HL (collect positive funding), short Bin
        if (spread > 0) {
          return { sideHl: 'LONG', sideBin: 'SHORT' };
        } else {
          return { sideHl: 'SHORT', sideBin: 'LONG' };
        }
      }
      
      return null;
    } catch (error: any) {
      console.error('Error detecting opportunity:', error.message);
      return null;
    }
  }
}

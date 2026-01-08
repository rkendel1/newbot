declare module '@binance/connector' {
  export class Spot {
    constructor(apiKey?: string, apiSecret?: string, options?: any);
    fundingRate(params: { symbol: string; limit?: number }): Promise<any>;
  }
}

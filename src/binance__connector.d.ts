declare module '@binance/connector' {
  interface SpotOptions {
    baseURL?: string;
    timeout?: number;
    recvWindow?: number;
  }

  export class Spot {
    constructor(apiKey?: string, apiSecret?: string, options?: SpotOptions);
    fundingRate(params: { symbol: string; limit?: number }): Promise<{
      data: Array<{
        symbol: string;
        fundingRate: string;
        fundingTime: number;
      }>;
    }>;
  }
}

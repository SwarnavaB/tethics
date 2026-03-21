export interface BagsClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class BagsClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BagsClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://public-api-v2.bags.fm/api/v1";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getTokenCreators(tokenMint: string): Promise<unknown> {
    const url = new URL("/token-launch/creator/v3", this.baseUrl);
    url.searchParams.set("tokenMint", tokenMint);
    return this.request(url);
  }

  async getClaimStats(tokenMint: string): Promise<unknown> {
    const url = new URL("/token-launch/claim-stats", this.baseUrl);
    url.searchParams.set("tokenMint", tokenMint);
    return this.request(url);
  }

  private async request(url: URL): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers["x-api-key"] = this.apiKey;

    const response = await this.fetchImpl(url, { headers });
    if (!response.ok) {
      throw new Error(`Bags API request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}

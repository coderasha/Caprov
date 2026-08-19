export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
}

export function createApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export type RpkiStatus = 'valid' | 'invalid' | 'not-found' | 'unknown';

export interface Roa {
  origin: number;
  maxLength: number;
  ta: string;
}

export interface OriginObservation {
  asn: number;
  name?: string;
  peerCount: number;
}

export interface RouteReceipt {
  id: string;
  generatedAt: string;
  prefix: string;
  expectedOriginAsn?: number;
  rpki: {
    status: RpkiStatus;
    roas: Roa[];
  };
  visibility: {
    observedPeers: number;
    totalPeers: number;
    percent: number;
  };
  origins: OriginObservation[];
  unexpectedOrigins: OriginObservation[];
  suggestions: string[];
}

export interface WatchedPrefix {
  prefix: string;
  expectedOriginAsn?: number;
  addedAt: string;
  label?: string;
}

export interface Watchlist {
  version: 1;
  prefixes: WatchedPrefix[];
}

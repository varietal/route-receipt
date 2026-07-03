import { randomUUID } from 'node:crypto';
import {
  fetchPrefixOrigins,
  fetchRpki,
  fetchVisibility,
} from './collectors/ripestat.js';
import type { OriginObservation, RouteReceipt } from './types.js';

export interface GenerateReceiptOptions {
  prefix: string;
  expectedOriginAsn?: number;
}

export async function generateReceipt(
  options: GenerateReceiptOptions,
): Promise<RouteReceipt> {
  const { prefix, expectedOriginAsn } = options;

  const [origins, visibility] = await Promise.all([
    fetchPrefixOrigins(prefix),
    fetchVisibility(prefix),
  ]);

  const rpkiOrigin = expectedOriginAsn ?? origins[0]?.asn;

  const rpki = rpkiOrigin
    ? await fetchRpki(prefix, rpkiOrigin)
    : { status: 'unknown' as const, roas: [] };

  const unexpectedOrigins = findUnexpectedOrigins(origins, expectedOriginAsn);
  const suggestions = buildSuggestions({
    prefix,
    expectedOriginAsn,
    origins,
    unexpectedOrigins,
    rpki,
    visibility,
  });

  return {
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    prefix,
    expectedOriginAsn,
    rpki,
    visibility,
    origins,
    unexpectedOrigins,
    suggestions,
  };
}

function findUnexpectedOrigins(
  origins: OriginObservation[],
  expectedOriginAsn?: number,
): OriginObservation[] {
  if (expectedOriginAsn === undefined) {
    if (origins.length <= 1) {
      return [];
    }
    const [primary, ...rest] = origins;
    return rest.filter(
      (origin) => origin.peerCount >= Math.ceil(primary.peerCount * 0.05),
    );
  }

  return origins.filter((origin) => origin.asn !== expectedOriginAsn);
}

function buildSuggestions(input: {
  prefix: string;
  expectedOriginAsn?: number;
  origins: OriginObservation[];
  unexpectedOrigins: OriginObservation[];
  rpki: RouteReceipt['rpki'];
  visibility: RouteReceipt['visibility'];
}): string[] {
  const suggestions: string[] = [];

  if (input.rpki.status === 'invalid') {
    suggestions.push(
      `RPKI status is invalid for ${input.prefix}. Publish or update ROAs for the announcing ASN before expecting global acceptance.`,
    );
  }

  if (input.rpki.status === 'not-found') {
    suggestions.push(
      `No validating ROA found for ${input.prefix}. Create a ROA at your RIR (ARIN, RIPE, APNIC, etc.) covering this prefix.`,
    );
  }

  if (input.expectedOriginAsn !== undefined) {
    const expected = input.origins.find((o) => o.asn === input.expectedOriginAsn);
    if (!expected) {
      suggestions.push(
        `Expected origin AS${input.expectedOriginAsn} was not observed. Verify your BGP session is established and the prefix is exported upstream.`,
      );
    }
  }

  for (const rogue of input.unexpectedOrigins) {
    const label = rogue.name ? ` (${rogue.name})` : '';
    suggestions.push(
      `Unexpected origin AS${rogue.asn}${label} seen by ${rogue.peerCount} peers. Check for route leaks, stale IRR objects, or a possible hijack.`,
    );
  }

  if (input.visibility.percent < 80) {
    suggestions.push(
      `Prefix visibility is ${input.visibility.percent}% (${input.visibility.observedPeers}/${input.visibility.totalPeers} RIPE RIS peers). Investigate upstream filtering or incomplete propagation.`,
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      'No issues detected. Prefix propagation and RPKI look healthy from public vantage points.',
    );
  }

  return suggestions;
}

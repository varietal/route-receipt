import type { OriginObservation, Roa, RpkiStatus } from '../types.js';

const BASE = 'https://stat.ripe.net/data';

interface RipeEnvelope<T> {
  status: string;
  status_code: number;
  data: T;
}

async function ripeGet<T>(
  endpoint: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE}/${endpoint}/data.json`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`RIPE Stat ${endpoint} failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as RipeEnvelope<T>;
  if (body.status !== 'ok') {
    throw new Error(`RIPE Stat ${endpoint} returned status: ${body.status}`);
  }

  return body.data;
}

interface BgpStateData {
  bgp_state: Array<{
    target_prefix: string;
    source_id: string;
    path: number[];
  }>;
}

interface PrefixOverviewData {
  asns: Array<{
    asn: number;
    holder: string;
  }>;
}

interface RoutingStatusData {
  visibility: {
    v4: {
      ris_peers_seeing: number;
      total_ris_peers: number;
    };
  };
}

interface RpkiValidationData {
  validating_roas: Array<{
    origin: string | number;
    prefix: string;
    max_length: number;
    validity: string;
  }>;
  status: string;
}

export async function fetchPrefixOrigins(prefix: string): Promise<OriginObservation[]> {
  const [bgpState, overview] = await Promise.all([
    ripeGet<BgpStateData>('bgp-state', { resource: prefix }),
    ripeGet<PrefixOverviewData>('prefix-overview', { resource: prefix }),
  ]);

  const holderByAsn = new Map(
    (overview.asns ?? []).map((entry) => [entry.asn, entry.holder.split(' - ')[0]]),
  );

  const peersByOrigin = new Map<number, Set<string>>();

  for (const state of bgpState.bgp_state ?? []) {
    const path = state.path;
    if (path.length === 0) {
      continue;
    }
    const origin = path[path.length - 1];
    const peers = peersByOrigin.get(origin) ?? new Set<string>();
    peers.add(state.source_id);
    peersByOrigin.set(origin, peers);
  }

  if (peersByOrigin.size === 0) {
    return (overview.asns ?? []).map((entry) => ({
      asn: entry.asn,
      name: entry.holder.split(' - ')[0],
      peerCount: 0,
    }));
  }

  return [...peersByOrigin.entries()]
    .map(([asn, peers]) => ({
      asn,
      name: holderByAsn.get(asn),
      peerCount: peers.size,
    }))
    .sort((a, b) => b.peerCount - a.peerCount);
}

export async function fetchVisibility(prefix: string): Promise<{
  observedPeers: number;
  totalPeers: number;
  percent: number;
}> {
  const data = await ripeGet<RoutingStatusData>('routing-status', { resource: prefix });
  const observed = data.visibility?.v4?.ris_peers_seeing ?? 0;
  const total = data.visibility?.v4?.total_ris_peers ?? 0;
  const percent = total > 0 ? Math.round((observed / total) * 100) : 0;

  return { observedPeers: observed, totalPeers: total, percent };
}

export async function fetchRpki(
  prefix: string,
  originAsn: number,
): Promise<{
  status: RpkiStatus;
  roas: Roa[];
}> {
  const data = await ripeGet<RpkiValidationData>('rpki-validation', {
    resource: String(originAsn),
    prefixes: prefix,
  });

  const roas: Roa[] = (data.validating_roas ?? []).map((roa) => ({
    origin: Number(roa.origin),
    maxLength: roa.max_length,
    ta: 'routinator',
  }));

  const status = mapRpkiStatus(data.status);
  return { status, roas };
}

function mapRpkiStatus(status: string): RpkiStatus {
  switch (status.toLowerCase()) {
    case 'valid':
      return 'valid';
    case 'invalid':
      return 'invalid';
    case 'not-found':
      return 'not-found';
    default:
      return 'unknown';
  }
}

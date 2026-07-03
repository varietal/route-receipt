# Route Receipt

BGP route receipts — proof of what the internet actually saw when you announced a prefix.

Every BGP change deserves a receipt: RPKI status, observed origins, visibility across RIPE RIS peers, unexpected announcements, and actionable suggestions. Built for indie hosts, consultancies, and anyone who announces prefixes without an enterprise BGP observability stack.

## Install

```bash
cd route-receipt
npm install
```

## Usage

Generate a one-off receipt:

```bash
npm run receipt -- check 1.1.1.0/24 --asn 13335
```

JSON output (for automation or archiving):

```bash
npm run receipt -- check 1.1.1.0/24 --asn 13335 --json
```

Save to file:

```bash
npm run receipt -- check 1.1.1.0/24 --asn 13335 --out receipt.txt
```

### Watchlist

Persist prefixes you care about in `~/.config/route-receipt/watchlist.json`:

```bash
npm run receipt -- watch add 203.0.113.0/24 --asn 64512 --label staging
npm run receipt -- watch list
npm run receipt -- watch check
npm run receipt -- watch remove 203.0.113.0/24
```

Batch export:

```bash
mkdir -p receipts
npm run receipt -- watch check --out ./receipts
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Healthy — no unexpected origins, RPKI valid, visibility ≥ 80% |
| `1`  | Error (bad args, API failure) |
| `2`  | Issues detected (unexpected origin, invalid RPKI, low visibility) |

Use exit code `2` in cron or CI to alert on route problems.

## Example output

```
ROUTE RECEIPT
════════════════════════════════════════════════════════════
ID:       8f3c2a1b-...
Time:     2026-07-03T10:15:00.000Z
Prefix:   1.1.1.0/24
Expected: AS13335

RPKI
  Status: valid
  ROA:    13335 → 1.1.1.0/24 max /24 (APNIC)

VISIBILITY (RIPE RIS)
  Peers:  24/26 (92%)

ORIGINS
  AS13335 CLOUDFLARENET — 24 peers

SUGGESTIONS
  • No issues detected. Prefix propagation and RPKI look healthy from public vantage points.

════════════════════════════════════════════════════════════
```

## Data sources

Route Receipt queries public RIPE Stat APIs — no BGP session or API key required:

- [prefix-overview](https://stat.ripe.net/docs/data-api/api-endpoints/prefix-overview) — announcing ASNs
- [routing-status](https://stat.ripe.net/docs/data-api/api-endpoints/routing-status) — RIPE RIS visibility
- [rpki-validation](https://stat.ripe.net/docs/data-api/api-endpoints/rpki-validation) — ROA status

## Development

```bash
npm run build
npm run lint
npm run check
```

## Roadmap

- [ ] BMP feed ingestion for real-time change triggers
- [ ] Receipt diffing (before/after on announce/withdraw)
- [ ] Slack / email webhooks
- [ ] Signed receipt exports for compliance tickets

## License

MIT

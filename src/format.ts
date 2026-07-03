import type { RouteReceipt } from './types.js';

export function formatReceiptText(receipt: RouteReceipt): string {
  const lines: string[] = [
    'ROUTE RECEIPT',
    '═'.repeat(60),
    `ID:       ${receipt.id}`,
    `Time:     ${receipt.generatedAt}`,
    `Prefix:   ${receipt.prefix}`,
  ];

  if (receipt.expectedOriginAsn !== undefined) {
    lines.push(`Expected: AS${receipt.expectedOriginAsn}`);
  }

  lines.push('', 'RPKI', `  Status: ${receipt.rpki.status}`);

  if (receipt.rpki.roas.length > 0) {
    for (const roa of receipt.rpki.roas) {
      lines.push(
        `  ROA:    ${roa.origin} → ${receipt.prefix} max /${roa.maxLength} (${roa.ta})`,
      );
    }
  } else {
    lines.push('  ROA:    none');
  }

  lines.push(
    '',
    'VISIBILITY (RIPE RIS)',
    `  Peers:  ${receipt.visibility.observedPeers}/${receipt.visibility.totalPeers} (${receipt.visibility.percent}%)`,
    '',
    'ORIGINS',
  );

  if (receipt.origins.length === 0) {
    lines.push('  (none observed)');
  } else {
    for (const origin of receipt.origins) {
      const name = origin.name ? ` ${origin.name}` : '';
      const marker =
        receipt.expectedOriginAsn !== undefined &&
        origin.asn !== receipt.expectedOriginAsn
          ? ' ⚠'
          : '';
      lines.push(`  AS${origin.asn}${name} — ${origin.peerCount} peers${marker}`);
    }
  }

  lines.push('', 'SUGGESTIONS');
  for (const suggestion of receipt.suggestions) {
    lines.push(`  • ${suggestion}`);
  }

  lines.push('', '═'.repeat(60));
  return lines.join('\n');
}

export function formatReceiptJson(receipt: RouteReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

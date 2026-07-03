#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { formatReceiptJson, formatReceiptText } from './format.js';
import { generateReceipt } from './receipt.js';
import {
  addToWatchlist,
  loadWatchlist,
  removeFromWatchlist,
  watchlistPath,
} from './watchlist.js';

function usage(): void {
  console.log(`route-receipt — BGP route receipts from public vantage points

Usage:
  route-receipt check <prefix> [--asn <asn>] [--json] [--out <file>]
  route-receipt watch add <prefix> [--asn <asn>] [--label <name>]
  route-receipt watch list
  route-receipt watch remove <prefix>
  route-receipt watch check [--json] [--out <dir>]

Examples:
  route-receipt check 1.1.1.0/24 --asn 13335
  route-receipt watch add 203.0.113.0/24 --asn 64512 --label staging
  route-receipt watch check --out ./receipts
`);
}

interface ParsedArgs {
  command: string[];
  flags: Map<string, string | boolean>;
  positionals: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
      continue;
    }
    positionals.push(arg);
  }

  return { command: positionals, flags, positionals };
}

function parseAsn(value: string | boolean | undefined): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.replace(/^AS/i, '');
  const asn = Number.parseInt(normalized, 10);
  if (Number.isNaN(asn)) {
    throw new Error(`Invalid ASN: ${value}`);
  }
  return asn;
}

async function runCheck(args: ParsedArgs): Promise<number> {
  const prefix = args.positionals[1];
  if (!prefix) {
    console.error('error: prefix required\n');
    usage();
    return 1;
  }

  const expectedOriginAsn = parseAsn(args.flags.get('asn'));
  const asJson = args.flags.has('json');
  const outFile = args.flags.get('out');

  const receipt = await generateReceipt({ prefix, expectedOriginAsn });
  const output = asJson ? formatReceiptJson(receipt) : formatReceiptText(receipt);

  if (typeof outFile === 'string') {
    await writeFile(outFile, output, 'utf8');
    console.log(`Receipt written to ${outFile}`);
  } else {
    process.stdout.write(output);
    if (!output.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  const hasProblems =
    receipt.unexpectedOrigins.length > 0 ||
    receipt.rpki.status === 'invalid' ||
    receipt.visibility.percent < 80;

  return hasProblems ? 2 : 0;
}

async function runWatch(args: ParsedArgs): Promise<number> {
  const subcommand = args.positionals[1];

  switch (subcommand) {
    case 'add': {
      const prefix = args.positionals[2];
      if (!prefix) {
        console.error('error: prefix required\n');
        usage();
        return 1;
      }
      const expectedOriginAsn = parseAsn(args.flags.get('asn'));
      const label = args.flags.get('label');
      const saved = await addToWatchlist({
        prefix,
        expectedOriginAsn,
        label: typeof label === 'string' ? label : undefined,
      });
      console.log(`Watching ${saved.prefix}${saved.label ? ` (${saved.label})` : ''}`);
      if (saved.expectedOriginAsn !== undefined) {
        console.log(`Expected origin: AS${saved.expectedOriginAsn}`);
      }
      console.log(`Watchlist: ${watchlistPath()}`);
      return 0;
    }

    case 'list': {
      const watchlist = await loadWatchlist();
      if (watchlist.prefixes.length === 0) {
        console.log('Watchlist is empty.');
        console.log(`Config: ${watchlistPath()}`);
        return 0;
      }
      for (const item of watchlist.prefixes) {
        const label = item.label ? ` [${item.label}]` : '';
        const asn =
          item.expectedOriginAsn !== undefined ? ` → AS${item.expectedOriginAsn}` : '';
        console.log(`${item.prefix}${label}${asn}`);
      }
      return 0;
    }

    case 'remove': {
      const prefix = args.positionals[2];
      if (!prefix) {
        console.error('error: prefix required\n');
        usage();
        return 1;
      }
      const removed = await removeFromWatchlist(prefix);
      if (!removed) {
        console.error(`error: ${prefix} not in watchlist`);
        return 1;
      }
      console.log(`Removed ${prefix} from watchlist`);
      return 0;
    }

    case 'check': {
      const watchlist = await loadWatchlist();
      if (watchlist.prefixes.length === 0) {
        console.log(
          'Watchlist is empty. Add prefixes with: route-receipt watch add <prefix>',
        );
        return 0;
      }

      const asJson = args.flags.has('json');
      const outDir = args.flags.get('out');
      let exitCode = 0;

      for (const item of watchlist.prefixes) {
        const receipt = await generateReceipt({
          prefix: item.prefix,
          expectedOriginAsn: item.expectedOriginAsn,
        });

        const output = asJson ? formatReceiptJson(receipt) : formatReceiptText(receipt);

        if (typeof outDir === 'string') {
          const filename = `${item.prefix.replace(/\//g, '_')}.${asJson ? 'json' : 'txt'}`;
          const path = `${outDir.replace(/\/$/, '')}/${filename}`;
          await writeFile(path, output, 'utf8');
          console.log(`Wrote ${path}`);
        } else {
          if (watchlist.prefixes.length > 1) {
            console.log(`\n--- ${item.prefix} ---\n`);
          }
          process.stdout.write(output);
          if (!output.endsWith('\n')) {
            process.stdout.write('\n');
          }
        }

        const hasProblems =
          receipt.unexpectedOrigins.length > 0 ||
          receipt.rpki.status === 'invalid' ||
          receipt.visibility.percent < 80;
        if (hasProblems) {
          exitCode = 2;
        }
      }

      return exitCode;
    }

    default:
      console.error(`error: unknown watch subcommand: ${subcommand ?? '(none)'}\n`);
      usage();
      return 1;
  }
}

async function main(): Promise<void> {
  const [, , ...argv] = process.argv;
  const args = parseArgs(argv);
  const command = args.positionals[0];

  try {
    let code = 0;
    switch (command) {
      case 'check':
        code = await runCheck(args);
        break;
      case 'watch':
        code = await runWatch(args);
        break;
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        usage();
        break;
      default:
        console.error(`error: unknown command: ${command}\n`);
        usage();
        code = 1;
    }
    process.exitCode = code;
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

main();

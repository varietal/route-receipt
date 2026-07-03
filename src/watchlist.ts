import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { WatchedPrefix, Watchlist } from './types.js';

const CONFIG_DIR = join(homedir(), '.config', 'route-receipt');
const WATCHLIST_PATH = join(CONFIG_DIR, 'watchlist.json');

const EMPTY_WATCHLIST: Watchlist = { version: 1, prefixes: [] };

async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadWatchlist(): Promise<Watchlist> {
  try {
    const raw = await readFile(WATCHLIST_PATH, 'utf8');
    return JSON.parse(raw) as Watchlist;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...EMPTY_WATCHLIST };
    }
    throw error;
  }
}

async function saveWatchlist(watchlist: Watchlist): Promise<void> {
  await ensureConfigDir();
  await writeFile(WATCHLIST_PATH, `${JSON.stringify(watchlist, null, 2)}\n`, 'utf8');
}

export function watchlistPath(): string {
  return WATCHLIST_PATH;
}

export async function addToWatchlist(
  entry: Omit<WatchedPrefix, 'addedAt'>,
): Promise<WatchedPrefix> {
  const watchlist = await loadWatchlist();
  const existing = watchlist.prefixes.find((item) => item.prefix === entry.prefix);

  const saved: WatchedPrefix = {
    ...entry,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
  };

  watchlist.prefixes = [
    ...watchlist.prefixes.filter((item) => item.prefix !== entry.prefix),
    saved,
  ];

  await saveWatchlist(watchlist);
  return saved;
}

export async function removeFromWatchlist(prefix: string): Promise<boolean> {
  const watchlist = await loadWatchlist();
  const before = watchlist.prefixes.length;
  watchlist.prefixes = watchlist.prefixes.filter((item) => item.prefix !== prefix);
  if (watchlist.prefixes.length === before) {
    return false;
  }
  await saveWatchlist(watchlist);
  return true;
}

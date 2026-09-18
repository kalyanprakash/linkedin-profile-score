import { RUBRIC_VERSION } from '../../packages/engine/src/version.ts';
import type { PersonaId } from '../../packages/engine/src/types.ts';
import { readKey, writeKey } from './storage.ts';

/**
 * Your own score, over time, on your own machine.
 *
 * The one thing worth knowing about this tool is whether the loop works: does a
 * person read the recommendation, do it, come back, and find the number moved?
 * Answering that with analytics would mean breaking the only promise the product
 * really makes. So it is answered by making it a feature instead — the person who
 * improved their profile is the person who most deserves to be shown that they
 * did, and showing them requires nothing to leave the device.
 *
 * Kept in extension-local storage, never transmitted, gone when the extension is
 * uninstalled. It is a convenience, so every path here tolerates storage being
 * absent, blocked or empty: a missing history means the panel shows no progress
 * line, and nothing else changes.
 */

export interface Entry {
  /** Score at the time. */
  s: number;
  /** ISO date, day resolution — this is a progress note, not an audit log. */
  d: string;
  /** Rubric version, so a change to the scoring is never read as a change to the profile. */
  v: string;
}

export type History = Partial<Record<PersonaId, Entry[]>>;

const KEY = 'lps.history';
/** Enough to see a trend, small enough to never matter. */
const MAX_ENTRIES = 20;

export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Add a reading, if it says anything new.
 *
 * Rescanning without changing anything is the single most common action this tool
 * sees, so recording every scan would bury the two readings that matter under
 * fifty identical ones. A reading is kept when the score moved, or when it is the
 * first of a new day under a new rubric; otherwise the existing entry stands.
 */
export function record(
  history: History,
  persona: PersonaId,
  score: number,
  now = new Date(),
): History {
  const entries = history[persona] ?? [];
  const last = entries[entries.length - 1];
  const entry: Entry = { s: score, d: today(now), v: RUBRIC_VERSION };

  if (last && last.s === score && last.v === entry.v) return history;

  // Same day, same rubric, different score: replace rather than append, so an
  // afternoon of edits reads as one move rather than a dozen.
  const keep = last && last.d === entry.d && last.v === entry.v ? entries.slice(0, -1) : entries;
  return { ...history, [persona]: [...keep, entry].slice(-MAX_ENTRIES) };
}

export interface Progress {
  from: number;
  to: number;
  delta: number;
  since: string;
}

/**
 * The earliest comparable reading, and how far the score has come from it.
 *
 * Only ever compares entries written under the CURRENT rubric version. Scores move
 * when the scoring changes — this profile went from 57 to 49 in one afternoon
 * because a bug was fixed, not because it got worse — and telling someone they
 * lost eight points when they had not touched their profile would be a lie the
 * tool told itself first. When the rubric changes, the comparison starts again.
 */
export function progress(history: History, persona: PersonaId, current: number): Progress | undefined {
  const comparable = (history[persona] ?? []).filter((e) => e.v === RUBRIC_VERSION);
  const first = comparable[0];
  if (!first || first.s === current) return undefined;
  return { from: first.s, to: current, delta: current - first.s, since: first.d };
}

/** "3 days ago", "last month" — relative, because the date itself is not the point. */
export function ago(iso: string, now = new Date()): string {
  const then = Date.parse(`${iso}T00:00:00Z`);
  const days = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - then) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export async function readHistory(): Promise<History> {
  try {
    const raw = await readKey(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as History) : {};
  } catch {
    return {}; // corrupt, blocked, or absent — all mean "no history", never an error
  }
}

export async function writeHistory(history: History): Promise<void> {
  try {
    await writeKey(KEY, JSON.stringify(history));
  } catch {
    /* best-effort, exactly like the persona preference */
  }
}

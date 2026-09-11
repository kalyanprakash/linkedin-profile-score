import type { PersonaId } from './types.ts';

/**
 * What a score means, in terms of the person reading the profile.
 *
 * Four bands with a hard edge at 60 was the last pass/fail-shaped thing left in
 * this rubric. Two problems, both visible on a real profile:
 *
 *  - The middle was one bucket. Across the calibration corpus half of all scores
 *    land between 50 and 69, so 60 and 79 read as the same standing while 59 and
 *    61 read as different ones. The band carried almost no information exactly
 *    where the users are.
 *  - "Solid" is a grade, not an instruction. It tells someone how they did, which
 *    is what the tools this project exists to replace do. What a person actually
 *    needs to know is what the reader of their profile can and cannot do with it.
 *
 * So: six bands, narrower through the crowded middle, each naming a state rather
 * than awarding a mark, and each carrying a sentence about the reader. The
 * sentence is composed from the band and the goal, because "a recruiter cannot
 * shortlist you" and "a buyer has no reason to call" are different failures and
 * the same score means both depending on what the profile is for.
 *
 * Boundaries are set from the corpus distribution, not from round numbers.
 */
export interface Band {
  id: BandId;
  /** Lowest score in the band. */
  min: number;
  /** Shown beside the number. A state, never a grade. */
  label: string;
  /** Composed with the persona's reader to say what that person can do. */
  reads: (reader: string, decision: string) => string;
}

export type BandId = 'unreadable' | 'bare' | 'partial' | 'readable' | 'convincing' | 'compelling';

/** Highest first, so the lookup is a find rather than a chain of comparisons. */
export const BANDS: Band[] = [
  {
    id: 'compelling',
    min: 84,
    label: 'Hard to ignore',
    reads: (reader, decision) => `Little left on the page that would stop ${reader} deciding to ${decision}.`,
  },
  {
    id: 'convincing',
    min: 71,
    label: 'Convincing',
    reads: (reader, decision) => `${cap(reader)} has a reason to ${decision}, not just the means to.`,
  },
  {
    id: 'readable',
    min: 58,
    label: 'Readable',
    reads: (reader, decision) =>
      `${cap(reader)} can follow what you do and where you have done it. What is missing is a reason to ${decision}.`,
  },
  {
    id: 'partial',
    min: 45,
    label: 'Getting there',
    reads: (reader) => `${cap(reader)} can tell what you do, but not what you have actually done.`,
  },
  {
    id: 'bare',
    min: 25,
    label: 'Bare bones',
    reads: (reader) => `${cap(reader)} learns your job title and very little else.`,
  },
  {
    id: 'unreadable',
    min: 0,
    label: 'Nothing to read yet',
    reads: (reader) => `There is not enough on the page for ${reader} to form an impression either way.`,
  },
];

/** Who is reading this profile, and what they are deciding, per goal. */
const AUDIENCE: Record<PersonaId, { reader: string; decision: string }> = {
  job_search: { reader: 'a recruiter', decision: 'shortlist you' },
  recruiter_inbound: { reader: 'a recruiter searching', decision: 'reach out' },
  sales: { reader: 'a buyer', decision: 'start a conversation' },
  thought_leadership: { reader: 'a first-time reader', decision: 'follow you' },
  hiring: { reader: 'a candidate', decision: 'want to work for you' },
};

export function bandFor(score: number): Band {
  return BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1];
}

/** The band above this one, or undefined at the top. */
export function nextBand(score: number): Band | undefined {
  const i = BANDS.findIndex((b) => score >= b.min);
  return i > 0 ? BANDS[i - 1] : undefined;
}

/** What the reader of this profile can do with it, at this score, for this goal. */
export function bandReads(score: number, persona: PersonaId): string {
  const { reader, decision } = AUDIENCE[persona] ?? AUDIENCE.job_search;
  return bandFor(score).reads(reader, decision);
}

/**
 * How far to the next band, when it is close enough to be worth chasing.
 *
 * The point of showing it is to make the boundary visible rather than a surprise.
 * A band you cross without warning is the same cliff in a different coat; a band
 * you can see coming, next to a recommendation worth more points than the gap, is
 * a reason to do the thing.
 */
export function toNextBand(score: number, within = 14): { label: string; points: number } | undefined {
  const next = nextBand(score);
  if (!next) return undefined;
  const points = next.min - score;
  return points > 0 && points <= within ? { label: next.label, points } : undefined;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

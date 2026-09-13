import type { Profile } from './types.ts';

/**
 * How long a career the profile describes, and what that changes.
 *
 * The point is expectations, not leniency. Measured on the corpus first: a new
 * graduate loses points almost entirely for things a graduate can fix — no number
 * in the one role they have, no outcome in the sentence, nothing quantified in the
 * About. Only ONE check is genuinely bounded by how long they have worked, and
 * that is recommendations: you cannot have three when you have had one manager.
 * Every other rule is already a ratio over what exists ("0 of 1 roles described",
 * never "you only have 1 role"), which is why the rubric was mostly stage-neutral
 * before this file existed.
 *
 * So the interesting half is the other direction. Sixteen years across six roles
 * with no description anywhere is a far worse signal than one year with a thin
 * one — and before this, both landed in the same band. The longer the career, the
 * more of the profile's job the work history is doing, and the more an empty one
 * costs.
 *
 * Two things this deliberately is not:
 *  - Not an age proxy. It reads stated work history only, never education dates or
 *    a graduation year, and it names the career the profile describes rather than
 *    the person reading it.
 *  - Not a handicap. It moves what is expected, not what is earned. A graduate who
 *    writes well still scores well, and is not congratulated for an empty profile.
 */

export type StageId = 'early' | 'mid' | 'senior' | 'veteran';

export interface Stage {
  id: StageId;
  /** Lowest career length in years. */
  min: number;
  label: string;
  /**
   * Per-rule multipliers layered over the persona's own weights.
   *
   * Kept short on purpose. Every entry has to answer "why is the right target
   * different at this stage?" — not "does this matter more to this kind of
   * person?", which is what the persona weights are already for.
   */
  weights: Record<string, number>;
  /**
   * Points added to a named blocking gap's floor at this stage.
   *
   * Weights alone under-deliver here, and the corpus shows why: raising a rule's
   * weight raises what is earned as well as what is available, so the score barely
   * moves. What actually changes how a long empty career reads is the ceiling. A
   * profile describing sixteen years with nothing written under any role should not
   * merely lose points — a recruiter cannot assess it at all, which is precisely
   * what a cap is for. Negative lowers the ceiling (bites harder); positive raises
   * it (more forgiving of a career that has not happened yet).
   *
   * Keyed by rule, never applied across the board. A first draft shifted every
   * blocking gap and the archetype guard caught it immediately: the veteran nurse
   * fell to 35 for audience building, because the shift had reached a gap about
   * POSTING. How long someone has worked says nothing about whether they should
   * post more — only about how much unwritten work history there is to answer for.
   * A stage may only move the ceiling on gaps whose evidence accumulates with a
   * career.
   */
  blockingFloorShift: Record<string, number>;
}

/** Highest first. Boundaries are the ones a hiring market actually uses. */
export const STAGES: Stage[] = [
  {
    id: 'veteran',
    min: 15,
    label: '15+ years',
    blockingFloorShift: {
      'experience.description_coverage': -15,
      'experience.current_role_detail': -15,
    },
    weights: {
      // At this length the work history is the profile. An undescribed one is
      // not a thin section, it is a career nobody can see.
      'experience.description_coverage': 1.4,
      'experience.current_role_detail': 1.3,
      'experience.outcome_language': 1.2,
      // Nobody is hiring on the degree any more.
      'education.present': 0.4,
      // A portfolio still helps, but twenty years of shipped work is the case.
      'portfolio.present': 0.5,
    },
  },
  {
    id: 'senior',
    min: 8,
    label: '8–15 years',
    blockingFloorShift: {
      'experience.description_coverage': -8,
      'experience.current_role_detail': -8,
    },
    weights: {
      'experience.description_coverage': 1.25,
      'experience.current_role_detail': 1.15,
      'education.present': 0.6,
      'portfolio.present': 0.7,
    },
  },
  {
    id: 'mid',
    min: 2,
    label: '2–8 years',
    blockingFloorShift: {},
    weights: {},
  },
  {
    id: 'early',
    min: 0,
    label: 'Under 2 years',
    blockingFloorShift: {
      // One role, honestly described, is all there is to have.
      'experience.description_coverage': 10,
      'experience.current_role_detail': 10,
    },
    weights: {
      // The one check a short career genuinely caps. One manager, one reference.
      'recommendations.count': 0.35,
      // Fewer roles to have gathered a broad skill list from.
      'skills.count': 0.7,
      // At this stage it is the main evidence there is.
      'education.present': 1.8,
      // The heart of this stage. With one role and one manager, what a person
      // built is the case they have — so the rubric has to give them a way to
      // make it, and has to reward describing it as seriously as a job.
      'portfolio.present': 2.8,
      'portfolio.described': 3.2,
      // The other side of the same judgement. With one internship on the page,
      // a third paragraph about it is worth less than describing three separate
      // pieces of work — so the role rules stop out-weighing the portfolio 4:1.
      'experience.description_coverage': 0.45,
      'experience.current_role_detail': 0.45,
      'experience.quantified': 0.45,
      'experience.outcome_language': 0.45,
      // Having held no job at all is not free. Every other experience rule
      // abstains when there are no roles — you cannot describe what you have not
      // done — so without this the denominator shrinks and a profile with no work
      // history outscores the same profile with an internship on it. Whether you
      // have worked yet is the one experience question a student can still answer,
      // so it carries the weight the abstaining rules gave up.
      'experience.present': 1.6,
      // What they post is evidence too: at two years, thinking out loud about
      // the work is often the only public record of how they think.
      'activity.recency': 1.5,
    },
  },
];

/** A month index, so intervals can be unioned without date arithmetic. */
function monthsSince1900(year: number, month: number): number {
  return year * 12 + month;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Apr 2021" → month index. A bare "2021" resolves to `fallback` within that year. */
function parsePoint(token: string, fallback: 0 | 11): number | null {
  const withMonth = /([A-Za-z]{3})[a-z]*\.?\s+((?:19|20)\d{2})/.exec(token);
  if (withMonth) {
    const m = MONTHS.indexOf(withMonth[1].toLowerCase());
    if (m >= 0) return monthsSince1900(Number(withMonth[2]), m);
  }
  const yearOnly = /(?:19|20)\d{2}/.exec(token);
  if (yearOnly) return monthsSince1900(Number(yearOnly[0]), fallback);
  return null;
}

/** One role's span as [startMonth, endMonth], or null if the dates are unreadable. */
function interval(dateRange: string, now: number): [number, number] | null {
  // Strip LinkedIn's trailing duration ("· 7 yrs 5 mos") so its digits are not
  // mistaken for years.
  const clean = dateRange.replace(/·.*$/, '').trim();
  const [rawStart, rawEnd] = clean.split(/\s*[-–—]\s*|\s+to\s+/i);
  if (!rawStart) return null;

  const start = parsePoint(rawStart, 0);
  if (start === null) return null;

  const end = !rawEnd || /present|current|now/i.test(rawEnd) ? now : parsePoint(rawEnd, 11);
  if (end === null) return null;

  return start <= end ? [start, end] : [end, start];
}

/**
 * Total years of career the profile describes.
 *
 * Unions the intervals rather than summing them. A contractor with twelve
 * engagements inside one calendar year has worked a year, not six — summing role
 * durations would read every parallel or back-to-back short engagement as extra
 * career and hand the most misjudged profile in the corpus a veteran's rubric.
 *
 * Returns undefined when no role carries a readable date, which is the honest
 * answer for a paste-based extraction: the stage then does nothing at all.
 */
export function careerYears(profile: Profile, now = new Date()): number | undefined {
  const roles = profile.experience ?? [];
  if (!roles.length) {
    // No roles is not the same as no information. If the Experience section was
    // actually read and is empty, the career length is zero — and it is precisely
    // the person with no job yet who most needs to be read as early-career. Only
    // an UNREAD section leaves the stage genuinely unknown.
    return profile.observed?.includes('experience') ? 0 : undefined;
  }

  const nowMonth = monthsSince1900(now.getFullYear(), now.getMonth());
  const spans = roles
    .map((r) => (r.dateRange ? interval(r.dateRange, nowMonth) : null))
    .filter((s): s is [number, number] => s !== null)
    .sort((a, b) => a[0] - b[0]);

  if (!spans.length) return undefined;

  let months = 0;
  let [openStart, openEnd] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= openEnd + 1) {
      openEnd = Math.max(openEnd, e); // overlapping or contiguous — one span
    } else {
      months += openEnd - openStart + 1;
      [openStart, openEnd] = [s, e];
    }
  }
  months += openEnd - openStart + 1;

  return Math.round((months / 12) * 10) / 10;
}

export function stageFor(years: number): Stage {
  return STAGES.find((s) => years >= s.min) ?? STAGES[STAGES.length - 1];
}

/** The stage a profile is read against, or undefined when the dates were unreadable. */
export function stageOf(profile: Profile, now?: Date): { stage: Stage; years: number } | undefined {
  const years = careerYears(profile, now);
  return years === undefined ? undefined : { stage: stageFor(years), years };
}

/**
 * Canonical profile shape the engine scores.
 * Every field is optional: extractors degrade (paste sees less than the plugin),
 * and a rule that cannot observe its input must abstain, never score zero.
 */

export interface Experience {
  title?: string;
  company?: string;
  /** Raw date range text, e.g. "Jan 2019 - Present" */
  dateRange?: string;
  description?: string;
  current?: boolean;
}

export interface FeaturedItem {
  kind?: 'link' | 'post' | 'media' | 'newsletter';
  title?: string;
  url?: string;
  hasCustomThumbnail?: boolean;
}

export interface Profile {
  name?: string;
  headline?: string;
  about?: string;
  location?: string;
  customUrl?: boolean;

  experience?: Experience[];
  /**
   * Employer groups on the profile, and how many resolve to a LinkedIn company
   * entity rather than plain text. Counted at the employer level because that is
   * where the logo and /company/ link live — never on the individual role.
   */
  employerCount?: number;
  linkedEmployers?: number;
  education?: { school?: string; degree?: string }[];
  skills?: string[];
  /**
   * How many skills the profile declares. LinkedIn collapses the section and
   * renders only the first couple of names, so the count is knowable when the
   * names are not. Kept separate so scoring can use the true count while advice
   * only ever names skills actually read.
   */
  skillsDeclaredCount?: number;
  featured?: FeaturedItem[];
  certifications?: string[];
  recommendationsReceived?: number;

  banner?: { present?: boolean; isDefault?: boolean };
  /** `hasFrame` is LinkedIn's photo ring — in practice almost always #OpenToWork. */
  photo?: { present?: boolean; isDefault?: boolean; hasFrame?: boolean };
  /** Whether the "Open to work" banner is on, and who can see it. */
  openToWork?: { active?: boolean; publicToAll?: boolean };
  contactInfoAvailable?: boolean;

  activity?: {
    /** Days since most recent public post. null = never posted. */
    lastPostDaysAgo?: number | null;
    postsLast30d?: number;
  };

  /** Which fields the extractor actually looked at. Anything absent here is unobserved. */
  observed?: string[];
}

export type PersonaId =
  | 'job_search'
  | 'recruiter_inbound'
  | 'sales'
  | 'thought_leadership'
  | 'hiring';

/** A rule's raw verdict, before persona weighting. */
export interface RuleResult {
  /** 0..1. Partial credit is the point — avoid returning only 0 or 1. */
  ratio: number;
  /** What was actually seen on the profile. Shown to the user verbatim. */
  observed: string;
  /** Why it scored what it scored. */
  reason: string;
  /** Concrete next action. Omit when ratio is 1. */
  fix?: string;
}

/** Returned instead of a RuleResult when the input was never captured. */
export const ABSTAIN = Symbol('abstain');
export type RuleOutcome = RuleResult | typeof ABSTAIN;

export interface RuleContext {
  profile: Profile;
  persona: PersonaId;
}

export interface Rule {
  id: string;
  dimension: string;
  /** One line, phrased as the thing being measured — not as a pass claim. */
  title: string;
  /** Relative weight before persona multipliers. */
  base: number;
  evaluate(ctx: RuleContext): RuleOutcome;
}

export interface ScoredRule {
  id: string;
  dimension: string;
  title: string;
  earned: number;
  available: number;
  ratio: number;
  observed: string;
  reason: string;
  fix?: string;
}

export interface DimensionScore {
  dimension: string;
  earned: number;
  available: number;
}

/**
 * Something worth telling the person that must not move the score.
 *
 * Some profile choices have no defensible right answer — the evidence is thin,
 * contested, or the correct call genuinely depends on the person. Pricing those
 * in points fabricates authority we do not have, which is the failure mode this
 * rubric exists to avoid. Report them; let the person decide.
 */
export interface Observation {
  id: string;
  title: string;
  /** What is actually on the profile. */
  observed: string;
  /** The trade-off, both directions, without a recommendation. */
  note: string;
}

/**
 * A ceiling imposed because a decision-blocking check failed.
 *
 * Weights express how much something matters. A cap expresses something weights
 * cannot: that a reader is unable to make the decision this profile exists to
 * enable, so no amount of polish elsewhere should read as "solid". Blocking is
 * deliberately rare — if everything blocks, nothing does.
 *
 * Graded, not a cliff: the ceiling interpolates with the blocking check's own
 * ratio, so a half-written experience section caps at roughly half the distance
 * between the floor and 100.
 */
export interface ScoreCap {
  ruleId: string;
  title: string;
  /** 0..100 ceiling actually applied. */
  ceiling: number;
  /** How the blocking check scored, 0..1. */
  ratio: number;
  /** Plain-language reason, phrased as what the reader cannot do. */
  because: string;
}

export interface ScoreReport {
  persona: PersonaId;
  /** 0..100, normalised over rules that did not abstain, after any cap. */
  score: number;
  /** The score before caps. Equal to `score` when nothing blocks. */
  uncappedScore: number;
  /** Ceilings applied, if any. The lowest one wins. */
  caps: ScoreCap[];
  /**
   * Honest bounds when some input was not captured: `floor` assumes every
   * unmeasured check would fail, `ceiling` assumes every one would pass.
   * With a complete extraction both equal `score`.
   *
   * This exists because normalising over what we could see makes a partial
   * extraction score higher than a complete one. Reporting the point estimate
   * alone would mean the paste-based path always flatters the user.
   *
   * Brackets `uncappedScore`, not `score`. Uncertainty about what we could read and
   * a ceiling from a blocking gap are separate things; mixing them would make
   * neither legible. Present them side by side.
   */
  range: { floor: number; ceiling: number };
  band: 'weak' | 'developing' | 'solid' | 'strong';
  rules: ScoredRule[];
  dimensions: DimensionScore[];
  /** Rules skipped because the extractor never saw the input. */
  abstained: { id: string; title: string; reason: string }[];
  /** Highest points-per-effort fixes, richest first. */
  topFixes: { id: string; title: string; fix: string; pointsAvailable: number }[];
  /** Points unreachable by this extractor, so the score is honest about its ceiling. */
  unobservedPoints: number;
  /** Unscored findings. See `Observation`. */
  observations: Observation[];
}

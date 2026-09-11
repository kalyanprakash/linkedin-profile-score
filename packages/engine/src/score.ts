import {
  ABSTAIN, type PersonaId, type Profile, type ScoreReport, type ScoredRule, type DimensionScore,
  type ScoreCap,
} from './types.ts';
import { PERSONAS, DEFAULT_PERSONA } from './personas.ts';
import { ALL_RULES } from './rules/index.ts';
import { clamp01 } from './text.ts';
import { observe } from './observations.ts';

/**
 * Points a cap must remove before it is reported at all.
 *
 * Set from the UI consequence rather than the maths: the cap renders as a red
 * block that reorders the advice, and "capped at 58 — would otherwise be 59" is a
 * false alarm. Three points is the smallest difference that survives rounding and
 * changes how a reader reads the band.
 */
const MIN_BIND = 3;

function band(score: number): ScoreReport['band'] {
  if (score < 40) return 'weak';
  if (score < 60) return 'developing';
  if (score < 80) return 'solid';
  return 'strong';
}

/**
 * Score a profile against one persona.
 *
 * Two properties the competition does not have, and the reasons this exists:
 *  1. Partial credit — every rule returns 0..1, so a real profile lands on a real
 *     number instead of collapsing to zero.
 *  2. Abstention — rules whose input was never captured are removed from the
 *     denominator rather than scored zero, so a paste-based extraction is not
 *     punished for what it cannot see.
 */
export function scoreProfile(profile: Profile, personaId: PersonaId = DEFAULT_PERSONA): ScoreReport {
  const persona = PERSONAS[personaId] ?? PERSONAS[DEFAULT_PERSONA];

  const scored: ScoredRule[] = [];
  const abstained: ScoreReport['abstained'] = [];
  let rawAvailable = 0;
  let rawEarned = 0;
  let rawUnobserved = 0;

  for (const rule of ALL_RULES) {
    const weight = persona.weights[rule.id] ?? 1;
    if (weight === 0) continue; // not measured for this persona

    const available = rule.base * weight;
    const outcome = rule.evaluate({ profile, persona: persona.id });

    if (outcome === ABSTAIN) {
      rawUnobserved += available;
      abstained.push({
        id: rule.id,
        title: rule.title,
        reason: 'Not visible to this extractor.',
      });
      continue;
    }

    const ratio = clamp01(outcome.ratio);
    rawAvailable += available;
    rawEarned += ratio * available;

    scored.push({
      id: rule.id,
      dimension: rule.dimension,
      title: rule.title,
      earned: ratio * available,
      available,
      ratio,
      observed: outcome.observed,
      reason: outcome.reason,
      fix: ratio < 1 ? outcome.fix : undefined,
    });
  }

  // Normalise the measured rules onto a 100-point scale.
  const scale = rawAvailable > 0 ? 100 / rawAvailable : 0;
  for (const r of scored) {
    r.earned = round1(r.earned * scale);
    r.available = round1(r.available * scale);
  }

  const uncappedScore = Math.round(rawAvailable > 0 ? (rawEarned / rawAvailable) * 100 : 0);

  /**
   * Decision-blocking gaps impose a ceiling.
   *
   * Weights say how much something matters; a cap says a reader cannot make the
   * decision at all, so polish elsewhere must not read as "solid". Two rules the
   * implementation must honour:
   *
   *  - It engages only on genuine absence. `engageBelow` (default 0.35) is the
   *    ratio under which a gap counts as blocking at all; above it the check is
   *    merely short of full marks, which is what weights are for.
   *  - Graded, never a cliff. Between zero and `engageBelow` the ceiling rises
   *    from `floor` to 100, so the cap fades out instead of falling off an edge —
   *    the same reason every rule returns partial credit.
   *  - An ABSTAINED check never caps. If the section could not be read, we cannot
   *    claim it is missing; that is the whole point of abstention.
   *  - It must be worth saying. A cap binding by a point or two changes nothing
   *    about the advice but renders as a prominent red warning, so it reads as far
   *    more serious than it is. Below MIN_BIND the cap is dropped entirely rather
   *    than applied quietly — a ceiling the panel does not explain is exactly the
   *    invisible limit this design exists to avoid, and one worth 1 point is not
   *    worth explaining. As a gap closes the cap now fades out and then goes.
   */
  const caps: ScoreCap[] = [];
  for (const gap of persona.blocking ?? []) {
    const rule = scored.find((r) => r.id === gap.ruleId);
    if (!rule) continue;             // abstained, or not measured for this persona
    const engageBelow = gap.engageBelow ?? 0.35;
    if (rule.ratio >= engageBelow) continue; // short of full marks, not blocking
    const ceiling = Math.round(gap.floor + (100 - gap.floor) * (rule.ratio / engageBelow));
    if (uncappedScore - ceiling < MIN_BIND) continue; // not binding, or too small to mean anything
    caps.push({
      ruleId: gap.ruleId, title: rule.title, ceiling, ratio: rule.ratio, because: gap.because,
    });
  }
  caps.sort((a, b) => a.ceiling - b.ceiling);

  const score = caps.length ? Math.min(uncappedScore, caps[0].ceiling) : uncappedScore;

  // Bounds over the full rubric, including what we could not see.
  const fullDenominator = rawAvailable + rawUnobserved;
  const range = fullDenominator > 0
    ? {
        floor: Math.round((rawEarned / fullDenominator) * 100),
        ceiling: Math.round(((rawEarned + rawUnobserved) / fullDenominator) * 100),
      }
    : { floor: 0, ceiling: 0 };

  const byDimension = new Map<string, DimensionScore>();
  for (const r of scored) {
    const d = byDimension.get(r.dimension) ?? { dimension: r.dimension, earned: 0, available: 0 };
    d.earned = round1(d.earned + r.earned);
    d.available = round1(d.available + r.available);
    byDimension.set(r.dimension, d);
  }

  const topFixes = scored
    .filter((r) => r.fix)
    .map((r) => ({
      id: r.id,
      title: r.title,
      fix: r.fix!,
      pointsAvailable: round1(r.available - r.earned),
    }))
    .sort((a, b) => b.pointsAvailable - a.pointsAvailable)
    .slice(0, 5);

  return {
    persona: persona.id,
    score,
    uncappedScore,
    caps,
    range,
    band: band(score),
    rules: scored.sort((a, b) => b.available - a.available),
    dimensions: [...byDimension.values()].sort((a, b) => b.available - a.available),
    abstained,
    topFixes,
    unobservedPoints: round1(rawUnobserved * scale),
    observations: observe(profile),
  };
}

/** Score against every persona — useful for showing which goal the profile currently serves. */
export function scoreAllPersonas(profile: Profile): Record<PersonaId, number> {
  const out = {} as Record<PersonaId, number>;
  for (const id of Object.keys(PERSONAS) as PersonaId[]) {
    out[id] = scoreProfile(profile, id).score;
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

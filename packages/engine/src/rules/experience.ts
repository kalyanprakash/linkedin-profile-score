import { ABSTAIN, type Rule, type Experience } from '../types.ts';
import { dutyPhraseCount, outcomeVerbCount, pct, quantHits, ramp, words } from '../text.ts';
import { saw } from './util.ts';

/** Below this there is no prose worth analysing for numbers or verb choice. */
const MIN_WORDS = 8;
/** Words at which a role description is fully credited. */
const FULL_WORDS = 40;

/** Has enough prose to analyse at all. Not a quality judgement. */
function described(e: Experience): boolean {
  return words(e.description || '').length >= MIN_WORDS;
}

/**
 * How complete one role's description is, 0..1.
 *
 * Graded rather than a threshold. A hard cutoff made an 18-word description score
 * identically to a blank one, which is the all-or-nothing behaviour this rubric
 * exists to avoid — and it hit short histories hardest, where one partly-written
 * role is the entire section.
 */
function descriptionDepth(e: Experience): number {
  return ramp(words(e.description || '').length, 0, FULL_WORDS);
}

/** Recency weighting: the current role carries more than a job from 2011. */
function weights(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 2 : i === 1 ? 1.5 : 1));
}

function weightedScore(list: Experience[], score: (e: Experience) => number): number {
  const w = weights(list.length);
  const total = w.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return list.reduce((acc, e, i) => acc + score(e) * w[i], 0) / total;
}

export const experienceRules: Rule[] = [
  {
    id: 'experience.present',
    dimension: 'Experience',
    title: 'Experience section has entries',
    base: 4,
    evaluate({ profile }) {
      if (!saw(profile, 'experience')) return ABSTAIN;
      const n = (profile.experience || []).length;
      return n > 0
        ? { ratio: 1, observed: `${n} role${n === 1 ? '' : 's'} listed.`, reason: 'Experience entries are present.' }
        : {
            ratio: 0,
            observed: 'No roles listed.',
            reason: 'Experience entries are what recruiter search filters on.',
            fix: 'Add your roles, most recent first.',
          };
    },
  },

  {
    id: 'experience.description_coverage',
    dimension: 'Experience',
    title: 'Roles have descriptions, not just titles',
    base: 12,
    evaluate({ profile }) {
      if (!saw(profile, 'experience')) return ABSTAIN;
      const list = profile.experience || [];
      if (list.length === 0) return ABSTAIN; // absence handled by experience.present

      const filled = list.filter((e) => descriptionDepth(e) >= 0.5);
      const ratio = weightedScore(list, descriptionDepth);
      const blanks = list.filter((e) => descriptionDepth(e) < 0.5).map((e) => e.title || 'untitled role');

      return {
        ratio,
        observed: `${filled.length} of ${list.length} roles are described in real depth${blanks.length ? ` — thin or missing on: ${blanks.slice(0, 4).join(', ')}` : ''}.`,
        reason:
          ratio === 0
            ? 'A title and a date range tell a reader nothing about what you did or how well.'
            : `Weighted toward your most recent roles, coverage is ${pct(ratio)}.`,
        fix:
          ratio < 1
            ? `Bring each thin role toward ${FULL_WORDS} words, starting with the most recent. This is usually the largest single gain available on a profile.`
            : undefined,
      };
    },
  },

  {
    id: 'experience.current_role_detail',
    dimension: 'Experience',
    title: 'The current role is described in depth',
    base: 7,
    evaluate({ profile }) {
      if (!saw(profile, 'experience')) return ABSTAIN;
      const list = profile.experience || [];
      const current = list.find((e) => e.current) || list[0];
      if (!current) return ABSTAIN;

      const wc = words(current.description || '').length;
      const ratio = ramp(wc, 0, 90);
      return {
        ratio,
        observed: `"${current.title || 'Current role'}" has ${wc} words of description.`,
        reason: 'The current role is the entry most readers open and the one search weights most heavily.',
        fix: ratio < 1 ? 'Bring the current role to roughly 90 words: scope owned, what changed, and the numbers.' : undefined,
      };
    },
  },

  {
    id: 'experience.quantified',
    dimension: 'Experience',
    title: 'Role descriptions carry measurable outcomes',
    base: 9,
    evaluate({ profile }) {
      if (!saw(profile, 'experience')) return ABSTAIN;
      const list = (profile.experience || []).filter(described);
      if (list.length === 0) return ABSTAIN; // nothing written yet; coverage rule owns that

      const withNumbers = list.filter((e) => quantHits(e.description || '').length > 0);
      const ratio = withNumbers.length / list.length;
      return {
        ratio,
        observed: `${withNumbers.length} of ${list.length} written roles include a number.`,
        reason: 'Scope is the difference between "led a team" and "grew the team from 6 to 35".',
        fix: ratio < 1 ? 'Add one number to every described role — team size, users, latency, revenue, or time saved.' : undefined,
      };
    },
  },

  {
    id: 'experience.outcome_language',
    dimension: 'Experience',
    title: 'Descriptions read as outcomes rather than duties',
    base: 8,
    evaluate({ profile }) {
      if (!saw(profile, 'experience')) return ABSTAIN;
      const list = (profile.experience || []).filter(described);
      if (list.length === 0) return ABSTAIN;

      // Per role, not distinct verbs across the section. Counting variety punished
      // anyone whose roles are genuinely similar — a contractor doing the same job
      // twelve times scored as if none of it were an outcome.
      const withOutcome = list.filter((e) => outcomeVerbCount(e.description || '') > 0);
      const duties = dutyPhraseCount(list.map((e) => e.description || '').join('\n'));
      const ratio = Math.max(0, withOutcome.length / list.length - ramp(duties, 0, 5) * 0.4);

      return {
        ratio,
        observed: `${withOutcome.length} of ${list.length} written role${list.length === 1 ? '' : 's'} lead with an outcome${duties ? `; ${duties} duty phrase${duties === 1 ? '' : 's'} found` : ''}.`,
        reason: '"Responsible for" describes the job posting. "Reduced", "grew", "shipped" describe you.',
        fix: ratio < 1 ? 'Open each role with what changed because you were there, not what you were assigned.' : undefined,
      };
    },
  },
];

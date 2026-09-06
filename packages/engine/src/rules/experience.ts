import { ABSTAIN, type Rule, type Experience } from '../types.ts';
import { dutyPhraseCount, outcomeVerbCount, pct, quantHits, ramp, words } from '../text.ts';
import { saw } from './util.ts';

/** Below this, an entry is a stub rather than a description. */
const MIN_WORDS = 20;

function described(e: Experience): boolean {
  return words(e.description || '').length >= MIN_WORDS;
}

/** Recency weighting: the current role carries more than a job from 2011. */
function weights(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 2 : i === 1 ? 1.5 : 1));
}

function weightedRatio(list: Experience[], predicate: (e: Experience) => boolean): number {
  const w = weights(list.length);
  const total = w.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const got = list.reduce((acc, e, i) => acc + (predicate(e) ? w[i] : 0), 0);
  return got / total;
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

      const filled = list.filter(described);
      const ratio = weightedRatio(list, described);
      const blanks = list.filter((e) => !described(e)).map((e) => e.title || 'untitled role');

      return {
        ratio,
        observed: `${filled.length} of ${list.length} roles have a real description${blanks.length ? ` — missing on: ${blanks.slice(0, 4).join(', ')}` : ''}.`,
        reason:
          ratio === 0
            ? 'A title and a date range tell a reader nothing about what you did or how well.'
            : `Weighted toward your most recent roles, coverage is ${pct(ratio)}.`,
        fix:
          ratio < 1
            ? `Add ${MIN_WORDS}+ words to each blank role, starting with the most recent. This is usually the largest single gain available on a profile.`
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

      const text = list.map((e) => e.description || '').join('\n');
      const outcomes = outcomeVerbCount(text);
      const duties = dutyPhraseCount(text);
      const ratio = Math.max(0, ramp(outcomes, 0, list.length * 2) - ramp(duties, 0, 5) * 0.5);

      return {
        ratio,
        observed: `${outcomes} outcome verb${outcomes === 1 ? '' : 's'} and ${duties} duty phrase${duties === 1 ? '' : 's'} across ${list.length} written role${list.length === 1 ? '' : 's'}.`,
        reason: '"Responsible for" describes the job posting. "Reduced", "grew", "shipped" describe you.',
        fix: ratio < 1 ? 'Open each line with what changed because you were there, not what you were assigned.' : undefined,
      };
    },
  },
];

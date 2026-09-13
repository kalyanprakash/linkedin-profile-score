import { ABSTAIN, type Rule } from '../types.ts';
import { ramp } from '../text.ts';
import { saw } from './util.ts';

/**
 * Evidence that is not a job.
 *
 * Every other rule in here reads the work history, which quietly assumes the
 * person has one worth reading. For someone two years in, the honest evidence of
 * what they can do is a project they built, a paper they wrote, a certification
 * they earned, or what they post — and none of that was measured, so the rubric
 * offered them no way to score well by doing exactly the right thing. That is a
 * defect in the rubric, not a fact about early-career people.
 *
 * Scored for everyone, because a portfolio helps at any stage; weighted by stage,
 * because it is most of the case at two years and a footnote at twenty.
 *
 * The counting is deliberately unglamorous — how many pieces of evidence, and how
 * many of them say anything. A list of project titles is a list of nouns; "Built
 * X, which did Y" is the thing a reader can actually assess.
 */

/** Words before an entry counts as genuinely described. Lower than a role: these are short by nature. */
const FULL_DEPTH = 25;
const MIN_WORDS = 6;

function words(s: string | undefined): number {
  return (s ?? '').trim().split(/\s+/).filter(Boolean).length;
}

const KIND_LABEL: Record<string, string> = {
  project: 'project',
  publication: 'publication',
  certification: 'certification',
  volunteer: 'volunteering entry',
  honor: 'honour',
  course: 'course',
};

function summarise(kinds: string[]): string {
  const counts = new Map<string, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .map(([k, n]) => `${n} ${KIND_LABEL[k] ?? k}${n === 1 ? '' : 's'}`)
    .join(', ');
}

export const portfolioRules: Rule[] = [
  {
    id: 'portfolio.present',
    dimension: 'evidence',
    title: 'Work shown outside your job history',
    base: 5,
    evaluate({ profile }) {
      if (!saw(profile, 'portfolio')) return ABSTAIN;
      const items = profile.portfolio ?? [];
      // Three is full marks, not ten. This is a supporting case, and a wall of
      // certifications is not three times the profile that three good ones are.
      const ratio = ramp(items.length, 0, 3);
      return {
        ratio,
        observed: items.length
          ? `${summarise(items.map((i) => i.kind))} listed.`
          : 'No projects, publications, certifications or volunteering listed.',
        reason:
          'Projects, publications, certifications and volunteering are evidence of what you can do that does not depend on having held the job yet.',
        fix: 'Add two or three projects — coursework, side projects and open-source all count. Each one is a claim your job titles cannot make for you.',
      };
    },
  },
  {
    id: 'portfolio.described',
    dimension: 'evidence',
    title: 'Those entries say what you actually did',
    base: 5,
    evaluate({ profile }) {
      if (!saw(profile, 'portfolio')) return ABSTAIN;
      const items = profile.portfolio ?? [];
      // Absence is priced by portfolio.present. Charging for it twice would make
      // an empty section cost more than a thin one, which is the wrong ordering.
      if (items.length === 0) return ABSTAIN;

      const depths = items.map((i) => {
        const w = words(i.description);
        return w < MIN_WORDS ? 0 : ramp(w, 0, FULL_DEPTH);
      });
      const ratio = depths.reduce((a, b) => a + b, 0) / depths.length;
      const described = depths.filter((d) => d > 0).length;

      return {
        ratio,
        observed: `${described} of ${items.length} ${items.length === 1 ? 'entry describes' : 'entries describe'} what was done.`,
        reason:
          'A title alone is a noun. What a reader is looking for is what you built, what it was for, and what changed as a result.',
        fix: 'Give each entry two or three sentences: what you built, the problem it solved, and the outcome — a number if you have one.',
      };
    },
  },
];

import { ABSTAIN, type Rule } from '../types.ts';
import {
  isDefaultShapedHeadline, plateau, ramp, uniqueLower, words,
} from '../text.ts';
import { saw, stem, contentTokens, candidateTerms, splitTerms } from './util.ts';

/** LinkedIn's headline field caps at 220 characters. */
const HEADLINE_BUDGET = 220;

export const headlineRules: Rule[] = [
  {
    id: 'headline.present',
    dimension: 'Headline',
    title: 'Headline is filled in',
    base: 4,
    evaluate({ profile }) {
      if (!saw(profile, 'headline')) return ABSTAIN;
      const h = (profile.headline || '').trim();
      return h
        ? { ratio: 1, observed: `"${h}"`, reason: 'Headline is present.' }
        : {
            ratio: 0,
            observed: 'No headline.',
            reason: 'The headline is the single most-indexed field on the profile.',
            fix: 'Add a headline. It travels with you into search results, comments and invitations.',
          };
    },
  },

  {
    id: 'headline.length',
    dimension: 'Headline',
    title: 'Headline uses the space available',
    base: 5,
    evaluate({ profile }) {
      if (!saw(profile, 'headline')) return ABSTAIN;
      const h = (profile.headline || '').trim();
      if (!h) return { ratio: 0, observed: 'No headline.', reason: 'Nothing to measure.', fix: 'Add a headline.' };
      const len = h.length;
      const ratio = plateau(len, 0, 100, HEADLINE_BUDGET, HEADLINE_BUDGET + 40);
      return {
        ratio,
        observed: `${len} of ${HEADLINE_BUDGET} characters used.`,
        reason:
          len < 100
            ? 'Short headlines leave indexed search real estate unused.'
            : 'Good use of the available space.',
        fix:
          ratio < 1
            ? `Roughly ${HEADLINE_BUDGET - len} characters are still free — enough for a specialism and two more search terms.`
            : undefined,
      };
    },
  },

  {
    id: 'headline.beyond_default',
    dimension: 'Headline',
    title: 'Headline says more than the autofilled title and company',
    base: 8,
    evaluate({ profile }) {
      if (!saw(profile, 'headline')) return ABSTAIN;
      const h = (profile.headline || '').trim();
      if (!h) return { ratio: 0, observed: 'No headline.', reason: 'Nothing to measure.', fix: 'Add a headline.' };

      const segments = h.split('|').map((s) => s.trim()).filter(Boolean);
      const defaultShaped = isDefaultShapedHeadline(h);

      if (!defaultShaped) {
        return { ratio: 1, observed: `"${h}"`, reason: 'Headline is written, not autofilled.' };
      }
      if (segments.length === 1) {
        return {
          ratio: 0,
          observed: `"${h}" — this is LinkedIn's default "Title at Company" shape.`,
          reason: 'Everyone with that job title has the same headline, so it distinguishes nothing.',
          fix: 'Keep the title for search, then add what you actually do that the title does not convey.',
        };
      }

      const firstStems = new Set(contentTokens(segments[0]).map(stem));
      const extra = segments.slice(1).join(' ');
      const newStems = uniqueLower(contentTokens(extra).map(stem)).filter((t) => !firstStems.has(t));
      const ratio = 0.15 + 0.7 * ramp(newStems.length, 0, 4);

      return {
        ratio,
        observed: `"${h}" — starts with the default title-and-company shape; the rest adds ${newStems.length} new term${newStems.length === 1 ? '' : 's'}.`,
        reason:
          newStems.length >= 3
            ? 'The added segment carries real extra information.'
            : 'The added segment mostly restates the job title rather than adding new information.',
        fix:
          ratio < 0.85
            ? 'Replace the restatement with something the title cannot say: your specialism, the scale you work at, or the problem you own.'
            : undefined,
      };
    },
  },

  {
    id: 'headline.searchable_terms',
    dimension: 'Headline',
    title: 'Headline carries terms people actually search',
    base: 9,
    evaluate({ profile }) {
      if (!saw(profile, 'headline')) return ABSTAIN;
      const h = (profile.headline || '').trim();
      if (!h) return { ratio: 0, observed: 'No headline.', reason: 'Nothing to measure.', fix: 'Add a headline.' };

      const terms = candidateTerms(profile);
      // With almost no vocabulary captured there is nothing meaningful to match
      // against, and matching a title against a headline that contains it is circular.
      if (terms.length < 5) return ABSTAIN;

      const { hit, miss } = splitTerms(h, terms);
      // Target scales with what the person actually has to work with.
      const target = Math.min(5, Math.max(2, Math.ceil(terms.length / 4)));
      const ratio = ramp(hit.length, 0, target);

      return {
        ratio,
        observed:
          hit.length > 0
            ? `Carries ${hit.length} of your own role and skill terms: ${hit.slice(0, 6).join(', ')}.`
            : 'None of your role or skill terms appear in the headline.',
        reason:
          'Recruiter and buyer search weights the headline heavily, and it matches on your own vocabulary — job titles and skills — not on adjectives.',
        fix:
          ratio < 1 && miss.length
            ? `Work in ${target - hit.length} more of the terms you are already known for, for example: ${miss.slice(0, 5).join(', ')}.`
            : ratio < 1
              ? 'Add more of the specific terms you want to be searched for.'
              : undefined,
      };
    },
  },

  {
    id: 'headline.specificity',
    dimension: 'Headline',
    title: 'Headline names a specialism, scale or audience',
    base: 6,
    evaluate({ profile }) {
      if (!saw(profile, 'headline')) return ABSTAIN;
      const h = (profile.headline || '').trim();
      if (!h) return { ratio: 0, observed: 'No headline.', reason: 'Nothing to measure.', fix: 'Add a headline.' };

      const signals: string[] = [];
      if (/\b\d/.test(h)) signals.push('a number');
      if (/\b(?:for|helping|who|serving|to)\b/i.test(h)) signals.push('an audience');
      if (/[→|·•—-]/.test(h) && words(h).length > 6) signals.push('structure');
      if (/\b(?:ex-|formerly|previously)\b/i.test(h)) signals.push('prior affiliation');
      const domainish = contentTokens(h).filter((t) => t.length > 6).length;
      if (domainish >= 2) signals.push('domain terms');

      const ratio = ramp(signals.length, 0, 3);
      return {
        ratio,
        observed: signals.length ? `Contains ${signals.join(', ')}.` : 'Generic — no specialism, scale or audience named.',
        reason: 'Specificity is what separates two people with the same job title.',
        fix: ratio < 1 ? 'Name the domain you work in, the scale you operate at, or who you do it for.' : undefined,
      };
    },
  },
];

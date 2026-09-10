import { ABSTAIN, type Rule } from '../types.ts';
import { ramp } from '../text.ts';
import { candidateTerms, proseCorpus, splitTerms, saw } from './util.ts';
import { uniqueLower } from '../text.ts';

export const signalRules: Rule[] = [
  // ---------------------------------------------------------------- keywords
  {
    id: 'keywords.reinforcement',
    dimension: 'Keywords',
    title: 'Your key terms are backed up by prose, not just listed',
    base: 10,
    evaluate({ profile }) {
      // Declared skills only, not job-title tokens. Prose is measured with titles
      // excluded, so title words padded the denominator with terms the writing had
      // no natural reason to repeat.
      const declared = uniqueLower((profile.skills || []).slice(0, 10));
      const terms = declared.length >= 5 ? declared : candidateTerms(profile);
      // Fewer than five terms means we are mostly looking at one job title; the
      // measurement would be circular, so decline it rather than reward it.
      if (terms.length < 5) return ABSTAIN;

      // Deliberately excludes the headline and the skills list — the places the
      // terms were harvested from. Reinforcement means the term also appears in
      // writing, which is where it stops being a label and becomes evidence.
      const prose = proseCorpus(profile);
      if (!prose.trim()) {
        return {
          ratio: 0,
          observed: `${terms.length} terms listed, but there is no written About or role description for any of them to appear in.`,
          reason: 'A term that appears only in a list carries far less weight than one used in context.',
          fix: 'Write the terms you want to be found for into your About and role descriptions, not just the skills list.',
        };
      }

      const { hit, miss } = splitTerms(prose, terms);
      // Full credit at ~40% coverage. Nobody writes prose that names every skill
      // they list, so requiring all of them made this unreachable — the same
      // unwinnable-check problem this rubric exists to avoid.
      const target = Math.max(2, Math.ceil(terms.length * 0.4));
      const ratio = ramp(hit.length, 0, target);
      return {
        ratio,
        observed: `${hit.length} of your ${terms.length} role and skill terms also appear in your written sections (${target} is full credit).`,
        reason: 'LinkedIn search rewards a term used in several places over one that appears once in a list.',
        fix: ratio < 1 ? `Listed but never written about: ${miss.slice(0, 8).join(', ')}.` : undefined,
      };
    },
  },

  {
    id: 'skills.count',
    dimension: 'Keywords',
    title: 'Skills section is populated',
    base: 6,
    evaluate({ profile }) {
      if (!saw(profile, 'skills')) return ABSTAIN;
      const n = profile.skillsDeclaredCount ?? (profile.skills || []).length;
      const ratio = ramp(n, 0, 25);
      return {
        ratio,
        observed: `${n} skill${n === 1 ? '' : 's'} listed (LinkedIn allows 50).`,
        reason: 'Skills are a direct filter in recruiter search — an unlisted skill cannot match.',
        fix: ratio < 1 ? 'Get to at least 25, ordered so the three you want to be found for sit at the top.' : undefined,
      };
    },
  },

  {
    id: 'skills.alignment',
    dimension: 'Keywords',
    title: 'Top skills match what your headline claims',
    base: 5,
    evaluate({ profile }) {
      if (!saw(profile, 'skills') || !saw(profile, 'headline')) return ABSTAIN;
      const top = (profile.skills || []).slice(0, 5);
      if (top.length === 0) return ABSTAIN;
      const { hit } = splitTerms(profile.headline || '', top);
      const ratio = ramp(hit.length, 0, 2);
      return {
        ratio,
        observed: hit.length ? `Headline reflects: ${hit.join(', ')}.` : 'None of your top five skills appear in the headline.',
        reason: 'When the headline and the top skills disagree, search relevance splits between them.',
        fix: ratio < 1 ? `Pull one or two of your top skills into the headline: ${top.slice(0, 3).join(', ')}.` : undefined,
      };
    },
  },

  // ------------------------------------------------------------------ assets
  {
    id: 'featured.present',
    dimension: 'Featured',
    title: 'Featured section shows proof',
    base: 7,
    evaluate({ profile }) {
      if (!saw(profile, 'featured')) return ABSTAIN;
      const items = profile.featured || [];
      const ratio = ramp(items.length, 0, 2);
      return {
        ratio,
        observed: items.length ? `${items.length} featured item${items.length === 1 ? '' : 's'}.` : 'Featured section is empty.',
        reason: 'Featured sits above the fold and is the only section where you choose exactly what a visitor sees first.',
        fix: ratio < 1 ? 'Pin two items: one piece of proof (a talk, a write-up, a launch) and one route to reach you.' : undefined,
      };
    },
  },

  {
    id: 'banner.present',
    dimension: 'Presentation',
    title: 'Custom banner rather than the default background',
    base: 5,
    evaluate({ profile }) {
      if (!saw(profile, 'banner')) return ABSTAIN;
      const b = profile.banner || {};
      if (b.present && !b.isDefault) {
        return { ratio: 1, observed: 'Custom banner in place.', reason: 'The banner is the largest element on the page.' };
      }
      return {
        ratio: b.present ? 0.3 : 0,
        observed: b.present ? 'Default LinkedIn background.' : 'No banner image.',
        reason: 'The largest visual element on the profile is currently saying nothing.',
        fix: 'Add a 1584 × 396 image. Keep text out of the lower-left where the photo overlaps.',
      };
    },
  },

  {
    id: 'photo.present',
    dimension: 'Presentation',
    title: 'Profile photo is set',
    base: 4,
    evaluate({ profile }) {
      if (!saw(profile, 'photo')) return ABSTAIN;
      const p = profile.photo || {};
      return p.present
        ? { ratio: 1, observed: 'Photo is set.', reason: 'Photo present.' }
        : {
            ratio: 0,
            observed: 'No profile photo.',
            reason: 'A profile without a photo is routinely skipped in search results and invitations.',
            fix: 'Add a clear head-and-shoulders photo.',
          };
    },
  },

  {
    id: 'profile.custom_url',
    dimension: 'Presentation',
    title: 'Vanity URL is claimed',
    base: 2,
    evaluate({ profile }) {
      if (!saw(profile, 'customUrl')) return ABSTAIN;
      return profile.customUrl
        ? { ratio: 1, observed: 'Custom URL set.', reason: 'Clean URL in place.' }
        : {
            ratio: 0,
            observed: 'URL still contains LinkedIn’s generated suffix.',
            reason: 'A clean URL is what goes on a CV and in an email signature.',
            fix: 'Claim linkedin.com/in/yourname under Edit public profile & URL.',
          };
    },
  },

  {
    id: 'recommendations.count',
    dimension: 'Social proof',
    title: 'Recommendations from other people',
    base: 5,
    evaluate({ profile }) {
      if (!saw(profile, 'recommendationsReceived')) return ABSTAIN;
      const n = profile.recommendationsReceived || 0;
      const ratio = ramp(n, 0, 3);
      return {
        ratio,
        observed: `${n} recommendation${n === 1 ? '' : 's'} received.`,
        reason: 'Recommendations are the only claims on the profile you did not write yourself.',
        fix: ratio < 1 ? 'Ask three people you have worked closely with. Two or three specific ones beat ten generic ones.' : undefined,
      };
    },
  },

  // ---------------------------------------------------------------- activity
  {
    id: 'activity.recency',
    dimension: 'Activity',
    title: 'Posted recently enough to appear in the feed',
    base: 6,
    evaluate({ profile }) {
      if (!saw(profile, 'activity')) return ABSTAIN;
      const days = profile.activity?.lastPostDaysAgo;
      if (days === undefined) return ABSTAIN;
      if (days === null) {
        return {
          ratio: 0,
          observed: 'No public posts found.',
          reason: 'Nothing carries your headline back into anyone’s feed.',
          fix: 'One post a month is enough to stop the profile going quiet.',
        };
      }
      const ratio = 1 - ramp(days, 14, 150);
      return {
        ratio,
        observed: `Last public post was ${days} day${days === 1 ? '' : 's'} ago.`,
        reason: days <= 14
          ? 'Recent enough that the profile reads as active.'
          : 'Activity decays; a profile that has been quiet for months shows up less and reads as dormant.',
        fix: ratio < 1 ? 'Post something once this month. Recency matters more here than volume.' : undefined,
      };
    },
  },

  {
    id: 'activity.cadence',
    dimension: 'Activity',
    title: 'Posting is regular rather than one-off',
    base: 4,
    evaluate({ profile }) {
      if (!saw(profile, 'activity')) return ABSTAIN;
      const n = profile.activity?.postsLast30d;
      if (n === undefined) return ABSTAIN;
      const ratio = ramp(n, 0, 4);
      return {
        ratio,
        observed: `${n} post${n === 1 ? '' : 's'} in the last 30 days.`,
        reason: 'Consistency compounds; a single post does not.',
        fix: ratio < 1 ? 'Four posts a month is the point where reach starts to build.' : undefined,
      };
    },
  },
];

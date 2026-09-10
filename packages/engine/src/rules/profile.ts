import { ABSTAIN, type Rule } from '../types.ts';
import { saw } from './util.ts';

/**
 * Top-card completeness and positioning signals.
 *
 * Deliberately short. LinkedIn renders empty-state cards for Projects, Patents,
 * Honours, Courses, Test Scores, Causes and more on every profile in existence —
 * scoring their emptiness would manufacture the same near-zero the paid tools
 * produce. A section is only worth a rule when its absence genuinely costs the
 * person something.
 */
export const profileRules: Rule[] = [
  {
    id: 'profile.location',
    dimension: 'Findability',
    title: 'Location is set',
    base: 5,
    evaluate({ profile }) {
      if (!saw(profile, 'location')) return ABSTAIN;
      const loc = (profile.location || '').trim();
      return loc
        ? { ratio: 1, observed: `Location: ${loc}.`, reason: 'Location is set.' }
        : {
            ratio: 0,
            observed: 'No location on the profile.',
            reason: 'Location is one of the few hard filters in recruiter search — a blank one excludes you from every geographic query, not just the wrong ones.',
            fix: 'Set your city and country. It costs nothing and it is a filter you are currently failing by default.',
          };
    },
  },

  {
    id: 'education.present',
    dimension: 'Credentials',
    title: 'Education is listed',
    base: 4,
    evaluate({ profile }) {
      if (!saw(profile, 'education')) return ABSTAIN;
      const n = (profile.education || []).length;
      return n > 0
        ? { ratio: 1, observed: `${n} education entr${n === 1 ? 'y' : 'ies'} listed.`, reason: 'Education present.' }
        : {
            ratio: 0,
            observed: 'No education listed.',
            reason: 'Plenty of recruiter searches filter on school or degree, and an empty section drops you from all of them.',
            fix: 'Add at least your most recent institution, even without dates.',
          };
    },
  },

  {
    id: 'experience.company_linked',
    dimension: 'Findability',
    title: 'Employers resolve to a company page',
    base: 4,
    evaluate({ profile }) {
      if (!saw(profile, 'employerCount')) return ABSTAIN;
      const total = profile.employerCount ?? 0;
      const linked = profile.linkedEmployers ?? 0;
      if (total === 0) return ABSTAIN;

      const ratio = linked / total;
      const missing = total - linked;
      return {
        ratio,
        observed: `${linked} of ${total} employer${total === 1 ? '' : 's'} link to a LinkedIn company page.`,
        // Deliberately narrow. Whether a company has a page says nothing about
        // whether the job happened, and scoring it as credibility would penalise
        // startups, non-profits and the self-employed. The only defensible cost is
        // the search filter, so that is the only thing claimed here.
        reason:
          'A linked employer is filterable in recruiter search; a plain-text one is not, so those roles drop out of any search narrowed by company.',
        fix:
          ratio < 1
            ? `${missing} employer${missing === 1 ? '' : 's'} won't match a search filtered by company. Usually the name was typed rather than picked from the dropdown when the role was added — re-edit the role and select it. If it's your own company and has no page, creating one is free.`
            : undefined,
      };
    },
  },

  {
    id: 'profile.contact_info',
    dimension: 'Findability',
    title: 'Contact details are reachable',
    base: 3,
    evaluate({ profile }) {
      if (!saw(profile, 'contactInfoAvailable')) return ABSTAIN;
      return profile.contactInfoAvailable
        ? { ratio: 1, observed: 'Contact info is filled in.', reason: 'There is a route to reach you.' }
        : {
            ratio: 0,
            observed: 'No contact info.',
            reason: 'Someone convinced by your profile has no way to act on it without sending a connection request first.',
            fix: 'Add an email or a link under Contact info.',
          };
    },
  },

];

import type { PersonaId } from './types.ts';

export interface PersonaDef {
  id: PersonaId;
  label: string;
  /** What the profile is being optimised for. Shown above the score. */
  intent: string;
  /**
   * Per-rule multipliers applied to each rule's base weight. Unlisted rules use 1.
   * A 0 removes the rule from this persona's denominator entirely — it is not a
   * zero score, it simply is not measured.
   */
  weights: Record<string, number>;
}

export const PERSONAS: Record<PersonaId, PersonaDef> = {
  job_search: {
    id: 'job_search',
    label: 'Job search',
    intent: 'Be found and shortlisted by recruiters and hiring managers for a specific role.',
    weights: {
      // Findability and evidence carry the profile.
      'experience.description_coverage': 2.0,
      'experience.quantified': 1.6,
      'experience.outcome_language': 1.4,
      'experience.current_role_detail': 1.5,
      'keywords.reinforcement': 1.5,
      'skills.count': 1.3,
      'headline.searchable_terms': 1.5,
      'headline.beyond_default': 0.8,
      'recommendations.count': 1.3,
      // Marketing furniture matters much less than the competitor assumes.
      'banner.present': 0.4,
      'featured.present': 0.6,
      'about.cta': 0.5,
      'activity.recency': 0.5,
      'activity.cadence': 0.3,
      'profile.location': 1.6,
      'education.present': 1.3,
    },
  },

  recruiter_inbound: {
    id: 'recruiter_inbound',
    label: 'Passive — be findable',
    intent: 'Not actively looking, but surface in recruiter searches for the right roles.',
    weights: {
      'keywords.reinforcement': 2.0,
      'skills.count': 1.8,
      'skills.alignment': 1.6,
      'headline.searchable_terms': 2.0,
      'experience.description_coverage': 1.4,
      'experience.quantified': 1.2,
      'recommendations.count': 1.2,
      'about.cta': 0.2,
      'banner.present': 0.2,
      'featured.present': 0.3,
      'activity.recency': 0.2,
      'activity.cadence': 0.1,
      'profile.location': 1.6,
      'education.present': 1.2,
    },
  },

  sales: {
    id: 'sales',
    label: 'Inbound / lead generation',
    intent: 'Turn profile visits into conversations with buyers.',
    weights: {
      'headline.beyond_default': 1.8,
      'about.hook': 1.8,
      'about.cta': 2.0,
      'featured.present': 2.0,
      'banner.present': 1.6,
      'activity.recency': 1.5,
      'activity.cadence': 1.4,
      'about.quantified': 1.3,
      'experience.description_coverage': 0.7,
      'skills.count': 0.6,
      'recommendations.count': 1.2,
      'profile.location': 0.6,
      'education.present': 0.4,
      'profile.contact_info': 1.6,
    },
  },

  thought_leadership: {
    id: 'thought_leadership',
    label: 'Audience building',
    intent: 'Grow reach and be recognised for a point of view.',
    weights: {
      'activity.recency': 2.2,
      'activity.cadence': 2.2,
      'about.hook': 1.8,
      'featured.present': 1.6,
      'banner.present': 1.2,
      'headline.beyond_default': 1.4,
      'experience.description_coverage': 0.5,
      'experience.quantified': 0.6,
      'skills.count': 0.4,
      'skills.alignment': 0.4,
      'about.cta': 1.2,
      'profile.location': 0.4,
      'education.present': 0.3,
    },
  },

  hiring: {
    id: 'hiring',
    label: 'Hiring for my team',
    intent: 'Attract candidates who want to work with you.',
    weights: {
      'about.hook': 1.6,
      'about.cta': 1.8,
      'headline.beyond_default': 1.4,
      'activity.recency': 1.4,
      'featured.present': 1.2,
      'banner.present': 1.2,
      'experience.description_coverage': 1.2,
      'experience.current_role_detail': 1.5,
      'recommendations.count': 1.4,
      'skills.count': 0.5,
      'profile.location': 1.0,
      'education.present': 0.5,
      'profile.contact_info': 1.4,
    },
  },
};

export const DEFAULT_PERSONA: PersonaId = 'job_search';

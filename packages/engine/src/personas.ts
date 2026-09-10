import type { PersonaId } from './types.ts';

/**
 * A check whose failure stops the reader deciding, and the ceiling that imposes.
 * `floor` is where the score is capped when the check scores zero.
 */
export interface BlockingGap {
  ruleId: string;
  /** Ceiling imposed when the check scores zero. */
  floor: number;
  /**
   * The cap engages only below this ratio, and lifts to 100 as the ratio climbs
   * toward it. Default 0.35.
   *
   * Without it, a graded depth check used as a blocking gap caps anyone who is
   * merely short of full marks — a 53-word role description is "could be longer",
   * not "a candidate cannot tell what the work is like". Blocking is about absence.
   */
  engageBelow?: number;
  because: string;
}

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
  /**
   * Checks whose failure caps the whole score. Keep this list to one or two —
   * the bar is that the reader cannot make the decision, not that it matters a lot.
   * Anything short of that belongs in `weights`.
   */
  blocking?: BlockingGap[];
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
      'experience.company_linked': 1.0,
    },
    blocking: [{
      ruleId: 'experience.description_coverage',
      floor: 55,
      because: 'a recruiter opening your profile has no account of what you actually did in any role, so there is nothing to shortlist on',
    }],
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
      'experience.company_linked': 1.2,
    },
    blocking: [
      { ruleId: 'skills.count', floor: 60, because: 'skills are a direct search filter, so with none listed you are absent from the result set rather than ranked low in it' },
      { ruleId: 'profile.location', floor: 60, because: 'location is a hard filter, so a blank one excludes you from every geographic search' },
    ],
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
      'experience.company_linked': 0.4,
      'profile.contact_info': 1.6,
    },
    blocking: [
      { ruleId: 'about.cta', floor: 58, because: 'a visitor convinced by your profile has no next step to take' },
      { ruleId: 'headline.beyond_default', floor: 62, because: 'the headline does not say what you offer, so a buyer cannot tell whether you solve their problem' },
    ],
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
      'experience.company_linked': 0.3,
    },
    blocking: [{
      ruleId: 'activity.recency',
      floor: 50,
      because: 'there is nothing recent to follow, and an audience cannot form around a profile that has gone quiet',
    }],
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
      'experience.company_linked': 0.6,
      'profile.contact_info': 1.4,
    },
    blocking: [
      { ruleId: 'experience.current_role_detail', floor: 58, because: 'a candidate cannot tell what the work or the team is actually like' },
      { ruleId: 'profile.contact_info', floor: 62, because: 'an interested candidate has no way to reach you' },
    ],
  },
};

export const DEFAULT_PERSONA: PersonaId = 'job_search';

import type { PersonaId, Profile, ScoreReport } from './types.ts';
import { scoreProfile } from './score.ts';
import { candidateTerms } from './rules/util.ts';

/**
 * Actions, not rules.
 *
 * A ranked list of failing *rules* misleads, because one thing a person does
 * usually moves several rules at once. Writing a role description improves
 * coverage, depth, quantification, outcome language and keyword reinforcement —
 * five checks from one afternoon. Ranking rules undersells it; ranking actions
 * does not.
 *
 * Deltas here are measured, never estimated: the action is applied to a copy of
 * the profile and the whole thing is re-scored. No minute estimates anywhere —
 * they are a second layer of invented numbers on top of a proxy, and they label
 * substantive work as a chore.
 */

/**
 * What kind of thing this is. Ranking is by class first, delta within class,
 * because a points comparison alone gets it wrong:
 *
 *  - `blocking`   its absence stops the reader deciding. Outranks any number of
 *                 polish points.
 *  - `substance`  makes the case better.
 *  - `polish`     improves the surface. Never the headline recommendation, however
 *                 cheap — "add a banner" is quick and irrelevant to a shortlist.
 *  - `compounding` not a gap to close but a slope to start. The only class that
 *                 keeps working after you stop, and the only one that cannot be
 *                 compared to a one-off on points, so it gets its own slot.
 */
export type ActionClass = 'blocking' | 'substance' | 'polish' | 'compounding';

export interface Action {
  id: string;
  /** Imperative, specific, user-facing. */
  label: string;
  /** Rules this action moves. Used to skip actions that would change nothing. */
  rules: string[];
  /** What changes for the person reading the profile. Not a rule restatement. */
  consequence: string;
  /** Class per persona. Posting blocks an audience and merely compounds for a job hunt. */
  classFor: (persona: PersonaId) => ActionClass;
  /** Produce the fixed state, for simulation. Mutates the copy it is given. */
  apply: (p: Profile) => void;
}

const CLASS_RANK: Record<ActionClass, number> = {
  blocking: 0, substance: 1, polish: 2, compounding: 3,
};

/**
 * The simulated "fixed" state has to be built from the person's OWN vocabulary.
 *
 * A canned replacement measures the wrong thing. A fixed platform-engineering
 * headline scored a mechanical-engineering graduate LOWER than their real one,
 * because it destroyed their skill alignment — the simulation was asking "what if
 * you became someone else" rather than "what if you wrote this well".
 */
function ownTerms(p: Profile, n: number): string[] {
  const terms = candidateTerms(p).filter((t) => t.length > 3);
  return terms.slice(0, n).map((t) => t.replace(/\b\w/g, (c) => c.toUpperCase()));
}

function currentTitle(p: Profile): string {
  const list = p.experience ?? [];
  return (list.find((e) => e.current) ?? list[0])?.title ?? 'Senior specialist';
}

/**
 * A simulated fix must be MONOTONIC: it may add, never overwrite.
 *
 * Replacing content destroys information. A generic model description swapped over
 * an already-good 53-word role made the score go DOWN, so the engine reported that
 * writing a description was a bad idea. Augmenting keeps whatever was there and
 * measures what finishing the job is worth.
 */
function augment(existing: string | undefined, addition: string): string {
  const base = (existing ?? '').trim();
  return base ? `${base} ${addition}` : addition;
}

/** ~90 words of outcome-shaped, quantified prose in the person's own domain. */
function modelDescription(p: Profile): string {
  const [a = 'the core systems', b = 'delivery'] = ownTerms(p, 2).map((t) => t.toLowerCase());
  return (
    `Own ${a} and ${b} across four teams and roughly forty people, end to end. ` +
    `Cut the main cycle time from eleven hours to twenty-two minutes and raised success rate to 99.4%. ` +
    `Reduced annual running costs by 38% while volume tripled, and brought recovery time down 62% over ` +
    `eighteen months by rebuilding how the work is triaged. Hired and grew the team from six to forty, ` +
    `and built the review practice the wider group now uses.`
  );
}

export const ACTIONS: Action[] = [
  {
    id: 'describe_current_role',
    label: 'Write a proper description for your current role',
    rules: ['experience.description_coverage', 'experience.current_role_detail',
      'experience.quantified', 'experience.outcome_language', 'keywords.reinforcement'],
    consequence:
      'Right now a recruiter opening your most recent role sees a job title and a date range. They cannot tell what you owned or what changed.',
    classFor: (p) => (p === 'job_search' || p === 'recruiter_inbound' ? 'blocking' : 'substance'),
    apply: (p) => {
      const list = p.experience ?? [];
      const i = Math.max(0, list.findIndex((e) => e.current));
      if (list[i]) list[i].description = augment(list[i].description, modelDescription(p));
    },
  },
  {
    id: 'describe_all_roles',
    label: 'Describe every role, not just the current one',
    rules: ['experience.description_coverage', 'experience.quantified', 'experience.outcome_language'],
    consequence:
      'Your earlier roles are titles only, so the arc of what you have done is invisible — a reader sees where you worked but not what you are good at.',
    classFor: (p) => (p === 'job_search' || p === 'recruiter_inbound' ? 'substance' : 'polish'),
    apply: (p) => {
      const text = modelDescription(p);
      for (const e of p.experience ?? []) e.description = augment(e.description, text);
    },
  },
  {
    id: 'rewrite_about',
    label: 'Rewrite your About with a hook, numbers and a closing ask',
    rules: ['about.present', 'about.hook', 'about.quantified', 'about.length',
      'about.cta', 'about.buzzwords', 'keywords.reinforcement'],
    consequence:
      'About is the only place you set your own framing. Most visitors read the first two lines and stop, so those lines decide whether anyone expands it.',
    classFor: (p) => (p === 'sales' || p === 'thought_leadership' || p === 'hiring' ? 'blocking' : 'substance'),
    apply: (p) => {
      const [a = 'this work', b = 'the team'] = ownTerms(p, 2).map((t) => t.toLowerCase());
      const hook =
        'Three years ago the main process took eleven hours and failed a third of the time. It takes ' +
        'twenty-two minutes now, at 99.4% success.';
      const middle =
        `My work is ${a} and ${b}: the systems, the practice around them, and the people who own both. ` +
        'Over fourteen years I have grown two groups past a hundred people and cut running costs 38% ' +
        'while volume tripled.';
      const ask =
        'If you are scaling past thirty people and the seams are showing, message me — that is the problem I know best.';
      // Lead with the hook, keep everything they already wrote, close with the ask.
      p.about = [hook, (p.about ?? '').trim(), middle, ask].filter(Boolean).join(' ');
    },
  },

  {
    id: 'rewrite_headline',
    label: 'Replace the autofilled headline with one that says what you do',
    rules: ['headline.beyond_default', 'headline.searchable_terms', 'headline.specificity',
      'headline.length', 'skills.alignment'],
    consequence:
      'Your headline travels with you into every search result, comment and invitation. Right now it says the same thing as everyone else with your job title.',
    classFor: (p) => (p === 'sales' || p === 'thought_leadership' ? 'blocking' : 'substance'),
    apply: (p) => {
      // Built from their own title and skills, so the delta measures writing
      // quality rather than a change of profession.
      const terms = ownTerms(p, 3);
      const tail = terms.length ? terms.join(', ') : 'specialist work';
      p.headline = `${currentTitle(p)} | Scaling ${tail} for teams past 40 people | ${tail}`;
    },
  },
  {
    id: 'set_location',
    label: 'Set your location',
    rules: ['profile.location'],
    consequence:
      'Location is a hard filter in recruiter search. A blank one drops you out of every geographic query rather than ranking you lower in it.',
    classFor: () => 'substance',
    apply: (p) => { p.location = 'Seattle, Washington, United States'; },
  },
  {
    id: 'fill_skills',
    label: 'Get your skills list to 25, with the three that matter at the top',
    rules: ['skills.count', 'skills.alignment', 'keywords.reinforcement'],
    consequence:
      'Skills are a direct search filter. A skill you have not listed cannot match, no matter how much of your experience demonstrates it.',
    classFor: (p) => (p === 'recruiter_inbound' ? 'blocking' : 'substance'),
    apply: (p) => {
      p.skillsDeclaredCount = 26;
      // Pad with their own vocabulary, not someone else's discipline.
      p.skills = [...(p.skills ?? []), ...ownTerms(p, 6)];
    },
  },
  {
    id: 'ask_recommendations',
    label: 'Ask three people you worked closely with for a recommendation',
    rules: ['recommendations.count'],
    consequence:
      'Recommendations are the only claims on your profile you did not write yourself, which is exactly why they carry weight.',
    classFor: () => 'substance',
    apply: (p) => { p.recommendationsReceived = Math.max(3, p.recommendationsReceived ?? 0); },
  },
  {
    id: 'pin_featured',
    label: 'Pin two things to Featured',
    rules: ['featured.present'],
    consequence:
      'Featured sits above the fold and is the only section where you choose exactly what a visitor sees first.',
    classFor: (p) => (p === 'sales' || p === 'thought_leadership' ? 'substance' : 'polish'),
    apply: (p) => {
      p.featured = [
        { kind: 'link', title: 'proof', hasCustomThumbnail: true },
        { kind: 'post', title: 'reach', hasCustomThumbnail: true },
      ];
    },
  },
  {
    id: 'add_banner',
    label: 'Add a custom banner',
    rules: ['banner.present'],
    consequence: 'The largest element on your profile is currently saying nothing.',
    classFor: () => 'polish',
    apply: (p) => { p.banner = { present: true, isDefault: false }; },
  },
  {
    id: 'claim_vanity_url',
    label: 'Claim your vanity URL',
    rules: ['profile.custom_url'],
    consequence: 'This is the link that goes on a CV and in an email signature.',
    classFor: () => 'polish',
    apply: (p) => { p.customUrl = true; },
  },
  {
    id: 'link_employers',
    label: 'Re-pick your employers from the company dropdown',
    rules: ['experience.company_linked'],
    consequence:
      'Employers entered as plain text do not match a search filtered by company, so those roles are invisible to anyone looking for people who worked there.',
    classFor: () => 'polish',
    apply: (p) => { p.linkedEmployers = p.employerCount ?? 0; },
  },
  {
    id: 'start_posting',
    label: 'Post once a month, starting this month',
    rules: ['activity.recency', 'activity.cadence'],
    consequence:
      'Every post carries your headline back into other people’s feeds. This is the one thing on the list that keeps working after you stop doing it — and the one that takes months rather than an afternoon.',
    classFor: (p) => {
      if (p === 'thought_leadership') return 'blocking';
      if (p === 'sales' || p === 'hiring') return 'substance';
      return 'compounding';
    },
    apply: (p) => { p.activity = { lastPostDaysAgo: 3, postsLast30d: 2 }; },
  },
];

export interface Recommendation {
  action: Action;
  class: ActionClass;
  /** Measured, by re-scoring. Never estimated. */
  delta: number;
  scoreAfter: number;
  /** How many rules actually moved. */
  rulesMoved: number;
  /** Checks that went from unmeasured to measured. */
  unabstained: number;
  /** True when this action lifts a score cap. */
  liftsCap: boolean;
}

export interface Advice {
  /** The highest-class one-time action worth doing. */
  oneThing?: Recommendation;
  /** The compounding action, presented separately — a practice, not a checkbox. */
  habit?: Recommendation;
  /** Everything else worth doing, best first. */
  alsoWorthDoing: Recommendation[];
  /**
   * Actions that LOWER the score. Never shown to the user: a negative delta means
   * the rubric is wrong, not that the person should skip a genuine improvement.
   * Surfaced here so it shows up in tests instead of as bad advice.
   */
  suspect: Recommendation[];
}

function simulate(profile: Profile, persona: PersonaId, action: Action, before: ScoreReport): Recommendation {
  const copy = structuredClone(profile);
  action.apply(copy);
  const after = scoreProfile(copy, persona);

  const moved = after.rules.filter((r) => {
    const b = before.rules.find((x) => x.id === r.id);
    return !b || Math.abs(b.ratio - r.ratio) > 0.01;
  }).length;
  const unabstained = before.abstained.filter((a) => !after.abstained.some((x) => x.id === a.id)).length;

  return {
    action,
    class: action.classFor(persona),
    delta: after.score - before.score,
    scoreAfter: after.score,
    rulesMoved: moved,
    unabstained,
    liftsCap: before.caps.length > 0 && after.caps.length < before.caps.length,
  };
}

/**
 * What to do next, ranked by class then measured delta.
 *
 * Deliberately not ranked by delta alone. A better headline can score *lower*
 * than the generic one it replaces when a rubric is miscalibrated, and ranking on
 * points would then advise against fixing it. Class ordering keeps a blocking gap
 * ahead of cheap polish however the numbers land.
 */
export function advise(profile: Profile, persona: PersonaId): Advice {
  const before = scoreProfile(profile, persona);
  const imperfect = new Set(before.rules.filter((r) => r.ratio < 0.999).map((r) => r.id));

  const candidates = ACTIONS
    // Skip anything that would change nothing: every rule it touches is already
    // full marks, or was never measured for this persona.
    .filter((a) => a.rules.some((id) => imperfect.has(id)))
    .map((a) => simulate(profile, persona, a, before));

  const suspect = candidates.filter((c) => c.delta < 0);
  const useful = candidates.filter((c) => c.delta > 0);

  const rank = (a: Recommendation, b: Recommendation) =>
    (b.liftsCap ? 1 : 0) - (a.liftsCap ? 1 : 0) ||
    CLASS_RANK[a.class] - CLASS_RANK[b.class] ||
    b.delta - a.delta;

  const oneOffs = useful.filter((c) => c.class !== 'compounding').sort(rank);
  const habit = useful.find((c) => c.class === 'compounding');

  return {
    oneThing: oneOffs[0],
    habit,
    alsoWorthDoing: oneOffs.slice(1),
    suspect,
  };
}

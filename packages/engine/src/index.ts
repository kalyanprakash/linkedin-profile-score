export { scoreProfile, scoreAllPersonas } from './score.ts';
export { PERSONAS, DEFAULT_PERSONA, type PersonaDef, type BlockingGap } from './personas.ts';
export { ALL_RULES, ruleById } from './rules/index.ts';
export { OBSERVERS, observe } from './observations.ts';
export type {
  Profile, Experience, FeaturedItem, PersonaId,
  Rule, RuleResult, ScoredRule, ScoreReport, DimensionScore, Observation, ScoreCap,
} from './types.ts';

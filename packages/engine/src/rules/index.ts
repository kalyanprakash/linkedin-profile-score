import type { Rule } from '../types.ts';
import { headlineRules } from './headline.ts';
import { aboutRules } from './about.ts';
import { experienceRules } from './experience.ts';
import { signalRules } from './signals.ts';
import { profileRules } from './profile.ts';
import { portfolioRules } from './portfolio.ts';

export const ALL_RULES: Rule[] = [
  ...headlineRules,
  ...aboutRules,
  ...experienceRules,
  ...signalRules,
  ...profileRules,
  ...portfolioRules,
];

export function ruleById(id: string): Rule | undefined {
  return ALL_RULES.find((r) => r.id === id);
}

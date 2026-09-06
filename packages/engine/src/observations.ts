import type { Observation, Profile } from './types.ts';
import { saw } from './rules/util.ts';

/**
 * Unscored findings.
 *
 * The bar for a scored rule is that a defensible right answer exists. Where it
 * does not — where the evidence is thin or the call depends on the person — the
 * honest output is the fact plus the trade-off, worth zero points either way.
 */
export type Observer = (profile: Profile) => Observation | null;

export const OBSERVERS: Observer[] = [
  (profile) => {
    if (!saw(profile, 'photo') && !saw(profile, 'openToWork')) return null;
    const framed = profile.photo?.hasFrame === true;
    const active = profile.openToWork?.active === true;
    if (!framed && !active) return null;
    const scope = profile.openToWork?.publicToAll ? 'visible to everyone' : 'limited to recruiters';
    return {
      id: 'observation.open_to_work',
      title: 'Open to work signal',
      observed: [
        framed ? 'photo frame on' : null,
        active ? `banner on, ${scope}` : null,
      ].filter(Boolean).join('; '),
      note:
        'Worth knowing that the frame and the setting are separable: the recruiters-only setting feeds LinkedIn Recruiter’s filter, while the green photo frame is purely public signalling and does not. ' +
        'Whether the public version helps is genuinely unsettled — there is no study either way, only opinion pieces pointing in both directions and LinkedIn’s own claim that it helps. ' +
        'Scored at zero deliberately.',
    };
  },
];

export function observe(profile: Profile): Observation[] {
  return OBSERVERS.map((o) => o(profile)).filter((x): x is Observation => x !== null);
}

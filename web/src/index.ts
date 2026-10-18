import { scoreProfile } from '../../packages/engine/src/score.ts';
import { advise, type Advice } from '../../packages/engine/src/actions.ts';
import { PERSONAS, DEFAULT_PERSONA } from '../../packages/engine/src/personas.ts';
import { RUBRIC_VERSION } from '../../packages/engine/src/version.ts';
import type { PersonaId, Profile, ScoreReport } from '../../packages/engine/src/types.ts';
import { fromLinkedInPdfItems, type PdfTextItem } from './pdf.ts';
import { fromPaste, type PasteSections } from './paste.ts';

/**
 * The engine, for a web page.
 *
 * Built into a single IIFE that assigns `window.ProfileScoreWeb`, so a site can
 * load it with one <script> tag and no build step of its own. The names below are
 * a contract with a page being built against them in parallel — change them and
 * that page breaks.
 *
 * Nothing here scores anything. `score` is the same `scoreProfile` + `advise` pair
 * the extension panel calls, so a profile reads the same on the site as in the
 * extension; the only new code is the two importers, which turn what a web page
 * can get (a PDF's text, or pasted sections) into the engine's `Profile` — with
 * `observed` set honestly, so whatever the input cannot show abstains instead of
 * scoring zero.
 *
 * Pass `score` a profile from one of the importers. A hand-built profile with no
 * `observed` array is read as a complete extraction, which is the engine's
 * long-standing default, and almost never what a web input deserves.
 */
export interface ProfileScoreWeb {
  version: string;
  personas: { id: PersonaId; label: string }[];
  defaultPersona: PersonaId;
  score(profile: Profile, persona?: PersonaId): { report: ScoreReport; advice: Advice };
  fromLinkedInPdfItems(items: PdfTextItem[]): Profile;
  fromPaste(sections: PasteSections): Profile;
}

function personaOrDefault(persona: unknown): PersonaId {
  return typeof persona === 'string' && Object.prototype.hasOwnProperty.call(PERSONAS, persona)
    ? (persona as PersonaId)
    : DEFAULT_PERSONA;
}

const api: ProfileScoreWeb = {
  version: RUBRIC_VERSION,
  personas: Object.freeze(
    Object.values(PERSONAS).map((p) => Object.freeze({ id: p.id, label: p.label })),
  ) as ProfileScoreWeb['personas'],
  defaultPersona: DEFAULT_PERSONA,
  score(profile, persona) {
    if (!profile || typeof profile !== 'object') {
      throw new TypeError('ProfileScoreWeb.score expects a Profile object — build one with fromLinkedInPdfItems or fromPaste');
    }
    // An unknown goal falls back to the default rather than throwing: the report
    // names the persona it was scored against, so the page can see what happened.
    const id = personaOrDefault(persona);
    return { report: scoreProfile(profile, id), advice: advise(profile, id) };
  },
  fromLinkedInPdfItems,
  fromPaste,
};

// Frozen so the surface stays exactly the contract: page code that assigns to it
// by mistake fails loudly in strict mode instead of quietly changing what the next
// caller gets. Not a security boundary — any script on the page can read the
// profile it was handed anyway.
(globalThis as unknown as { ProfileScoreWeb: ProfileScoreWeb }).ProfileScoreWeb = Object.freeze(api);

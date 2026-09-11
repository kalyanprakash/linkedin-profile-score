import { extractProfile, missingCards } from './extract.ts';
import { readKey, writeKey } from './storage.ts';
import { scoreProfile, scoreAllPersonas } from '../../packages/engine/src/score.ts';
import { advise, type Recommendation } from '../../packages/engine/src/actions.ts';
import { PERSONAS, DEFAULT_PERSONA } from '../../packages/engine/src/personas.ts';
import type { PersonaId, Profile, ScoreReport } from '../../packages/engine/src/types.ts';

const PANEL_ID = 'lps-panel';
const STORAGE_KEY = 'lps.persona';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bandLabel(band: ScoreReport['band']): string {
  return { weak: 'Needs work', developing: 'Developing', solid: 'Solid', strong: 'Strong' }[band];
}

/**
 * Rule id → the section of the profile a person would recognise.
 *
 * Presentation, so it lives here rather than on the rule: the engine's dimensions
 * are coarser than the page is, and a person looking for what went unread is
 * looking for LinkedIn's own headings.
 */
const SECTION_OF: Array<[RegExp, string]> = [
  [/^about\./, 'About'],
  [/^experience\./, 'Experience'],
  [/^education\./, 'Education'],
  [/^skills\./, 'Skills'],
  [/^featured\./, 'Featured'],
  [/^recommendations\./, 'Recommendations'],
  [/^activity\./, 'Recent activity'],
  [/^headline\./, 'Headline'],
  [/^banner\./, 'Banner image'],
  [/^photo\./, 'Profile photo'],
  [/^profile\.location/, 'Location'],
  [/^profile\.contact_info/, 'Contact info'],
];

/** Distinct sections behind a set of abstained checks, in page order. */
function unreadSections(abstained: ScoreReport['abstained']): string[] {
  const names = new Set<string>();
  for (const a of abstained) {
    const hit = SECTION_OF.find(([re]) => re.test(a.id));
    if (hit) names.add(hit[1]);
  }
  return SECTION_OF.map(([, name]) => name).filter((n) => names.has(n));
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The one thing, rendered large.
 *
 * A list of twenty findings is a to-do list nobody starts. One action with a
 * measured consequence is something a person does this afternoon — and after they
 * do it, Rescan surfaces the next one. The loop is the product.
 */
function oneThingBlock(rec: Recommendation, report: ScoreReport): HTMLElement {
  const box = el('div', 'lps-onething');
  const head = el('div', 'lps-ot-head');
  head.append(
    el('span', 'lps-ot-eyebrow', rec.liftsCap ? 'Do this first — it lifts the cap' : 'Do this first'),
    el('span', 'lps-ot-delta', `${report.score} → ${rec.scoreAfter}`),
  );
  box.append(head);
  box.append(el('h3', 'lps-ot-title', rec.action.label));
  box.append(el('p', 'lps-ot-why', rec.consequence));
  const meta = el('div', 'lps-ot-meta');
  meta.append(el('span', undefined, `+${Math.round(rec.delta)} points`));
  meta.append(el('span', undefined, `${rec.rulesMoved} checks move`));
  if (rec.unabstained > 0) meta.append(el('span', undefined, `${rec.unabstained} become measurable`));
  box.append(meta);
  return box;
}

/** The compounding action, framed as a practice rather than a checkbox. */
function habitBlock(rec: Recommendation): HTMLElement {
  const box = el('div', 'lps-habit');
  box.append(el('div', 'lps-habit-eyebrow', 'And start the habit'));
  box.append(el('h4', 'lps-habit-title', rec.action.label));
  box.append(el('p', 'lps-habit-why', rec.consequence));
  box.append(el('div', 'lps-habit-meta', `Worth +${Math.round(rec.delta)} here, but unlike the rest it keeps compounding.`));
  return box;
}

function render(
  report: ScoreReport,
  profile: Profile,
  persona: PersonaId,
  onPersona: (p: PersonaId) => void,
  onRescan: () => void,
): HTMLElement {
  const panel = el('div', 'lps-panel');
  panel.id = PANEL_ID;

  // ------------------------------------------------------------------ header
  const head = el('div', 'lps-head');
  const scoreWrap = el('div', 'lps-scorewrap');
  scoreWrap.append(
    el('div', `lps-score lps-${report.band}`, String(report.score)),
    el('div', 'lps-outof', '/100'),
  );
  const headText = el('div', 'lps-headtext');
  headText.append(el('div', 'lps-title', 'Profile score'), el('div', 'lps-band', bandLabel(report.band)));
  head.append(scoreWrap, headText);

  const rescan = el('button', 'lps-rescan', 'Rescan');
  rescan.title = 'Re-read the page — do a fix, then check again';
  rescan.onclick = onRescan;
  const close = el('button', 'lps-close', '×');
  close.title = 'Close';
  close.onclick = () => panel.remove();
  head.append(rescan, close);
  panel.append(head);

  // ------------------------------------------------------------------ the cap
  // A ceiling nobody can see is worse than a low number, so it is stated in full
  // and always names the thing that lifts it.
  for (const cap of report.caps) {
    const c = el('div', 'lps-cap');
    c.append(el('div', 'lps-cap-head', `Capped at ${cap.ceiling} — would otherwise be ${report.uncappedScore}`));
    c.append(el('p', 'lps-cap-why', `Because ${cap.because}.`));
    c.append(el('p', 'lps-cap-lift', `Fix "${cap.title.toLowerCase()}" and the ceiling lifts.`));
    panel.append(c);
    break; // only the binding cap
  }

  // ------------------------------------------------------------ persona pick
  const goal = el('div', 'lps-goal');
  goal.append(el('label', 'lps-label', 'Scoring for'));
  const select = el('select', 'lps-select');
  for (const p of Object.values(PERSONAS)) {
    const opt = el('option', undefined, p.label);
    opt.value = p.id;
    if (p.id === persona) opt.selected = true;
    select.append(opt);
  }
  select.onchange = () => onPersona(select.value as PersonaId);
  goal.append(select, el('div', 'lps-intent', PERSONAS[persona].intent));
  panel.append(goal);

  // ------------------------------------------------------------- uncertainty
  // Naming the sections rather than counting the checks. "11 checks could not read
  // their section" tells a person nothing they can act on and reads as a fault in
  // the tool; "could not read: Experience, Skills" tells them what the number is
  // missing and is checkable against the page in front of them.
  if (report.unobservedPoints > 0) {
    const sections = unreadSections(report.abstained);
    const note = el('div', 'lps-note');
    note.append(el('strong', undefined, `Really between ${report.range.floor} and ${report.range.ceiling}. `));
    note.append(document.createTextNode(
      sections.length
        ? `Could not read: ${list(sections)}. Either you have no such section, or it had still not loaded. Hit Rescan to look again.`
        : `${report.abstained.length} checks had nothing to measure. Hit Rescan to look again.`,
    ));
    panel.append(note);
  }

  // ------------------------------------------------------- one thing + habit
  const { oneThing, habit, alsoWorthDoing } = advise(profile, persona);
  if (oneThing) panel.append(oneThingBlock(oneThing, report));
  if (habit) panel.append(habitBlock(habit));

  if (alsoWorthDoing.length) {
    const more = el('details', 'lps-details');
    more.append(el('summary', undefined, `${alsoWorthDoing.length} more worth doing`));
    for (const r of alsoWorthDoing) {
      const row = el('div', 'lps-row');
      row.append(
        el('span', 'lps-pts', `+${Math.round(r.delta)}`),
        el('span', 'lps-rowtitle', r.action.label),
      );
      more.append(row);
    }
    panel.append(more);
  }

  if (!oneThing && !habit) {
    panel.append(el('div', 'lps-done', 'Nothing significant left to fix for this goal. Try another goal in the dropdown.'));
  }

  // ----------------------------------------------------------- observations
  for (const o of report.observations) {
    const obs = el('div', 'lps-obs');
    obs.append(el('div', 'lps-obs-head', `${o.title} — not scored`));
    obs.append(el('p', 'lps-obs-observed', o.observed));
    obs.append(el('p', 'lps-obs-note', o.note));
    panel.append(obs);
  }

  // ------------------------------------------------------------- all checks
  const details = el('details', 'lps-details');
  details.append(el('summary', undefined, `All ${report.rules.length} checks`));
  for (const r of report.rules) {
    const row = el('div', 'lps-row');
    const mark = r.ratio === 1 ? '✓' : r.ratio === 0 ? '✗' : '~';
    const cls = r.ratio === 1 ? 'pass' : r.ratio === 0 ? 'fail' : 'part';
    row.append(
      el('span', `lps-mark lps-${cls}`, mark),
      el('span', 'lps-rowtitle', r.title),
      el('span', 'lps-rowpts', `${Math.round(r.earned)}/${Math.round(r.available)}`),
      el('p', 'lps-observed', r.observed),
    );
    details.append(row);
  }
  panel.append(details);

  if (report.abstained.length) {
    const skipped = el('details', 'lps-details');
    skipped.append(el('summary', undefined, `${report.abstained.length} not measured`));
    for (const a of report.abstained) skipped.append(el('div', 'lps-row', a.title));
    panel.append(skipped);
  }

  panel.append(el('div', 'lps-foot', 'Runs entirely in your browser. Nothing about your profile is uploaded anywhere.'));
  return panel;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Force the lazily-hydrated cards into the DOM before scoring.
 *
 * Below the fold, LinkedIn does not render a card until it is scrolled near — so a
 * scan at `document_idle` saw the top card, About and Activity and nothing else.
 * Experience, Education, Skills, Featured and Recommendations abstained, the score
 * was computed from a headline and an About, and the panel reported "really between
 * 35 and 88". A 53-point band is not a score.
 *
 * Waiting passively for a MutationObserver only works if the user scrolls, and the
 * old note asked them to. That is the tool asking the user to do its job: most
 * people read the number and leave, so most people saw the half-read one. So walk
 * the page, let each card hydrate, and put the scroll position back.
 *
 * Bounded on purpose, because this runs before the user sees anything: it stops as
 * soon as every card is present, at the bottom of the page, or at the deadline.
 */
async function hydrate(deadlineMs = 4000): Promise<void> {
  if (!missingCards().length) return;
  // jsdom has no layout: scrollHeight is 0 and scrollTo is a no-op, so there is
  // nothing to provoke and the loop would spin to its deadline for nothing.
  if (!document.documentElement.scrollHeight || typeof window.scrollTo !== 'function') return;

  const startY = window.scrollY;
  const until = Date.now() + deadlineMs;
  const step = Math.max(400, Math.round(window.innerHeight * 0.75));

  for (let y = startY + step; Date.now() < until; y += step) {
    window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
    await sleep(150);
    if (!missingCards().length) break;
    // Re-read each pass: the page gets taller as cards arrive, so a height
    // captured up front would stop the walk early on exactly the profiles that
    // need it most.
    if (y >= document.documentElement.scrollHeight) break;
  }

  window.scrollTo({ top: startY, behavior: 'instant' as ScrollBehavior });
  await sleep(50);
}

/** Shown while hydrating, so the first number a person sees is not a half-read one. */
function loadingPanel(): HTMLElement {
  const panel = el('div', 'lps-panel lps-loading');
  panel.id = PANEL_ID;
  panel.append(el('div', 'lps-loading-title', 'Reading your profile…'));
  panel.append(el('p', 'lps-loading-note', 'Checking every section before scoring, so the number is not built on half a page.'));
  return panel;
}

async function readPersona(): Promise<PersonaId> {
  const stored = await readKey(STORAGE_KEY);
  return (stored as PersonaId) || DEFAULT_PERSONA;
}

async function writePersona(p: PersonaId): Promise<void> {
  await writeKey(STORAGE_KEY, p);
}

async function run(): Promise<void> {
  let persona = await readPersona();

  // Mount something immediately — hydration takes a second or two and a silent
  // page looks like a broken extension.
  document.body.append(loadingPanel());
  await hydrate();

  const draw = (p: PersonaId) => {
    persona = p;
    void writePersona(p);
    const profile = extractProfile();
    const scrollTop = document.getElementById(PANEL_ID)?.scrollTop ?? 0;
    document.getElementById(PANEL_ID)?.remove();
    const panel = render(scoreProfile(profile, p), profile, p, draw, () => void rescan());
    document.body.append(panel);
    panel.scrollTop = scrollTop;
    return profile;
  };

  // Rescan is pressed after the user has edited their profile, so it must provoke
  // the lazy cards again — a fresh page means a fresh set of unrendered sections,
  // and a second reading that sees less than the first would look like the fix
  // lowered the score. Declared as a function so draw can reference it above.
  async function rescan(): Promise<void> {
    await hydrate(2500);
    draw(persona);
  }

  const profile = draw(persona);
  console.log('[profile-score] extracted', profile);
  console.log('[profile-score] unread cards after hydration', missingCards());
  console.log('[profile-score] all personas', scoreAllPersonas(profile));

  // Cards below the fold hydrate lazily, so the first scan sees fewer sections
  // than exist. Re-scan when new cards appear rather than reporting a score
  // built on half the page.
  let known = document.querySelectorAll('div[componentkey]').length;
  let timer: number | undefined;
  const obs = new MutationObserver(() => {
    const now = document.querySelectorAll('div[componentkey]').length;
    if (now === known) return;
    known = now;
    clearTimeout(timer);
    timer = setTimeout(() => {
      draw(persona);
      console.log('[profile-score] re-scanned after lazy load');
    }, 600) as unknown as number;
  });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 60000);
}

// LinkedIn is a single-page app and renders the profile after navigation, so wait
// for the top card to exist. NOT `main h1` — on the server-driven UI the name is
// an h2 and that selector never matches, which silently prevents the panel mounting.
const READY_SELECTOR = 'div[componentkey$="Topcard"], main h1, main h2';

function whenReady(cb: () => void): void {
  if (document.querySelector(READY_SELECTOR)) return cb();
  const obs = new MutationObserver(() => {
    if (document.querySelector(READY_SELECTOR)) {
      obs.disconnect();
      cb();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 20000);
}

whenReady(() => void run());

import { extractProfile } from './extract.ts';
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
  if (report.unobservedPoints > 0) {
    const note = el('div', 'lps-note');
    note.append(
      el('strong', undefined, `Really between ${report.range.floor} and ${report.range.ceiling}. `),
      document.createTextNode(
        `${report.abstained.length} checks could not read their section — usually because it has not loaded yet. Scroll the page and hit Rescan.`,
      ),
    );
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

async function readPersona(): Promise<PersonaId> {
  try {
    const got = await chrome.storage.local.get(STORAGE_KEY);
    return (got?.[STORAGE_KEY] as PersonaId) || DEFAULT_PERSONA;
  } catch {
    return DEFAULT_PERSONA;
  }
}

async function writePersona(p: PersonaId): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: p });
  } catch {
    /* storage unavailable — the panel still works, the choice just will not stick */
  }
}

async function run(): Promise<void> {
  let persona = await readPersona();

  const draw = (p: PersonaId) => {
    persona = p;
    void writePersona(p);
    const profile = extractProfile();
    const scrollTop = document.getElementById(PANEL_ID)?.scrollTop ?? 0;
    document.getElementById(PANEL_ID)?.remove();
    const panel = render(scoreProfile(profile, p), profile, p, draw, () => draw(persona));
    document.body.append(panel);
    panel.scrollTop = scrollTop;
    return profile;
  };

  const profile = draw(persona);
  console.log('[profile-score] extracted', profile);
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

import { extractProfile } from './extract.ts';
import { scoreProfile, scoreAllPersonas } from '../../packages/engine/src/score.ts';
import { PERSONAS, DEFAULT_PERSONA } from '../../packages/engine/src/personas.ts';
import type { PersonaId, ScoreReport } from '../../packages/engine/src/types.ts';

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

function render(
  report: ScoreReport,
  persona: PersonaId,
  onPersona: (p: PersonaId) => void,
  onRescan: () => void,
): HTMLElement {
  const panel = el('div', 'lps-panel');
  panel.id = PANEL_ID;

  // ------------------------------------------------------------------ header
  const head = el('div', 'lps-head');
  const scoreWrap = el('div', 'lps-scorewrap');
  const score = el('div', `lps-score lps-${report.band}`, String(report.score));
  scoreWrap.append(score, el('div', 'lps-outof', '/100'));
  const headText = el('div', 'lps-headtext');
  headText.append(
    el('div', 'lps-title', 'Profile score'),
    el('div', 'lps-band', bandLabel(report.band)),
  );
  head.append(scoreWrap, headText);

  const rescan = el('button', 'lps-rescan', 'Rescan');
  rescan.title = 'Re-read the page — useful after scrolling loads more sections';
  rescan.onclick = onRescan;
  head.append(rescan);

  const close = el('button', 'lps-close', '×');
  close.title = 'Close';
  close.onclick = () => panel.remove();
  head.append(close);
  panel.append(head);

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
  goal.append(select);
  goal.append(el('div', 'lps-intent', PERSONAS[persona].intent));
  panel.append(goal);

  // ------------------------------------------------------------- uncertainty
  if (report.unobservedPoints > 0) {
    const note = el('div', 'lps-note');
    note.append(
      el('strong', undefined, `Actually between ${report.range.floor} and ${report.range.ceiling}. `),
      document.createTextNode(
        `${report.abstained.length} checks could not read their section from this page — the ${report.score} above only counts what was visible.`,
      ),
    );
    panel.append(note);
  }

  // --------------------------------------------------------------- top fixes
  if (report.topFixes.length) {
    panel.append(el('h3', 'lps-h3', 'Biggest gains available'));
    const list = el('ol', 'lps-fixes');
    for (const f of report.topFixes) {
      const li = el('li');
      li.append(
        el('span', 'lps-pts', `+${Math.round(f.pointsAvailable)}`),
        el('span', 'lps-fixtitle', f.title),
        el('p', 'lps-fixbody', f.fix),
      );
      list.append(li);
    }
    panel.append(list);
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

  panel.append(
    el('div', 'lps-foot', 'Runs entirely in your browser. Nothing about your profile is uploaded anywhere.'),
  );
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
    document.getElementById(PANEL_ID)?.remove();
    document.body.append(render(scoreProfile(profile, p), p, draw, () => draw(persona)));
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
      const next = draw(persona);
      console.log('[profile-score] re-scanned after lazy load', next);
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

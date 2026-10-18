import type { Evidence, Experience, Profile } from '../../packages/engine/src/types.ts';
import { PORTFOLIO_FULL_MARKS } from '../../packages/engine/src/rules/portfolio.ts';
import {
  DEGREE_WORDS, DURATION_ONLY, META_LINE, PDF_DATE_LINE,
  collapse, durationMonths, isCurrent, isPlace, looksLikeProse, monthIndex,
} from './lines.ts';

/**
 * LinkedIn's "Save to PDF" export, read from text items pdf.js has already pulled
 * out of the file. The page does the PDF decoding; this only sees strings and
 * where they sat, so nothing here touches a file, a worker or the network.
 *
 * The export is a two-column layout:
 *   LEFT  (narrow)  Contact · Top Skills · Languages · Certifications ·
 *                   Honors-Awards · Publications
 *   MAIN  (wide)    name (large) · headline · location · Summary · Experience ·
 *                   Education
 *
 * Written against that described layout and synthetic fixtures, not a real
 * export — see web/test/fixtures/linkedin-pdf-synthetic.ts. A real export
 * fixture is the first thing to add when one is available.
 *
 * ## What this can honestly claim to have observed
 *
 * The engine abstains on anything not in `observed`, and that is the whole
 * difference between "you have no banner" and "we could not see your banner". So
 * `observed` here is decided by what the PDF *format* can carry, not by what
 * happened to parse:
 *
 *  - Never observed: photo, banner, featured, recommendations, activity,
 *    open-to-work, custom URL. The export does not render them (or not
 *    reliably), so a profile with all of them must not read as one with none.
 *
 *  - Observed even when the heading is ABSENT: about, experience, education.
 *    LinkedIn leaves an empty section out of the export entirely rather than
 *    printing an empty heading, so a PDF with no "Summary" is a profile with no
 *    About. That is a real absence, and abstaining on it would flatter exactly the
 *    profiles that most need telling — the abstention-inflation problem `range`
 *    exists to bound, here for no reason at all.
 *
 *  - Portfolio: the sidebar shows certifications, honours and publications, but
 *    whether the export carries projects, volunteering or courses is not
 *    established. So what it shows is a lower bound on the person's evidence, and
 *    a lower bound can only be scored once it already earns full marks
 *    (`PORTFOLIO_FULL_MARKS` entries): two certifications might be the whole
 *    portfolio or a third of it, three or more is full marks either way. Below
 *    that the entries are kept for display and the count abstains. Descriptions
 *    (`portfolioDescriptions`) are never observed — the export prints titles only,
 *    and scoring them as undescribed would price its layout as the person's gap.
 *
 *  - Observed only on positive evidence: contact info, location. Contact details depend on
 *    the member's visibility settings, and the LinkedIn URL that is always printed
 *    does not count as a route to reach anyone. A location that could not be told
 *    apart from the headline is a parse failure, not a missing location.
 *
 *  - Skills: the export lists only the top few. When "Top Skills" is present the
 *    names are kept (they feed keyword checks) but the field is left unobserved,
 *    because scoring the count off a truncated list would price LinkedIn's layout
 *    as the person's gap. When the heading is absent the profile genuinely has
 *    none, and that is observed as empty.
 *
 *  - Employers are counted, but `employerCount` is not observed: the rule that
 *    reads it compares against how many link to a company page, and a PDF has no
 *    links. Observing the count without the links would score every employer as
 *    unlinked.
 */

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  page: number;
  fontSize?: number;
}

type Column = 'left' | 'main';

interface Line {
  text: string;
  page: number;
  /** Vertical position, normalised so larger is always further down the page. */
  key: number;
  fontSize?: number;
  column: Column;
  /**
   * Distance from the previous line in typical line spacings. 1 at a page start:
   * a page break says nothing about paragraphs, and an entry that runs onto the
   * next page must rejoin as one sentence.
   */
  gap: number;
  /** First line of its column on its page — where a heading needs no space above it. */
  pageStart: boolean;
}

type SectionId =
  | 'contact' | 'skills' | 'languages' | 'summary' | 'experience' | 'education'
  | Evidence['kind'];

/**
 * Section headings the export uses, plus close variants. Matched against a whole
 * line, never a substring, so "Experience" inside a sentence is just prose.
 *
 * A Map, not an object literal: a plain-object lookup answers for "constructor"
 * and "__proto__" too, which turned body lines with those words into headings.
 */
const HEADINGS = new Map<string, SectionId>(Object.entries({
  'contact': 'contact',
  'top skills': 'skills',
  'skills': 'skills',
  'languages': 'languages',
  'summary': 'summary',
  'about': 'summary',
  'experience': 'experience',
  'education': 'education',
  'certifications': 'certification',
  'licenses & certifications': 'certification',
  'licenses and certifications': 'certification',
  'honors-awards': 'honor',
  'honors & awards': 'honor',
  'honors and awards': 'honor',
  'honours-awards': 'honor',
  'honours & awards': 'honor',
  'publications': 'publication',
  'patents': 'publication',
  'projects': 'project',
  'volunteer experience': 'volunteer',
  'volunteering': 'volunteer',
  'courses': 'course',
} as Record<string, SectionId>));

/** Sections only a LinkedIn export would have. Without one, this is some other PDF. */
const SIGNATURE: SectionId[] = ['contact', 'skills', 'summary', 'experience', 'education'];

const EVIDENCE_KINDS: Evidence['kind'][] = ['certification', 'honor', 'publication', 'project', 'volunteer', 'course'];

const FOOTER = /^Page\s+\d+\s+of\s+\d+$/i;
const BULLET = /^[•▪◦*–-]\s/;

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function headingOf(text: string): SectionId | undefined {
  return HEADINGS.get(collapse(text).toLowerCase());
}

/** Main-column sections whose absence from a complete export is a real absence. */
const MAIN_SECTIONS: SectionId[] = ['summary', 'experience', 'education'];

/** A degree line's date tail, "· (2011 - 2015)". */
const EDU_TAIL = /\s*·?\s*\(\s*[^)]*(?:19|20)\d{2}[^)]*\)\s*$/;

/**
 * Input bounds. A three-page export is a few hundred items of a few dozen
 * characters; these are orders of magnitude above that, and exist so a hostile
 * or broken input costs milliseconds rather than seconds.
 */
const MAX_ITEMS = 20_000;
const MAX_ITEM_CHARS = 1_000;
const MAX_LINE_CHARS = 2_000;

/**
 * Whether y grows down the page.
 *
 * pdf.js reports y in PDF space, where it grows UP; a page that converts through a
 * viewport gets it growing down. The contract does not pin one, so it is read from
 * the document: the page footer sits at the bottom, the name (largest type on page
 * one) at the top, and Summary comes before Experience before Education. Ties go to
 * pdf.js's native orientation, since passing `transform[5]` straight through is
 * the most likely integration.
 */
function detectYDown(items: PdfTextItem[]): boolean {
  let votes = 0;
  const pages = new Map<number, PdfTextItem[]>();
  for (const it of items) {
    const list = pages.get(it.page);
    if (list) list.push(it); else pages.set(it.page, [it]);
  }

  for (const pageItems of pages.values()) {
    const footer = pageItems.find((i) => FOOTER.test(collapse(i.str)));
    if (!footer) continue;
    const mid = median(pageItems.filter((i) => i !== footer).map((i) => i.y));
    if (mid !== undefined && footer.y !== mid) votes += footer.y > mid ? 1 : -1;
  }

  const first = pages.get([...pages.keys()].reduce((a, b) => Math.min(a, b))) ?? [];
  const sized = first.filter((i) => i.fontSize !== undefined);
  if (sized.length) {
    const biggest = sized.reduce((a, b) => ((b.fontSize ?? 0) > (a.fontSize ?? 0) ? b : a));
    const mid = median(first.map((i) => i.y));
    if (mid !== undefined && biggest.y !== mid) votes += biggest.y < mid ? 1 : -1;
  }

  // First of each heading per page only: the pairwise vote is quadratic, and a
  // flood of repeated headings must not make it so.
  const seen = new Set<string>();
  const anchors = items
    .map((i) => ({ i, rank: MAIN_SECTIONS.indexOf(headingOf(i.str) as SectionId) }))
    .filter((a) => {
      const k = `${a.i.page}:${a.rank}`;
      if (a.rank < 0 || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  for (const a of anchors) {
    for (const b of anchors) {
      if (a.i.page === b.i.page && a.rank < b.rank && a.i.y !== b.i.y) votes += a.i.y < b.i.y ? 1 : -1;
    }
  }
  return votes > 0;
}

/**
 * Split the sidebar from the main column by clustering left edges, not by a
 * pixel value — the page may arrive at any scale, and a hard-coded x would be
 * right for one viewport and wrong for the next.
 *
 * Left edges pile up: every line in a column starts at the same x, while the
 * fragments that continue a line land wherever the text before them ended. So the
 * sidebar is the leftmost x that recurs, and the main column is the most-recurring
 * x well to its right. Returns the x at which the main column begins, or
 * -Infinity when there is only one column.
 */
function mainColumnStart(items: PdfTextItem[]): number {
  const xs = items.map((i) => i.x);
  // reduce rather than Math.min(...xs): a long export can exceed the spread limit.
  const lo = xs.reduce((a, b) => Math.min(a, b), Infinity);
  const range = xs.reduce((a, b) => Math.max(a, b), -Infinity) - lo;
  if (!(range > 0)) return -Infinity;

  const bin = range / 200;
  const bins = new Map<number, { x: number; n: number }>();
  for (const x of xs) {
    const k = Math.round((x - lo) / bin);
    const b = bins.get(k);
    if (b) { b.n++; b.x = Math.min(b.x, x); } else bins.set(k, { x, n: 1 });
  }
  const modes = [...bins.values()].filter((b) => b.n >= 2).sort((a, b) => a.x - b.x);
  if (!modes.length) return -Infinity;

  const left = modes[0];
  const candidates = modes.filter((m) => m.x >= left.x + range * 0.15);
  if (!candidates.length) return -Infinity;
  const main = candidates.reduce((a, b) => (b.n > a.n ? b : a));
  // A main column has more than a stray repeated fragment's worth of lines.
  if (main.n < left.n * 0.1) return -Infinity;
  return main.x - (main.x - left.x) * 0.05;
}

/** Fragments sharing a baseline become one line, in reading order, footers removed. */
function toLines(items: PdfTextItem[], column: Column, key: (y: number) => number): Line[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || key(a.y) - key(b.y) || a.x - b.x);

  // Line spacing in this column, used when no font size says how tall a line is.
  const steps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = key(sorted[i].y) - key(sorted[i - 1].y);
    if (sorted[i].page === sorted[i - 1].page && d > 1e-6) steps.push(d);
  }
  const step = median(steps) ?? 1;

  const groups: PdfTextItem[][] = [];
  for (const it of sorted) {
    const g = groups[groups.length - 1];
    const tol = it.fontSize ? it.fontSize * 0.4 : step * 0.25;
    if (g && g[0].page === it.page && Math.abs(key(it.y) - key(g[0].y)) <= tol) g.push(it);
    else groups.push([it]);
  }

  const lines = groups
    .map((g) => {
      const parts = [...g].sort((a, b) => a.x - b.x);
      const sizes = parts.map((p) => p.fontSize).filter((s): s is number => s !== undefined);
      return {
        text: collapse(parts.map((p) => p.str).join(' ')).slice(0, MAX_LINE_CHARS),
        page: parts[0].page,
        key: key(parts[0].y),
        fontSize: sizes.length ? Math.max(...sizes) : undefined,
        column,
        gap: 1,
        pageStart: false,
      };
    })
    .filter((l) => l.text && !FOOTER.test(l.text));

  const lineSteps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].page === lines[i - 1].page) lineSteps.push(lines[i].key - lines[i - 1].key);
  }
  const typical = median(lineSteps) ?? 1;
  lines.forEach((line, i) => {
    if (i > 0 && line.page === lines[i - 1].page) line.gap = (line.key - lines[i - 1].key) / typical;
    else line.pageStart = true;
  });
  return lines;
}

interface Sections {
  preamble: Line[];
  parts: Map<SectionId, Line[]>;
}

interface ColumnRead {
  /** Lines before the column's first heading. */
  preamble: Line[];
  /** Sections in the order this column opened them. */
  order: SectionId[];
  /** Lines set at heading size that name no known section — a heading this parser cannot read. */
  unknownHeadings: number;
}

/**
 * Cut a column at its headings.
 *
 * A heading is a whole line naming a known section, opening it for the first time
 * (LinkedIn prints each once), and set apart from body text:
 *  - With font sizes, at least 15% larger than the column's body size. Body size
 *    is the median over lines that are NOT heading names. Taking it over every
 *    line let the headings vote: a sidebar with one entry per heading put the
 *    median halfway between the two, the headings fell under the bar, and Top
 *    Skills was read as absent.
 *  - Without, with space above it or at the top of a page — so a description
 *    line that happens to read exactly "Skills" stays a description line.
 */
function sectionise(lines: Line[], into: Sections): ColumnRead {
  const bodySizes = lines
    .filter((l) => !headingOf(l.text))
    .map((l) => l.fontSize)
    .filter((s): s is number => s !== undefined);
  const body = median(bodySizes);
  const read: ColumnRead = { preamble: [], order: [], unknownHeadings: 0 };
  let current: Line[] | null = null;
  for (const line of lines) {
    const id = headingOf(line.text);
    const sized = line.fontSize !== undefined && body !== undefined;
    const setApart = sized ? line.fontSize! >= body! * 1.15 : line.gap >= 1.4 || line.pageStart;
    if (id && setApart && !into.parts.has(id)) {
      current = [];
      into.parts.set(id, current);
      read.order.push(id);
      continue;
    }
    if (!id && sized && setApart && current) read.unknownHeadings++;
    (current ?? read.preamble).push(line);
  }
  return read;
}

/** Wrapped lines rejoin with a space; bullets and paragraph gaps keep a line break. */
function prose(lines: Line[]): string {
  let out = '';
  lines.forEach((l, i) => {
    if (i === 0) out = l.text;
    else out += (l.gap > 1.6 || BULLET.test(l.text) ? '\n' : ' ') + l.text;
  });
  return out.trim();
}

function parseHeader(lines: Line[]): { name?: string; headline?: string; location?: string } {
  if (!lines.length) return {};
  // The name is set in the largest type on the page; without sizes, it is first.
  let nameAt = 0;
  if (lines.every((l) => l.fontSize !== undefined)) {
    lines.forEach((l, i) => { if ((l.fontSize ?? 0) > (lines[nameAt].fontSize ?? 0)) nameAt = i; });
  }
  const rest = lines.slice(nameAt + 1);
  let place: string | undefined;
  let headline = rest;

  // Location is the last header line, set smaller than the headline. Without font
  // sizes it must read as a place. A lone line is the location only if it reads as
  // one; otherwise it is the headline.
  const last = rest[rest.length - 1];
  if (rest.length >= 2) {
    const smaller = last.fontSize !== undefined && rest[0].fontSize !== undefined && last.fontSize < rest[0].fontSize - 0.01;
    if (smaller || isPlace(last.text)) {
      place = last.text;
      headline = rest.slice(0, -1);
    }
  } else if (rest.length === 1 && isPlace(last.text)) {
    place = last.text;
    headline = [];
  }
  return {
    name: lines[nameAt].text,
    headline: headline.map((l) => l.text).join(' ').trim(),
    // Named `place` locally: assigning to a bare identifier called location is
    // what the no-network check looks for, since in a browser it navigates.
    location: place,
  };
}

/**
 * Roles, anchored on date lines.
 *
 * Every role in the export has a date line — "January 2019 - Present (5 years 10
 * months)" — directly under its title, so dates are the one thing that cannot be
 * mistaken for prose. Everything else is placed relative to them:
 *
 *   Company                       ← a single-role employer
 *   Title
 *   Date line
 *   Location (optional)
 *   Description …
 *
 *   Company                       ← a multi-role employer: the company, then its
 *   5 years 2 months                total tenure, then each title + date beneath
 *   Title / Date line / …
 *   Title / Date line / …
 *
 * The hard case is the line above a later title: the employer of a new
 * single-role job, or the last line of the previous role's description? Layout
 * cannot say. Dates can: a multi-role employer's tenure fixes when its earliest
 * role began, so a role starting inside that span belongs to it, and once the role
 * starting at the span's beginning has been read the group is complete. Where the
 * dates do not settle it, the shape of the line does — prose ends in punctuation,
 * employer names do not.
 *
 * Page breaks need no handling here: by now the column is one stream of lines with
 * footers removed, so an entry split across pages reads as if it were not.
 */
function parseExperience(raw: Line[]): { roles: Experience[]; employers: number } {
  const lines = mergeWrappedTitles(raw);
  const t = lines.map((l) => l.text);
  const dateAt = t.map((s, i) => (PDF_DATE_LINE.test(s) ? i : -1)).filter((i) => i >= 0);
  if (!dateAt.length) {
    // An Experience heading with no readable role under it is a parse failure, not
    // an empty career. Keep the words rather than drop them: one undated role
    // holding the text still lets the description checks read it.
    const text = prose(lines);
    return { roles: text ? [{ description: text }] : [], employers: 0 };
  }

  interface Placed { role: Experience; headerStart: number; bodyStart: number }
  const placed: Placed[] = [];
  let group: { company?: string; start: number | null } | null = null;
  let employers = 0;
  let minIdx = 0; // first line the next role's header may claim

  for (const d of dateAt) {
    if (d < minIdx) continue; // already consumed (cannot normally happen)
    const m = PDF_DATE_LINE.exec(t[d])!;
    let bodyStart = d + 1;
    let duration = m[3];
    // A page break can push "(5 years 10 months)" onto a line of its own.
    if (!duration && /^\([^)]*\)$/.test(t[bodyStart] ?? '')) duration = t[bodyStart++].slice(1, -1);

    const start = monthIndex(m[1]);
    const months = durationMonths(duration);
    const end = isCurrent(m[2])
      ? (start !== null && months !== null ? start + months - 1 : null)
      : monthIndex(m[2]);

    const titleAt = d - 1 >= minIdx ? d - 1 : -1;
    const aboveAt = titleAt - 1 >= minIdx ? titleAt - 1 : -1;
    let headerStart = titleAt >= 0 ? titleAt : d;
    let company: string | undefined;

    if (aboveAt >= 0 && DURATION_ONLY.test(t[aboveAt]) && aboveAt - 1 >= minIdx) {
      company = t[aboveAt - 1];
      headerStart = aboveAt - 1;
      const tenure = durationMonths(t[aboveAt]);
      group = { company, start: end !== null && tenure !== null ? end - tenure + 1 : null };
      employers++;
    } else if (group && belongsToGroup(group.start, start, aboveAt >= 0 ? t[aboveAt] : null)) {
      company = group.company;
      // The role that starts where the employer's tenure starts is its earliest,
      // and the export lists earliest last — anything after it is a new employer.
      if (group.start !== null && start !== null && start <= group.start + 1) group = null;
    } else if (aboveAt >= 0) {
      company = t[aboveAt];
      headerStart = aboveAt;
      group = null;
      employers++;
    } else {
      group = null;
      employers++;
    }

    // An optional location line sits directly under the dates. `isPlace` is strict
    // because whatever it accepts leaves the description.
    const next = t[bodyStart];
    if (next && isPlace(next)) bodyStart++;

    placed.push({
      role: {
        title: titleAt >= 0 ? t[titleAt] : undefined,
        company,
        dateRange: `${collapse(m[1])} - ${collapse(m[2])}`,
        current: isCurrent(m[2]),
      },
      headerStart,
      bodyStart,
    });
    minIdx = bodyStart;
  }

  placed.forEach((p, i) => {
    const until = i + 1 < placed.length ? placed[i + 1].headerStart : lines.length;
    const body = lines.slice(p.bodyStart, until).filter((l) => !META_LINE.test(l.text));
    p.role.description = prose(body);
  });

  return { roles: placed.map((p) => p.role), employers };
}

/**
 * Rejoin a job title that wrapped onto two lines, so the anchor logic sees one
 * title line above the dates instead of mistaking the first half for the employer.
 *
 * Only on evidence of a wrap: both lines in the same type size (the employer is set
 * larger than the title), the second straight under the first, and the first
 * either breaking mid-phrase or running nearly the full column width — measured
 * against the section's own longest line, so no page width is assumed. Without
 * font sizes the employer and the title cannot be told apart this way, so nothing
 * is merged.
 */
function mergeWrappedTitles(lines: Line[]): Line[] {
  const widest = lines.reduce((m, l) => Math.max(m, l.text.length), 0);
  const out: Line[] = [];
  for (let i = 0; i < lines.length; i++) {
    const [a, b, date] = [lines[i], lines[i + 1], lines[i + 2]];
    const wrapped = b && date && PDF_DATE_LINE.test(date.text) &&
      a.fontSize !== undefined && b.fontSize !== undefined && Math.abs(a.fontSize - b.fontSize) < 0.01 &&
      b.gap <= 1.3 && !b.pageStart &&
      !PDF_DATE_LINE.test(a.text) && !DURATION_ONLY.test(a.text) && !DURATION_ONLY.test(b.text) &&
      (/[-–—,&/|]$|\b(?:and|of|for|in|the|to|with|on|at)$/i.test(a.text) || /^[a-z]/.test(b.text) ||
        a.text.length >= widest * 0.8);
    if (wrapped) {
      out.push({ ...a, text: `${a.text} ${b.text}` });
      i++;
    } else {
      out.push(a);
    }
  }
  return out;
}

function belongsToGroup(groupStart: number | null, roleStart: number | null, above: string | null): boolean {
  // Nothing between the previous role and this title: no room for an employer line.
  if (above === null) return true;
  if (looksLikeProse(above)) return true;
  if (groupStart !== null && roleStart !== null) return roleStart >= groupStart - 1;
  return false;
}

/**
 * Schools and degrees. The degree line ends "· (2011 - 2015)", which closes an
 * entry. What came before it since the last entry is one or more schools and the
 * degree — more than one school when an earlier entry had no dates, which used to
 * fold that school into the next entry's degree. The school lines are told apart
 * by type size where it is known (schools are set larger), and by degree
 * vocabulary where it is not.
 */
function parseEducation(lines: Line[]): { school?: string; degree?: string }[] {
  const out: { school?: string; degree?: string }[] = [];
  const clean = (s: string) => s.replace(EDU_TAIL, '').trim();
  const push = (school: string, degree: string[]) => {
    const d = degree.map(clean).join(' ').trim();
    out.push(d ? { school: clean(school), degree: d } : { school: clean(school) });
  };

  const closed = (chunk: Line[]) => {
    const sizes = chunk.map((l) => l.fontSize);
    if (sizes.every((s) => s !== undefined) && new Set(sizes).size > 1) {
      const schoolSize = Math.max(...(sizes as number[]));
      let school: string | null = null;
      let degree: string[] = [];
      for (const l of chunk) {
        if (l.fontSize! >= schoolSize - 0.01) {
          if (school !== null) push(school, degree);
          school = l.text;
          degree = [];
        } else if (school === null) {
          school = l.text;
        } else {
          degree.push(l.text);
        }
      }
      if (school !== null) push(school, degree);
      return;
    }
    // No sizes: the degree starts at the last line that opens a run of degree
    // vocabulary, or failing that is just the dated line.
    let start = chunk.length - 1;
    for (let i = chunk.length - 1; i >= 1; i--) {
      if (DEGREE_WORDS.test(chunk[i].text) && !DEGREE_WORDS.test(chunk[i - 1].text)) { start = i; break; }
    }
    if (chunk.length === 1) start = 1;
    const schools = chunk.slice(0, start);
    const degree = chunk.slice(start).map((l) => l.text);
    schools.forEach((s, i) => push(s.text, i === schools.length - 1 ? degree : []));
  };

  let chunk: Line[] = [];
  for (const l of lines) {
    chunk.push(l);
    if (EDU_TAIL.test(l.text)) { closed(chunk); chunk = []; }
  }
  // Trailing lines with no dated line to anchor on: fall back to vocabulary.
  for (const l of chunk) {
    const prev = out[out.length - 1];
    if (prev && !prev.degree && DEGREE_WORDS.test(l.text)) prev.degree = l.text;
    else out.push({ school: l.text });
  }
  return out;
}

/**
 * One section's evidence entries.
 *
 * The sidebar is narrow and holds titles only, so a long title wraps — a line
 * continues the one above when the break is plainly mid-phrase. The main column
 * can carry descriptions, so there a prose-shaped line describes the entry above.
 */
function parseEvidence(kind: Evidence['kind'], lines: Line[]): Evidence[] {
  const out: Evidence[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && l.column === 'left' && continuesTitle(kind, prev.title ?? '', l.text)) {
      prev.title = `${prev.title} ${l.text}`;
    } else if (prev && l.column === 'main' && looksLikeProse(l.text)) {
      prev.description = prev.description ? `${prev.description} ${l.text}` : l.text;
    } else {
      out.push({ kind, title: l.text });
    }
  }
  return out;
}

/**
 * Whether a sidebar line is the wrapped end of the title above it.
 *
 * Plain mid-phrase breaks are certain: a line ending on a dash, comma or "of", or
 * one starting in lower case. The other common wrap — "Microsoft Certified: Azure"
 * then "Fundamentals" — leaves one capitalised word on the next line, which for a
 * certification or a publication is almost never a whole entry on its own. Short
 * certifications are acronyms (PMP, CISSP), so those still stand alone. Honours
 * are left out of that rule: "Valedictorian" is a complete honour.
 */
function continuesTitle(kind: Evidence['kind'], prev: string, line: string): boolean {
  if (/[-–—,&/(:]$|\b(?:and|of|for|in|the|to|with|on|at)$/i.test(prev)) return true;
  if (/^[a-z)]/.test(line)) return true;
  const oneWord = /^[A-Z][a-z]+$/.test(line);
  return oneWord && prev.length >= 20 && (kind === 'certification' || kind === 'publication');
}

/**
 * A route to reach the person beyond the LinkedIn URL that every export prints:
 * an email, a phone number, or a site of their own.
 */
function hasContactRoute(lines: Line[]): boolean {
  const text = lines.map((l) => l.text).join(' ');
  // Bounded quantifiers: unbounded ones backtrack quadratically on a long line.
  if (/[\w.+-]{1,64}@[\w-]{1,63}\.[\w.-]{2,63}/.test(text)) return true;
  if (/\((?:Mobile|Home|Work)\)/i.test(text)) return true;
  if (/\((?:Personal|Company|Portfolio|Blog|Other|RSS Feed)\)/i.test(text)) return true;
  return false;
}

/**
 * Shaped like a Contact entry: an address, a URL or a fragment of one, a phone
 * number, or one of LinkedIn's "(LinkedIn)" / "(Mobile)" labels. A Contact section
 * holding anything else has swallowed a heading this parser did not recognise.
 */
function contactShaped(text: string): boolean {
  if (/@|www\.|https?:|\.[a-z]{2,}(?:\/|\b)|\((?:LinkedIn|Mobile|Home|Work|Personal|Company|Portfolio|Blog|Other|RSS Feed)\)/i.test(text)) return true;
  if (/^\+?[\d\s().-]{7,}$/.test(text)) return true;
  return /^\S+$/.test(text) && /[./\-_\d]/.test(text); // a wrapped URL's tail
}

/**
 * Whether every page the footers promise is here. "Page 1 of 2" with no page 2 is
 * a truncated upload, and nothing missing from it can be called absent.
 */
function pagesComplete(items: PdfTextItem[]): boolean {
  let promised = 0;
  const present = new Set<number>();
  for (const it of items) {
    present.add(it.page);
    const m = /^Page\s+\d+\s+of\s+(\d+)$/i.exec(collapse(it.str));
    if (m) promised = Math.max(promised, Number(m[1]));
  }
  for (let p = 1; p <= Math.min(promised, 500); p++) if (!present.has(p)) return false;
  return true;
}

export function fromLinkedInPdfItems(input: PdfTextItem[]): Profile {
  const items = (Array.isArray(input) ? input : [])
    .slice(0, MAX_ITEMS)
    .filter((i) => i && typeof i.str === 'string' && i.str.trim() && Number.isFinite(i.x) && Number.isFinite(i.y))
    .map((i) => ({
      str: i.str.length > MAX_ITEM_CHARS ? i.str.slice(0, MAX_ITEM_CHARS) : i.str,
      x: i.x,
      y: i.y,
      page: Number.isFinite(i.page) ? i.page : 1,
      fontSize: Number.isFinite(i.fontSize) && (i.fontSize as number) > 0 ? i.fontSize : undefined,
    }));
  if (!items.length) return { observed: [] };

  const yDown = detectYDown(items);
  const key = (y: number) => (yDown ? y : -y);
  const split = mainColumnStart(items);

  const sections: Sections = { preamble: [], parts: new Map() };
  const left = sectionise(toLines(items.filter((i) => i.x < split), 'left', key), sections);
  const main = sectionise(toLines(items.filter((i) => i.x >= split), 'main', key), sections);
  sections.preamble = main.preamble;

  // Not recognisably a LinkedIn export: claim nothing, so every check abstains
  // instead of a résumé PDF being scored as an empty profile.
  if (!SIGNATURE.some((id) => sections.parts.has(id))) return { observed: [] };

  const part = (id: SectionId) => sections.parts.get(id);

  /*
   * When is a missing section a real absence?
   *
   * LinkedIn leaves empty sections out, so a missing heading means "none" — but
   * only if the parser would have seen the heading had it been there. A Dutch
   * export, a heading set at an unexpected size, or a file cut short all leave
   * headings unread, and calling those absences scored a complete profile as an
   * empty one. So absence is claimed only from a read that proves itself:
   *
   *  - Every page the footers promise is present.
   *  - Main column: at least one of its headings was recognised, and what sits
   *    above the first one is short and holds no role dates or degree lines — a
   *    header, not a section whose heading was missed.
   *  - Sidebar: Contact was recognised, nothing sits above it, every Contact line
   *    is contact-shaped, and no line is set at heading size without naming a
   *    known section.
   *
   * A section that WAS found is read regardless — except the one a truncated file
   * ends in, whose last entry may be a fragment.
   */
  const complete = pagesComplete(items);
  const stray = (l: Line) => PDF_DATE_LINE.test(l.text) || EDU_TAIL.test(l.text);
  const headerOk = main.preamble.length > 0 && main.preamble.length <= 8 && !main.preamble.some(stray);
  const mainTrusted = complete && headerOk && MAIN_SECTIONS.some((id) => main.order.includes(id));
  const contact = part('contact');
  const sidebarTrusted = complete && !!contact && left.preamble.length === 0 && left.unknownHeadings === 0 &&
    contact.every((l) => contactShaped(l.text));
  const cutShort = complete ? undefined : main.order[main.order.length - 1];

  const profile: Profile = {};
  const observed: string[] = [];

  if (headerOk) {
    const header = parseHeader(main.preamble);
    if (header.name) profile.name = header.name;
    if (header.name) observed.push('name');
    // A headline is mandatory on LinkedIn, so an empty one is a parse failure.
    if (header.headline) {
      profile.headline = header.headline;
      observed.push('headline');
    }
    if (header.location) {
      profile.location = header.location;
      observed.push('location');
    }
  }

  /** Observe a main section: read when found (unless cut short), absent only on a trusted read. */
  const mainSection = (id: SectionId) => (part(id) ? id !== cutShort : mainTrusted);

  const summary = part('summary');
  if (summary) profile.about = prose(summary);
  if (mainSection('summary')) {
    profile.about ??= '';
    observed.push('about');
  }

  const experience = part('experience');
  if (experience) {
    const { roles, employers } = parseExperience(experience);
    profile.experience = roles;
    if (employers > 0) profile.employerCount = employers;
  }
  if (mainSection('experience')) {
    profile.experience ??= [];
    observed.push('experience');
  }

  const education = part('education');
  if (education) profile.education = parseEducation(education);
  if (mainSection('education')) {
    profile.education ??= [];
    observed.push('education');
  }

  const skills = part('skills');
  if (skills) {
    profile.skills = skills.map((l) => l.text).filter((s, i, a) => a.indexOf(s) === i);
  } else if (sidebarTrusted) {
    profile.skills = [];
    observed.push('skills');
  }

  const evidence = EVIDENCE_KINDS.flatMap((kind) => {
    const lines = part(kind);
    return lines ? parseEvidence(kind, lines) : [];
  });
  if (evidence.length) profile.portfolio = evidence;
  if (evidence.length >= PORTFOLIO_FULL_MARKS) observed.push('portfolio');

  if (contact && hasContactRoute(contact)) {
    profile.contactInfoAvailable = true;
    observed.push('contactInfoAvailable');
  }

  profile.observed = observed;
  return profile;
}

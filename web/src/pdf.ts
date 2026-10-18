import type { Evidence, Experience, Profile } from '../../packages/engine/src/types.ts';
import { PORTFOLIO_FULL_MARKS } from '../../packages/engine/src/rules/portfolio.ts';
import {
  DEGREE_WORDS, DURATION_ONLY, LOCATION_ISH, META_LINE, PDF_DATE_LINE,
  collapse, durationMonths, isCurrent, looksLikeProse, monthIndex,
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
}

type SectionId =
  | 'contact' | 'skills' | 'languages' | 'summary' | 'experience' | 'education'
  | Evidence['kind'];

/**
 * Section headings the export uses, plus close variants. Matched against a whole
 * line, never a substring, so "Experience" inside a sentence is just prose.
 */
const HEADINGS: Record<string, SectionId> = {
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
};

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
  return HEADINGS[collapse(text).toLowerCase()];
}

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

  const order: SectionId[] = ['summary', 'experience', 'education'];
  const anchors = items
    .map((i) => ({ i, rank: order.indexOf(headingOf(i.str) as SectionId) }))
    .filter((a) => a.rank >= 0);
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
        text: collapse(parts.map((p) => p.str).join(' ')),
        page: parts[0].page,
        key: key(parts[0].y),
        fontSize: sizes.length ? Math.max(...sizes) : undefined,
        column,
        gap: 1,
      };
    })
    .filter((l) => l.text && !FOOTER.test(l.text));

  const lineSteps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].page === lines[i - 1].page) lineSteps.push(lines[i].key - lines[i - 1].key);
  }
  const typical = median(lineSteps) ?? 1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].page === lines[i - 1].page) lines[i].gap = (lines[i].key - lines[i - 1].key) / typical;
  }
  return lines;
}

interface Sections {
  preamble: Line[];
  parts: Map<SectionId, Line[]>;
}

/**
 * Cut a column at its headings. A heading must be a whole line naming a known
 * section and, where font sizes are known, set larger than the column's body
 * text — so a certification literally called "Projects" stays a certification.
 */
function sectionise(lines: Line[], into: Sections): Line[] {
  const sizes = lines.map((l) => l.fontSize).filter((s): s is number => s !== undefined);
  const body = median(sizes);
  const preamble: Line[] = [];
  let current: Line[] | null = null;
  for (const line of lines) {
    const id = headingOf(line.text);
    const bigEnough = line.fontSize === undefined || body === undefined || line.fontSize >= body * 1.15;
    if (id && bigEnough) {
      current = into.parts.get(id) ?? [];
      into.parts.set(id, current);
      continue;
    }
    (current ?? preamble).push(line);
  }
  return preamble;
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
  let location: string | undefined;
  let headline = rest;

  // Location is the last header line, set smaller than the headline. Without font
  // sizes, it must also read as a place — and a lone line is taken as the headline,
  // because a headline that merely contains a comma is the likelier mistake.
  const last = rest[rest.length - 1];
  if (rest.length >= 2) {
    const smaller = last.fontSize !== undefined && rest[0].fontSize !== undefined && last.fontSize < rest[0].fontSize - 0.01;
    if (smaller || LOCATION_ISH.test(last.text)) {
      location = last.text;
      headline = rest.slice(0, -1);
    }
  }
  return {
    name: lines[nameAt].text,
    headline: headline.map((l) => l.text).join(' ').trim(),
    location,
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
function parseExperience(lines: Line[]): { roles: Experience[]; employers: number } {
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

    // An optional location line sits directly under the dates.
    const next = t[bodyStart];
    if (next && next.length <= 60 && LOCATION_ISH.test(next) && !PDF_DATE_LINE.test(next)) bodyStart++;

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

function belongsToGroup(groupStart: number | null, roleStart: number | null, above: string | null): boolean {
  // Nothing between the previous role and this title: no room for an employer line.
  if (above === null) return true;
  if (looksLikeProse(above)) return true;
  if (groupStart !== null && roleStart !== null) return roleStart >= groupStart - 1;
  return false;
}

/**
 * Schools and degrees. The degree line ends "· (2011 - 2015)", which closes an
 * entry; whatever came before it since the last entry is school then degree, so a
 * degree that wraps onto two lines stays one degree.
 */
function parseEducation(lines: Line[]): { school?: string; degree?: string }[] {
  const TAIL = /\s*·?\s*\(\s*[^)]*(?:19|20)\d{2}[^)]*\)\s*$/;
  const out: { school?: string; degree?: string }[] = [];
  let chunk: string[] = [];
  const flush = (closed: boolean) => {
    if (!chunk.length) return;
    if (closed) {
      const [school, ...degree] = chunk.map((s) => s.replace(TAIL, '').trim());
      out.push({ school: school || undefined, degree: degree.join(' ').trim() || undefined });
    } else {
      // No dated line to anchor on: fall back to vocabulary.
      for (const line of chunk) {
        const prev = out[out.length - 1];
        if (prev && !prev.degree && DEGREE_WORDS.test(line)) prev.degree = line;
        else out.push({ school: line });
      }
    }
    chunk = [];
  };
  for (const l of lines) {
    chunk.push(l.text);
    if (TAIL.test(l.text)) flush(true);
  }
  flush(false);
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
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) return true;
  if (/\((?:Mobile|Home|Work)\)/i.test(text)) return true;
  if (/\((?:Personal|Company|Portfolio|Blog|Other|RSS Feed)\)/i.test(text)) return true;
  return false;
}

export function fromLinkedInPdfItems(input: PdfTextItem[]): Profile {
  const items = (Array.isArray(input) ? input : [])
    .filter((i) => i && typeof i.str === 'string' && i.str.trim() && Number.isFinite(i.x) && Number.isFinite(i.y))
    .map((i) => ({
      str: i.str,
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
  sectionise(toLines(items.filter((i) => i.x < split), 'left', key), sections);
  sections.preamble = sectionise(toLines(items.filter((i) => i.x >= split), 'main', key), sections);

  // Not recognisably a LinkedIn export: claim nothing, so every check abstains
  // instead of a résumé PDF being scored as an empty profile.
  if (!SIGNATURE.some((id) => sections.parts.has(id))) return { observed: [] };

  const profile: Profile = {};
  const observed: string[] = [];
  const part = (id: SectionId) => sections.parts.get(id);

  const header = parseHeader(sections.preamble);
  if (header.name) {
    profile.name = header.name;
    profile.headline = header.headline ?? '';
    observed.push('name', 'headline');
  }
  if (header.location) {
    profile.location = header.location;
    observed.push('location');
  }

  const summary = part('summary');
  profile.about = summary ? prose(summary) : '';
  observed.push('about');

  const experience = part('experience');
  const { roles, employers } = experience ? parseExperience(experience) : { roles: [], employers: 0 };
  profile.experience = roles;
  observed.push('experience');
  if (employers > 0) profile.employerCount = employers;

  const education = part('education');
  profile.education = education ? parseEducation(education) : [];
  observed.push('education');

  const skills = part('skills');
  if (skills) {
    profile.skills = skills.map((l) => l.text).filter((s, i, a) => a.indexOf(s) === i);
  } else {
    profile.skills = [];
    observed.push('skills');
  }

  const evidence = EVIDENCE_KINDS.flatMap((kind) => {
    const lines = part(kind);
    return lines ? parseEvidence(kind, lines) : [];
  });
  if (evidence.length) profile.portfolio = evidence;
  if (evidence.length >= PORTFOLIO_FULL_MARKS) observed.push('portfolio');

  const contact = part('contact');
  if (contact && hasContactRoute(contact)) {
    profile.contactInfoAvailable = true;
    observed.push('contactInfoAvailable');
  }

  profile.observed = observed;
  return profile;
}

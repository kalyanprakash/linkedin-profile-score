import type { Evidence, Experience, Profile } from '../../packages/engine/src/types.ts';
import { PORTFOLIO_FULL_MARKS } from '../../packages/engine/src/rules/portfolio.ts';
import {
  DATE_RANGE, DEGREE_WORDS, DURATION_ONLY, META_LINE,
  collapse, durationMonths, isCurrent, isPlace, looksLikeProse, monthIndex,
} from './lines.ts';

/**
 * Paste mode: the person copies sections of their own profile into a form.
 *
 * ## What counts as observed
 *
 * A section is observed exactly when its key is present with a string value —
 * including an empty string — and unobserved when it is missing or undefined.
 *
 * The form is the only witness to intent. A field the person left blank on
 * purpose ("I have no About") is a real answer, and scoring it is what they
 * asked for. A field the page never sent is not an answer at all, and must not be
 * read as "you have none" — that is the false zero this project exists to avoid.
 * So the page decides by what it sends: include the key for a field the person
 * was shown, omit it for one they were not. `null` is treated as omitted.
 *
 * Certifications and projects both feed `portfolio`, so it is observed only when
 * both keys were sent: then the person was asked for all of their evidence, and an
 * empty answer is a real one. With only one key, what came back is a lower bound
 * — the projects nobody asked for may exist — and like the PDF it is scored only
 * once it already earns full marks (`PORTFOLIO_FULL_MARKS`). Descriptions
 * (`portfolioDescriptions`) are claimed only when projects were pasted:
 * certifications carry no prose on LinkedIn, so a certifications-only paste says
 * nothing about how well the evidence is described.
 *
 * Paste never observes the things it cannot see: photo, banner, featured,
 * recommendations, activity, open-to-work, custom URL, contact info, location,
 * company links. Those abstain and widen the range.
 */
export interface PasteSections {
  name?: string;
  headline?: string;
  about?: string;
  experience?: string;
  education?: string;
  skills?: string;
  certifications?: string;
  projects?: string;
}

function toLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n').map((l) => collapse(l));
}

/** Pasted copy often starts with the section's own heading. */
function dropHeading(lines: string[], heading: RegExp): string[] {
  const first = lines.findIndex((l) => l !== '');
  return first >= 0 && heading.test(lines[first]) ? lines.slice(first + 1) : lines;
}

/** Non-empty runs separated by blank lines. */
function blocks(lines: string[]): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (l) cur.push(l);
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

interface Anchor {
  at: number;
  range: string;
  inline?: string;
  /** Months since year 0, when readable — for placing a role inside an employer's tenure. */
  start: number | null;
  end: number | null;
}

/**
 * A line that dates a role, as opposed to prose that mentions a year.
 *
 * Whatever trails the range may only be a duration ("· 3 yrs 10 mos",
 * "(5 years 10 months)") or a work-arrangement chip; whatever leads it, if
 * anything, is a header
 * ("Engineer, Acme — 2019 - Present"). A sentence that happens to contain
 * "2015 - 2018" fails one or the other and stays prose.
 */
function anchorAt(line: string, at: number): Anchor | null {
  const m = DATE_RANGE.exec(line);
  if (!m) return null;
  const tail = line.slice(m.index + m[0].length)
    .replace(/\b(?:Remote|Hybrid|On-site|Full-time|Part-time|Contract|Internship|Freelance)\b/gi, '')
    .replace(/[·•|,()\-–—]/g, ' ')
    .replace(/\b\d+\s*(?:years?|yrs?|months?|mos?)\b|less than a year/gi, '')
    .trim();
  if (tail) return null;
  const lead = line.slice(0, m.index).replace(/[\s·•|,(\-–—:]+$/, '').trim();
  // "Between 2015 - 2018 I ran…" fails on its tail; "From 2015 - 2018" on its lead.
  if (lead && (lead.length > 100 || looksLikeProse(lead) ||
      /(?:^|\s)(?:from|between|in|during|since|of|until|through|by)$/i.test(lead))) return null;
  const start = monthIndex(m[1]);
  const months = durationMonths(line.slice(m.index + m[0].length));
  const end = isCurrent(m[2])
    ? (start !== null && months !== null ? start + months - 1 : null)
    : monthIndex(m[2]);
  return { at, range: `${collapse(m[1])} - ${collapse(m[2])}`, inline: lead || undefined, start, end };
}

/**
 * Title and employer from up to two header lines, nearest the dates first.
 *
 * Pasted text arrives in at least three orders: the live page (title, then
 * "Company · Full-time"), the PDF (company, then title), and every résumé
 * convention there is. The markers settle what they can — "·" follows an
 * employer on the live page, " at " joins title to employer, and an employer's
 * tenure line ("Full-time · 5 yrs") between the two lines means employer above,
 * title below in either layout. What is left is the layout's own order: the PDF
 * puts the title nearest the dates, the live page and most résumés put it first.
 */
function titleAndCompany(
  header: string[],
  { pdfOrder, grouped }: { pdfOrder: boolean; grouped: boolean },
): { title?: string; company?: string } {
  const dotted = header.findIndex((h) => / · /.test(h));
  if (dotted >= 0) {
    const other = header.find((_, i) => i !== dotted);
    return { title: other, company: header[dotted].split(' · ')[0].trim() };
  }
  if (header.length === 1) {
    const at = /^(.+?)\s+at\s+(.+)$/i.exec(header[0]);
    return at ? { title: at[1].trim(), company: at[2].trim() } : { title: header[0] };
  }
  if (header.length === 0) return {};
  return pdfOrder || grouped
    ? { title: header[0], company: header[1] }
    : { title: header[1], company: header[0] };
}

/** Durations in brackets — "(3 years 8 months)" — are the PDF's; the live page writes "· 2 yrs 10 mos". */
function looksCopiedFromPdf(lines: string[]): boolean {
  return lines.some((l) => DATE_RANGE.test(l) && /\(\s*(?:\d+\s*(?:years?|months?)\s*)+\)\s*$|\(less than a year\)/i.test(l));
}

/**
 * Roles from free text, anchored on date-range lines.
 *
 * Description text is never dropped. When there are no anchors, or text sits
 * above the first one, it is kept — as undated roles split on blank lines, or
 * folded into the first role — because a misplaced sentence still counts toward
 * how well the work is described, and a discarded one silently scores as absent.
 */
function parseExperience(text: string): Experience[] {
  const lines = dropHeading(toLines(text), /^Experience$/i);
  const anchors = lines.map((l, i) => (l ? anchorAt(l, i) : null)).filter((a): a is Anchor => a !== null);

  if (!anchors.length) {
    return blocks(lines).map((b) =>
      b.length > 1 && b[0].length <= 80 && !looksLikeProse(b[0])
        ? { title: b[0], description: b.slice(1).join('\n') }
        : { description: b.join('\n') });
  }

  interface Placed { role: Experience; headerStart: number; bodyStart: number }
  const placed: Placed[] = [];
  const pdfOrder = looksCopiedFromPdf(lines);
  let minIdx = 0;
  /** The employer whose "Company / tenure" header the following roles sit under. */
  let group: { company?: string; start: number | null } | null = null;
  /** A group just ended, so the next role's employer line is expected. */
  let newEmployerDue = false;

  for (const a of anchors) {
    if (a.at < minIdx) continue;
    const found: { text: string; at: number }[] = [];
    let grouped = false;
    let tenure: number | null = null;
    if (a.inline) {
      found.push({ text: a.inline, at: a.at });
    } else {
      for (let i = a.at - 1; i >= minIdx && found.length < 2; i--) {
        const l = lines[i];
        if (!l) break;
        if (DURATION_ONLY.test(l) || META_LINE.test(l)) {
          if (found.length === 1 && DURATION_ONLY.test(l)) { grouped = true; tenure = durationMonths(l); }
          continue;
        }
        if (l.length > 100 || looksLikeProse(l) || anchorAt(l, i)) break;
        found.push({ text: l, at: i });
      }
    }

    // The nearest line is the title. A second line above it may be this role's
    // employer — or the unpunctuated last line of the previous role's description,
    // and layout cannot tell which. So it is taken only with something to confirm
    // it: this is the first role; a "Company / tenure" header or a "Company ·
    // Full-time" chip; a blank line above it; the employer group before it having
    // just ended; or dates that put this role outside that group. Otherwise it stays description — misfiling a
    // line as a title costs the description its words and the title its meaning.
    const second = found[1];
    const outsideGroup = group !== null && group.start !== null && a.start !== null && a.start < group.start - 1;
    const confirmed = second !== undefined && (
      placed.length === 0 || grouped || newEmployerDue || outsideGroup ||
      found.some((f) => / · /.test(f.text)) ||
      (second.at > 0 && !lines[second.at - 1])
    );
    const header = found.slice(0, confirmed ? 2 : 1);
    const headerStart = header.length ? header[header.length - 1].at : a.at;

    let { title, company } = titleAndCompany(header.map((h) => h.text), { pdfOrder, grouped: grouped && confirmed });
    newEmployerDue = false;
    if (grouped && confirmed) {
      group = { company, start: a.end !== null && tenure !== null ? a.end - tenure + 1 : null };
    } else if (!company && group && !outsideGroup) {
      company = group.company;
      // The role starting where the tenure starts is the employer's earliest, and
      // it is listed last — whatever comes next is someone else.
      if (group.start !== null && a.start !== null && a.start <= group.start + 1) {
        group = null;
        newEmployerDue = true;
      }
    } else if (company || outsideGroup) {
      group = null;
    }

    let bodyStart = a.at + 1;
    // Location and employment-type chips sit straight under the dates.
    while (bodyStart < lines.length && lines[bodyStart] &&
           (META_LINE.test(lines[bodyStart]) || isPlace(lines[bodyStart]))) bodyStart++;

    placed.push({
      role: { title, company, dateRange: a.range, current: isCurrent(a.range) },
      headerStart,
      bodyStart,
    });
    minIdx = bodyStart;
  }

  placed.forEach((p, i) => {
    const until = i + 1 < placed.length ? placed[i + 1].headerStart : lines.length;
    p.role.description = lines.slice(p.bodyStart, until)
      .filter((l) => !META_LINE.test(l))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  });

  const preface = lines.slice(0, placed[0].headerStart).filter(Boolean).join('\n');
  if (preface) {
    const first = placed[0].role;
    first.description = [preface, first.description].filter(Boolean).join('\n');
  }
  return placed.map((p) => p.role);
}

const DATE_TAIL = /\s*·?\s*\(?\s*(?:[A-Za-z]{3,9}\s+)?(?:19|20)\d{2}\s*(?:[-–—]\s*(?:[A-Za-z]{3,9}\s+)?(?:(?:19|20)\d{2}|Present))?\s*\)?\s*$/i;
const DATES_ONLY = /^\(?\s*(?:[A-Za-z]{3,9}\s+)?(?:19|20)\d{2}(?:\s*[-–—]\s*(?:[A-Za-z]{3,9}\s+)?(?:(?:19|20)\d{2}|Present))?\s*\)?$/i;

/**
 * Schools and degrees. Separated by blank lines, the second line of each block is
 * the degree; run together, a line naming a degree attaches to the school above.
 */
function parseEducation(text: string): { school?: string; degree?: string }[] {
  const lines = dropHeading(toLines(text), /^Education$/i);
  const bs = blocks(lines);
  const strip = (s: string) => s.replace(DATE_TAIL, '').trim() || undefined;

  if (bs.length > 1) {
    return bs.map((b) => {
      const rest = b.slice(1).filter((l) => !DATES_ONLY.test(l));
      return { school: strip(b[0]), degree: rest.length ? strip(rest[0]) : undefined };
    });
  }
  const out: { school?: string; degree?: string }[] = [];
  for (const l of lines.filter(Boolean)) {
    if (DATES_ONLY.test(l)) continue;
    const prev = out[out.length - 1];
    if (prev && !prev.degree && DEGREE_WORDS.test(l)) prev.degree = strip(l);
    else out.push({ school: strip(l) });
  }
  return out;
}

/** Skills separated by lines, commas, bullets or pipes; LinkedIn's provenance rows removed. */
function parseSkills(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[\n,;·•|]+/)
    .map((s) => collapse(s))
    .filter((s) => s && s.length < 80 && !/^(?:Skills|Top skills)$/i.test(s))
    .filter((s) => !/^\d+\s+(?:endorsements?|experiences?)\b|^Show all|^Endorsed by\b/i.test(s))
    .filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/**
 * Evidence entries. Separated by blank lines, a block is a title and its
 * description; run together, a prose-shaped line describes the entry above.
 */
function parseEvidence(kind: Evidence['kind'], text: string, heading: RegExp): Evidence[] {
  const lines = dropHeading(toLines(text), heading);
  const bs = blocks(lines);
  if (bs.length > 1) {
    return bs.map((b) => ({
      kind,
      title: b[0],
      description: b.slice(1).join(' ') || undefined,
    }));
  }
  const out: Evidence[] = [];
  for (const l of lines.filter(Boolean)) {
    const prev = out[out.length - 1];
    if (prev && looksLikeProse(l)) prev.description = prev.description ? `${prev.description} ${l}` : l;
    else out.push({ kind, title: l });
  }
  return out;
}

export function fromPaste(sections: PasteSections): Profile {
  const s: Record<string, unknown> = sections && typeof sections === 'object' ? { ...sections } : {};
  const given = (k: keyof PasteSections): string | undefined =>
    Object.prototype.hasOwnProperty.call(s, k) && typeof s[k] === 'string' ? (s[k] as string) : undefined;

  const profile: Profile = {};
  const observed: string[] = [];

  const name = given('name');
  if (name !== undefined) { profile.name = collapse(name); observed.push('name'); }

  const headline = given('headline');
  if (headline !== undefined) { profile.headline = collapse(headline); observed.push('headline'); }

  const about = given('about');
  if (about !== undefined) {
    profile.about = dropHeading(toLines(about), /^About$/i).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    observed.push('about');
  }

  const experience = given('experience');
  if (experience !== undefined) {
    profile.experience = parseExperience(experience);
    observed.push('experience');
  }

  const education = given('education');
  if (education !== undefined) {
    profile.education = parseEducation(education);
    observed.push('education');
  }

  const skills = given('skills');
  if (skills !== undefined) {
    profile.skills = parseSkills(skills);
    observed.push('skills');
  }

  const certifications = given('certifications');
  const projects = given('projects');
  if (certifications !== undefined || projects !== undefined) {
    profile.portfolio = [
      ...(certifications ? parseEvidence('certification', certifications, /^(?:Licenses (?:&|and) )?certifications$/i) : []),
      ...(projects ? parseEvidence('project', projects, /^Projects$/i) : []),
    ];
    const complete = certifications !== undefined && projects !== undefined;
    if (complete || profile.portfolio.length >= PORTFOLIO_FULL_MARKS) {
      observed.push('portfolio');
      if (projects !== undefined) observed.push('portfolioDescriptions');
    }
  }

  profile.observed = observed;
  return profile;
}

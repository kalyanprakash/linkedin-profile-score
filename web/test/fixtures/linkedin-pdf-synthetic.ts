/**
 * SYNTHETIC LinkedIn "Save to PDF" exports, as pdf.js text items.
 *
 * Not a real export. No real profile is reproduced; every name, employer and
 * sentence here is invented. The layout mirrors the export's described shape — a
 * narrow left sidebar (Contact, Top Skills, Languages, Certifications,
 * Honors-Awards, Publications) and a wide main column (large name, headline,
 * location, then Summary, Experience, Education) — with the type sizes and
 * positions approximated, not measured.
 *
 * TODO(real-fixture): replace or supplement these with items extracted from a
 * genuine export. The owner can export his own profile (More → Save to PDF),
 * run it through pdf.js `getTextContent()`, and commit the items here — scrubbed
 * of contact details — so the parser is checked against what LinkedIn actually
 * emits rather than against what this file assumes it emits.
 *
 * The generator below lays out lines top-down per column, flows them onto new
 * pages, stamps "Page N of M" footers, and splits some lines into several
 * fragments the way pdf.js does, so the parser meets the awkward parts of a real
 * extraction: fragments, footers, page breaks, both y orientations, any scale.
 */

export interface PdfItem {
  str: string;
  x: number;
  y: number;
  page: number;
  fontSize?: number;
}

/** One printed line. An array of strings becomes that many pdf.js fragments. */
export interface PrintLine {
  text: string | string[];
  size: number;
  /** Extra space above the line, in points — section and paragraph breaks. */
  space?: number;
}
export type Flow = (PrintLine | 'PAGE_BREAK')[];

const PAGE_HEIGHT = 792;
const TOP = 750;
const BOTTOM = 60;
const LEFT_X = 34;
const MAIN_X = 214;
const FOOTER = { x: 268, y: 26, size: 9 };

export interface LayoutOptions {
  /** y grows down the page, as a viewport-converted extraction reports it. Default: PDF space (y up). */
  yDown?: boolean;
  /** Omit fontSize from every item, as a page that does not pass it would. */
  noFontSizes?: boolean;
  /** Multiply every coordinate and size, as a page rendering at another scale would. */
  scale?: number;
  /** Add pdf.js's empty and whitespace-only items. */
  noise?: boolean;
}

function flow(lines: Flow, x: number): { str: string; x: number; y: number; page: number; size: number }[] {
  const out: { str: string; x: number; y: number; page: number; size: number }[] = [];
  let page = 1;
  let y = TOP;
  for (const line of lines) {
    if (line === 'PAGE_BREAK') { page++; y = TOP; continue; }
    const advance = (line.space ?? 0) + line.size * 1.3;
    if (y - advance < BOTTOM) { page++; y = TOP; }
    y -= advance;
    let fx = x;
    for (const frag of Array.isArray(line.text) ? line.text : [line.text]) {
      out.push({ str: frag, x: fx, y, page, size: line.size });
      fx += frag.length * line.size * 0.5;
    }
  }
  return out;
}

export function layout(spec: { left: Flow; main: Flow }, opts: LayoutOptions = {}): PdfItem[] {
  const placed = [...flow(spec.left, LEFT_X), ...flow(spec.main, MAIN_X)];
  const pages = Math.max(...placed.map((p) => p.page));
  for (let p = 1; p <= pages; p++) {
    placed.push({ str: `Page ${p} of ${pages}`, x: FOOTER.x, y: FOOTER.y, page: p, size: FOOTER.size });
  }
  if (opts.noise) {
    const extra = placed.filter((_, i) => i % 3 === 0).map((p) => ({ ...p, str: i0(p.str) }));
    placed.push(...extra);
  }
  const k = opts.scale ?? 1;
  return placed.map((p) => {
    const item: PdfItem = {
      str: p.str,
      x: p.x * k,
      y: (opts.yDown ? PAGE_HEIGHT - p.y : p.y) * k,
      page: p.page,
    };
    if (!opts.noFontSizes) item.fontSize = p.size * k;
    return item;
  });
}

/** pdf.js emits empty end-of-line items and lone spaces; the parser must ignore both. */
function i0(s: string): string {
  return s.length % 2 ? '' : ' ';
}

// Type sizes, approximated.
const NAME = 26;
const HEADLINE = 12;
const LOCATION = 10.5;
const H_MAIN = 15.75;
const H_SIDE = 13;
const COMPANY = 12;
const TITLE = 11.5;
const BODY = 10.5;
const SIDE = 10.5;

const h = (text: string, size = H_MAIN): PrintLine => ({ text, size, space: 14 });
const l = (text: string | string[], size = BODY, space = 0): PrintLine => ({ text, size, space });

/**
 * A long career: one employer holding three titles under a total tenure line,
 * single-role employers after it, a role with no description, a page break in the
 * middle of a description, a two-paragraph Summary, a degree that wraps, and a
 * full sidebar including a certification that wraps.
 *
 * Durations are internally consistent with an export taken in October 2026.
 */
export const LONG_CAREER = {
  left: [
    h('Contact', H_SIDE),
    l('priya.raman@example.com', SIDE),
    l('www.linkedin.com/in/priya-raman-', SIDE),
    l(['synthetic ', '(LinkedIn)'], SIDE),
    h('Top Skills', H_SIDE),
    l('Distributed Systems', SIDE),
    l('Payments', SIDE),
    l('Go', SIDE),
    h('Languages', H_SIDE),
    l('English (Native or Bilingual)', SIDE),
    l('Tamil (Native or Bilingual)', SIDE),
    h('Certifications', H_SIDE),
    l('AWS Certified Solutions Architect –', SIDE),
    l('Professional', SIDE),
    l('Certified Kubernetes Administrator', SIDE),
    h('Honors-Awards', H_SIDE),
    l('Engineering Excellence Award', SIDE),
    h('Publications', H_SIDE),
    l('Idempotency at Scale: Lessons from', SIDE),
    l('a Payments Ledger', SIDE),
  ] as Flow,
  main: [
    l('Priya Raman', NAME),
    l('Principal Engineer at Northwind Payments | Distributed systems,', HEADLINE, 6),
    l('payments infrastructure and platform reliability', HEADLINE),
    l('Bengaluru, Karnataka, India', LOCATION, 4),
    h('Summary'),
    l('I build the systems that move money reliably. For fourteen years I have'),
    l('designed payment platforms that stay correct under partial failure.'),
    l('Today I lead a platform group of 40 engineers across three countries.', BODY, 9),
    l('If you are hiring for payments infrastructure, message me here.'),
    h('Experience'),
    l('Northwind Payments', COMPANY),
    l('6 years 4 months', BODY),
    l('Principal Engineer', TITLE, 4),
    l(['March 2023 - Present ', '(3 years 8 months)'], BODY),
    l('Bengaluru, Karnataka, India', BODY),
    l('Lead the ledger and settlement platform. Cut reconciliation breaks by 92%'),
    l('and moved settlement from T+2 to same-day for 11 markets.'),
    l('Staff Engineer', TITLE, 8),
    l(['January 2021 - February 2023 ', '(2 years 2 months)'], BODY),
    l('Designed the idempotency layer now used by every payment service, removing'),
    l('duplicate charges worth $1.2M a year.'),
    l('Team of 14 engineers'),
    l('Senior Software Engineer', TITLE, 8),
    l(['July 2020 - December 2020 ', '(6 months)'], BODY),
    l('Migrated card authorisation to an event-sourced design with zero downtime.'),
    l('Globex Logistics', COMPANY, 10),
    l('Senior Software Engineer', TITLE),
    l(['Mar 2015 - Jun 2020 ', '(5 years 4 months)'], BODY),
    l('Bengaluru, Karnataka, India', BODY),
    l('Built the routing engine that plans 300,000 deliveries a day, reducing'),
    'PAGE_BREAK',
    l('fleet distance by 18% and fuel spend by $4M annually.'),
    l('Kafka, Go, PostgreSQL'),
    l('Initech', COMPANY, 10),
    l('Software Engineer', TITLE),
    l(['August 2012 - February 2015 ', '(2 years 7 months)'], BODY),
    l('Shipped the billing export used by 2,000 enterprise customers.'),
    l('Hooli', COMPANY, 10),
    l('Graduate Engineer', TITLE),
    l(['June 2011 - July 2012 ', '(1 year 2 months)'], BODY),
    h('Education'),
    l('Indian Institute of Technology Madras', COMPANY),
    l('Bachelor of Technology - BTech, Computer Science and', BODY),
    l('Engineering · (2007 - 2011)', BODY),
    l('Stanford University', COMPANY, 6),
    l('Graduate Certificate, Distributed Systems · (2016 - 2017)', BODY),
  ] as Flow,
};

/**
 * No Summary heading at all — LinkedIn leaves an empty section out of the export,
 * so this person has no About. Two single-role employers, one page break landing
 * between a title and its dates, a sidebar holding only the LinkedIn URL and top
 * skills (so no contact route and no portfolio can be claimed).
 */
export const NO_SUMMARY = {
  left: [
    h('Contact', H_SIDE),
    l('www.linkedin.com/in/marcus-oyelaran', SIDE),
    l('(LinkedIn)', SIDE),
    h('Top Skills', H_SIDE),
    l('Customer Success', SIDE),
    l('Salesforce', SIDE),
    l('Account Management', SIDE),
  ] as Flow,
  main: [
    l('Marcus Oyelaran', NAME),
    l('Customer Success Manager', HEADLINE, 6),
    l('Greater Manchester Area', LOCATION, 4),
    h('Experience'),
    l('Brightline Software', COMPANY),
    l('Customer Success Manager', TITLE),
    'PAGE_BREAK',
    l(['September 2021 - Present ', '(5 years 2 months)'], BODY),
    l('Own renewals for a book of 60 mid-market accounts.'),
    l('Acme Retail', COMPANY, 10),
    l('Account Executive', TITLE),
    l(['Feb 2018 - Aug 2021 ', '(3 years 7 months)'], BODY),
    l('Manchester, England, United Kingdom', BODY),
    h('Education'),
    l('University of Leeds', COMPANY),
    l('BA, Economics · (2014 - 2017)', BODY),
  ] as Flow,
};

/**
 * A new graduate: education and certifications only. No Summary, no Experience,
 * no Top Skills — so all three are real absences, observed as empty.
 */
export const NEW_GRAD = {
  left: [
    h('Contact', H_SIDE),
    l('aiko.tanaka.dev@example.com', SIDE),
    l('www.linkedin.com/in/aiko-tanaka-', SIDE),
    l('4b2c19a7 (LinkedIn)', SIDE),
    l('aikotanaka.dev (Personal)', SIDE),
    h('Certifications', H_SIDE),
    l('Google Data Analytics Certificate', SIDE),
    l('Microsoft Certified: Azure', SIDE),
    l('Fundamentals', SIDE),
  ] as Flow,
  main: [
    l('Aiko Tanaka', NAME),
    l('Computer Science graduate | Data analysis and Python', HEADLINE, 6),
    l('Osaka, Osaka, Japan', LOCATION, 4),
    h('Education'),
    l('Osaka University', COMPANY),
    l("Bachelor's degree, Computer Science · (2022 - 2026)", BODY),
  ] as Flow,
};

/** Something that is not a LinkedIn export at all — a plain one-column résumé. */
export const NOT_LINKEDIN = {
  left: [] as Flow,
  main: [
    l('Jordan Smith', 20),
    l('Résumé', 14),
    l('Work history', 13, 10),
    l('Barista, Bean There, 2019 - 2021'),
    l('Served coffee and trained new staff on the espresso machine.'),
  ] as Flow,
};

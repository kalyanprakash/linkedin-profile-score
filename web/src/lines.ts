/**
 * Text primitives shared by the two web importers (PDF and paste).
 *
 * Both importers read the same kinds of line — date ranges, durations, places —
 * and the point of sharing them is that a profile pasted from the PDF and the same
 * PDF uploaded should come out the same, rather than drift as one regex gets fixed
 * and its twin does not.
 */

const MONTH =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|' +
  'Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const YEAR = '(?:19|20)\\d{2}';
/** "January 2019", "Mar 2015", "03/2015", "2015". */
const POINT = `(?:${MONTH}\\s+${YEAR}|\\d{1,2}/${YEAR}|${YEAR})`;
const END = `(?:Present|Current|Now|${POINT})`;
const RANGE_SRC = `(${POINT})\\s*(?:[-–—]|to)\\s*(${END})`;

/** A date range anywhere in a line. Group 1 is the start, group 2 the end. */
export const DATE_RANGE = new RegExp(RANGE_SRC, 'i');

/**
 * A line that is nothing but a LinkedIn PDF date range, with its optional
 * duration: "January 2019 - Present (5 years 10 months)". Anchored at both ends —
 * in the PDF the date is always a line of its own, so a range buried in prose
 * ("from 2015 - 2018 I led…") must not start a new role.
 */
export const PDF_DATE_LINE = new RegExp(`^${RANGE_SRC}\\s*(?:\\(([^)]*)\\))?$`, 'i');

/**
 * A line holding only a duration, which in the PDF is a multi-role employer's
 * total tenure ("5 years 2 months") and on the live page reads "3 yrs 10 mos".
 * Optionally led by an employment type, as the web copy renders it
 * ("Full-time · 5 yrs 2 mos").
 */
export const DURATION_ONLY =
  /^(?=.*(?:\d|less than a year))(?:(?:Full-time|Part-time|Contract|Internship|Freelance|Self-employed|Permanent|Seasonal|Apprenticeship)\s*·\s*)?(?:less than a year|(?:\d+\s*(?:years?|yrs?))?\s*(?:\d+\s*(?:months?|mos?))?)$/i;

/**
 * Employment-type chips, LinkedIn's "Show all" links and its skills row: metadata,
 * never a title or a description.
 *
 * Anchored tightly, because whatever matches here is dropped from a description.
 * An employment type must stand alone or lead a "· duration" chip — a looser
 * prefix match ate "Contract negotiations with 40 suppliers" as metadata — and
 * the skills row is a list, never a sentence.
 */
export const META_LINE =
  /^(?:Full-time|Part-time|Contract|Internship|Freelance|Self-employed|Permanent|Seasonal|Apprenticeship)(?:\s*·[^.!?]*)?$|^Show all \d+\b[^.!?]*$|^Skills:\s[^.!?]*$/i;

/**
 * Countries as LinkedIn writes them in a location, plus the few other endings a
 * pasted résumé uses. A location's last part is one of these (or an "… Area"),
 * which is what separates "Bengaluru, Karnataka, India" from "Kafka, Go,
 * PostgreSQL" — capitalised, comma-separated words alone cannot.
 */
const PLACE_ENDINGS = new Set([
  'afghanistan', 'albania', 'algeria', 'andorra', 'angola', 'argentina', 'armenia', 'australia', 'austria',
  'azerbaijan', 'bahamas', 'bahrain', 'bangladesh', 'barbados', 'belarus', 'belgium', 'belize', 'benin',
  'bhutan', 'bolivia', 'bosnia and herzegovina', 'botswana', 'brazil', 'brunei', 'bulgaria', 'burkina faso',
  'burundi', 'cambodia', 'cameroon', 'canada', 'cape verde', 'chad', 'chile', 'china', 'colombia', 'congo',
  'costa rica', "côte d'ivoire", 'croatia', 'cuba', 'cyprus', 'czechia', 'czech republic', 'denmark',
  'djibouti', 'dominican republic', 'ecuador', 'egypt', 'el salvador', 'estonia', 'eswatini', 'ethiopia',
  'fiji', 'finland', 'france', 'gabon', 'gambia', 'georgia', 'germany', 'ghana', 'greece', 'guatemala',
  'guinea', 'guyana', 'haiti', 'honduras', 'hong kong', 'hong kong sar', 'hungary', 'iceland', 'india',
  'indonesia', 'iran', 'iraq', 'ireland', 'israel', 'italy', 'jamaica', 'japan', 'jordan', 'kazakhstan',
  'kenya', 'kosovo', 'kuwait', 'kyrgyzstan', 'laos', 'latvia', 'lebanon', 'lesotho', 'liberia', 'libya',
  'liechtenstein', 'lithuania', 'luxembourg', 'macao', 'madagascar', 'malawi', 'malaysia', 'maldives', 'mali',
  'malta', 'mauritania', 'mauritius', 'mexico', 'moldova', 'monaco', 'mongolia', 'montenegro', 'morocco',
  'mozambique', 'myanmar', 'namibia', 'nepal', 'netherlands', 'the netherlands', 'new zealand', 'nicaragua',
  'niger', 'nigeria', 'north macedonia', 'norway', 'oman', 'pakistan', 'palestine', 'panama',
  'papua new guinea', 'paraguay', 'peru', 'philippines', 'poland', 'portugal', 'puerto rico', 'qatar',
  'romania', 'russia', 'russian federation', 'rwanda', 'saudi arabia', 'senegal', 'serbia', 'seychelles',
  'sierra leone', 'singapore', 'slovakia', 'slovenia', 'somalia', 'south africa', 'south korea', 'korea',
  'south sudan', 'spain', 'sri lanka', 'sudan', 'suriname', 'sweden', 'switzerland', 'syria', 'taiwan',
  'tajikistan', 'tanzania', 'thailand', 'togo', 'trinidad and tobago', 'tunisia', 'turkey', 'türkiye',
  'turkmenistan', 'uganda', 'ukraine', 'united arab emirates', 'united kingdom', 'united states', 'uruguay',
  'uzbekistan', 'venezuela', 'vietnam', 'yemen', 'zambia', 'zimbabwe',
  'uk', 'usa', 'us', 'uae', 'england', 'scotland', 'wales', 'northern ireland',
]);

/** One word of a place name: capitalised words, short codes, and the connectives place names use. */
const PLACE_WORD = /^(?:\p{Lu}[\p{Ll}'’.]*(?:-\p{L}[\p{Ll}'’.]*)*|\p{Lu}{2,3}|de|la|le|del|di|da|do|dos|of|upon|on|am|im|an|der|den|du|des|y|e|el|al|and|sur)$/u;

/**
 * Reads as a place. Only ever applied where a location is expected — straight
 * after a role's dates, or at the end of the header — and strict even there,
 * because a line it accepts is removed from a description.
 */
export function isPlace(raw: string): boolean {
  const line = raw.replace(/\s*·\s*(?:On-site|Hybrid|Remote)$/i, '').trim();
  if (!line || line.length > 70) return false;
  if (/^(?:Remote|On-site|Hybrid)$/i.test(line)) return true;
  if (/[\d@#+/|:;!?()&]/.test(line)) return false;
  const parts = line.split(/\s*,\s*/);
  if (parts.length > 3 || parts.some((p) => !p || !p.split(/\s+/).every((w) => PLACE_WORD.test(w)))) return false;
  const last = parts[parts.length - 1];
  if (/^Greater\s/.test(parts[0]) || /\s(?:Area|Region|Metroplex)$/.test(last)) return true;
  // "Austin, TX" — a two-letter code ends a résumé-style two-part location.
  if (parts.length === 2 && /^\p{Lu}{2}$/u.test(last)) return true;
  return PLACE_ENDINGS.has(last.toLowerCase());
}

/**
 * Words that mark a degree rather than a school. Used only where the layout gives
 * no better signal — the PDF's degree line normally ends "· (2011 - 2015)", which
 * is a far stronger anchor than any vocabulary.
 */
export const DEGREE_WORDS =
  /\b(?:Bachelor|Master|Doctor|Associate|Diploma|Certificate|Degree|Ph\.?D|M\.?B\.?A|B\.?Sc|M\.?Sc|B\.?S|M\.?S|B\.?A|M\.?A|B\.?Tech|M\.?Tech|B\.?E|M\.?E|BEng|MEng|LL\.?B|LL\.?M|GCSE|A-Levels?)\b/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Mar 2015" / "03/2015" / "2015" → months since year 0, or null. */
export function monthIndex(token: string): number | null {
  const named = new RegExp(`(${MONTH})\\s+(${YEAR})`, 'i').exec(token);
  if (named) {
    const m = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase());
    if (m >= 0) return Number(named[2]) * 12 + m;
  }
  const numeric = new RegExp(`(\\d{1,2})/(${YEAR})`).exec(token);
  if (numeric) return Number(numeric[2]) * 12 + Math.min(11, Math.max(0, Number(numeric[1]) - 1));
  const year = new RegExp(YEAR).exec(token);
  return year ? Number(year[0]) * 12 : null;
}

/**
 * "5 years 10 months" / "3 yrs 10 mos" / "1 year" → months. "less than a year"
 * becomes 1, the most it can safely be taken to mean for span arithmetic.
 */
export function durationMonths(text: string | undefined): number | null {
  if (!text) return null;
  if (/less than a year/i.test(text)) return 1;
  const y = /(\d+)\s*(?:years?|yrs?)\b/i.exec(text);
  const m = /(\d+)\s*(?:months?|mos?)\b/i.exec(text);
  if (!y && !m) return null;
  return (y ? Number(y[1]) * 12 : 0) + (m ? Number(m[1]) : 0);
}

export function isCurrent(range: string | undefined): boolean {
  return /\b(?:present|current|now)\b/i.test(range ?? '');
}

export function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Looks like the tail of a paragraph rather than an employer or a title.
 *
 * Used to break ties where layout alone cannot: the line above a role title is
 * either the employer or the last line of the previous role's description.
 * Company suffixes ending in a full stop ("Acme Inc.") are names, not sentences.
 */
export function looksLikeProse(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^[•▪◦·*–-]\s/.test(t)) return true;
  if (/^[a-z]/.test(t)) return true;
  if (t.split(/\s+/).length >= 12 || t.length > 70) return true;
  if (/\b(?:Inc|Ltd|Co|Corp|LLC|L\.L\.C|S\.A|GmbH|Pvt|PLC|LLP)\.$/i.test(t)) return false;
  return /[.!?;:,]$/.test(t);
}

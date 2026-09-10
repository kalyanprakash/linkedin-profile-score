/** Shared text primitives. Deterministic, no inference, no network. */

/** Piecewise-linear partial credit: 0 at or below `lo`, 1 at or above `hi`. */
export function ramp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return 0;
  if (hi === lo) return value >= hi ? 1 : 0;
  return clamp01((value - lo) / (hi - lo));
}

/** Full credit inside [lo, hi], tapering to 0 at `floor` and `ceil`. */
export function plateau(value: number, floor: number, lo: number, hi: number, ceil: number): number {
  if (value < lo) return ramp(value, floor, lo);
  if (value > hi) return 1 - ramp(value, hi, ceil);
  return 1;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function words(s: string): string[] {
  return (s || '').trim().split(/\s+/).filter(Boolean);
}

export function sentences(s: string): string[] {
  return (s || '').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
}

/** LinkedIn truncates About at roughly 275 characters before "…see more". */
export const ABOUT_FOLD = 275;

export function aboveFold(s: string): string {
  return (s || '').slice(0, ABOUT_FOLD);
}

/**
 * Quantified claims: percentages, currency, multipliers, magnitudes, team sizes,
 * durations. Deliberately excludes bare years (2019) and version numbers.
 */
const QUANT_PATTERNS: RegExp[] = [
  /\b\d{1,3}(?:\.\d+)?\s?%/g,
  /[$€£]\s?\d[\d,.]*\s?(?:k|m|bn?|billion|million|thousand)?\b/gi,
  /\b\d+(?:\.\d+)?\s?x\b/gi,
  /\b\d[\d,]*\s?(?:k|m|bn)\b/gi,
  /\b\d{1,3}(?:,\d{3})+\b/g,
  /\b\d+\+?\s+(?:engineers?|people|customers?|users?|clients?|teams?|reports?|countries|markets|accounts?|hours?|days?|weeks?|months?|years?)\b/gi,
  /\b(?:from|to|by)\s+\d[\d,.]*\b/gi,
];

export function quantHits(s: string): string[] {
  const text = s || '';
  const out = new Set<string>();
  for (const re of QUANT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const hit = m[0].trim();
      if (/^(19|20)\d{2}$/.test(hit)) continue; // bare year
      out.add(hit);
    }
  }
  return [...out];
}

/** Verbs that describe a result. */
const OUTCOME_VERBS = [
  'led', 'built', 'scaled', 'grew', 'launched', 'shipped', 'reduced', 'cut', 'increased',
  'improved', 'drove', 'delivered', 'saved', 'accelerated', 'eliminated', 'migrated',
  'founded', 'created', 'designed', 'architected', 'turned around', 'doubled', 'tripled',
  'expanded', 'negotiated', 'recovered', 'automated', 'consolidated', 'unblocked',
];

/** Phrasing that describes a job description rather than an achievement. */
const DUTY_PHRASES = [
  'responsible for', 'duties included', 'worked on', 'helped with', 'involved in',
  'participated in', 'tasked with', 'assisted', 'in charge of', 'day to day',
  'day-to-day', 'various', 'etc.',
];

export function outcomeVerbCount(s: string): number {
  const t = (s || '').toLowerCase();
  // Allow common prefixes: "rebuilt" is as much an outcome as "built", but a bare
  // \b would never match it.
  return OUTCOME_VERBS.filter((v) => new RegExp(`\\b(?:re|over|out)?${v}\\b`).test(t)).length;
}

export function dutyPhraseCount(s: string): number {
  const t = (s || '').toLowerCase();
  return DUTY_PHRASES.filter((p) => t.includes(p)).length;
}

/**
 * Ways people actually end an About section with an invitation.
 *
 * Deliberately broad. This check is a blocking gap for the sales persona, which
 * multiplies the cost of a false negative: a narrow list capped the score of
 * profiles closing with "glad to hear from people working on ICU staffing" and
 * "happy to talk to anyone considering the same switch" — both unmistakably calls
 * to action. Prefer over-matching here; the cost of a miss is far higher than the
 * cost of crediting a weak invitation.
 */
const CTA_PATTERNS: RegExp[] = [
  // direct asks
  /\b(?:dm|message|email|write to|ping)\s+me\b|\bdrop\s+me\s+a\b/i,
  /\b(?:reach out|get in touch|say hello|say hi|let me know|look me up)\b/i,
  /\bcontact\b|\bconnect(?:\s+with\s+me)?\b/i,
  // invitations, including the indirect phrasings people actually use
  /\b(?:happy|glad|keen|delighted|always up)\s+to\s+\w+/i,
  /\b(?:love|like|happy)\s+to\s+(?:hear|talk|chat|connect|help)\b/i,
  /\bhear\s+from\s+(?:you|people|anyone|folks)\b/i,
  /\bfeel\s+free\s+to\b/i,
  /\bif\s+you(?:'re|\s+are)?\s+\w+[^.]{0,60}\b(?:message|reach|get in touch|talk|hear|contact)\b/i,
  // conversions
  /\b(?:sign up|subscribe|download|read more|learn more|apply|book a|schedule a)\b/i,
  // a route rather than a sentence
  /\bmailto:|@[\w.-]+\.\w{2,}\b/i,
  /https?:\/\/\S+/i,
];

export function hasCta(s: string): boolean {
  return CTA_PATTERNS.some((re) => re.test(s || ''));
}

/** Empty-calorie words that occupy space a searchable term could hold. */
const BUZZWORDS = [
  'passionate', 'results-driven', 'results driven', 'self-starter', 'go-getter',
  'thought leader', 'guru', 'ninja', 'rockstar', 'wizard', 'evangelist',
  'seasoned', 'dynamic', 'proven track record', 'detail-oriented', 'team player',
  'hard working', 'hard-working', 'synergy', 'visionary', 'strategic thinker',
];

export function buzzwordHits(s: string): string[] {
  const t = (s || '').toLowerCase();
  return BUZZWORDS.filter((b) => t.includes(b));
}

/**
 * LinkedIn's autofilled headline is "<Title> at <Company>" / "<Title> @ <Company>",
 * optionally with a pipe-separated afterthought. Detects that shape.
 */
export function isDefaultShapedHeadline(headline: string): boolean {
  const h = (headline || '').trim();
  if (!h) return false;
  const firstSegment = h.split('|')[0].trim();
  return /^[\w\s.,'&/-]{2,60}\s+(?:at|@)\s+[\w\s.,'&/-]{2,60}$/i.test(firstSegment);
}

export function uniqueLower(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

/** Token overlap between a corpus and a term list. Multi-word terms match as phrases. */
export function termCoverage(corpus: string, terms: string[]): { hit: string[]; miss: string[] } {
  const t = ` ${(corpus || '').toLowerCase().replace(/[^a-z0-9+#./\s-]/g, ' ').replace(/\s+/g, ' ')} `;
  const hit: string[] = [];
  const miss: string[] = [];
  for (const term of terms) {
    const needle = term.toLowerCase();
    (t.includes(` ${needle} `) || t.includes(` ${needle}s `) || t.includes(`${needle} `) ? hit : miss).push(term);
  }
  return { hit, miss };
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

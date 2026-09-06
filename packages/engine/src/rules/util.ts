import type { Profile } from '../types.ts';
import { uniqueLower } from '../text.ts';

/**
 * Did the extractor look at this field? Rules must abstain on unobserved input
 * rather than score it zero — that is the difference between "you have no banner"
 * and "we could not see your banner".
 */
export function saw(profile: Profile, field: string): boolean {
  if (!profile.observed) return true; // no manifest supplied: assume full extraction
  return profile.observed.includes(field);
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'at', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'by', 'my', 'our',
  'i', 'we', 'is', 'are', 'was', 'were', 'be', 'as', 'from', 'that', 'this', 'it', 'its',
  'you', 'your', 'me', 'am', 'have', 'has', 'had', 'will', 'can', 'or', 'but', 'not',
]);

const SUFFIXES = ['ements', 'ement', 'ments', 'ment', 'ings', 'ing', 'ers', 'er', 'ions', 'ion', 'es', 's'];

/**
 * Crude suffix stemmer, applied repeatedly until stable.
 *
 * A single pass is not enough and is actively wrong: "engineering" loses "ing"
 * to give "engineer" while "engineers" loses "ers" to give "engine", so the two
 * never match. Iterating collapses both to "engine".
 */
export function stem(token: string): string {
  let t = token.toLowerCase();
  for (let pass = 0; pass < 3; pass++) {
    const before = t;
    for (const suffix of SUFFIXES) {
      if (t.length > suffix.length + 3 && t.endsWith(suffix)) {
        t = t.slice(0, -suffix.length);
        break;
      }
    }
    if (t === before) break;
  }
  return t;
}

/**
 * Meaningful tokens: no stopwords, length > 2.
 *
 * Internal punctuation is kept so "node.js", "ci/cd" and "multi-region" survive,
 * but edge punctuation is trimmed — otherwise a sentence-final "engineers." never
 * matches "engineers" and every rule that compares terms silently under-reports.
 */
export function contentTokens(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[./-]+|[./-]+$/g, ''))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * The user's own vocabulary — role titles plus declared skills. Used instead of a
 * hardcoded keyword list so the rubric needs no vocabulary maintenance and stays
 * honest across industries.
 */
/**
 * Seniority and org-chart words. They appear in job titles but describe rank, not
 * expertise, so they are not terms anyone should be told to work into their prose.
 * Left in, they padded the denominator and produced advice like "write 'senior'
 * into your About".
 */
const SENIORITY_TOKENS = new Set([
  'senior', 'junior', 'staff', 'principal', 'lead', 'head', 'chief', 'director',
  'manager', 'vice', 'president', 'associate', 'assistant', 'executive', 'officer',
  'intern', 'deputy', 'global', 'regional', 'group', 'level', 'grade',
]);

export function candidateTerms(profile: Profile): string[] {
  const titles = (profile.experience || []).map((e) => e.title || '').filter(Boolean);
  // Only the top skills. LinkedIn orders these, and the top of the list is what
  // the person wants to be known for. Requiring all 25 to appear in prose would
  // make the check unwinnable, which is the failure mode this rubric exists to avoid.
  const skills = (profile.skills || []).slice(0, 8);
  const titleTokens = titles
    .flatMap((t) => contentTokens(t))
    .filter((t) => t.length > 3 && !SENIORITY_TOKENS.has(t));
  return uniqueLower([...skills, ...titleTokens]).slice(0, 12);
}

/**
 * Does `term` appear in `corpus`? A multi-word term counts when all of its content
 * tokens appear, stemmed — so "Platform Engineering" matches prose saying
 * "platform ... engineers". Strict phrase matching made real writing look like a miss.
 */
export function termPresent(corpus: string, term: string): boolean {
  const haystack = new Set(contentTokens(corpus).map(stem));
  const needles = contentTokens(term).map(stem);
  if (needles.length === 0) return false;
  return needles.every((n) => haystack.has(n));
}

export function splitTerms(corpus: string, terms: string[]): { hit: string[]; miss: string[] } {
  const haystack = new Set(contentTokens(corpus).map(stem));
  const hit: string[] = [];
  const miss: string[] = [];
  for (const term of terms) {
    const needles = contentTokens(term).map(stem);
    (needles.length > 0 && needles.every((n) => haystack.has(n)) ? hit : miss).push(term);
  }
  return { hit, miss };
}

/** Full searchable corpus: headline + about + every experience title and description. */
export function profileCorpus(profile: Profile): string {
  const exp = (profile.experience || [])
    .map((e) => [e.title, e.company, e.description].filter(Boolean).join(' '))
    .join(' ');
  return [profile.headline, profile.about, exp, (profile.skills || []).join(' ')]
    .filter(Boolean)
    .join(' \n ');
}

/**
 * Written prose only — About plus role descriptions. Excludes the headline, job
 * titles and the skills list, which is where candidate terms are harvested from.
 * Measuring reinforcement against the corpus that produced the terms is circular
 * and scores an empty profile perfectly.
 */
export function proseCorpus(profile: Profile): string {
  const descriptions = (profile.experience || []).map((e) => e.description || '').filter(Boolean);
  return [profile.about || '', ...descriptions].filter(Boolean).join(' \n ');
}

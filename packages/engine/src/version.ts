/**
 * The scoring rubric's version.
 *
 * Bump this whenever a change would move an unchanged profile's score: a new or
 * removed rule, a weight, a band boundary, a cap floor, a stage multiplier. Not
 * for wording, panel layout, or extractor fixes that read the same profile more
 * accurately — though a fix that genuinely reads more of the page is a judgement
 * call, and bumping is the safer answer.
 *
 * It exists because the panel shows people their own progress over time, and a
 * score that moved because the rubric changed is not progress. This profile went
 * from 57 to 49 in one afternoon when a lazy-loading bug was fixed; reporting that
 * to its owner as eight points lost would have been a lie the tool told itself
 * first. Readings are only ever compared within one version, so changing the
 * rubric restarts the comparison rather than fabricating a fall.
 *
 * Date-shaped rather than semver: the only question ever asked of it is "is this
 * the same rubric as that reading", and a date makes a stale entry obvious.
 */
export const RUBRIC_VERSION = '2026.09.18';

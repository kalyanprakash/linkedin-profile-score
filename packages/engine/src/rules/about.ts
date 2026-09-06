import { ABSTAIN, type Rule } from '../types.ts';
import {
  ABOUT_FOLD, aboveFold, buzzwordHits, hasCta, plateau, quantHits, ramp, sentences, words,
} from '../text.ts';
import { saw } from './util.ts';

/** LinkedIn's About field caps at 2,600 characters. */
const ABOUT_BUDGET = 2600;

/** Openers that burn the visible fold saying nothing. */
const WEAK_OPENERS = [
  /^i am an? (?:experienced|passionate|dedicated|motivated|results)/i,
  /^(?:experienced|seasoned|passionate|dynamic|dedicated) \w+ (?:professional|leader|manager|engineer)/i,
  /^with over \d+ years/i,
  /^i have (?:over |more than )?\d+ years/i,
  /^welcome to my (?:profile|page)/i,
  /^hi[,!]? i'?m /i,
];

export const aboutRules: Rule[] = [
  {
    id: 'about.present',
    dimension: 'About',
    title: 'About section exists',
    base: 6,
    evaluate({ profile }) {
      if (!saw(profile, 'about')) return ABSTAIN;
      const a = (profile.about || '').trim();
      return a
        ? { ratio: 1, observed: `${a.length} characters.`, reason: 'About section is present.' }
        : {
            ratio: 0,
            observed: 'About section is empty.',
            reason: 'About is the only place on the profile where you set your own framing in your own words.',
            fix: 'Write it. Even four sentences beats an empty section.',
          };
    },
  },

  {
    id: 'about.hook',
    dimension: 'About',
    title: 'The visible first lines earn the click on "see more"',
    base: 8,
    evaluate({ profile }) {
      if (!saw(profile, 'about')) return ABSTAIN;
      const a = (profile.about || '').trim();
      if (!a) return { ratio: 0, observed: 'No About section.', reason: 'Nothing above the fold.', fix: 'Write an About section.' };

      const fold = aboveFold(a);
      const weak = WEAK_OPENERS.some((re) => re.test(fold.trim()));
      const hasNumber = quantHits(fold).length > 0;
      const firstSentence = sentences(fold)[0] || '';
      const short = words(firstSentence).length <= 25;

      let ratio = 0.25;
      if (!weak) ratio += 0.35;
      if (hasNumber) ratio += 0.25;
      if (short) ratio += 0.15;
      ratio = Math.min(1, ratio);

      const notes: string[] = [];
      if (weak) notes.push('opens with a generic "experienced professional" line');
      if (!hasNumber) notes.push('no concrete number in the visible portion');
      if (!short) notes.push('first sentence runs long');

      return {
        ratio,
        observed: `First ${Math.min(ABOUT_FOLD, a.length)} characters: "${fold.slice(0, 140)}${fold.length > 140 ? '…' : ''}"`,
        reason: notes.length
          ? `LinkedIn collapses About after about ${ABOUT_FOLD} characters — ${notes.join('; ')}.`
          : 'The visible portion is specific and gives a reason to expand.',
        fix: ratio < 0.85
          ? 'Lead with a specific claim or number rather than a summary of your seniority. The first two lines are all most visitors read.'
          : undefined,
      };
    },
  },

  {
    id: 'about.quantified',
    dimension: 'About',
    title: 'About contains concrete numbers, not just adjectives',
    base: 7,
    evaluate({ profile }) {
      if (!saw(profile, 'about')) return ABSTAIN;
      const a = (profile.about || '').trim();
      if (!a) return { ratio: 0, observed: 'No About section.', reason: 'Nothing to measure.', fix: 'Write an About section.' };

      const hits = quantHits(a);
      const ratio = ramp(hits.length, 0, 4);
      return {
        ratio,
        observed: hits.length ? `${hits.length} quantified claim${hits.length === 1 ? '' : 's'}: ${hits.slice(0, 5).join(', ')}.` : 'No numbers found.',
        reason: 'Numbers are the cheapest credibility on the page and the hardest thing for anyone else to copy.',
        fix: ratio < 1 ? 'Add scale to your claims — team size, users served, time or cost saved, growth delivered.' : undefined,
      };
    },
  },

  {
    id: 'about.length',
    dimension: 'About',
    title: 'About is substantial without being a wall',
    base: 5,
    evaluate({ profile }) {
      if (!saw(profile, 'about')) return ABSTAIN;
      const a = (profile.about || '').trim();
      if (!a) return { ratio: 0, observed: 'No About section.', reason: 'Nothing to measure.', fix: 'Write an About section.' };
      const len = a.length;
      const ratio = plateau(len, 0, 600, 2000, ABOUT_BUDGET);
      return {
        ratio,
        observed: `${len} of ${ABOUT_BUDGET} characters.`,
        reason: len < 600
          ? 'Too short to establish much beyond the headline.'
          : len > 2000
            ? 'Long enough that most readers will stop early.'
            : 'Well within the range people actually finish.',
        fix: ratio < 1
          ? len < 600
            ? 'Aim for 600–2,000 characters — roughly three to six short paragraphs.'
            : 'Tighten toward 2,000 characters and move the detail into your experience entries.'
          : undefined,
      };
    },
  },

  {
    id: 'about.cta',
    dimension: 'About',
    title: 'About ends by telling the reader what to do',
    base: 5,
    evaluate({ profile }) {
      if (!saw(profile, 'about')) return ABSTAIN;
      const a = (profile.about || '').trim();
      if (!a) return { ratio: 0, observed: 'No About section.', reason: 'Nothing to measure.', fix: 'Write an About section.' };

      const tail = a.slice(-320);
      const inTail = hasCta(tail);
      const anywhere = hasCta(a);
      const ratio = inTail ? 1 : anywhere ? 0.5 : 0;
      return {
        ratio,
        observed: inTail
          ? 'Closing lines include a way to make contact.'
          : anywhere
            ? 'Contact details appear, but not at the end where the reader finishes.'
            : 'No call to action or contact route.',
        reason: 'A reader who has finished your About is the warmest visitor you get; without a next step they leave.',
        fix: ratio < 1 ? 'Close with one specific next step — what to message you about, or where to reach you.' : undefined,
      };
    },
  },

  {
    id: 'about.buzzwords',
    dimension: 'About',
    title: 'About avoids filler adjectives',
    base: 4,
    evaluate({ profile }) {
      if (!saw(profile, 'about')) return ABSTAIN;
      const a = (profile.about || '').trim();
      if (!a) return ABSTAIN; // absence of About is already penalised elsewhere
      const hits = buzzwordHits(a);
      const ratio = 1 - ramp(hits.length, 0, 4);
      return {
        ratio,
        observed: hits.length ? `${hits.length} filler phrase${hits.length === 1 ? '' : 's'}: ${hits.slice(0, 5).join(', ')}.` : 'No filler phrases found.',
        reason: 'Filler adjectives are unsearchable and self-assessed, so they cost space and return nothing.',
        fix: hits.length ? 'Replace each with the evidence that would make a reader draw that conclusion themselves.' : undefined,
      };
    },
  },
];

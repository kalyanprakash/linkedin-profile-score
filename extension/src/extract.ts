import type { Profile, Experience } from '../../packages/engine/src/types.ts';

/**
 * DOM extraction for linkedin.com/in/*.
 *
 * The only file that knows about LinkedIn's markup, and therefore the only one
 * that rots. Verified against the live DOM on 2026-09-06.
 *
 * LinkedIn now renders profiles with a server-driven UI. Sections are no longer
 * `div#about` / `div#experience` anchors inside their own `<section>`; they are
 * divs carrying a `componentkey` attribute whose suffix names the card, all
 * nested inside one outer `<section>`. Two consequences:
 *   - `closest('section')` returns the whole page and is useless here.
 *   - `innerText` returns "" on these cards even when they are visible and
 *     1,000px tall. Everything below uses `textContent`.
 *
 * Legacy selectors are kept as a fallback because the rollout may be partial.
 *
 * Contract with the engine: only list a field in `observed` when the section was
 * genuinely reachable. Guessing turns "we could not see it" into "you do not
 * have it", which is the failure mode this project exists to avoid.
 */

/** Card suffixes on the `componentkey` attribute. */
export const CARDS = {
  topcard: 'Topcard',
  about: 'About',
  featured: 'Featured',
  experience: 'ExperienceTopLevelSection',
  education: 'EducationTopLevelSection',
  skills: 'Skills',
  recommendations: 'RecommendationsTopLevel',
  locales: 'SupportedLocales',
  activity: 'Activity',
} as const;

/** Pre-SDUI anchors, for profiles not yet migrated. */
const LEGACY_ANCHOR: Partial<Record<keyof typeof CARDS, string>> = {
  about: 'about',
  featured: 'featured',
  experience: 'experience',
  education: 'education',
  skills: 'skills',
};

function card(name: keyof typeof CARDS): HTMLElement | null {
  const sdui = document.querySelector<HTMLElement>(`div[componentkey$="${CARDS[name]}"]`);
  if (sdui) return sdui;
  const legacyId = LEGACY_ANCHOR[name];
  if (legacyId) {
    const anchor = document.getElementById(legacyId);
    const section = anchor?.closest('section');
    if (section instanceof HTMLElement) return section;
  }
  return null;
}

/** textContent, whitespace-collapsed, with LinkedIn's truncation affordance removed. */
function T(el: Element | null | undefined): string {
  return (el?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .replace(/…\s*(?:see\s*)?more\s*$/i, '')
    .trim();
}

/** Drop the card's own heading ("About", "Experience", …) from its text. */
function body(el: Element | null, heading: string): string {
  const t = T(el);
  return t.startsWith(heading) ? t.slice(heading.length).trim() : t;
}

const DATE_RANGE = /\b(?:19|20)\d{2}\b.*?(?:Present|\b(?:19|20)\d{2}\b)|·\s*\d+\s*yrs?/i;
/** "Technical Leadership, Team Management and +2 skills" is a skills badge, not prose. */
const SKILLS_BADGE = /(?:\band\s*)?\+\d+\s*skills?$|^\s*[\w\s,]+\band\s\+\d+\s*skills?/i;
const LOCATION_ISH = /^[\w\s.'-]+,\s*[\w\s.'-]+(?:,\s*[\w\s.'-]+)?$|^Greater\s|\bArea$|\bRemote\b|·\s*(?:On-site|Hybrid|Remote)/i;
const META_ISH = /^(?:Full-time|Part-time|Contract|Internship|Freelance|Self-employed|Permanent)\b|^·$|^Show all|^Contact info$|^\d+\+?\s*(?:connections|followers)$/i;

/** Minimum characters before a leftover string counts as an actual description. */
const MIN_DESCRIPTION_CHARS = 25;

function parseExperience(root: HTMLElement | null): Experience[] | undefined {
  if (!root) return undefined;
  const items = [...root.querySelectorAll<HTMLElement>('li')];
  if (items.length === 0) return [];

  return items.map((li): Experience => {
    const texts = [...li.querySelectorAll<HTMLElement>('p, span, h3')]
      .map((n) => T(n))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);

    const title = texts[0];
    const dateRange = texts.find((t) => DATE_RANGE.test(t));

    // Whatever remains after removing the title, dates, location, employment-type
    // chips and skills badges is the only thing that can be a real description.
    const description = texts
      .filter((t) =>
        t !== title &&
        t !== dateRange &&
        !SKILLS_BADGE.test(t) &&
        !LOCATION_ISH.test(t) &&
        !META_ISH.test(t) &&
        t.length >= MIN_DESCRIPTION_CHARS)
      .join(' ')
      .trim();

    return {
      title,
      company: texts.find((t) => /·/.test(t) && !DATE_RANGE.test(t))?.split('·')[0].trim(),
      dateRange,
      description,
      current: /present/i.test(dateRange || ''),
    };
  });
}

/** "4mo" / "2w" / "3d" / "1yr" → days. */
function relativeToDays(token: string): number | null {
  const m = /^(\d+)\s*(m|h|d|w|mo|yr)$/i.exec(token.trim());
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case 'm': return 0;            // minutes
    case 'h': return 0;
    case 'd': return n;
    case 'w': return n * 7;
    case 'mo': return Math.round(n * 30.44);
    case 'yr': return n * 365;
    default: return null;
  }
}

function looksLikeBanner(img: HTMLImageElement): boolean {
  return /profile-background|profile-cover|companyBackground/i.test(img.src) || img.naturalWidth > 900;
}

export function extractProfile(): Profile {
  const observed: string[] = [];
  const profile: Profile = {};

  // ----------------------------------------------------------------- topcard
  const top = card('topcard');
  if (top) {
    profile.name = T(top.querySelector('h2')) || undefined;
    observed.push('name');

    // The headline is the first paragraph that is not pronouns, location,
    // current-company/school, connection count or the contact-info link.
    const paragraphs = [...top.querySelectorAll<HTMLElement>('p')].map((p) => T(p)).filter(Boolean);
    profile.headline =
      paragraphs.find(
        (t) =>
          t.length > 15 &&
          !/^(?:he|she|they)\//i.test(t) &&
          !META_ISH.test(t) &&
          !LOCATION_ISH.test(t),
      ) ?? '';
    observed.push('headline');

    const photo = [...top.querySelectorAll('img')].find((i) =>
      /profile-displayphoto|profile-framedphoto/i.test(i.src));
    profile.photo = photo
      ? {
          present: true,
          isDefault: /ghost/i.test(photo.src),
          // LinkedIn serves a framed avatar from a different path than a plain one.
          hasFrame: /profile-framedphoto/i.test(photo.src),
        }
      : { present: false };
    observed.push('photo');

    const topText = T(top);
    // Location is the top-card paragraph that reads as a place and is not the
    // current-company/school line.
    profile.location =
      paragraphs.find((t) => LOCATION_ISH.test(t) && !/·/.test(t) && t !== profile.headline) ?? '';
    observed.push('location');

    profile.contactInfoAvailable = /Contact info/i.test(topText);
    observed.push('contactInfoAvailable');

    if (/Open to work/i.test(topText)) {
      profile.openToWork = {
        active: true,
        publicToAll: /Open to work\s*·\s*Everyone on LinkedIn/i.test(topText),
      };
    } else {
      profile.openToWork = { active: false };
    }
    observed.push('openToWork');

    const banner = [...document.querySelectorAll('img')].find(looksLikeBanner);
    profile.banner = banner
      ? { present: true, isDefault: /ghost|aero-v1\/sc\/h\//i.test(banner.src) }
      : { present: false };
    observed.push('banner');
  }

  // ------------------------------------------------------------------- about
  const aboutCard = card('about');
  if (aboutCard) {
    profile.about = body(aboutCard, 'About');
    observed.push('about');
  }

  // -------------------------------------------------------------- experience
  const experience = parseExperience(card('experience'));
  if (experience) {
    profile.experience = experience;
    observed.push('experience');
  }

  // --------------------------------------------------------------- education
  const educationCard = card('education');
  if (educationCard) {
    const items = [...educationCard.querySelectorAll<HTMLElement>('li')];
    if (items.length) {
      profile.education = items.map((li) => {
        const parts = [...li.querySelectorAll<HTMLElement>('p, span, h3')].map((n) => T(n)).filter(Boolean);
        return { school: parts[0], degree: parts[1] };
      });
    } else {
      // Same shape as the Skills card: no <li>, entries are anchors/paragraphs.
      const EDU_META = /^Education$|^Show all|^[A-Z][a-z]{2}\s\d{4}\s*[–-]/;
      const names = [...educationCard.querySelectorAll<HTMLElement>('a, h3')]
        .map((n) => T(n))
        .filter((t) => t && t.length < 90 && !EDU_META.test(t))
        .filter((t, i, a) => a.indexOf(t) === i);
      profile.education = names.map((school) => ({ school }));
    }
    observed.push('education');
  }

  // ------------------------------------------------------------------ skills
  const skillsCard = card('skills');
  if (skillsCard) {
    const raw = T(skillsCard);
    const declared = Number(/Skills\s*\((\d+)\)/i.exec(raw)?.[1] ?? NaN);
    // This card renders no <li>. Names are anchors/paragraphs interleaved with
    // "N experiences at …" provenance rows and a "Show all" link.
    const SKILL_META = /^\d+\s+experiences?\b|^Show all|^Skills\s*\(/i;
    const names = [...skillsCard.querySelectorAll<HTMLElement>('a, p, h3')]
      .map((n) => T(n))
      .filter((t) => t && t.length < 60 && !SKILL_META.test(t))
      .filter((t, i, a) => a.indexOf(t) === i);
    profile.skills = names;
    if (Number.isFinite(declared)) profile.skillsDeclaredCount = declared;
    observed.push('skills');
  }

  // ---------------------------------------------------------------- featured
  const featuredCard = card('featured');
  if (featuredCard) {
    const items = [...featuredCard.querySelectorAll<HTMLElement>('li')];
    profile.featured = items.map((li) => ({
      title: T(li).slice(0, 120),
      url: li.querySelector('a')?.href,
      hasCustomThumbnail: !!li.querySelector('img'),
    }));
    observed.push('featured');
  }

  // --------------------------------------------------------- recommendations
  const recCard = card('recommendations');
  if (recCard) {
    const received = Number(/Received\s*\((\d+)\)/i.exec(T(recCard))?.[1] ?? NaN);
    if (Number.isFinite(received)) {
      profile.recommendationsReceived = received;
      observed.push('recommendationsReceived');
    }
  }

  // ---------------------------------------------------------------- activity
  const activityCard = card('activity');
  if (activityCard) {
    const text = T(activityCard);
    // `textContent` runs adjacent elements together ("Visit my website" + "4mo"
    // becomes "website4mo"), so a leading \b never matches. LinkedIn renders post
    // timestamps as "4mo •", so anchor on that bullet; fall back to a looser scan
    // only if the card carries no bullets at all.
    const stamped = [...text.matchAll(/(\d+)\s?(mo|yr|[wdhm])\s*[•·]/gi)].map((m) => `${m[1]}${m[2]}`);
    const loose = [...text.matchAll(/(?<!\d)(\d+)\s?(mo|yr|[wdhm])(?![a-z])/gi)].map((m) => `${m[1]}${m[2]}`);
    const tokens = stamped.length ? stamped : loose;
    const days = tokens.map(relativeToDays).filter((d): d is number => d !== null);
    profile.activity = {
      lastPostDaysAgo: days.length ? Math.min(...days) : null,
      postsLast30d: days.filter((d) => d <= 30).length,
    };
    observed.push('activity');
  }

  // ------------------------------------------------------------- vanity URL
  profile.customUrl = !/\/in\/[^/]*-[0-9a-f]{6,}\/?$/i.test(location.pathname);
  observed.push('customUrl');

  profile.observed = observed;
  return profile;
}

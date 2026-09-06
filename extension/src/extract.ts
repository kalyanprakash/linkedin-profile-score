import type { Profile, Experience } from '../../packages/engine/src/types.ts';

/**
 * DOM extraction for linkedin.com/in/*.
 *
 * This is the only part of the project that knows about LinkedIn's markup, and
 * therefore the only part that rots. Every selector lives in SELECTORS so a DOM
 * change is a one-file fix.
 *
 * Contract with the engine: only list a field in `observed` when we genuinely
 * looked at it and the section was reachable. Guessing here turns "we could not
 * see it" into "you do not have it", which is the failure mode this whole
 * project exists to avoid.
 */

export const SELECTORS = {
  topCard: 'section.artdeco-card:has(h1), .pv-top-card, main section:first-of-type',
  name: 'h1',
  headline: '[data-generated-suggestion-target], .text-body-medium.break-words',
  bannerImg: '#profile-background-image img, .profile-background-image img, .live-video-hero-image img',
  photoImg: 'img.pv-top-card-profile-picture__image, img.profile-photo-edit__preview',
  sectionAnchor: (id: string) => `div#${id}`,
  aboutSection: 'section:has(div#about)',
  experienceSection: 'section:has(div#experience)',
  skillsSection: 'section:has(div#skills)',
  featuredSection: 'section:has(div#featured)',
  listItems: 'ul > li',
  visuallyHidden: 'span[aria-hidden="true"]',
} as const;

/** LinkedIn's default background is served from a static ghost asset path. */
const DEFAULT_BANNER_HINTS = ['/aero-v1/sc/h/', 'profile-cover-photo', 'ghost'];
const DEFAULT_PHOTO_HINTS = ['ghost-person', 'aero-v1/sc/h/'];

function q(root: ParentNode, sel: string): HTMLElement | null {
  try {
    return root.querySelector<HTMLElement>(sel);
  } catch {
    return null; // :has() unsupported, or malformed selector
  }
}

function qa(root: ParentNode, sel: string): HTMLElement[] {
  try {
    return [...root.querySelectorAll<HTMLElement>(sel)];
  } catch {
    return [];
  }
}

/** LinkedIn duplicates every label for screen readers; take the visible copy once. */
function visibleText(el: Element | null): string {
  if (!el) return '';
  const preferred = el.querySelector('span[aria-hidden="true"]');
  const raw = (preferred?.textContent ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  // Collapse "Foo Foo" duplication that LinkedIn's a11y markup produces.
  const half = raw.slice(0, Math.floor(raw.length / 2)).trim();
  if (half && raw === `${half} ${half}`) return half;
  return raw;
}

function sectionFor(anchorId: string): HTMLElement | null {
  const anchor = document.getElementById(anchorId);
  return (anchor?.closest('section') as HTMLElement) ?? null;
}

function looksDefault(src: string | null | undefined, hints: string[]): boolean {
  if (!src) return true;
  return hints.some((h) => src.includes(h));
}

function extractExperience(section: HTMLElement | null): Experience[] | undefined {
  if (!section) return undefined;
  const items = qa(section, ':scope > div > ul > li');
  if (items.length === 0) return [];

  return items.map((li): Experience => {
    // Role entries render title, then company, then dates, then description blocks.
    const spans = qa(li, 'span[aria-hidden="true"]').map((s) => (s.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const title = spans[0];
    const company = spans[1]?.split('·')[0].trim();
    const dateRange = spans.find((s) => /\b(19|20)\d{2}\b|\bPresent\b/i.test(s));
    // Description lives in the nested sub-component, not in the header spans.
    const descEl = qa(li, '.inline-show-more-text, [class*="show-more-less-text"]');
    const description = descEl.map((d) => visibleText(d)).join('\n').trim();
    return {
      title,
      company,
      dateRange,
      description,
      current: /present/i.test(dateRange || ''),
    };
  });
}

export function extractProfile(): Profile {
  const observed: string[] = [];
  const profile: Profile = {};

  // ------------------------------------------------------------------ name
  const nameEl = q(document, 'main h1');
  if (nameEl) {
    profile.name = visibleText(nameEl);
    observed.push('name');
  }

  // -------------------------------------------------------------- headline
  const topCard = nameEl?.closest('section') ?? null;
  if (topCard) {
    const headlineEl = q(topCard, '.text-body-medium.break-words') ?? q(topCard, '[data-generated-suggestion-target]');
    profile.headline = headlineEl ? visibleText(headlineEl) : '';
    observed.push('headline');
  }

  // ----------------------------------------------------------------- about
  const aboutSection = sectionFor('about');
  if (aboutSection) {
    const body = q(aboutSection, '.inline-show-more-text') ?? q(aboutSection, ':scope > div:last-child');
    profile.about = body ? visibleText(body) : '';
    observed.push('about');
  }

  // ------------------------------------------------------------ experience
  const expSection = sectionFor('experience');
  const experience = extractExperience(expSection);
  if (experience) {
    profile.experience = experience;
    observed.push('experience');
  }

  // ---------------------------------------------------------------- skills
  const skillsSection = sectionFor('skills');
  if (skillsSection) {
    profile.skills = qa(skillsSection, ':scope > div > ul > li')
      .map((li) => visibleText(q(li, 'span[aria-hidden="true"]') ?? li))
      .filter(Boolean);
    observed.push('skills');
  }

  // -------------------------------------------------------------- featured
  const featuredSection = sectionFor('featured');
  if (featuredSection) {
    profile.featured = qa(featuredSection, ':scope > div > ul > li').map((li) => ({
      title: visibleText(q(li, 'span[aria-hidden="true"]') ?? li).slice(0, 120),
      url: (q(li, 'a') as HTMLAnchorElement | null)?.href,
      hasCustomThumbnail: !!q(li, 'img'),
    }));
    observed.push('featured');
  }

  // ------------------------------------------------------- banner and photo
  const bannerImg = q(document, SELECTORS.bannerImg) as HTMLImageElement | null;
  if (topCard) {
    profile.banner = bannerImg
      ? { present: true, isDefault: looksDefault(bannerImg.src, DEFAULT_BANNER_HINTS) }
      : { present: false };
    observed.push('banner');

    const photoImg = q(document, SELECTORS.photoImg) as HTMLImageElement | null;
    profile.photo = photoImg
      ? { present: true, isDefault: looksDefault(photoImg.src, DEFAULT_PHOTO_HINTS) }
      : { present: false };
    observed.push('photo');
  }

  // ------------------------------------------------------------ vanity URL
  profile.customUrl = !/\/in\/[^/]*-[0-9a-f]{6,}\/?$/i.test(location.pathname);
  observed.push('customUrl');

  // NOTE: activity and recommendations live on separate pages
  // (/recent-activity/all/ and /details/recommendations/). They are deliberately
  // left unobserved here so the engine reports a range rather than assuming zero.

  profile.observed = observed;
  return profile;
}

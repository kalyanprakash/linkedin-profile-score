/**
 * Synthetic LinkedIn profile markup.
 *
 * Modelled on the live DOM observed on 2026-09-06, deliberately synthetic so it
 * can live in a public repo — no real person's profile is reproduced here. Its
 * job is to catch our own refactors breaking extraction. Live drift needs a live
 * check; no saved fixture can provide that.
 *
 * Every structural oddity that has bitten us is encoded:
 *   - cards identified by a `componentkey` suffix, all inside ONE outer <section>
 *   - the name is an <h2>, not an <h1>
 *   - an employer with several roles renders a <div> header (logo + /company/
 *     link) with the roles as <li> beneath it
 *   - an employer with ONE role renders a single <div> block, title inline, and
 *     no <li> at all — the shape the extractor used to drop entirely
 *   - "Leadership, Delivery and +2 skills" sits exactly where a description would
 *   - the skills card renders no <li>; names are anchors interleaved with
 *     "N experiences at …" provenance rows and a "Show all" link
 *   - activity timestamps abut the preceding text ("website4mo") because
 *     textContent runs adjacent elements together
 */

export interface FixtureOptions {
  withAbout?: boolean;
  withSkills?: boolean;
  withFeatured?: boolean;
  withRecommendations?: boolean;
  withEducation?: boolean;
  withExperience?: boolean;
  /** Omit the /company/ link on the second employer. */
  unlinkedSecondEmployer?: boolean;
  framedPhoto?: boolean;
  openToWork?: boolean;
  banner?: boolean;
}

const URN = 'refACoAAAxxxxYYYYzzzz';
const key = (suffix: string) => `com.linkedin.sdui.profile.card.${URN}Ut0${suffix}`;

function card(suffix: string, inner: string): string {
  return `<div class="c" componentkey="${key(suffix)}" id="${key(suffix)}">${inner}</div>`;
}

/** An employer with more than one role: div header, roles as <li>. */
function groupedEmployer(company: string, companyId: string, roles: string[], linked = true): string {
  const head = linked
    ? `<a href="/company/${companyId}/"><img src="https://media.licdn.com/dms/image/company-logo_100_100/x"><span>${company}</span></a>`
    : `<span>${company}</span>`;
  return `
    <div class="employer">
      <p>${head}</p>
      <p>Full-time · 7 yrs 5 mos</p>
      <ul>${roles.join('')}</ul>
    </div>`;
}

function groupedRole(title: string, dates: string, location: string, description?: string): string {
  return `<li>
    <p><span>${title}</span></p>
    <p><span>${dates}</span></p>
    <p><span>${location}</span></p>
    ${description ? `<p><span>${description}</span></p>` : '<p><span>Leadership, Delivery and +2 skills</span></p>'}
  </li>`;
}

/**
 * An employer with exactly one role: a single div, title inline with the company,
 * no <li> anywhere. This is the shape a `querySelectorAll('li')` extractor misses.
 */
function singleRoleEmployer(
  title: string, company: string, companyId: string, dates: string,
  location: string, description?: string, linked = true,
): string {
  const logo = linked
    ? `<a href="/company/${companyId}/"><img src="https://media.licdn.com/dms/image/company-logo_100_100/y"></a>`
    : '';
  return `
    <div class="single-role">
      ${logo}
      <p><span>${title}</span></p>
      <p><span>${company}</span></p>
      <p><span>${dates}</span></p>
      <p><span>${location}</span></p>
      ${description ? `<p><span>${description}</span></p>` : ''}
    </div>`;
}

export function buildProfileHtml(o: FixtureOptions = {}): string {
  const {
    withAbout = true, withSkills = true, withFeatured = true,
    withRecommendations = true, withEducation = true, withExperience = true,
    unlinkedSecondEmployer = false, framedPhoto = false,
    openToWork = false, banner = false,
  } = o;

  const photoSrc = framedPhoto
    ? 'https://media.licdn.com/dms/image/v2/AAA/profile-framedphoto-shrink_100_100/x'
    : 'https://media.licdn.com/dms/image/v2/AAA/profile-displayphoto-shrink_100_100/x';

  const topcard = card('Topcard', `
    <h2>Dana Okonkwo</h2>
    <p>She/Her</p>
    <p>Staff Platform Engineer @ Meridian Freight | Distributed systems and developer tooling</p>
    <p>Meridian Freight · Rivertown Institute of Technology</p>
    <p>Bristol, England, United Kingdom</p>
    <p>Contact info</p>
    <p>500+ connections</p>
    ${openToWork ? '<p>Open to work · Everyone on LinkedIn</p>' : ''}
    <img src="${photoSrc}">
  `);

  const bannerImg = banner
    ? '<img src="https://media.licdn.com/dms/image/profile-background-image/z">'
    : '';

  const about = withAbout ? card('About', `
    <h2>About</h2>
    <p>Our release train used to take eleven hours end to end. It takes twenty-two minutes now,
    and the on-call pager fires about a third as often. I build the platform underneath delivery
    teams: build systems, deployment, and the reliability practice around them. If you are
    untangling a monolith and the seams are showing, message me.… more</p>
  `) : '';

  const experience = withExperience ? card('ExperienceTopLevelSection', `
    <h2>Experience</h2>
    <ul>
      ${groupedEmployer('Meridian Freight', '1122334', [
        groupedRole('Staff Platform Engineer', 'Mar 2022 - Present · 3 yrs 6 mos', 'Bristol, England',
          'Own build, deploy and reliability for 40 engineers across 5 teams. Cut release time from 11 hours to 22 minutes and reduced paging volume 64%.'),
        groupedRole('Senior Platform Engineer', 'Jan 2020 - Mar 2022 · 2 yrs 2 mos', 'Bristol, England'),
      ])}
      ${groupedEmployer('Halden Logistics', '5566778', [
        groupedRole('Infrastructure Engineer', 'Jun 2017 - Dec 2019 · 2 yrs 6 mos', 'Remote'),
      ], !unlinkedSecondEmployer)}
    </ul>
    ${singleRoleEmployer('Systems Engineer', 'Corrán Data', '9900112',
      'Sep 2015 - Jun 2017 · 1 yr 9 mos', 'Cork, Ireland',
      'Ran the on-premise fleet and the migration off it.')}
    ${singleRoleEmployer('Support Engineer', 'Tinsmith Software', '3344556',
      'Aug 2013 - Sep 2015 · 2 yrs 1 mo', 'Cork, Ireland')}
  `) : '';

  // No <li> in this card: names are anchors, interleaved with provenance rows.
  const skills = withSkills ? card('Skills', `
    <h2>Skills (31)</h2>
    <a href="/search/x"><span>Distributed Systems</span></a>
    <p>3 experiences at Meridian Freight</p>
    <a href="/search/y"><span>Developer Tooling</span></a>
    <p>2 experiences at Meridian Freight and 1 other company</p>
    <a href="/details/skills/">Show all</a>
  `) : '';

  const featured = withFeatured ? card('Featured', `
    <h2>Featured</h2>
    <ul>
      <li><a href="/feed/update/1"><img src="https://media.licdn.com/x/thumb"><span>Cutting a release train from 11 hours to 22 minutes</span></a></li>
    </ul>
  `) : '';

  const education = withEducation ? card('EducationTopLevelSection', `
    <h2>Education</h2>
    <a href="/school/1"><span>Rivertown Institute of Technology</span></a>
    <p>BEng Computer Engineering</p>
    <p>Sep 2009 – Jun 2013</p>
  `) : '';

  const recommendations = withRecommendations ? card('RecommendationsTopLevel', `
    <h2>Recommendations</h2>
    <p>Received (3)</p><p>Given (1)</p>
  `) : '';

  // "…website4mo" reproduces textContent running adjacent nodes together.
  const activity = card('Activity', `
    <h2>Activity</h2>
    <p>2,104 followers</p>
    <p>Dana Okonkwo posted this</p><p>Visit my website</p><p>4mo • </p>
    <p>Dana Okonkwo posted this</p><p>7mo • </p>
  `);

  return `<main><section>
    ${topcard}${bannerImg}${about}${experience}${skills}${featured}${education}${recommendations}${activity}
  </section></main>`;
}

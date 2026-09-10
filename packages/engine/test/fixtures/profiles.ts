import type { Profile } from '../../src/types.ts';

/**
 * Real profile, as reported by linkedinrebuilt.com on 2026-09-05, which scored it 0/100.
 *
 * Only fields that report actually evidenced are marked observed. About, skills,
 * photo and recommendations were never surfaced, so they are left unobserved rather
 * than invented — the engine must abstain on them, not score them zero.
 */
export const kalyan: Profile = {
  name: 'Kalyan Dasika',
  headline: 'Software Development Manager @ Amazon Web Services | Engineering Management',
  customUrl: true,
  experience: [
    { title: 'Software Development Manager', company: 'Amazon Web Services', current: true, description: '' },
    { title: undefined, company: undefined, description: '' },
    { title: undefined, company: undefined, description: '' },
    { title: undefined, company: undefined, description: '' },
  ],
  featured: [],
  banner: { present: false, isDefault: false },
  activity: { lastPostDaysAgo: 131, postsLast30d: 0 },
  observed: ['headline', 'experience', 'featured', 'banner', 'activity', 'customUrl'],
};

/** A profile doing most things right. Guards against a rubric that can only score low. */
export const strong: Profile = {
  name: 'Test Strong',
  headline:
    'VP Engineering | Scaling platform teams from 10 to 100 engineers | Distributed systems, developer productivity, SRE',
  about: [
    'Three years ago our deploy pipeline took 4 hours and failed 30% of the time. We got it to 11 minutes at 99.4% success, and shipped 12x more often as a result.',
    '',
    'I build platform organisations: the internal tooling, the reliability practice, and the teams that own them. Over 14 years I have grown two platform groups from 10 to 100+ engineers, cut cloud spend by $8M annually, and taken three products from zero to general availability.',
    '',
    'What I care about: developer experience as a measurable discipline, incident review without blame, and hiring for slope over intercept.',
    '',
    'If you are scaling a platform team past 30 engineers and the seams are showing, message me — that is the problem I know best.',
  ].join('\n'),
  customUrl: true,
  experience: [
    {
      title: 'VP Engineering',
      company: 'Acme Cloud',
      current: true,
      description:
        'Own platform, infrastructure and developer productivity across 6 teams and 84 engineers. Cut median deploy time from 4 hours to 11 minutes and raised change success to 99.4%. Reduced annual cloud spend by $8M while traffic grew 3x. Built the SRE practice from scratch and drove incident MTTR down 62% in 18 months.',
    },
    {
      title: 'Director of Engineering',
      company: 'Northwind',
      description:
        'Grew the platform org from 12 to 45 engineers across 4 teams. Launched the internal service catalogue now used by 900 developers. Delivered the multi-region migration 6 weeks early with zero customer-visible downtime.',
    },
    {
      title: 'Senior Engineering Manager',
      company: 'Northwind',
      description:
        'Led 3 teams building the billing platform, processing $1.2B annually. Reduced invoice defects by 78% and shipped the usage-metering rewrite that unblocked 4 new pricing models.',
    },
  ],
  skills: [
    'Distributed Systems', 'Platform Engineering', 'Site Reliability Engineering', 'Kubernetes',
    'Developer Productivity', 'Engineering Management', 'Cloud Infrastructure', 'AWS', 'Go',
    'Observability', 'Incident Management', 'Technical Strategy', 'Hiring', 'Cost Optimization',
    'Microservices', 'CI/CD', 'Terraform', 'Postgres', 'Team Building', 'Organisational Design',
    'Product Strategy', 'Mentoring', 'System Design', 'Capacity Planning', 'Multi-region Architecture',
  ],
  featured: [
    { kind: 'link', title: 'How we cut deploy time 20x', url: 'https://example.com/deploys', hasCustomThumbnail: true },
    { kind: 'post', title: 'Platform team operating model', url: 'https://example.com/platform', hasCustomThumbnail: true },
  ],
  banner: { present: true, isDefault: false },
  photo: { present: true, isDefault: false },
  recommendationsReceived: 7,
  activity: { lastPostDaysAgo: 5, postsLast30d: 6 },
  employerCount: 2,
  linkedEmployers: 2,
  location: 'Amsterdam, Netherlands',
  contactInfoAvailable: true,
  education: [{ school: 'Delft University of Technology', degree: 'MSc Computer Science' }],
  observed: ['headline', 'about', 'experience', 'skills', 'featured', 'banner', 'photo', 'activity', 'customUrl', 'recommendationsReceived', 'location', 'contactInfoAvailable', 'education', 'employerCount'],
};

/** Everything visible, everything empty. The genuine floor. */
export const empty: Profile = {
  name: 'Test Empty',
  headline: '',
  about: '',
  customUrl: false,
  experience: [],
  skills: [],
  featured: [],
  banner: { present: false },
  photo: { present: false },
  recommendationsReceived: 0,
  activity: { lastPostDaysAgo: null, postsLast30d: 0 },
  location: '',
  contactInfoAvailable: false,
  education: [],
  employerCount: 0,
  linkedEmployers: 0,
  observed: ['headline', 'about', 'experience', 'skills', 'featured', 'banner', 'photo', 'activity', 'customUrl', 'recommendationsReceived', 'location', 'contactInfoAvailable', 'education'],
};

/** Median case: complete but unremarkable. Should land mid-range, not at either extreme. */
export const median: Profile = {
  name: 'Test Median',
  headline: 'Senior Software Engineer at Contoso',
  about:
    'Experienced software professional with over 10 years of experience building web applications. Passionate about clean code and team player with a proven track record. Skilled in Java, Spring, and cloud technologies.',
  customUrl: true,
  experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Contoso',
      current: true,
      description:
        'Responsible for developing and maintaining backend services for the payments team. Worked on API design and helped with code reviews and mentoring junior developers on the team.',
    },
    { title: 'Software Engineer', company: 'Contoso', description: '' },
    { title: 'Software Engineer', company: 'Fabrikam', description: '' },
  ],
  skills: ['Java', 'Spring', 'AWS', 'REST APIs', 'SQL', 'Git', 'Docker'],
  featured: [],
  banner: { present: false },
  photo: { present: true },
  recommendationsReceived: 1,
  activity: { lastPostDaysAgo: 60, postsLast30d: 0 },
  employerCount: 2,
  linkedEmployers: 1,
  location: 'Manchester, United Kingdom',
  contactInfoAvailable: false,
  education: [{ school: 'University of Manchester', degree: 'BSc' }],
  observed: ['headline', 'about', 'experience', 'skills', 'featured', 'banner', 'photo', 'activity', 'customUrl', 'recommendationsReceived', 'location', 'contactInfoAvailable', 'education', 'employerCount'],
};

/**
 * The same person, read from the live LinkedIn DOM on 2026-09-06 — everything
 * visible, nothing inferred. Kept alongside `kalyan` (the partial scrape) so the
 * pair shows what full extraction is worth.
 *
 * Two of linkedinrebuilt.com's findings are contradicted by the page itself:
 * it reported the Featured section empty (there is a featured post) and reported
 * four roles (there are six).
 */
export const kalyanLive: Profile = {
  name: 'Kalyan Dasika',
  headline: 'Software Development Manager @ Amazon Web Services | Engineering Management',
  about:
    'With over 15 years of experience at Amazon, I currently serve as a Software Development Manager, ' +
    'focusing on engineering and team management. I lead initiatives that prioritize technical leadership ' +
    "and collaboration, enabling teams to deliver impactful solutions aligned with AWS's mission to innovate " +
    'in cloud computing. My expertise lies in fostering high-performing teams and driving strategic goals ' +
    'through technical excellence, while maintaining a commitment to supporting professional growth and ' +
    'delivering value to our customers.',
  customUrl: true,
  experience: [
    { title: 'Software Development Manager', company: 'Amazon Web Services (AWS)', dateRange: 'Apr 2021 - Present', current: true, description: '' },
    { title: 'Software Development Manager', company: 'Amazon Web Services (AWS)', dateRange: 'May 2019 - Apr 2021', description: '' },
    { title: 'SDE II', company: 'Amazon Web Services (AWS)', dateRange: 'Oct 2017 - May 2019', description: '' },
    { title: 'Software Development Engineer', company: 'Amazon Web Services (AWS)', dateRange: 'Nov 2015 - Oct 2017', description: '' },
    { title: 'Support Engineer', company: 'Amazon Web Services (AWS)', dateRange: 'Apr 2013 - Nov 2015', description: 'Working as a Support Engineer in AWS Commerce platform.' },
    { title: 'Support Engineer', company: 'Amazon', dateRange: 'Oct 2010 - Apr 2013', description: 'Worked as Support Engineer in CBA.' },
  ],
  // 34 declared; LinkedIn only renders two names before "Show all".
  skills: ['Engineering Management', 'Team Management'],
  skillsDeclaredCount: 34,
  featured: [{ kind: 'post', title: 'The job market has been brutal lately…', hasCustomThumbnail: true }],
  banner: { present: false },
  photo: { present: true, isDefault: false, hasFrame: true },
  openToWork: { active: true, publicToAll: true },
  employerCount: 4,
  linkedEmployers: 4,
  location: 'Seattle, Washington, United States',
  contactInfoAvailable: true,
  education: [
    { school: 'Northwestern University - Kellogg School of Management', degree: 'Executive MBA' },
    { school: 'International Institute of Information Technology' },
  ],
  recommendationsReceived: 4,
  activity: { lastPostDaysAgo: 122, postsLast30d: 0 },
  observed: ['name', 'headline', 'about', 'experience', 'skills', 'featured', 'banner', 'photo', 'recommendationsReceived', 'activity', 'customUrl', 'location', 'contactInfoAvailable', 'education', 'employerCount'],
};

import type { Profile } from '../../src/types.ts';

/**
 * Calibration corpus.
 *
 * Every profile here is fabricated. Their job is to catch a rubric that works on
 * one shape of career and misjudges another — particularly the shapes a scoring
 * tool is most likely to punish unfairly: short tenures, changed direction, a
 * short history, and work outside tech.
 *
 * These are not aspirational. Each is a plausible, decent profile of its kind, so
 * a very low score here is a finding about the rubric, not about the person.
 */

const observedAll = [
  'name', 'headline', 'about', 'experience', 'skills', 'featured', 'banner', 'photo',
  'activity', 'customUrl', 'recommendationsReceived', 'location', 'contactInfoAvailable',
  'education', 'employerCount',
];

/** 12 short engagements. Tests recency weighting and ratios over many roles. */
export const contractor: Profile = {
  name: 'Contractor',
  headline: 'Freelance data engineer | Airflow, dbt, Snowflake | Short-notice pipeline rescue work',
  about:
    'I take over data pipelines that are on fire. Usually that means an Airflow deployment nobody owns, ' +
    'a warehouse bill that tripled, and a analytics team that stopped trusting the numbers. Twelve engagements ' +
    'in four years, average six months, three of them extended twice. Longest was 14 months rebuilding ingestion ' +
    'for a retail group moving 40M rows a day. If your pipelines are the bottleneck, message me — I can usually ' +
    'start within a fortnight.',
  location: 'Leeds, England, United Kingdom',
  customUrl: true,
  contactInfoAvailable: true,
  experience: Array.from({ length: 12 }, (_, i) => ({
    title: i % 3 === 0 ? 'Data Engineer (contract)' : 'Senior Data Engineer (contract)',
    company: `Client ${12 - i}`,
    dateRange: `${2021 + Math.floor(i / 4)} - ${2021 + Math.floor(i / 4)} · ${4 + (i % 6)} mos`,
    current: i === 0,
    description: i < 4
      ? 'Rebuilt the ingestion layer on Airflow and dbt, cut warehouse spend 38% and brought nightly runs from 6 hours to 40 minutes.'
      : '',
  })),
  skills: ['Airflow', 'dbt', 'Snowflake', 'Python', 'SQL', 'Data Engineering', 'ETL', 'Terraform'],
  skillsDeclaredCount: 28,
  featured: [{ kind: 'link', title: 'How I audit a broken pipeline in a day', hasCustomThumbnail: true }],
  education: [{ school: 'University of Leeds', degree: 'BSc Mathematics' }],
  employerCount: 12,
  linkedEmployers: 9,
  banner: { present: true, isDefault: false },
  photo: { present: true, isDefault: false },
  recommendationsReceived: 6,
  activity: { lastPostDaysAgo: 20, postsLast30d: 2 },
  observed: observedAll,
};

/** Teacher → bootcamp → junior developer. Two vocabularies, little overlap. */
export const careerChanger: Profile = {
  name: 'Career changer',
  headline: 'Junior Software Engineer | Former secondary school teacher | React, TypeScript, accessibility',
  about:
    'I taught secondary maths for nine years before retraining as a developer, and the classroom turned out to be ' +
    'better preparation than I expected: explaining a hard idea to thirty people who did not ask for it is most of ' +
    'code review. I now build front-end at a small health-tech company, mostly React and TypeScript, with a particular ' +
    'interest in accessibility. Happy to talk to anyone considering the same switch.',
  location: 'Cardiff, Wales, United Kingdom',
  customUrl: true,
  contactInfoAvailable: true,
  experience: [
    {
      title: 'Junior Software Engineer', company: 'Careloop', dateRange: 'Feb 2025 - Present', current: true,
      description: 'Build patient-facing React interfaces. Took the appointment booking flow from WCAG AA failures to a clean audit and cut drop-off 22%.',
    },
    {
      title: 'Teacher of Mathematics', company: 'Llandaff High School', dateRange: 'Sep 2015 - Dec 2024',
      description: 'Taught GCSE and A-level maths to classes of 30. Led the department’s numeracy intervention, which moved 60+ students up a grade band over two years.',
    },
  ],
  skills: ['React', 'TypeScript', 'Accessibility', 'JavaScript', 'CSS', 'Testing'],
  skillsDeclaredCount: 14,
  featured: [],
  education: [
    { school: 'School of Code', degree: 'Software Development Bootcamp' },
    { school: 'Cardiff University', degree: 'BSc Mathematics' },
  ],
  employerCount: 2,
  linkedEmployers: 2,
  banner: { present: false },
  photo: { present: true, isDefault: false },
  recommendationsReceived: 3,
  activity: { lastPostDaysAgo: 45, postsLast30d: 0 },
  observed: observedAll,
};

/** Outside tech entirely. Tests whether the rubric carries a domain bias. */
export const nurse: Profile = {
  name: 'Nurse',
  headline: 'Senior Charge Nurse, Critical Care | Sepsis pathways, clinical education, ICU staffing',
  about:
    'Sixteen years in critical care, the last six as charge nurse on a 22-bed ICU. I led our sepsis recognition ' +
    'pathway rollout, which cut time-to-antibiotics from 94 minutes to 41 and is now used across the trust. ' +
    'I also run the preceptorship programme for newly qualified staff — 40 nurses through it so far, retention at ' +
    '18 months up from 61% to 88%. Always glad to hear from people working on ICU staffing or clinical education.',
  location: 'Sheffield, England, United Kingdom',
  customUrl: true,
  contactInfoAvailable: true,
  experience: [
    {
      title: 'Senior Charge Nurse, Critical Care', company: 'Northern General Hospital', dateRange: 'Mar 2019 - Present', current: true,
      description: 'Lead a 22-bed ICU across three shift teams, 60 nursing staff. Rolled out the sepsis recognition pathway, reducing time-to-antibiotics from 94 to 41 minutes. Built the preceptorship programme now covering the whole directorate.',
    },
    {
      title: 'Staff Nurse, Intensive Care', company: 'Royal Hallamshire Hospital', dateRange: 'Aug 2010 - Mar 2019',
      description: 'ICU nursing across medical and surgical admissions. Trained as a practice assessor and mentored 20+ student nurses through placement.',
    },
  ],
  skills: ['Critical Care', 'Sepsis Management', 'Clinical Education', 'ICU', 'Patient Safety', 'Mentoring', 'Staff Development'],
  skillsDeclaredCount: 22,
  featured: [],
  education: [{ school: 'University of Sheffield', degree: 'BSc Adult Nursing' }],
  employerCount: 2,
  linkedEmployers: 2,
  banner: { present: false },
  photo: { present: true, isDefault: false },
  recommendationsReceived: 4,
  activity: { lastPostDaysAgo: 200, postsLast30d: 0 },
  observed: observedAll,
};

/** Strong About, blank roles. Tests whether prose can carry a score it shouldn't. */
export const aboutOnly: Profile = {
  name: 'About only',
  headline: 'Head of Growth | B2B SaaS | Took two products from £0 to £5M ARR',
  about:
    'Two products from nothing to £5M ARR, both B2B SaaS, both sold to operations teams who hate being sold to. ' +
    'The first took 31 months and a rebuild of the entire onboarding funnel; the second took 19, because we stopped ' +
    'guessing and interviewed 40 churned accounts before writing a line of copy. I run growth as a research function ' +
    'with a paid-acquisition budget attached, not the other way round. If you are pre-Series A and your funnel leaks ' +
    'somewhere you cannot name, message me.',
  location: 'Dublin, County Dublin, Ireland',
  customUrl: true,
  contactInfoAvailable: true,
  experience: [
    { title: 'Head of Growth', company: 'Fernwood', dateRange: 'Jan 2023 - Present', current: true, description: '' },
    { title: 'Growth Lead', company: 'Ballast', dateRange: 'Jun 2020 - Dec 2022', description: '' },
    { title: 'Marketing Manager', company: 'Ballast', dateRange: 'Feb 2019 - Jun 2020', description: '' },
  ],
  skills: ['Growth Marketing', 'B2B SaaS', 'Paid Acquisition', 'Funnel Optimisation', 'Positioning'],
  skillsDeclaredCount: 19,
  featured: [
    { kind: 'link', title: '40 churn interviews, one uncomfortable pattern', hasCustomThumbnail: true },
    { kind: 'post', title: 'Why we stopped running ads for six weeks', hasCustomThumbnail: true },
  ],
  education: [{ school: 'Trinity College Dublin', degree: 'BA Economics' }],
  employerCount: 2,
  linkedEmployers: 2,
  banner: { present: true, isDefault: false },
  photo: { present: true, isDefault: false },
  recommendationsReceived: 5,
  activity: { lastPostDaysAgo: 6, postsLast30d: 5 },
  observed: observedAll,
};

/** One internship, strong education, no network yet. Tests fairness to short histories. */
export const newGrad: Profile = {
  name: 'New grad',
  headline: 'Graduate Mechanical Engineer | MEng Loughborough | Thermal systems, FEA, CAD',
  about:
    'MEng Mechanical Engineering, graduated this summer. My final-year project was a thermal management redesign ' +
    'for a battery pack that dropped peak cell temperature 11°C in simulation and won the departmental design prize. ' +
    'Spent a placement year at a tier-one automotive supplier doing FEA on suspension components. Looking for a ' +
    'graduate role in thermal or structural engineering.',
  location: 'Loughborough, England, United Kingdom',
  customUrl: true,
  contactInfoAvailable: true,
  experience: [
    {
      title: 'Engineering Placement Student', company: 'Brantwood Automotive', dateRange: 'Jul 2023 - Aug 2024', current: false,
      description: 'Ran FEA on suspension components through 40+ load cases and rewrote the reporting template the team still uses.',
    },
  ],
  skills: ['SolidWorks', 'FEA', 'Thermal Analysis', 'MATLAB', 'CAD', 'Ansys'],
  skillsDeclaredCount: 11,
  featured: [],
  education: [{ school: 'Loughborough University', degree: 'MEng Mechanical Engineering' }],
  employerCount: 1,
  linkedEmployers: 1,
  banner: { present: false },
  photo: { present: true, isDefault: false },
  recommendationsReceived: 1,
  activity: { lastPostDaysAgo: null, postsLast30d: 0 },
  observed: observedAll,
};

/** Founder whose own company has no LinkedIn page. Tests the company_linked rule. */
export const unlistedCompany: Profile = {
  name: 'Unlisted company',
  headline: 'Founder | Building scheduling software for independent veterinary practices',
  about:
    'I run a two-person software company making scheduling and recall software for independent vet practices — ' +
    'the ones too small for the big practice-management suites and badly served by them. 60 practices on it now, ' +
    'up from 4 at this time last year. Before this I spent eleven years building clinical systems for the NHS. ' +
    'If you run a practice and your recall list lives in a spreadsheet, I would like to hear from you.',
  location: 'Perth, Scotland, United Kingdom',
  customUrl: true,
  contactInfoAvailable: true,
  experience: [
    {
      title: 'Founder', company: 'Byre Software', dateRange: 'Sep 2023 - Present', current: true,
      description: 'Built and sell scheduling and recall software now used by 60 independent veterinary practices, up from 4 a year ago. Everything from the product to the support inbox.',
    },
    {
      title: 'Senior Developer', company: 'NHS Digital', dateRange: 'Apr 2012 - Sep 2023',
      description: 'Eleven years on clinical systems, latterly leading the team behind the electronic referral service used across 200+ trusts.',
    },
  ],
  skills: ['Software Development', 'Product Management', 'Healthcare IT', 'Ruby', 'Postgres', 'Customer Support'],
  skillsDeclaredCount: 17,
  featured: [{ kind: 'link', title: 'Byre Software', hasCustomThumbnail: false }],
  education: [{ school: 'University of Dundee', degree: 'BSc Computing Science' }],
  // The founder's own company has no page; the NHS does.
  employerCount: 2,
  linkedEmployers: 1,
  banner: { present: false },
  photo: { present: true, isDefault: false },
  recommendationsReceived: 2,
  activity: { lastPostDaysAgo: 90, postsLast30d: 0 },
  observed: observedAll,
};

export const ARCHETYPES = {
  contractor, careerChanger, nurse, aboutOnly, newGrad, unlistedCompany,
};

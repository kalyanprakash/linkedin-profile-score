import test from 'node:test';
import assert from 'node:assert/strict';

import { fromLinkedInPdfItems } from '../src/pdf.ts';
import { scoreProfile } from '../../packages/engine/src/score.ts';
import type { Profile } from '../../packages/engine/src/types.ts';
import {
  layout, LONG_CAREER, NO_SUMMARY, NEW_GRAD, NOT_LINKEDIN, DUTCH, SPARSE_SIDEBAR,
  h, l, NAME, HEADLINE, LOCATION, COMPANY, TITLE, BODY, SIDE, H_SIDE, type Flow,
} from './fixtures/linkedin-pdf-synthetic.ts';

/**
 * The LinkedIn PDF importer, against SYNTHETIC exports — see the fixture file for
 * why, and for the TODO to add a real one.
 */

const long = () => fromLinkedInPdfItems(layout(LONG_CAREER));
const noSummary = () => fromLinkedInPdfItems(layout(NO_SUMMARY, { noFontSizes: true, yDown: true }));
const grad = () => fromLinkedInPdfItems(layout(NEW_GRAD));

/** Fields the export never prints, or never reliably. */
const NEVER_IN_A_PDF = [
  'photo', 'banner', 'featured', 'recommendationsReceived', 'activity', 'openToWork', 'customUrl',
];

test('the header yields name, a wrapped headline rejoined, and location', () => {
  const p = long();
  assert.equal(p.name, 'Priya Raman');
  assert.equal(
    p.headline,
    'Principal Engineer at Northwind Payments | Distributed systems, payments infrastructure and platform reliability',
  );
  assert.equal(p.location, 'Bengaluru, Karnataka, India');
});

test('one employer holding three titles keeps all three under it', () => {
  const roles = long().experience!;
  assert.deepEqual(
    roles.slice(0, 3).map((r) => [r.company, r.title]),
    [
      ['Northwind Payments', 'Principal Engineer'],
      ['Northwind Payments', 'Staff Engineer'],
      ['Northwind Payments', 'Senior Software Engineer'],
    ],
  );
});

test('the employer after a multi-role group starts a new employer', () => {
  const p = long();
  assert.deepEqual(
    p.experience!.slice(3).map((r) => [r.company, r.title]),
    [
      ['Globex Logistics', 'Senior Software Engineer'],
      ['Initech', 'Software Engineer'],
      ['Hooli', 'Graduate Engineer'],
    ],
  );
  assert.equal(p.employerCount, 4, 'Northwind counts once however many titles it holds');
});

test('a short last line of a description stays with it when the dates place the next role in the same employer', () => {
  // "Team of 14 engineers" has no full stop, so its shape alone says "employer".
  // The employer's tenure says the role below started inside it, which settles it.
  const staff = long().experience![1];
  assert.match(staff.description!, /Team of 14 engineers$/);
  assert.equal(long().experience![2].company, 'Northwind Payments');
});

test('dates are kept without the duration, and only an open range is current', () => {
  const roles = long().experience!;
  assert.equal(roles[0].dateRange, 'March 2023 - Present');
  assert.equal(roles[0].current, true);
  assert.equal(roles[3].dateRange, 'Mar 2015 - Jun 2020');
  assert.ok(roles.slice(1).every((r) => r.current === false));
});

test('the location line under a role is not mistaken for its description', () => {
  assert.ok(!long().experience![0].description!.includes('Bengaluru'));
});

test('a description that runs onto the next page stays one sentence', () => {
  const globex = long().experience![3];
  assert.match(globex.description!, /reducing fleet distance by 18%/);
});

test('a page break between a title and its dates does not lose the role', () => {
  const [first] = noSummary().experience!;
  assert.equal(first.title, 'Customer Success Manager');
  assert.equal(first.company, 'Brightline Software');
  assert.equal(first.dateRange, 'September 2021 - Present');
});

test('a role with no description is still a role, with an empty description', () => {
  const hooli = long().experience![5];
  assert.equal(hooli.title, 'Graduate Engineer');
  assert.equal(hooli.description, '');
});

test('page footers never reach the profile', () => {
  const text = JSON.stringify([long(), noSummary(), grad()]);
  assert.ok(!/Page \d+ of \d+/.test(text), 'a footer leaked into the profile');
});

test('a wrapped degree is one degree, with the date tail removed', () => {
  assert.deepEqual(long().education, [
    { school: 'Indian Institute of Technology Madras', degree: 'Bachelor of Technology - BTech, Computer Science and Engineering' },
    { school: 'Stanford University', degree: 'Graduate Certificate, Distributed Systems' },
  ]);
});

test('sidebar evidence becomes portfolio entries, wrapped titles rejoined', () => {
  assert.deepEqual(long().portfolio, [
    { kind: 'certification', title: 'AWS Certified Solutions Architect – Professional' },
    { kind: 'certification', title: 'Certified Kubernetes Administrator' },
    { kind: 'honor', title: 'Engineering Excellence Award' },
    { kind: 'publication', title: 'Idempotency at Scale: Lessons from a Payments Ledger' },
  ]);
  assert.deepEqual(grad().portfolio!.map((e) => e.title), [
    'Google Data Analytics Certificate',
    'Microsoft Certified: Azure Fundamentals',
  ]);
});

test('Summary paragraphs survive as line breaks; wrapped lines rejoin with spaces', () => {
  const about = long().about!;
  assert.equal(about.split('\n').length, 2);
  assert.match(about, /For fourteen years I have designed payment platforms/);
});

test('scale and y orientation do not change the result, because columns are clustered rather than hard-coded', () => {
  const baseline = JSON.stringify(long());
  for (const opts of [{ yDown: true }, { scale: 1.7 }, { scale: 0.6, yDown: true, noise: true }]) {
    assert.equal(JSON.stringify(fromLinkedInPdfItems(layout(LONG_CAREER, opts))), baseline, JSON.stringify(opts));
  }
});

test('without font sizes the header and headings are still found', () => {
  const p = fromLinkedInPdfItems(layout(LONG_CAREER, { noFontSizes: true }));
  assert.equal(p.name, 'Priya Raman');
  assert.equal(p.location, 'Bengaluru, Karnataka, India');
  assert.equal(p.experience!.length, 6);
  assert.equal(p.education!.length, 2);
});

test('a missing Summary is an observed empty About, not an unread one', () => {
  // LinkedIn leaves empty sections out of the export, so no heading means no About.
  const p = noSummary();
  assert.equal(p.about, '');
  assert.ok(p.observed!.includes('about'));
});

test('a new graduate has experience and skills observed as empty, education as read', () => {
  const p = grad();
  assert.deepEqual(p.experience, []);
  assert.deepEqual(p.skills, []);
  assert.deepEqual(p.education, [{ school: 'Osaka University', degree: "Bachelor's degree, Computer Science" }]);
  for (const f of ['experience', 'skills', 'education', 'about']) {
    assert.ok(p.observed!.includes(f), `${f} should be observed`);
  }
});

test('top skills are kept for vocabulary but not observed, because the export truncates the list', () => {
  const p = long();
  assert.deepEqual(p.skills, ['Distributed Systems', 'Payments', 'Go']);
  assert.ok(!p.observed!.includes('skills'));
  assert.equal(p.skillsDeclaredCount, undefined, 'the true count is not knowable from the export');
});

test('contact info is claimed only on a route beyond the LinkedIn URL', () => {
  assert.equal(long().contactInfoAvailable, true);
  assert.equal(grad().contactInfoAvailable, true);
  const p = noSummary();
  assert.equal(p.contactInfoAvailable, undefined);
  assert.ok(!p.observed!.includes('contactInfoAvailable'));
});

test('portfolio is observed only when the export shows evidence', () => {
  const p = noSummary();
  assert.equal(p.portfolio, undefined);
  assert.ok(!p.observed!.includes('portfolio'));
});

test('fields the export never prints are never observed, on any fixture', () => {
  for (const p of [long(), noSummary(), grad()]) {
    for (const f of NEVER_IN_A_PDF) assert.ok(!p.observed!.includes(f), `${f} must stay unobserved`);
    // Employers are counted but not observed: a PDF has no company links to compare against.
    assert.ok(!p.observed!.includes('employerCount'));
  }
});

test('a PDF that is not a LinkedIn export claims nothing', () => {
  assert.deepEqual(fromLinkedInPdfItems(layout(NOT_LINKEDIN)), { observed: [] });
});

test('malformed input degrades to an empty claim rather than throwing', () => {
  assert.deepEqual(fromLinkedInPdfItems([]), { observed: [] });
  assert.deepEqual(fromLinkedInPdfItems(null as never), { observed: [] });
  assert.deepEqual(
    fromLinkedInPdfItems([{ str: 'x', x: NaN, y: 1, page: 1 }, { str: 7 as never, x: 1, y: 1, page: 1 }]),
    { observed: [] },
  );
});

test('scoring a PDF-derived profile abstains on what the export cannot show, rather than scoring it zero', () => {
  const p = long();
  const report = scoreProfile(p, 'job_search');
  const abstained = report.abstained.map((a) => a.id);
  for (const id of ['photo.present', 'banner.present', 'featured.present', 'recommendations.count',
    'activity.recency', 'activity.cadence', 'profile.custom_url']) {
    assert.ok(abstained.includes(id), `${id} should abstain`);
    assert.ok(!report.rules.some((r) => r.id === id), `${id} must not be scored`);
  }
  assert.ok(report.range.floor < report.uncappedScore, 'floor should sit below the point estimate');
  assert.ok(report.range.ceiling > report.uncappedScore, 'ceiling should sit above it');

  // The same profile with those fields claimed as seen-and-empty is what scoring
  // them zero would look like. It must come out lower, inside the reported range.
  const asZeros: Profile = {
    ...p,
    photo: { present: false },
    banner: { present: false },
    featured: [],
    recommendationsReceived: 0,
    activity: { lastPostDaysAgo: null, postsLast30d: 0 },
    customUrl: false,
    observed: [...p.observed!, ...NEVER_IN_A_PDF],
  };
  const zeroed = scoreProfile(asZeros, 'job_search');
  assert.ok(zeroed.uncappedScore < report.uncappedScore);
  assert.ok(zeroed.uncappedScore >= report.range.floor);
});

test('the export prints evidence titles only, so portfolio descriptions are never observed', () => {
  for (const p of [long(), noSummary(), grad()]) {
    assert.ok(!p.observed!.includes('portfolioDescriptions'));
    assert.ok(!scoreProfile(p, 'job_search').rules.some((r) => r.id === 'portfolio.described'),
      'portfolio.described must abstain, not score titles as undescribed');
  }
});

test('visible evidence is a lower bound, so the count is scored only once it already earns full marks', () => {
  // The export may leave out projects and volunteering. Two certifications mean
  // "at least two", which could be full marks or not — so it abstains. Three or
  // more is full marks whatever else is missing, so it is safe to score.
  const g = grad();
  assert.equal(g.portfolio!.length, 2);
  assert.ok(!g.observed!.includes('portfolio'));
  assert.ok(scoreProfile(g, 'job_search').abstained.some((a) => a.id === 'portfolio.present'));

  const l = long();
  assert.ok(l.portfolio!.length >= 3);
  assert.ok(l.observed!.includes('portfolio'));
  assert.equal(scoreProfile(l, 'job_search').rules.find((r) => r.id === 'portfolio.present')!.ratio, 1);
});

// ------------------------------------------------- absence needs a complete read

/** Fields whose absence the importer may claim as real — and must not, on a bad read. */
const ABSENCE_FIELDS = ['about', 'experience', 'education', 'skills'];

test('a localised export is mostly unobserved, not scored as an empty profile', () => {
  // Only "Contact" is recognised. Everything else is present but unreadable, and
  // must widen the range rather than score as missing.
  const p = fromLinkedInPdfItems(layout(DUTCH));
  for (const f of ABSENCE_FIELDS) assert.ok(!p.observed!.includes(f), `${f} must not be claimed absent`);
  assert.ok(!p.observed!.includes('headline'), 'the header cannot be told apart from the body');
  const r = scoreProfile(p, 'job_search');
  assert.ok(r.range.ceiling - r.range.floor >= 60, `range should be wide, got ${r.range.floor}-${r.range.ceiling}`);
});

test('an export whose main column cannot be read at all claims nothing, rather than a score off one check', () => {
  // Claiming the one thing that did parse — a contact email — produced a point
  // estimate of 100 measured over a single check. An empty claim is what the
  // engine reports as "Nothing to read yet", and what a page can detect and
  // explain ("is this an English-language export?").
  const p = fromLinkedInPdfItems(layout(DUTCH));
  assert.deepEqual(p.observed, []);
  assert.equal(scoreProfile(p, 'job_search').score, 0);
});

test('sidebar headings are found even when there are as many headings as entries', () => {
  const p = fromLinkedInPdfItems(layout(SPARSE_SIDEBAR));
  assert.deepEqual(p.skills, ['Go'], 'Top Skills should be read');
  assert.ok(!p.observed!.includes('skills'), 'present Top Skills is never a count');
  assert.equal(p.contactInfoAvailable, true, 'Contact should be read');
});

test('a truncated upload claims no absences and does not trust the section it is cut in', () => {
  // Page 1 of 2: the footer says a page is missing. Education is not absent, it
  // was never uploaded; Experience is cut mid-entry.
  const items = layout(LONG_CAREER).filter((i) => i.page === 1);
  const p = fromLinkedInPdfItems(items);
  assert.ok(!p.observed!.includes('education'), 'education was never uploaded');
  assert.ok(!p.observed!.includes('experience'), 'experience is cut off mid-entry');
  assert.ok(p.observed!.includes('about'), 'a section read whole is still read');
});

test('main-column absences are not claimed when the header runs on with dates in it', () => {
  // No Summary heading AND a role's lines sitting before the first heading: the
  // first heading was missed, so "no Summary" is not evidence of no About.
  const p = fromLinkedInPdfItems(layout({
    left: [h('Contact', H_SIDE), l('a.b@example.com', SIDE)],
    main: [
      l('Ana Bell', NAME), l('Nurse', HEADLINE, 6), l('Leeds, England, United Kingdom', LOCATION, 4),
      l('Expérience', 15.75, 14), l('St James Hospital', COMPANY), l('Staff Nurse', TITLE),
      l(['March 2018 - Present ', '(8 years 8 months)'], BODY), l('Ward sister for 28 beds.'),
      h('Education'), l('University of Leeds', COMPANY), l('BSc, Nursing · (2014 - 2017)', BODY),
    ] as Flow,
  }));
  assert.ok(!p.observed!.includes('about'));
  assert.ok(!p.observed!.includes('experience'));
  assert.ok(p.observed!.includes('education'), 'a section that was found is still read');
});

test('an empty headline is a parse failure, so it is left unobserved', () => {
  const p = fromLinkedInPdfItems(layout({
    left: [h('Contact', H_SIDE), l('x@example.com', SIDE)],
    main: [l('Ana Bell', NAME), l('Leeds, England, United Kingdom', LOCATION, 4), h('Education'),
      l('University of Leeds', COMPANY), l('BSc, Nursing · (2014 - 2017)', BODY)] as Flow,
  }));
  assert.equal(p.location, 'Leeds, England, United Kingdom');
  assert.ok(!p.observed!.includes('headline'));
});

// ------------------------------------------------------------- parser hardening

const roleFlow = (title: (string | [string, number])[], body: string[]): Flow => [
  l('Pat Lee', NAME), l('Engineering leader', HEADLINE, 6), l('Leeds, England, United Kingdom', LOCATION, 4),
  h('Experience'),
  l('Northwind Payments', COMPANY),
  ...title.map((t) => (Array.isArray(t) ? l(t[0], t[1]) : l(t, TITLE))),
  l(['March 2020 - Present ', '(6 years 8 months)'], BODY),
  ...body.map((b) => l(b)),
  l('Globex', COMPANY, 10), l('Engineer', TITLE), l(['Jan 2015 - Feb 2020 ', '(5 years 2 months)'], BODY),
  l('Built the routing engine that plans 300,000 deliveries a day across the region.'),
  h('Education'), l('University of Leeds', COMPANY), l('BSc, Physics · (2010 - 2014)', BODY),
];
const sidebar: Flow = [h('Contact', H_SIDE), l('pat@example.com', SIDE)];

test('a job title wrapped onto two lines is one title, not a title and an employer', () => {
  for (const title of [
    ['Senior Vice President, Global Payments Infrastructure and', 'Risk Engineering'],
    ['Head of Engineering, Merchant Acquiring and Settlement Platforms Europe', 'Region'],
  ]) {
    const p = fromLinkedInPdfItems(layout({ left: sidebar, main: roleFlow(title, ['Runs a group of 60 engineers.']) }));
    assert.equal(p.experience![0].company, 'Northwind Payments');
    assert.equal(p.experience![0].title, title.join(' '));
  }
});

test('heading lookup ignores Object prototype names', () => {
  for (const noFontSizes of [false, true]) {
    const p = fromLinkedInPdfItems(layout(
      { left: sidebar, main: roleFlow(['Engineer'], ['constructor', '__proto__', 'toString']) },
      { noFontSizes },
    ));
    assert.match(p.experience![0].description!, /constructor __proto__ toString/, `noFontSizes=${noFontSizes}`);
    assert.equal(p.experience!.length, 2);
  }
});

test('without font sizes, a body line that is exactly a heading name stays body text', () => {
  const p = fromLinkedInPdfItems(layout(
    { left: sidebar, main: roleFlow(['Engineer'], ['Grew the team from 4 to 20 people and set hiring standards.', 'Skills', 'Experience', 'Kept the platform at 99.99% availability.']) },
    { noFontSizes: true },
  ));
  assert.equal(p.experience!.length, 2, 'a stray "Experience" must not restart the section');
  assert.match(p.experience![0].description!, /Skills Experience Kept the platform/);
  assert.ok(p.observed!.includes('skills'), 'no real Top Skills heading, so skills are genuinely absent');
});

test('a description line that looks like a list of places is kept, not dropped as a location', () => {
  const p = fromLinkedInPdfItems(layout({ left: sidebar, main: roleFlow(['Engineer'], ['Kafka, Go, PostgreSQL', 'Built the settlement pipeline.']) }));
  assert.match(p.experience![0].description!, /^Kafka, Go, PostgreSQL/);
});

test('a description line starting with an employment type is kept', () => {
  const p = fromLinkedInPdfItems(layout({ left: sidebar, main: roleFlow(['Engineer'], ['Contract negotiations with 40 suppliers']) }));
  assert.equal(p.experience![0].description, 'Contract negotiations with 40 suppliers');
});

test('an undated school stays its own entry instead of swallowing the next one', () => {
  for (const noFontSizes of [false, true]) {
    const p = fromLinkedInPdfItems(layout({
      left: sidebar,
      main: [l('Pat Lee', NAME), l('Engineer', HEADLINE, 6), l('Leeds, England, United Kingdom', LOCATION, 4),
        h('Education'), l('Leeds Grammar School', COMPANY),
        l('University of Leeds', COMPANY, 6), l('BSc, Physics · (2010 - 2014)', BODY)] as Flow,
    }, { noFontSizes }));
    assert.deepEqual(p.education, [
      { school: 'Leeds Grammar School' },
      { school: 'University of Leeds', degree: 'BSc, Physics' },
    ], `noFontSizes=${noFontSizes}`);
  }
});

test('pathological input is bounded: a huge line and a flood of items return quickly', () => {
  const base = layout(LONG_CAREER);
  const huge = [...base, { str: 'a'.repeat(80_000), x: 34, y: 300, page: 1, fontSize: 10.5 }];
  let t = Date.now();
  fromLinkedInPdfItems(huge);
  assert.ok(Date.now() - t < 1000, `80k-char item took ${Date.now() - t}ms`);

  const flood = [...base, ...Array.from({ length: 30_000 }, (_, i) => ({ str: 'Experience', x: 214, y: i % 700, page: 1 + (i % 3), fontSize: 15.75 }))];
  t = Date.now();
  fromLinkedInPdfItems(flood);
  assert.ok(Date.now() - t < 3000, `30k heading items took ${Date.now() - t}ms`);
});

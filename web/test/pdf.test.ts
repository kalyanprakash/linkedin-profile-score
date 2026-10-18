import test from 'node:test';
import assert from 'node:assert/strict';

import { fromLinkedInPdfItems } from '../src/pdf.ts';
import { scoreProfile } from '../../packages/engine/src/score.ts';
import type { Profile } from '../../packages/engine/src/types.ts';
import {
  layout, LONG_CAREER, NO_SUMMARY, NEW_GRAD, NOT_LINKEDIN,
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

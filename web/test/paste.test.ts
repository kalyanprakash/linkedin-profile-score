import test from 'node:test';
import assert from 'node:assert/strict';

import { fromPaste } from '../src/paste.ts';
import { scoreProfile } from '../../packages/engine/src/score.ts';

/**
 * Paste mode. The inputs are synthetic, written in the shapes text arrives in when
 * copied from the live profile page, from the PDF, or from a résumé.
 */

/** As copied from the live Experience card: title, "Company · type", dates, location. */
const LIVE_PAGE_COPY = `Experience
Senior Product Manager
Fabrikam · Full-time
Jan 2022 - Present · 2 yrs 10 mos
London, England, United Kingdom · Hybrid
Led the checkout redesign that lifted conversion by 9% across 14 markets.
Skills: Product Strategy · A/B Testing

Product Manager
Contoso
Mar 2019 - Dec 2021 · 2 yrs 10 mos
Owned the onboarding funnel for 1.2M monthly sign-ups.`;

/** As copied out of the PDF export: company first, duration in brackets. */
const PDF_COPY = `Northwind Payments
Principal Engineer
March 2023 - Present (3 years 8 months)
Bengaluru, Karnataka, India
Lead the ledger and settlement platform.`;

test('live-page copy: title and employer are told apart by the "·" marker', () => {
  const p = fromPaste({ experience: LIVE_PAGE_COPY });
  assert.deepEqual(
    p.experience!.map((r) => [r.title, r.company, r.dateRange, r.current]),
    [
      ['Senior Product Manager', 'Fabrikam', 'Jan 2022 - Present', true],
      ['Product Manager', 'Contoso', 'Mar 2019 - Dec 2021', false],
    ],
  );
});

test('location and skills rows are not counted as description', () => {
  const [first] = fromPaste({ experience: LIVE_PAGE_COPY }).experience!;
  assert.equal(first.description, 'Led the checkout redesign that lifted conversion by 9% across 14 markets.');
});

test('live-page copy of an employer with several roles reads the employer from above its tenure line', () => {
  const p = fromPaste({
    experience: 'Acme Corp\nFull-time · 5 yrs 2 mos\nSenior Engineer\nJan 2021 - Present · 3 yrs 10 mos\nRuns the billing platform for 2M customers.',
  });
  assert.deepEqual([p.experience![0].title, p.experience![0].company], ['Senior Engineer', 'Acme Corp']);
});

test('PDF copy: the line nearest the dates is the title', () => {
  const [role] = fromPaste({ experience: PDF_COPY }).experience!;
  assert.equal(role.title, 'Principal Engineer');
  assert.equal(role.company, 'Northwind Payments');
  assert.equal(role.dateRange, 'March 2023 - Present');
  assert.equal(role.description, 'Lead the ledger and settlement platform.');
});

test('a résumé line carrying title, employer and dates is one header', () => {
  const [role] = fromPaste({ experience: 'Barista at Bean There, 2019 - 2021\nTrained six new staff.' }).experience!;
  assert.equal(role.title, 'Barista');
  assert.equal(role.company, 'Bean There');
  assert.equal(role.dateRange, '2019 - 2021');
});

test('a sentence that mentions a date range is prose, not a new role', () => {
  const p = fromPaste({
    experience: 'Night Manager\nCity Hotel\n2014 - 2019\nBetween 2015 - 2018 I ran the night shift alone.\nFrom 2016 - 2017\nHandled 80 rooms.',
  });
  assert.equal(p.experience!.length, 1);
  assert.match(p.experience![0].description!, /Between 2015 - 2018 I ran the night shift alone\./);
});

test('experience with no dates keeps the text instead of dropping it', () => {
  const p = fromPaste({ experience: 'Volunteer coordinator\nRan the food bank rota for 30 volunteers.\n\nTutored maths to year 9 pupils every week.' });
  assert.deepEqual(p.experience, [
    { title: 'Volunteer coordinator', description: 'Ran the food bank rota for 30 volunteers.' },
    { description: 'Tutored maths to year 9 pupils every week.' },
  ]);
});

test('text above the first dated role is kept, folded into that role', () => {
  const p = fromPaste({ experience: `I have spent a decade in fintech, mostly on payments.\n\n${PDF_COPY}` });
  assert.equal(p.experience!.length, 1);
  assert.match(p.experience![0].description!, /^I have spent a decade in fintech/);
});

test('education: blank-line blocks give school then degree; run-together lines use degree words', () => {
  assert.deepEqual(
    fromPaste({ education: 'University of Leeds\nBA, Economics · (2014 - 2017)\n\nLeeds Sixth Form College\n2012 - 2014' }).education,
    [{ school: 'University of Leeds', degree: 'BA, Economics' }, { school: 'Leeds Sixth Form College', degree: undefined }],
  );
  assert.deepEqual(
    fromPaste({ education: 'Education\nOsaka University\nBachelor of Engineering, Computer Science\nKyoto Language School' }).education,
    [{ school: 'Osaka University', degree: 'Bachelor of Engineering, Computer Science' }, { school: 'Kyoto Language School' }],
  );
});

test('skills split on any common separator, deduplicated, with LinkedIn provenance rows removed', () => {
  assert.deepEqual(
    fromPaste({ skills: 'Python, SQL\nData Analysis • python\n3 endorsements\nTableau | Excel; Show all 12 skills' }).skills,
    ['Python', 'SQL', 'Data Analysis', 'Tableau', 'Excel'],
  );
});

test('certifications and projects both feed the portfolio, with descriptions attached', () => {
  const p = fromPaste({
    certifications: 'AWS Certified Cloud Practitioner\nPMP',
    projects: 'Bus tracker\nBuilt a live bus-arrival app used by 400 students.\n\nThesis\nModelled flood risk for three river basins.',
  });
  assert.deepEqual(p.portfolio, [
    { kind: 'certification', title: 'AWS Certified Cloud Practitioner' },
    { kind: 'certification', title: 'PMP' },
    { kind: 'project', title: 'Bus tracker', description: 'Built a live bus-arrival app used by 400 students.' },
    { kind: 'project', title: 'Thesis', description: 'Modelled flood risk for three river basins.' },
  ]);
});

test('a section is observed when its key is present, even empty; absent or undefined is unobserved', () => {
  const p = fromPaste({ headline: 'Data analyst', about: '', experience: undefined });
  assert.deepEqual(p.observed, ['headline', 'about']);
  assert.equal(p.about, '');
  assert.equal(p.experience, undefined);
});

test('null is treated as not provided', () => {
  assert.deepEqual(fromPaste({ about: null as never }).observed, []);
});

test('an explicitly blank experience is an observed empty work history', () => {
  const p = fromPaste({ experience: '   ' });
  assert.deepEqual(p.experience, []);
  assert.ok(p.observed!.includes('experience'));
});

test('portfolio is observed as a complete answer only when both evidence fields were sent', () => {
  // One field is a lower bound: a certification-only form never asked about
  // projects, so one certification is not "a portfolio of one".
  assert.ok(!fromPaste({ certifications: 'PMP' }).observed!.includes('portfolio'));
  assert.ok(!fromPaste({ certifications: '' }).observed!.includes('portfolio'));
  assert.ok(!fromPaste({ projects: 'Bus tracker' }).observed!.includes('portfolio'));
  assert.ok(!fromPaste({ about: 'x' }).observed!.includes('portfolio'));
  // Both asked: an empty answer is a real one.
  const both = fromPaste({ certifications: '', projects: '' });
  assert.ok(both.observed!.includes('portfolio'));
  assert.deepEqual(both.portfolio, []);
  // A lower bound that already earns full marks is safe to score.
  assert.ok(fromPaste({ certifications: 'PMP\nCISSP\nCCNA' }).observed!.includes('portfolio'));
});

test('paste never observes what it cannot see, so those checks abstain and widen the range', () => {
  const p = fromPaste({ headline: 'Senior Product Manager | Checkout and payments', about: 'I build checkout flows.', experience: LIVE_PAGE_COPY });
  for (const f of ['photo', 'banner', 'featured', 'recommendationsReceived', 'activity', 'openToWork', 'customUrl', 'location', 'contactInfoAvailable']) {
    assert.ok(!p.observed!.includes(f), `${f} must stay unobserved`);
  }
  const report = scoreProfile(p, 'job_search');
  assert.ok(report.abstained.some((a) => a.id === 'profile.location'));
  assert.ok(report.range.ceiling > report.range.floor);
});

test('garbage input yields an empty claim rather than throwing', () => {
  assert.deepEqual(fromPaste(undefined as never), { observed: [] });
  assert.deepEqual(fromPaste({ name: 42 as never }), { observed: [] });
});

test('portfolio descriptions are observed only when projects were pasted, since certifications carry none', () => {
  assert.ok(!fromPaste({ certifications: 'PMP', projects: undefined }).observed!.includes('portfolioDescriptions'));
  assert.ok(!fromPaste({ certifications: 'PMP\nCISSP\nCCNA' }).observed!.includes('portfolioDescriptions'));
  assert.ok(fromPaste({ certifications: '', projects: 'Bus tracker\nBuilt a live bus-arrival app.' }).observed!.includes('portfolioDescriptions'));
});

test('a paste of only headline and skills does not score keyword reinforcement as zero', () => {
  const p = fromPaste({ headline: 'Data Engineer', skills: 'Airflow, dbt, Snowflake, Python, SQL' });
  assert.ok(scoreProfile(p, 'job_search').abstained.some((a) => a.id === 'keywords.reinforcement'));
});

test('description lines that look like places or employment types are kept', () => {
  const [role] = fromPaste({
    experience: 'Buyer\nAcme Retail\nJan 2019 - Dec 2022\nKafka, Go, PostgreSQL\nContract negotiations with 40 suppliers',
  }).experience!;
  assert.equal(role.description, 'Kafka, Go, PostgreSQL\nContract negotiations with 40 suppliers');
});

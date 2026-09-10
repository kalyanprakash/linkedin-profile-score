import { scoreProfile, scoreAllPersonas } from '../src/score.ts';
import { PERSONAS } from '../src/personas.ts';
import type { PersonaId, Profile } from '../src/types.ts';
import { kalyan, kalyanLive, strong, empty, median } from './fixtures/profiles.ts';

function bar(ratio: number, width = 12): string {
  const n = Math.round(ratio * width);
  return '█'.repeat(n) + '░'.repeat(width - n);
}

function report(label: string, profile: Profile, personaId: PersonaId) {
  const r = scoreProfile(profile, personaId);
  console.log('\n' + '═'.repeat(78));
  console.log(`${label}  —  ${PERSONAS[personaId].label}`);
  console.log('═'.repeat(78));
  console.log(`SCORE ${r.score}/100  (${r.band})`);
  for (const c of r.caps) {
    console.log(`      CAPPED at ${c.ceiling} (would be ${r.uncappedScore}) — ${c.title}`);
    console.log(`      because ${c.because}`);
  }
  if (r.unobservedPoints > 0) {
    console.log(`      true score is between ${r.range.floor} and ${r.range.ceiling} — ${r.abstained.length} checks (${r.unobservedPoints} pts) could not see their input`);
  }

  console.log('\nBy section');
  for (const d of r.dimensions) {
    console.log(`  ${d.dimension.padEnd(14)} ${bar(d.available ? d.earned / d.available : 0)} ${String(d.earned).padStart(5)} / ${d.available}`);
  }

  console.log('\nBiggest gains available');
  for (const f of r.topFixes) {
    console.log(`  +${String(f.pointsAvailable).padStart(4)}  ${f.title}`);
    console.log(`         ${f.fix}`);
  }

  console.log('\nAll checks');
  for (const c of r.rules) {
    const flag = c.ratio === 1 ? '✓' : c.ratio === 0 ? '✗' : '~';
    console.log(`  ${flag} ${String(c.earned).padStart(5)}/${String(c.available).padEnd(5)} ${c.title}`);
    console.log(`         ${c.observed}`);
  }

  if (r.observations.length) {
    console.log('\nObserved, not scored');
    for (const o of r.observations) {
      console.log(`  ·      ${o.title}: ${o.observed}`);
    }
  }

  if (r.abstained.length) {
    console.log('\nNot measured');
    for (const a of r.abstained) console.log(`  ?      ${a.title}`);
  }
}

const which = process.argv[2] ?? 'kalyan';
const persona = (process.argv[3] ?? 'job_search') as PersonaId;
const map: Record<string, [string, Profile]> = {
  kalyan: ['Kalyan Dasika (partial scrape)', kalyan],
  live: ['Kalyan Dasika (live DOM)', kalyanLive],
  strong: ['Strong reference profile', strong],
  median: ['Median reference profile', median],
  empty: ['Empty profile', empty],
};

if (which === 'matrix') {
  const rows = Object.entries(map);
  const personas = Object.keys(PERSONAS) as PersonaId[];
  console.log('\nScore by persona\n');
  console.log('  ' + 'profile'.padEnd(34) + personas.map((p) => p.slice(0, 11).padStart(13)).join(''));
  for (const [key, [label, p]] of rows) {
    const all = scoreAllPersonas(p);
    console.log('  ' + label.slice(0, 33).padEnd(34) + personas.map((x) => String(all[x]).padStart(13)).join(''));
  }
  console.log();
} else {
  const [label, p] = map[which];
  report(label, p, persona);
}

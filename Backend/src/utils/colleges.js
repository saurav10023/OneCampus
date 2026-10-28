import { normalizeScopePart } from './scopeKey.js';

// One canonical name per college. Add every spelling people use to `aliases`.
export const COLLEGES = Object.freeze([
  {
    name: 'BIT Mesra, Ranchi',
    aliases: [
      'BIT Mesra',
      'BIT, Mesra',
      'BIT Ranchi',
      'Birla Institute of Technology Mesra',
      'Birla Institute of Technology, Mesra',
      'Birla Institute of Technology Mesra Ranchi',
    ],
  },
]);

const byKey = new Map();
for (const c of COLLEGES) {
  for (const n of [c.name, ...c.aliases]) byKey.set(normalizeScopePart(n), c.name);
}

// Canonical name, or null if the college is not known
export const resolveCollege = (input) =>
  typeof input === 'string' ? byKey.get(normalizeScopePart(input)) ?? null : null;

export const listColleges = () => COLLEGES.map((c) => c.name);
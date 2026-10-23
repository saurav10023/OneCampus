// Pure subject matching, used at join (official subjects against the student's own) and by anything
// else that needs to ask "are these two the same subject?". No database.
//
// A match is never merged silently unless it is EXACT (same code, or the same name once
// normalized). LIKELY and POSSIBLE are only suggestions the student confirms.

const LIKELY = 0.7;
const POSSIBLE = 0.5;
const FUZZY_CAP = 0.9; // a fuzzy score can never look like an exact one
const EXACT_NAME_SCORE = 0.97;
const DIFFERENT_CODES_CAP = 0.4;
const ONE_SIDE_NUMBER_PENALTY = 0.15;

const ROMAN = { ii: 2, iii: 3, iv: 4, vi: 6, vii: 7, viii: 8, ix: 9 };
const ROMAN_SINGLE = { i: 1, v: 5, x: 10 }; // only at the very end, "Calculus I"
const STOPWORDS = new Set(['of', 'and', 'the', 'to', 'for', 'in', 'on', 'a', 'an', 'st', 'nd', 'rd', 'th']);
const ALIASES = { maths: 'mathematics', math: 'mathematics', stats: 'statistics', phy: 'physics', chem: 'chemistry' };
const LAB_WORDS = new Set(['lab', 'labs', 'laboratory', 'practical', 'practicals']);
const TUTORIAL_WORDS = new Set(['tutorial', 'tutorials', 'tut']);

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const normCode = (code) =>
  typeof code === 'string' ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';

// Splits a subject name into words, numbers (3, III and 3rd all become "3") and a kind
// (theory, lab or tutorial). "Physics" and "Physics Lab" are different subjects.
const tokenize = (name) => {
  const raw = String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  let type = 'theory';
  const words = [];
  const numbers = [];
  raw.forEach((token, index) => {
    if (LAB_WORDS.has(token)) { type = 'lab'; return; }
    if (TUTORIAL_WORDS.has(token)) { if (type === 'theory') type = 'tutorial'; return; }
    if (STOPWORDS.has(token)) return;
    if (/^\d+$/.test(token)) { numbers.push(String(Number(token))); return; }
    if (ROMAN[token]) { numbers.push(String(ROMAN[token])); return; }
    if (ROMAN_SINGLE[token] && index === raw.length - 1 && raw.length > 1) {
      numbers.push(String(ROMAN_SINGLE[token]));
      return;
    }
    words.push(ALIASES[token] ?? token);
  });
  return { words, numbers, type };
};

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

// "prog" matches "programming": one word starts the other, and the short one has 3+ letters
const wordsMatch = (a, b) => {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
};

const countMatches = (a, b) => {
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Set();
  let count = 0;
  for (const word of small) {
    const index = large.findIndex((other, i) => !used.has(i) && wordsMatch(word, other));
    if (index !== -1) { used.add(index); count += 1; }
  }
  return count;
};

const levelOf = (score, exact) => (exact ? 'exact' : score >= LIKELY ? 'likely' : score >= POSSIBLE ? 'possible' : 'none');
const none = (reason) => ({ score: 0, level: 'none', reason });

// a, b: { name, code }
const scoreSubjects = (a, b) => {
  const codeA = normCode(a.code);
  const codeB = normCode(b.code);
  if (codeA && codeB && codeA === codeB) return { score: 1, level: 'exact', reason: 'same code' };

  const ta = tokenize(a.name);
  const tb = tokenize(b.name);
  if (!ta.words.length || !tb.words.length) return none('no usable name');
  if (ta.type !== tb.type) return none('one is a lab or tutorial and the other is not');
  if (ta.numbers.length && tb.numbers.length && !sameSet(ta.numbers, tb.numbers)) {
    return none('different part or number');
  }

  const inter = countMatches(ta.words, tb.words);
  const small = Math.min(ta.words.length, tb.words.length);
  const union = ta.words.length + tb.words.length - inter;
  let score = 0.5 * (inter / small) + 0.5 * (inter / union);

  const sameName = sameSet(ta.words, tb.words) && sameSet(ta.numbers, tb.numbers);
  const bothCodes = Boolean(codeA && codeB); // and they differ, or we would have returned
  if (sameName) score = EXACT_NAME_SCORE;
  else score = Math.min(score, FUZZY_CAP);

  if (Boolean(ta.numbers.length) !== Boolean(tb.numbers.length)) score -= ONE_SIDE_NUMBER_PENALTY;
  if (bothCodes) return { score: round2(Math.min(score, DIFFERENT_CODES_CAP)), level: 'none', reason: 'different codes' };

  score = Math.max(0, score);
  return {
    score: round2(score),
    level: levelOf(score, sameName),
    reason: sameName ? 'same name' : 'similar name',
  };
};

// Matches official subjects to the student's own, one to one.
// officialSubjects: [{ key, name, code }]   studentSubjects: [{ id, name, code }]
// Returns { matches: [{ key, studentSubjectId|null, score, level, reason }], unmatchedStudent: [id] }
const suggestMatches = (officialSubjects, studentSubjects) => {
  const pairs = [];
  for (const o of officialSubjects) {
    for (const s of studentSubjects) {
      const result = scoreSubjects(o, s);
      if (result.level !== 'none') pairs.push({ key: o.key, id: String(s.id), ...result });
    }
  }
  pairs.sort(
    (x, y) => y.score - x.score || String(x.key).localeCompare(String(y.key)) || x.id.localeCompare(y.id)
  );

  const takenKeys = new Set();
  const takenIds = new Set();
  const best = new Map();
  for (const p of pairs) {
    if (takenKeys.has(p.key) || takenIds.has(p.id)) continue;
    takenKeys.add(p.key);
    takenIds.add(p.id);
    best.set(p.key, p);
  }

  const matches = officialSubjects.map((o) => {
    const p = best.get(o.key);
    return p
      ? { key: o.key, studentSubjectId: p.id, score: p.score, level: p.level, reason: p.reason }
      : { key: o.key, studentSubjectId: null, score: 0, level: 'none', reason: 'no match' };
  });
  return { matches, unmatchedStudent: studentSubjects.map((s) => String(s.id)).filter((id) => !takenIds.has(id)) };
};

export { tokenize, scoreSubjects, suggestMatches, LIKELY, POSSIBLE };
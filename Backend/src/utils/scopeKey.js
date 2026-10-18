// Spec §3.3: scopeKey links a Setup to the official schedule for the same
// academic year, semester, branch and section.

// Lowercase, trim, collapse whitespace, drop everything that is not a letter,
// digit or combining mark. Unicode-aware so non-Latin names are kept.
export function normalizeScopePart(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

// Each part is normalized on its own and joined with "|" so that
// ("a", "bc") and ("ab", "c") can never produce the same key.
export function buildScopeKey({ academicYear, semesterLabel, branch, section }) {
  return [academicYear, semesterLabel, branch, section]
    .map(normalizeScopePart)
    .join('|');
}

export const SCOPE_FIELDS = ['academicYear', 'semesterLabel', 'branch', 'section'];
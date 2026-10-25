// src/lib/groups.js
// One place that turns the "Lab batches / groups" rows in a form into a clean,
// valid `groups` array for the API. Used by CRStudio (create) and CRSchedule (edit).

export const GROUP_KINDS = ["lab", "elective", "tutorial", "other"];

// Backend limits for an official schedule group.
const MAX_KEY = 20; // lowercase a-z 0-9 _ -
const MAX_LABEL = 40;
const KEY_PATTERN = /^[a-z0-9_-]+$/;

// "Lab Batch B1" -> "lab-batch-b1"
export const slugKey = (s = "") =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_KEY)
    .replace(/-+$/g, "");

// A fresh empty row for the form.
export const emptyGroup = () => ({ key: "", label: "", kind: "lab", existing: false });

// Rows for the edit form, built from whatever the API returned.
// Existing keys are flagged so the UI can lock them (classes may point at them).
export const fromApiGroups = (groups) =>
  Array.isArray(groups)
    ? groups
        .filter((g) => g && (g.key || g.label))
        .map((g) => ({
          key: String(g.key ?? ""),
          label: String(g.label ?? ""),
          kind: GROUP_KINDS.includes(g.kind) ? g.kind : "lab",
          existing: true,
        }))
    : [];

// Immutable row update: setGroups((rows) => updateRow(rows, i, "label", value))
export const updateRow = (rows, index, field, value) =>
  rows.map((r, i) => (i === index ? { ...r, [field]: value } : r));

export const removeRow = (rows, index) => rows.filter((_, i) => i !== index);

/**
 * Validate and normalise form rows.
 * Returns { groups, error }.  If `error` is a non-empty string, show it and do not submit.
 *
 * Rules:
 *  - fully empty rows are skipped
 *  - a missing key is generated from the label (so label-only rows are NOT dropped)
 *  - keys are lowercased and must use only a-z, 0-9, _ and - (max 20 characters)
 *  - labels are at most 40 characters
 *  - keys must be unique; duplicates are reported, never silently merged
 *  - invalid kinds fall back to "lab"
 */
export const cleanGroups = (rows) => {
  const groups = [];
  const seen = new Map(); // key -> 1-based row number

  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows[i] || {};
    const rawKey = String(row.key ?? "").trim();
    const rawLabel = String(row.label ?? "").trim();
    if (!rawKey && !rawLabel) continue; // untouched row

    const key = (rawKey || slugKey(rawLabel)).toLowerCase();
    if (!key) return { groups: [], error: `Group ${i + 1}: add a key (letters or numbers).` };
    if (key.length > MAX_KEY) return { groups: [], error: `Group ${i + 1}: key must be ${MAX_KEY} characters or fewer.` };
    if (!KEY_PATTERN.test(key)) {
      return { groups: [], error: `Group ${i + 1}: the key may only use letters, numbers, "_" and "-".` };
    }
    if (rawLabel.length > MAX_LABEL) return { groups: [], error: `Group ${i + 1}: label must be ${MAX_LABEL} characters or fewer.` };

    if (seen.has(key)) {
      return { groups: [], error: `Groups ${seen.get(key)} and ${i + 1} both use the key "${key}". Each group needs a unique key.` };
    }
    seen.set(key, i + 1);

    groups.push({
      key,
      label: rawLabel || key,
      kind: GROUP_KINDS.includes(row.kind) ? row.kind : "lab",
    });
  }

  return { groups, error: "" };
};
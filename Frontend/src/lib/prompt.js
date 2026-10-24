// Ask for an optional note. Returns null when the user cancels, otherwise the trimmed text.
export const askNote = (text = "Add a note (optional)") => {
  const v = window.prompt(text);
  return v === null ? null : v.trim();
};

// Common helpers for "withdrawn" official records (field names vary a little).
export const isWithdrawn = (r) => r?.status === "withdrawn" || Boolean(r?.withdrawnAt) || r?.isActive === false;
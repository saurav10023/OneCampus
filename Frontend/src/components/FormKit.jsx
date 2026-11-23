// Shared form + action helpers for the official-schedule panels.
// Needs the updated Modal from Ui.Modal.snippet.jsx.
import { useEffect, useId, useState } from "react";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { errMsg } from "../api/endpoints";
import { Alert, Button, Field, Modal, cx } from "./Ui";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1";

// Moves the keyboard/screen to the first field that failed validation.
export const focusFirstInvalid = () =>
  setTimeout(() => {
    const el = document.querySelector('[role="dialog"] [aria-invalid="true"]');
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  }, 40);

// Dialog + <form> with a sticky footer.
//  - validation is ours (noValidate), so no browser pop-ups hidden behind the keyboard
//  - the error banner sits in the footer, so it is always visible
//  - closing with unsaved changes asks first (backdrop tap, Esc and Cancel all go through it)
//  - footer buttons wrap and the submit label wraps, so a long label never overflows
export const FormModal = ({ open, onClose, title, onSubmit, submitLabel, saving, dirty, error, extra, size, children }) => {
  const formId = useId();
  const [discard, setDiscard] = useState(false);

  useEffect(() => {
    if (open) setDiscard(false);
  }, [open]);

  const requestClose = () => {
    if (saving) return;
    if (dirty && !discard) return setDiscard(true);
    onClose();
  };

  const footer = discard ? (
    <div className="space-y-3 min-w-0">
      <Alert type="warning">You have unsaved changes. Discard them?</Alert>
      <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-3">
        <Button variant="danger" onClick={onClose} className="w-full sm:w-auto">Discard changes</Button>
        <Button variant="glass" onClick={() => setDiscard(false)} className="w-full sm:w-auto">Keep editing</Button>
      </div>
    </div>
  ) : (
    <div className="space-y-3 min-w-0">
      <Alert type="error">{error}</Alert>
      <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-3">
        <Button variant="glass" disabled={saving} onClick={requestClose} className="w-full sm:w-auto">Cancel</Button>
        {extra}
        <Button
          type="submit"
          form={formId}
          loading={saving}
          className="w-full sm:w-auto h-auto min-h-11 py-2 whitespace-normal text-center"
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={requestClose} title={title} footer={footer} size={size}>
      <form id={formId} onSubmit={onSubmit} noValidate autoComplete="off" className="space-y-4 pt-1 min-w-0">
        {children}
      </form>
    </Modal>
  );
};

// Replaces window.prompt: a proper dialog with an optional note.
export const NoteDialog = ({ open, title, message, confirmLabel = "Confirm", tone = "danger", busy, error, onConfirm, onClose }) => {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      footer={
        <div className="space-y-3 min-w-0">
          <Alert type="error">{error}</Alert>
          <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-3">
            <Button variant="glass" disabled={busy} onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
            <Button variant={tone} loading={busy} onClick={() => onConfirm(note.trim())} className="w-full sm:w-auto h-auto min-h-11 py-2 whitespace-normal text-center">
              {confirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pt-1 min-w-0">
        {message && <p className="text-[14px] leading-relaxed text-[color:var(--body)]">{message}</p>}
        <Field label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Shown in the history" />
      </div>
    </Modal>
  );
};

// const [ask, dialog] = useNoteDialog();
// ask({ title, message, confirmLabel, tone, run: async (note) => {...} });   render {dialog} once.
export const useNoteDialog = () => {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ask = (c) => {
    setError("");
    setCfg(c);
  };

  const dialog = (
    <NoteDialog
      open={Boolean(cfg)}
      title={cfg?.title}
      message={cfg?.message}
      confirmLabel={cfg?.confirmLabel}
      tone={cfg?.tone}
      busy={busy}
      error={error}
      onClose={() => setCfg(null)}
      onConfirm={async (note) => {
        setBusy(true);
        setError("");
        try {
          await cfg.run(note);
          setCfg(null);
        } catch (e) {
          setError(errMsg(e, "That did not work. Try again."));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
  return [ask, dialog];
};

// 44px touch targets on phones, 40px from sm
export const IconBtn = ({ label, danger, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={cx(
      "w-11 h-11 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors motion-reduce:transition-none active:scale-[0.98]",
      FOCUS,
      danger ? "text-rose-600 hover:bg-rose-50" : "text-[color:var(--body)] hover:bg-[color:var(--inset)]"
    )}
  >
    {children}
  </button>
);

export const RowActions = ({ withdrawn, onEdit, onToggle }) => (
  <div className="flex gap-0.5 shrink-0">
    {!withdrawn && onEdit && <IconBtn label="Edit" onClick={onEdit}><Pencil className="w-4 h-4" /></IconBtn>}
    <IconBtn label={withdrawn ? "Restore" : "Withdraw"} danger={!withdrawn} onClick={onToggle}>
      {withdrawn ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
    </IconBtn>
  </div>
);

// Sentence-case form label (no all-caps, no tracking)
export const FormLabel = ({ children, right }) => (
  <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
    <span className="text-[13px] font-medium text-[color:var(--body)]">{children}</span>
    {right}
  </div>
);

// Short label for a subject: its code if it has one, else initials ("Operating Systems" -> "OS").
const SKIP = new Set(["of", "and", "&", "the", "to", "in", "for"]);
export const shortOf = (name = "", code = "") => {
  if (code && String(code).trim()) return String(code).trim().toUpperCase();
  const words = String(name).trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w) && !SKIP.has(w.toLowerCase()));
  if (words.length >= 2) return words.slice(0, 4).map((w) => w[0]).join("").toUpperCase();
  return String(name).trim().slice(0, 5);
};
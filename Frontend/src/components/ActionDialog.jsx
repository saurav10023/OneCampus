// Shared confirm dialog with an optional note box. Replaces window.confirm / window.prompt,
// which look out of place and are awkward to use on phones.
import { useEffect, useState } from "react";
import { Alert, Button, Field, Modal } from "./Ui";

const ActionDialog = ({
  open,
  title,
  children,
  noteLabel,
  notePlaceholder,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary", // "primary" | "danger"
  busy = false,
  error = "",
  onConfirm, // (note: string) => void
  onClose,
}) => {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(note.trim());
        }}
        className="space-y-4"
      >
        <Alert type="error">{error}</Alert>
        {children && <div className="text-[14px] leading-relaxed text-[#444A63]">{children}</div>}
        {noteLabel && (
          <Field
            as="textarea"
            label={noteLabel}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={notePlaceholder}
            className="!h-24 !py-3 resize-none"
          />
        )}
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <Button type="button" variant="glass" disabled={busy} onClick={onClose} className="w-full sm:w-auto">
            {cancelLabel}
          </Button>
          <Button type="submit" variant={tone} loading={busy} className="w-full sm:w-auto">
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ActionDialog;
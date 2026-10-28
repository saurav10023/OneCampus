import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ListPlus, Plus, X } from "lucide-react";
import { errMsg } from "../api/endpoints";
import { Alert, Button, Modal, cx } from "./Ui";

/* ------------------------------------------------------------------------------------------
   Add many subjects at once. Shared by the student's Subjects tab and the CR's Subjects panel.

   Props
     open, onClose
     existing    [{ name, code }]   subjects already there, used to flag duplicates
     createOne   async ({ name, code, credits }, index) => void   creates ONE subject (throws on failure)
     onDone      (savedCount) => void   called after at least one subject was saved (reload the list)
     withCredits show a credits box (student subjects only)
     maxTotal    optional cap on active subjects; activeCount is how many exist now
------------------------------------------------------------------------------------------ */

const MAX_ROWS = 30;
const CODE = /^[A-Za-z]{2,5}-?\d{2,4}[A-Za-z]?$/;

// "Operating Systems, CS301, 4"  "CS301 - Operating Systems"  "1. Maths | MA101"  "CS301 Operating Systems"
export const parseSubjects = (text) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*[,;\t|]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
      let code = "";
      let credits = "";
      const nameBits = [];

      if (parts.length === 1) {
        const m = parts[0].match(/^([A-Za-z]{2,5}-?\d{2,4}[A-Za-z]?)\s+(.+)$/);
        if (m) {
          code = m[1];
          nameBits.push(m[2]);
        } else nameBits.push(parts[0]);
      } else {
        parts.forEach((p, i) => {
          if (i > 0 && !credits && /^\d{1,2}$/.test(p)) credits = p;
          else if (!code && CODE.test(p)) code = p;
          else nameBits.push(p);
        });
      }
      return { name: nameBits.join(" ").trim(), code: code.toUpperCase(), credits };
    });

const inputCls =
  "h-11 w-full rounded-xl bg-white/70 border border-white/90 shadow-[inset_0_1px_0_#fff] px-3 " +
  "text-[16px] sm:text-[14px] text-[#161827] placeholder:text-[#6A6F85]/60 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:bg-white disabled:opacity-60";

const BulkSubjects = ({ open, onClose, existing = [], createOne, onDone, withCredits = false, maxTotal, activeCount = 0 }) => {
  const [text, setText] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nextId = useRef(1);

  useEffect(() => {
    if (open) {
      setText("");
      setRows([]);
      setError("");
      setSaving(false);
    }
  }, [open]);

  const newRow = (r = {}) => ({ id: nextId.current++, name: "", code: "", credits: "", serverError: "", ...r });

  const addFromText = () => {
    const parsed = parseSubjects(text);
    if (!parsed.length) return;
    setRows((rs) => [...rs, ...parsed.map((p) => newRow(p))].slice(0, MAX_ROWS));
    setText("");
    setError("");
  };

  const addBlank = () => setRows((rs) => (rs.length >= MAX_ROWS ? rs : [...rs, newRow()]));
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));
  const edit = (id, k) => (e) => {
    const v = e.target.value;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v, serverError: "" } : r)));
  };

  // Problem with each row, by id. A row with a problem is skipped when saving.
  const issues = useMemo(() => {
    const out = {};
    const exName = new Set(existing.map((s) => (s.name || "").trim().toLowerCase()));
    const exCode = new Set(existing.map((s) => (s.code || "").trim().toLowerCase()).filter(Boolean));
    const seenName = new Set();
    const seenCode = new Set();
    rows.forEach((r) => {
      const n = r.name.trim().toLowerCase();
      const c = r.code.trim().toLowerCase();
      let msg = "";
      if (!n) msg = "Enter a name.";
      else if (r.name.trim().length > 80) msg = "Keep the name under 80 characters.";
      else if (exName.has(n)) msg = "You already have a subject with this name.";
      else if (seenName.has(n)) msg = "This name appears twice in your list.";
      else if (c && exCode.has(c)) msg = "Another subject already uses this code.";
      else if (c && seenCode.has(c)) msg = "This code appears twice in your list.";
      else if (withCredits && r.credits !== "" && !(Number(r.credits) >= 0 && Number(r.credits) <= 30)) msg = "Credits must be from 0 to 30.";
      if (n) seenName.add(n);
      if (c) seenCode.add(c);
      if (msg) out[r.id] = msg;
    });
    return out;
  }, [rows, existing, withCredits]);

  const valid = rows.filter((r) => !issues[r.id]);
  const room = maxTotal ? Math.max(0, maxTotal - activeCount) : Infinity;
  const overLimit = valid.length > room;

  const saveAll = async () => {
    if (saving || !valid.length || overLimit) return;
    setSaving(true);
    setError("");
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < valid.length; i++) {
      const r = valid[i];
      try {
        await createOne({ name: r.name.trim(), code: r.code.trim(), credits: r.credits }, i);
        ok++;
        setRows((rs) => rs.filter((x) => x.id !== r.id)); // saved rows leave the list
      } catch (e) {
        failed++;
        setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, serverError: errMsg(e, "Could not save this subject") } : x)));
      }
    }
    setSaving(false);
    if (ok) onDone?.(ok);
    if (!failed && rows.length === valid.length) onClose();
    else if (failed) setError(`${ok} saved, ${failed} failed. Fix the rows marked below and save again.`);
    else setError(`${ok} saved. Fix the rows marked below to add the rest.`);
  };

  const skipped = rows.length - valid.length;

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Add many subjects">
      <div className="space-y-5">
        <Alert type="error">{error}</Alert>

        <div>
          <label htmlFor="bulk-paste" className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-1.5 px-1">
            Paste or type your subjects
          </label>
          <textarea
            id="bulk-paste"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={saving}
            placeholder={"Operating Systems, CS301\nDBMS - CS302\nEngineering Maths, MA201, 4"}
            className={cx(inputCls, "h-auto py-2.5 leading-relaxed resize-y")}
            autoCapitalize="words"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
            <p className="text-[12.5px] text-[#6A6F85] px-1">
              One subject per line. A code{withCredits ? " and credits" : ""} after a comma or dash is picked up for you.
            </p>
            <Button type="button" size="sm" variant="glass" onClick={addFromText} disabled={saving || !text.trim()}>
              <ListPlus className="w-4 h-4" />Add to list
            </Button>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[13px] font-semibold text-[#161827] px-1">
              {rows.length} to add
              {skipped > 0 && <span className="font-normal text-[#A32A42]"> ({skipped} need a fix)</span>}
            </p>

            <ul className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
              {rows.map((r, i) => {
                const msg = issues[r.id] || r.serverError;
                return (
                  <li key={r.id} className={cx("rounded-2xl border p-2.5 bg-white/50", msg ? "border-[#F3B8C2]" : "border-white/90")}>
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-center text-[12px] text-[#6A6F85] shrink-0" aria-hidden="true">{i + 1}</span>
                      <input value={r.name} onChange={edit(r.id, "name")} disabled={saving} placeholder="Subject name" aria-label={`Subject ${i + 1} name`} maxLength={80} className={inputCls} />
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        disabled={saving}
                        aria-label={`Remove subject ${i + 1}`}
                        className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[#6A6F85] hover:bg-white hover:text-rose-600 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className={cx("grid gap-2 mt-2 pl-8", withCredits ? "grid-cols-[1fr_5.5rem]" : "grid-cols-1")}>
                      <input value={r.code} onChange={edit(r.id, "code")} disabled={saving} placeholder="Code (optional)" aria-label={`Subject ${i + 1} code`} maxLength={20} autoCapitalize="characters" className={inputCls} />
                      {withCredits && (
                        <input type="number" min="0" max="30" value={r.credits} onChange={edit(r.id, "credits")} disabled={saving} placeholder="Credits" aria-label={`Subject ${i + 1} credits`} className={inputCls} />
                      )}
                    </div>
                    {msg && (
                      <p className="flex items-start gap-1.5 text-[12.5px] text-[#A32A42] mt-2 pl-8" role="alert">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                        {msg}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {overLimit && (
          <Alert type="warning">
            A schedule can hold {maxTotal} subjects and it has {activeCount}. Remove {valid.length - room} row{valid.length - room === 1 ? "" : "s"} to continue.
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" loading={saving} disabled={!valid.length || overLimit} onClick={saveAll}>
            {saving ? "Adding..." : valid.length ? `Add ${valid.length} subject${valid.length === 1 ? "" : "s"}` : "Add subjects"}
          </Button>
          <Button type="button" variant="glass" disabled={saving || rows.length >= MAX_ROWS} onClick={addBlank}>
            <Plus className="w-4 h-4" />Add a row
          </Button>
          <Button type="button" variant="glass" disabled={saving} onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
};

export default BulkSubjects;
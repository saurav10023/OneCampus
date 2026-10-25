import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { officialSchedulesApi, errMsg } from "../../api/endpoints";
import { isWithdrawn } from "../../lib/prompt";
import { Alert, Badge, Button, Card, EmptyState, Field, PageSpinner, cx } from "../../components/Ui";
import { FormModal, RowActions, focusFirstInvalid, shortOf, useNoteDialog } from "../../components/FormKit";

const api = officialSchedulesApi.subjects;
const idOf = (x) => x?._id || x?.id; // works whether the backend returns `_id` or `id`
const blank = { name: "", code: "", note: "" };

const SubjectsPanel = ({ scheduleId, readOnly, onChanged }) => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [initial, setInitial] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [ask, noteDialog] = useNoteDialog();
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api.list(scheduleId));
      setError("");
    } catch (e) {
      setError(errMsg(e, "Could not load subjects"));
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = Boolean(editing) && JSON.stringify(form) !== initial;

  const open = (s) => {
    const f = s ? { name: s.name || "", code: s.code || "", note: "" } : blank;
    setEditing(s || "new");
    setForm(f);
    setInitial(JSON.stringify(f));
    setErrors({});
    setFormError("");
  };

  const setField = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const validate = () => {
    const errs = {};
    const name = form.name.trim();
    const code = form.code.trim();
    if (!name) errs.name = "Enter the subject name.";
    else if (name.length > 80) errs.name = "Keep the name under 80 characters.";
    if (code) {
      const clash = list.some((s) => !isWithdrawn(s) && idOf(s) !== idOf(editing) && (s.code || "").toLowerCase() === code.toLowerCase());
      if (clash) errs.code = "Another subject already uses this code.";
    }
    return errs;
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();

    setSaving(true);
    setFormError("");
    const body = { name: form.name.trim(), code: form.code.trim() };
    if (form.note.trim()) body.note = form.note.trim();
    try {
      if (editing === "new") await api.create(scheduleId, body);
      else await api.update(scheduleId, idOf(editing), body);
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      setFormError(errMsg(err, "Could not save the subject"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (s) => {
    const withdrawn = isWithdrawn(s);
    ask({
      title: withdrawn ? "Restore subject" : "Withdraw subject",
      message: withdrawn ? `"${s.name}" will be part of the schedule again.` : `"${s.name}" will be removed from the schedule. You can restore it later.`,
      confirmLabel: withdrawn ? "Restore" : "Withdraw",
      tone: withdrawn ? "primary" : "danger",
      run: async (note) => {
        if (withdrawn) await api.restore(scheduleId, idOf(s), note);
        else await api.withdraw(scheduleId, idOf(s), note);
        await load();
        onChanged?.();
      },
    });
  };

  const sorted = useMemo(() => [...list].sort((a, b) => Number(isWithdrawn(a)) - Number(isWithdrawn(b)) || (a.name || "").localeCompare(b.name || "")), [list]);

  if (loading) return <PageSpinner />;

  const q = query.trim().toLowerCase();
  const filtered = q ? sorted.filter((s) => `${s.name} ${s.code || ""}`.toLowerCase().includes(q)) : sorted;

  const addBtn = <Button onClick={() => open(null)}><Plus className="w-4 h-4" />Add subject</Button>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-[#6A6F85]">{list.length} subject{list.length === 1 ? "" : "s"}</p>
        {!readOnly && list.length > 0 && <Button size="sm" onClick={() => open(null)}><Plus className="w-4 h-4" /><span>Add<span className="hidden sm:inline"> subject</span></span></Button>}
      </div>

      <Alert type="error">{error}</Alert>

      {list.length > 6 && (
        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#6A6F85]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subjects"
            aria-label="Search subjects"
            className="w-full h-11 pl-10 pr-4 rounded-2xl bg-white/65 border border-white/80 shadow-[inset_0_1px_0_#fff] text-[16px] sm:text-[14px] text-[#161827] placeholder:text-[#6A6F85]/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState icon={BookOpen} title="No official subjects yet" text="Add the subjects for your section. Weekly classes are attached to them." action={!readOnly && addBtn} />
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#161827]/15 px-4 py-6 text-center text-[13.5px] text-[#6A6F85]">No subject matches “{query}”.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((s) => {
            const w = isWithdrawn(s);
            return (
              <Card key={idOf(s)} className={cx("p-3.5 sm:p-4 flex items-center gap-3", w && "opacity-60")}>
                <span
                  aria-hidden="true"
                  className={cx(
                    "w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center text-[12px] font-semibold tracking-wide",
                    w ? "bg-[#161827]/8 text-[#6A6F85]" : "bg-gradient-to-br from-[#5B52EE]/15 to-[#2B8DE0]/15 text-indigo-700"
                  )}
                >
                  {shortOf(s.name, s.code).slice(0, 5)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-[#161827] truncate">{s.name}</p>
                  <p className="text-[12.5px] text-[#6A6F85] mt-0.5 truncate">
                    {s.code ? `Code ${s.code}` : "No code"}
                  </p>
                  {w && <div className="mt-1"><Badge tone="amber">Withdrawn</Badge></div>}
                </div>
                {!readOnly && <RowActions withdrawn={w} onEdit={() => open(s)} onToggle={() => toggle(s)} />}
              </Card>
            );
          })}
        </div>
      )}

      <FormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add subject" : "Edit subject"}
        onSubmit={save}
        submitLabel={editing === "new" ? "Add subject" : "Save changes"}
        saving={saving}
        dirty={dirty}
        error={formError}
      >
        <Field label="Subject name" value={form.name} onChange={setField("name")} error={errors.name} placeholder="Operating Systems" maxLength={80} autoFocus autoCapitalize="words" enterKeyHint="next" />
        <Field label="Code (optional)" value={form.code} onChange={setField("code")} error={errors.code} placeholder="CS301" maxLength={20} autoCapitalize="characters" enterKeyHint="next" />
        <Field label="Note for the history (optional)" value={form.note} onChange={setField("note")} maxLength={200} enterKeyHint="done" />
      </FormModal>
      {noteDialog}
    </div>
  );
};

export default SubjectsPanel;
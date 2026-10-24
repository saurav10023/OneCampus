import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Eye, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { officialSchedulesApi, errMsg, toDateInput } from "../../api/endpoints";
import { askNote, isWithdrawn } from "../../lib/prompt";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageSpinner, Summary, cx, fmtDate } from "../../components/Ui";

const CLASS_TYPES = ["lecture", "lab", "tutorial"]; // edit if your backend allows more
const api = officialSchedulesApi.items;

// Works whether the backend returns `_id` or `id`
const idOf = (x) => x?._id || x?.id;
const keyOf = (s) => s.key || idOf(s);

// What each kind of item needs
const KINDS = {
  quiz: { label: "Quiz", tone: "brand", slots: ["quiz_1", "quiz_2"], subject: true, times: true, single: true },
  exam: { label: "Exam", tone: "brand", slots: ["midsem", "endsem"], subject: "optional", times: "optional" },
  holiday: { label: "Holiday", tone: "red" },
  event: { label: "Event", tone: "green", times: "optional" },
  mass_bunk: { label: "Mass bunk", tone: "amber" },
  class_cancel: { label: "Class cancel", tone: "red", subject: true, times: true, single: true, classType: true, group: true },
};

const blank = { kind: "holiday", title: "", startDate: "", endDate: "", startTime: "", endTime: "", subjectKey: "", slotKey: "", classType: "lecture", group: "", note: "" };

const ItemsPanel = ({ schedule, scheduleId: scheduleIdProp, readOnly, onChanged }) => {
  const scheduleId = scheduleIdProp || idOf(schedule);

  const [items, setItems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    if (!scheduleId) return;
    try {
      const [i, s] = await Promise.all([api.list(scheduleId), officialSchedulesApi.subjects.list(scheduleId)]);
      setItems(i);
      setSubjects(s.filter((x) => !isWithdrawn(x)));
    } catch (e) {
      setError(errMsg(e, "Could not load items"));
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = useMemo(() => {
    const m = {};
    subjects.forEach((s) => {
      m[keyOf(s)] = s.name;
      m[idOf(s)] = s.name;
    });
    return (it) => it.subjectName || it.subject?.name || m[it.subjectKey?._id || it.subjectKey] || "";
  }, [subjects]);

  const cfg = KINDS[form.kind] || {};
  const set = (k) => (e) => {
    setPreview(null);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const open = (it) => {
    setEditing(it || "new");
    setFormError("");
    setPreview(null);
    setForm(
      it
        ? {
            kind: it.kind,
            title: it.title || "",
            startDate: toDateInput(it.startDate),
            endDate: toDateInput(it.endDate),
            startTime: it.startTime || "",
            endTime: it.endTime || "",
            subjectKey: it.subjectKey?._id || it.subjectKey || "",
            slotKey: it.slotKey || "",
            classType: it.classType || "lecture",
            group: it.group || "",
            note: "",
          }
        : blank
    );
  };

  // Build the request body, or return an error string
  const buildBody = () => {
    const single = cfg.single;
    const endDate = single ? form.startDate : form.endDate;
    if (!form.title.trim()) return "Give it a title.";
    if (!form.startDate) return "Pick a date.";
    if (endDate < form.startDate) return "End date must be on or after the start date.";
    if (cfg.slots && !form.slotKey) return `Choose which one this is (${cfg.slots.join(" / ")}).`;
    if (cfg.subject === true && !form.subjectKey) return "Choose a subject.";
    if (cfg.times === true && (!form.startTime || !form.endTime)) return "Add start and end times.";
    if (form.startTime && form.endTime && form.endTime <= form.startTime) return "End time must be after the start time.";

    const body = { kind: form.kind, title: form.title.trim(), startDate: form.startDate, endDate };
    if (cfg.slots) body.slotKey = form.slotKey;
    if (cfg.subject && form.subjectKey) body.subjectKey = form.subjectKey;
    if (cfg.times && form.startTime && form.endTime) {
      body.startTime = form.startTime;
      body.endTime = form.endTime;
    }
    if (cfg.classType) body.classType = form.classType;
    if (cfg.group) body.group = form.group || null;
    if (form.note.trim()) body.note = form.note.trim();
    return body;
  };

  const runPreview = async () => {
    const body = buildBody();
    if (typeof body === "string") return setFormError(body);
    setFormError("");
    setPreviewing(true);
    try {
      setPreview(await officialSchedulesApi.actions.impactPreview(scheduleId, body));
    } catch (e) {
      setFormError(errMsg(e, "Could not preview the impact"));
    } finally {
      setPreviewing(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const body = buildBody();
    if (typeof body === "string") return setFormError(body);
    setSaving(true);
    setFormError("");
    try {
      if (editing === "new") await api.create(scheduleId, body);
      else await api.update(scheduleId, idOf(editing), body);
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      setFormError(errMsg(err, "Could not save the item"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (it) => {
    const w = isWithdrawn(it);
    const note = askNote(w ? "Restore this item. Note (optional)" : "Withdraw this item. Students get their classes back. Note (optional)");
    if (note === null) return;
    try {
      if (w) await api.restore(scheduleId, idOf(it), note);
      else await api.withdraw(scheduleId, idOf(it), note);
      await load();
      onChanged?.();
    } catch (err) {
      setError(errMsg(err, "Could not update the item"));
    }
  };

  if (loading) return <PageSpinner />;

  const shown = items.filter((i) => !filter || i.kind === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {[["", "All"], ...Object.entries(KINDS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cx(
                "h-8 px-3.5 rounded-full text-[12.5px] font-medium border transition",
                filter === k ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] border-transparent" : "bg-white/55 border-white/80 text-[#161827]/75 hover:bg-white/85"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {!readOnly && <Button size="sm" onClick={() => open(null)}><Plus className="w-4 h-4" />Add item</Button>}
      </div>

      <Alert type="error">{error}</Alert>

      {shown.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Nothing here yet" text="Declare quizzes, exams, holidays, mass bunks and single-class cancellations for your section." />
      ) : (
        <div className="space-y-3">
          {shown.map((it) => {
            const k = KINDS[it.kind] || { label: it.kind, tone: "neutral" };
            const w = isWithdrawn(it);
            const subj = nameOf(it);
            return (
              <Card key={idOf(it)} className={`p-5 flex flex-wrap items-center justify-between gap-3 ${w ? "opacity-60" : ""}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15.5px] font-semibold text-[#161827]">{it.title}</p>
                    <Badge tone={k.tone}>{k.label}</Badge>
                    {it.slotKey && <Badge>{it.slotKey}</Badge>}
                    {w && <Badge tone="amber">Withdrawn</Badge>}
                  </div>
                  <p className="text-[13px] text-[#6A6F85] mt-1">
                    {fmtDate(it.startDate)}
                    {toDateInput(it.startDate) !== toDateInput(it.endDate) && ` → ${fmtDate(it.endDate)}`}
                    {it.startTime && ` · ${it.startTime}–${it.endTime}`}
                    {subj && ` · ${subj}`}
                    {it.group && ` · ${it.group}`}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex gap-0.5">
                    {!w && <button onClick={() => open(it)} aria-label="Edit" className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80"><Pencil className="w-4 h-4" /></button>}
                    <button onClick={() => toggle(it)} aria-label={w ? "Restore" : "Withdraw"} className={`w-9 h-9 rounded-full flex items-center justify-center ${w ? "text-[#161827]/70 hover:bg-white/80" : "text-rose-600 hover:bg-rose-50"}`}>
                      {w ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add item" : "Edit item"}>
        <form onSubmit={save} className="space-y-4">
          <Alert type="error">{formError}</Alert>

          <Field as="select" label="Kind" value={form.kind} onChange={set("kind")} disabled={editing !== "new"}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Field>
          <Field label="Title" value={form.title} onChange={set("title")} placeholder="OS lecture cancelled" required />

          {cfg.slots && (
            <Field as="select" label="Which one" value={form.slotKey} onChange={set("slotKey")} required>
              <option value="">Choose…</option>
              {cfg.slots.map((s) => <option key={s} value={s}>{s}</option>)}
            </Field>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={cfg.single ? "Date" : "Start date"} type="date" value={form.startDate} onChange={set("startDate")} required />
            {!cfg.single && <Field label="End date" type="date" value={form.endDate} onChange={set("endDate")} required />}
          </div>

          {cfg.subject && (
            <Field as="select" label={cfg.subject === true ? "Subject" : "Subject (optional)"} value={form.subjectKey} onChange={set("subjectKey")}>
              <option value="">{cfg.subject === true ? "Choose a subject…" : "None"}</option>
              {subjects.map((s) => <option key={idOf(s)} value={keyOf(s)}>{s.name}</option>)}
            </Field>
          )}

          {cfg.times && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={cfg.times === true ? "Start time" : "Start time (optional)"} type="time" value={form.startTime} onChange={set("startTime")} />
              <Field label={cfg.times === true ? "End time" : "End time (optional)"} type="time" value={form.endTime} onChange={set("endTime")} />
            </div>
          )}

          {(cfg.classType || cfg.group) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {cfg.classType && (
                <Field as="select" label="Class type" value={form.classType} onChange={set("classType")}>
                  {CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Field>
              )}
              {cfg.group && (
                <Field as="select" label="Group (optional)" value={form.group} onChange={set("group")}>
                  <option value="">Whole section</option>
                  {(schedule?.groups || []).map((g) => <option key={g.key} value={g.key}>{g.label || g.key}</option>)}
                </Field>
              )}
            </div>
          )}

          <Field label="Note (optional)" value={form.note} onChange={set("note")} placeholder="Professor is out of station" />

          {preview && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-2">Impact on joined students</p>
              <Summary data={preview} />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {editing === "new" && (
              <Button type="button" variant="glass" loading={previewing} onClick={runPreview}><Eye className="w-4 h-4" />Preview impact</Button>
            )}
            <Button type="submit" loading={saving}>{editing === "new" ? "Save and sync" : "Save changes"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ItemsPanel;
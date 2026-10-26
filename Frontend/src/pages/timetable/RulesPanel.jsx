import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Pencil, Power, Trash2 } from "lucide-react";
import { rulesApi, subjectsApi, errMsg, toDateInput } from "../../api/endpoints";
import { WEEKDAYS } from "../../lib/dates";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageSpinner, Warnings } from "../../components/Ui";

// Edit this list if your backend allows other class types.
const CLASS_TYPES = ["lecture", "lab", "tutorial"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

const blank = (setup) => ({
  subjectId: "",
  weekday: "1",
  startTime: "09:00",
  endTime: "10:00",
  classType: "lecture",
  group: "",
  professor: "",
  room: "",
  attendanceUnits: "1",
  effectiveStartDate: toDateInput(setup.startDate),
  effectiveEndDate: toDateInput(setup.endDate),
  effectiveFrom: "",
});

// The server answers 409 for several reasons (overlap, archived subject, 150-rule limit,
// archived setup). Only an overlap can be confirmed, and the server says so by asking for confirmOverlap.
const isOverlapConflict = (e) =>
  e?.response?.status === 409 &&
  (e.response.data?.errors || []).some((x) => /confirmOverlap/i.test(String(x)));

const RulesPanel = ({ setup, onChanged }) => {
  const setupId = setup._id;
  const readOnly = setup.status === "archived";

  const [rules, setRules] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const [editing, setEditing] = useState(null); // null | "new" | rule
  const [form, setForm] = useState(() => blank(setup));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [overlap, setOverlap] = useState(null); // list of clashing classes when the server asks to confirm

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        rulesApi.list(setupId),
        subjectsApi.list(setupId, { limit: 100, isActive: true }),
      ]);
      setRules(r);
      setSubjects(s.subjects || []);
    } catch (e) {
      setError(errMsg(e, "Could not load weekly classes"));
    } finally {
      setLoading(false);
    }
  }, [setupId]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = {};
    rules.forEach((r) => { (map[r.weekday] = map[r.weekday] || []).push(r); });
    Object.values(map).forEach((l) => l.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [rules]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openForm = (rule) => {
    setOverlap(null);
    setFormError("");
    setEditing(rule || "new");
    setForm(
      rule
        ? {
            subjectId: rule.subjectId?._id || rule.subjectId || "",
            weekday: String(rule.weekday),
            startTime: rule.startTime,
            endTime: rule.endTime,
            classType: rule.classType || "lecture",
            group: rule.group || "",
            professor: rule.professor || "",
            room: rule.room || "",
            attendanceUnits: String(rule.attendanceUnits ?? 1),
            effectiveStartDate: toDateInput(rule.effectiveStartDate) || toDateInput(setup.startDate),
            effectiveEndDate: toDateInput(rule.effectiveEndDate) || toDateInput(setup.endDate),
            effectiveFrom: "",
          }
        : blank(setup)
    );
  };

  const submit = async (confirmOverlap = false) => {
    setFormError("");
    if (form.endTime <= form.startTime) return setFormError("End time must be after the start time.");
    if (!form.subjectId) return setFormError("Choose a subject.");

    const body = {
      subjectId: form.subjectId,
      weekday: Number(form.weekday),
      startTime: form.startTime,
      endTime: form.endTime,
      classType: form.classType,
      group: form.group.trim() || null,
      professor: form.professor.trim(),
      room: form.room.trim(),
      attendanceUnits: Number(form.attendanceUnits) || 1,
      effectiveStartDate: form.effectiveStartDate,
      effectiveEndDate: form.effectiveEndDate,
      confirmOverlap,
    };
    if (editing !== "new" && form.effectiveFrom) body.effectiveFrom = form.effectiveFrom;

    setSaving(true);
    try {
      const data = editing === "new" ? await rulesApi.create(setupId, body) : await rulesApi.update(setupId, editing._id, body);
      setResult(data);
      setEditing(null);
      setOverlap(null);
      await load();
      onChanged?.();
    } catch (e) {
      if (!confirmOverlap && isOverlapConflict(e)) {
        // Show the clashing classes, but leave out the "send confirmOverlap" instruction line.
        const lines = (e.response.data.errors || []).filter((x) => !/confirmOverlap/i.test(String(x)));
        setOverlap(lines.length ? lines : [e.response.data?.message || "This class overlaps another one."]);
      } else {
        // Any other 409 (archived subject, 150 rules limit, archived setup) is a normal error.
        setOverlap(null);
        setFormError(errMsg(e, "Could not save the class"));
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rule) => {
    try {
      setResult(await rulesApi.update(setupId, rule._id, { isActive: !rule.isActive }));
      await load();
      onChanged?.();
    } catch (e) {
      setError(errMsg(e, "Could not update the class"));
    }
  };

  const remove = async (rule) => {
    try {
      const impact = await rulesApi.deleteImpact(setupId, rule._id);
      const recorded = impact?.recordedClasses || 0;
      const text = recorded
        ? `This removes ${impact.classes} classes, ${recorded} of them with attendance already recorded. This cannot be undone. Tip: switching the class off keeps your history.\n\nDelete anyway?`
        : `Delete this weekly class and its ${impact?.classes ?? 0} generated classes?`;
      if (!window.confirm(text)) return;
      setResult(await rulesApi.remove(setupId, rule._id, true));
      await load();
      onChanged?.();
    } catch (e) {
      setError(errMsg(e, "Could not delete the class"));
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-[#6A6F85]">{rules.length} weekly class{rules.length === 1 ? "" : "es"}</p>
        {!readOnly && (
          <Button size="sm" onClick={() => openForm(null)} disabled={subjects.length === 0}>
            <CalendarPlus className="w-4 h-4" />Add weekly class
          </Button>
        )}
      </div>

      <Alert type="error">{error}</Alert>
      <Warnings data={result} />
      {subjects.length === 0 && !readOnly && (
        <Alert type="warning">Add at least one subject (Setups &gt; open your setup &gt; Subjects) before creating weekly classes.</Alert>
      )}

      {rules.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="No weekly classes yet" text="Add your recurring slots once; every class for the semester is generated for you." />
      ) : (
        ORDER.filter((d) => byDay[d]?.length).map((d) => (
          <div key={d}>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6A6F85] mb-2 px-1">{WEEKDAYS[d]}</p>
            <div className="space-y-3">
              {byDay[d].map((r) => (
                <Card key={r._id} className={`p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 ${r.isActive === false ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold text-[#161827]">{r.subjectId?.name || "Subject"}</p>
                      {r.classType && <Badge>{r.classType}</Badge>}
                      {r.group && <Badge tone="brand">{r.group}</Badge>}
                      {r.origin === "official" && <Badge tone="green">Official</Badge>}
                      {r.isActive === false && <Badge tone="amber">Off</Badge>}
                    </div>
                    <p className="text-[13px] text-[#6A6F85] mt-1">
                      {r.startTime}-{r.endTime}
                      {r.room && ` - ${r.room}`}
                      {r.professor && ` - ${r.professor}`}
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleActive(r)} aria-label={r.isActive === false ? "Turn on" : "Turn off"} title={r.isActive === false ? "Turn on" : "Turn off"} className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80"><Power className="w-4 h-4" /></button>
                      <button onClick={() => openForm(r)} aria-label="Edit" className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => remove(r)} aria-label="Delete" className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add weekly class" : "Edit weekly class"}>
        <form onSubmit={(e) => { e.preventDefault(); submit(false); }} className="space-y-4">
          <Alert type="error">{formError}</Alert>

          {editing !== "new" && editing?.origin === "official" && (
            <Alert type="info">
              This class comes from your CR&apos;s schedule. Changing the subject, day, time, dates, type or group makes it your own copy,
              and CR updates to it will stop. Changing only the room or professor keeps it linked.
            </Alert>
          )}

          {overlap && (
            <Alert type="warning" className="space-y-2">
              {overlap.map((w, i) => <p key={i}>{w}</p>)}
              <Button type="button" size="sm" variant="glass" loading={saving} onClick={() => submit(true)}>Save anyway</Button>
            </Alert>
          )}

          <Field as="select" label="Subject" value={form.subjectId} onChange={set("subjectId")} required>
            <option value="">Choose a subject...</option>
            {subjects.map((s) => <option key={s._id} value={s._id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}
          </Field>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field as="select" label="Day" value={form.weekday} onChange={set("weekday")}>
              {ORDER.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
            </Field>
            <Field label="Start" type="time" value={form.startTime} onChange={set("startTime")} required />
            <Field label="End" type="time" value={form.endTime} onChange={set("endTime")} required />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field as="select" label="Type" value={form.classType} onChange={set("classType")}>
              {CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Field>
            <Field label="Units" type="number" min="1" max="6" value={form.attendanceUnits} onChange={set("attendanceUnits")} hint="A 2-hour lab is often 2 units." />
            <Field label="Room" value={form.room} onChange={set("room")} placeholder="LH-201" />
            <Field label="Professor" value={form.professor} onChange={set("professor")} placeholder="Dr. Sharma" />
            <Field label="Group / batch (optional)" value={form.group} onChange={set("group")} placeholder="lab-b1" className="sm:col-span-2" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Runs from" type="date" value={form.effectiveStartDate} onChange={set("effectiveStartDate")} required />
            <Field label="Runs until" type="date" value={form.effectiveEndDate} onChange={set("effectiveEndDate")} required />
          </div>

          {editing !== "new" && (
            <Field label="Apply changes from (optional)" type="date" value={form.effectiveFrom} onChange={set("effectiveFrom")} hint="Defaults to today. Past classes and attendance are never changed." />
          )}

          <Button type="submit" loading={saving && !overlap}>{editing === "new" ? "Add class" : "Save changes"}</Button>
        </form>
      </Modal>
    </div>
  );
};

export default RulesPanel;
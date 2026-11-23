import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Pencil, Power, Trash2 } from "lucide-react";
import { rulesApi, subjectsApi, errMsg, toDateInput } from "../../api/endpoints";
import { WEEKDAYS } from "../../lib/dates";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageSpinner, Warnings, cx } from "../../components/Ui";

// Edit this list if your backend allows other class types.
const CLASS_TYPES = ["lecture", "lab", "tutorial"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1";

// 44px touch target on phones, 40px from sm
const iconBtn =
  "w-11 h-11 sm:w-10 sm:h-10 shrink-0 rounded-xl flex items-center justify-center transition-colors motion-reduce:transition-none active:scale-[0.98] " +
  FOCUS;

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
    <div className="space-y-4 sm:space-y-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-[color:var(--muted)] tabular-nums">{rules.length} weekly class{rules.length === 1 ? "" : "es"}</p>
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
            <p className="text-[13px] font-semibold text-[color:var(--body)] mb-2 px-1">{WEEKDAYS[d]}</p>
            <div className="space-y-2.5">
              {byDay[d].map((r) => (
                <Card key={r._id} className={cx("p-3.5 min-[380px]:p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 min-w-0", r.isActive === false && "opacity-60")}>
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold text-[color:var(--ink)] min-w-0 break-words">{r.subjectId?.name || "Subject"}</p>
                      {r.classType && <Badge>{r.classType}</Badge>}
                      {r.group && <Badge tone="brand">{r.group}</Badge>}
                      {r.origin === "official" && <Badge tone="green">Official</Badge>}
                      {r.isActive === false && <Badge tone="amber">Off</Badge>}
                    </div>
                    <p className="text-[13px] text-[color:var(--muted)] mt-1 tabular-nums break-words">
                      {r.startTime}-{r.endTime}
                      {r.room && ` - ${r.room}`}
                      {r.professor && ` - ${r.professor}`}
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onClick={() => toggleActive(r)} aria-label={r.isActive === false ? "Turn on" : "Turn off"} title={r.isActive === false ? "Turn on" : "Turn off"} className={cx(iconBtn, "text-[color:var(--body)] hover:bg-[color:var(--inset)]")}>
                        <Power className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => openForm(r)} aria-label="Edit" title="Edit" className={cx(iconBtn, "text-[color:var(--body)] hover:bg-[color:var(--inset)]")}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => remove(r)} aria-label="Delete" title="Delete" className={cx(iconBtn, "text-rose-600 hover:bg-rose-50")}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add weekly class" : "Edit weekly class"}>
        {/* @container: every grid below follows the width of the dialog, not the screen, so fields never overlap */}
        <form onSubmit={(e) => { e.preventDefault(); submit(false); }} className="@container space-y-4 min-w-0">
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

          <div className="grid grid-cols-1 @md:grid-cols-3 gap-4 min-w-0">
            <Field as="select" label="Day" value={form.weekday} onChange={set("weekday")}>
              {ORDER.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
            </Field>
            <Field label="Start" type="time" value={form.startTime} onChange={set("startTime")} required />
            <Field label="End" type="time" value={form.endTime} onChange={set("endTime")} required />
          </div>

          <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 min-w-0">
            <Field as="select" label="Type" value={form.classType} onChange={set("classType")}>
              {CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Field>
            <Field label="Units" type="number" min="1" max="6" value={form.attendanceUnits} onChange={set("attendanceUnits")} hint="A 2-hour lab is often 2 units." />
            <Field label="Room" value={form.room} onChange={set("room")} placeholder="LH-201" />
            <Field label="Professor" value={form.professor} onChange={set("professor")} placeholder="Dr. Sharma" />
            <div className="@md:col-span-2 min-w-0">
              <Field label="Group or batch (optional)" value={form.group} onChange={set("group")} placeholder="lab-b1" />
            </div>
          </div>

          <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 min-w-0">
            <Field label="Runs from" type="date" value={form.effectiveStartDate} onChange={set("effectiveStartDate")} required />
            <Field label="Runs until" type="date" value={form.effectiveEndDate} onChange={set("effectiveEndDate")} required />
          </div>

          {editing !== "new" && (
            <Field label="Apply changes from (optional)" type="date" value={form.effectiveFrom} onChange={set("effectiveFrom")} hint="Defaults to today. Past classes and attendance are never changed." />
          )}

          <Button type="submit" loading={saving && !overlap} className="w-full @md:w-auto">{editing === "new" ? "Add class" : "Save changes"}</Button>
        </form>
      </Modal>
    </div>
  );
};

export default RulesPanel;
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { officialSchedulesApi, errMsg, toDateInput } from "../../api/endpoints";
import { WEEKDAYS } from "../../lib/dates";
import { askNote, isWithdrawn } from "../../lib/prompt";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageSpinner, fmtDate } from "../../components/Ui";

const CLASS_TYPES = ["lecture", "lab", "tutorial"]; // edit if your backend allows more
const ORDER = [1, 2, 3, 4, 5, 6, 0];

// Works whether the backend returns `_id` or `id`
const idOf = (x) => x?._id || x?.id;
const keyOf = (s) => s.key || idOf(s);

const blankShared = { subjectKey: "", entryType: "weekly", group: "", professor: "", attendanceUnits: "1", note: "" };
const blankSlot = { weekday: "1", date: "", startTime: "09:00", endTime: "10:00", classType: "lecture", room: "" };

const OfficialRules = ({ schedule, scheduleId: scheduleIdProp, readOnly, onChanged }) => {
  const scheduleId = scheduleIdProp || idOf(schedule);
  const api = officialSchedulesApi.rules;

  const [rules, setRules] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankShared);
  const [slots, setSlots] = useState([blankSlot]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!scheduleId) return;
    try {
      const [r, s] = await Promise.all([api.list(scheduleId), officialSchedulesApi.subjects.list(scheduleId)]);
      setRules(r);
      setSubjects(s.filter((x) => !isWithdrawn(x)));
    } catch (e) {
      setError(errMsg(e, "Could not load classes"));
    } finally {
      setLoading(false);
    }
  }, [scheduleId, api]);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = useMemo(() => {
    const m = {};
    subjects.forEach((s) => {
      m[keyOf(s)] = s.name;
      m[idOf(s)] = s.name;
    });
    return (r) => r.subjectName || r.subject?.name || m[r.subjectKey?._id || r.subjectKey] || "Subject";
  }, [subjects]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSlot = (i, k) => (e) => setSlots((a) => a.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));

  const open = (r) => {
    setEditing(r || "new");
    setFormError("");
    if (r) {
      setForm({
        subjectKey: r.subjectKey?._id || r.subjectKey || "",
        entryType: r.entryType || "weekly",
        group: r.group || "",
        professor: r.professor || "",
        attendanceUnits: String(r.attendanceUnits ?? 1),
        note: "",
      });
      setSlots([
        {
          weekday: String(r.weekday ?? 1),
          date: toDateInput(r.effectiveStartDate),
          startTime: r.startTime || "09:00",
          endTime: r.endTime || "10:00",
          classType: r.classType || "lecture",
          room: r.room || "",
        },
      ]);
    } else {
      setForm(blankShared);
      setSlots([blankSlot]);
    }
  };

  // Copies the last slot and moves it to the next weekday, so a "Mon/Wed/Fri 9-10" pattern is quick to build.
  const addSlot = () =>
    setSlots((a) => {
      const last = a[a.length - 1] || blankSlot;
      const next = ORDER[(ORDER.indexOf(Number(last.weekday)) + 1) % ORDER.length];
      return [...a, { ...last, weekday: String(next), date: "" }];
    });

  const removeSlot = (i) => setSlots((a) => a.filter((_, j) => j !== i));

  const buildBody = (slot, { isEdit = false } = {}) => {
    const body = {
      subjectKey: form.subjectKey,
      startTime: slot.startTime,
      endTime: slot.endTime,
      classType: slot.classType,
      group: form.group || null,
      room: slot.room.trim(),
      professor: form.professor.trim(),
      attendanceUnits: Number(form.attendanceUnits) || 1,
    };
    // The server forbids changing entryType on an existing class,
    // so it is only sent when creating.
    if (!isEdit) body.entryType = form.entryType;
    if (form.note.trim()) body.note = form.note.trim();
    if (form.entryType === "makeup") {
      body.effectiveStartDate = slot.date;
      body.effectiveEndDate = slot.date;
      body.weekday = new Date(`${slot.date}T00:00:00Z`).getUTCDay();
    } else {
      body.weekday = Number(slot.weekday);
    }
    return body;
  };

  const slotLabel = (s) => (form.entryType === "makeup" ? s.date || "no date" : WEEKDAYS[Number(s.weekday)]);

  const validate = () => {
    if (!form.subjectKey) return "Choose a subject.";
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.endTime <= s.startTime) return `Slot ${i + 1}: end time must be after the start time.`;
      if (form.entryType === "makeup" && !s.date) return `Slot ${i + 1}: pick the makeup class date.`;
    }
    // overlap check between the new slots themselves
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        const sameDay = form.entryType === "makeup" ? a.date === b.date : a.weekday === b.weekday;
        if (sameDay && a.startTime < b.endTime && b.startTime < a.endTime) {
          return `Slots ${i + 1} and ${j + 1} overlap on ${slotLabel(a)}.`;
        }
      }
    }
    return "";
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    const problem = validate();
    if (problem) return setFormError(problem);

    setSaving(true);
    try {
      // editing one existing class
      if (editing !== "new") {
        await api.update(scheduleId, idOf(editing), buildBody(slots[0], { isEdit: true }));
        setEditing(null);
        await load();
        onChanged?.();
        return;
      }

      // creating several slots: one request per slot, in order
      const failed = [];
      let created = 0;
      for (let i = 0; i < slots.length; i++) {
        try {
          await api.create(scheduleId, buildBody(slots[i]));
          created++;
        } catch (err) {
          failed.push({ slot: slots[i], index: i, message: errMsg(err, "failed") });
        }
      }

      if (created > 0) {
        await load();
        onChanged?.();
      }

      if (failed.length === 0) {
        setEditing(null);
      } else {
        // keep only the slots that failed so you can fix and retry them
        setSlots(failed.map((f) => f.slot));
        setFormError(
          `${created} added, ${failed.length} failed. ` +
            failed.map((f) => `${slotLabel(f.slot)} ${f.slot.startTime}-${f.slot.endTime}: ${f.message}`).join(" | ")
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r) => {
    const w = isWithdrawn(r);
    const note = askNote(w ? "Restore this class. Note (optional)" : "Withdraw this class. Joined students lose it. Note (optional)");
    if (note === null) return;
    try {
      if (w) await api.restore(scheduleId, idOf(r), note);
      else await api.withdraw(scheduleId, idOf(r), note);
      await load();
      onChanged?.();
    } catch (err) {
      setError(errMsg(err, "Could not update the class"));
    }
  };

  if (loading) return <PageSpinner />;

  const weekly = rules.filter((r) => r.entryType !== "makeup");
  const makeups = rules.filter((r) => r.entryType === "makeup");
  const creating = editing === "new";
  const isMakeup = form.entryType === "makeup";

  const Row = ({ r }) => {
    const w = isWithdrawn(r);
    return (
      <Card className={`p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 ${w ? "opacity-60" : ""}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-[#161827]">{nameOf(r)}</p>
            {r.classType && <Badge>{r.classType}</Badge>}
            {r.group && <Badge tone="brand">{r.group}</Badge>}
            {w && <Badge tone="amber">Withdrawn</Badge>}
          </div>
          <p className="text-[13px] text-[#6A6F85] mt-1">
            {r.entryType === "makeup" ? fmtDate(r.effectiveStartDate) : WEEKDAYS[r.weekday]} · {r.startTime}–{r.endTime}
            {r.room && ` · ${r.room}`}
            {r.professor && ` · ${r.professor}`}
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-0.5">
            {!w && <button onClick={() => open(r)} aria-label="Edit" className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80"><Pencil className="w-4 h-4" /></button>}
            <button onClick={() => toggle(r)} aria-label={w ? "Restore" : "Withdraw"} className={`w-9 h-9 rounded-full flex items-center justify-center ${w ? "text-[#161827]/70 hover:bg-white/80" : "text-rose-600 hover:bg-rose-50"}`}>
              {w ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-[#6A6F85]">{weekly.length} weekly · {makeups.length} makeup</p>
        {!readOnly && <Button size="sm" onClick={() => open(null)} disabled={subjects.length === 0}><CalendarPlus className="w-4 h-4" />Add class</Button>}
      </div>

      <Alert type="error">{error}</Alert>
      {subjects.length === 0 && !readOnly && <Alert type="warning">Add an official subject first.</Alert>}

      {rules.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="No classes yet" text="Add the weekly timetable and any one-day makeup classes." />
      ) : (
        <>
          {ORDER.filter((d) => weekly.some((r) => r.weekday === d)).map((d) => (
            <div key={d}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6A6F85] mb-2 px-1">{WEEKDAYS[d]}</p>
              <div className="space-y-3">
                {weekly.filter((r) => r.weekday === d).sort((a, b) => a.startTime.localeCompare(b.startTime)).map((r) => <Row key={idOf(r)} r={r} />)}
              </div>
            </div>
          ))}
          {makeups.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6A6F85] mb-2 px-1">Makeup classes</p>
              <div className="space-y-3">{makeups.map((r) => <Row key={idOf(r)} r={r} />)}</div>
            </div>
          )}
        </>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={creating ? "Add class" : "Edit class"}>
        <form onSubmit={save} className="space-y-4">
          <Alert type="error">{formError}</Alert>

          {/* shared across every slot */}
          <Field as="select" label="Subject" value={form.subjectKey} onChange={set("subjectKey")} required>
            <option value="">Choose a subject…</option>
            {subjects.map((s) => <option key={idOf(s)} value={keyOf(s)}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              as="select"
              label="Kind"
              value={form.entryType}
              onChange={set("entryType")}
              disabled={!creating}
              hint={!creating ? "To change this, withdraw the class and add a new one." : undefined}
            >
              <option value="weekly">Weekly class</option>
              <option value="makeup">Makeup class (one day)</option>
            </Field>
            <Field label="Units" type="number" min="1" max="6" value={form.attendanceUnits} onChange={set("attendanceUnits")} />
            <Field as="select" label="Group (optional)" value={form.group} onChange={set("group")} hint="Leave empty for the whole section.">
              <option value="">Whole section</option>
              {(schedule?.groups || []).map((g) => <option key={g.key} value={g.key}>{g.label || g.key}</option>)}
            </Field>
            <Field label="Professor" value={form.professor} onChange={set("professor")} placeholder="Dr. Sharma" />
          </div>

          {/* one block per time slot */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85]">
                {creating ? `Time slots (${slots.length})` : "Time slot"}
              </span>
              {creating && (
                <button type="button" onClick={addSlot} className="text-[13px] text-indigo-600 font-medium hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />Add another slot
                </button>
              )}
            </div>

            <div className="space-y-3">
              {slots.map((s, i) => (
                <div key={i} className="rounded-2xl bg-white/60 border border-white/80 p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12.5px] font-semibold text-[#161827]">Slot {i + 1}</span>
                    {creating && slots.length > 1 && (
                      <button type="button" onClick={() => removeSlot(i)} aria-label="Remove slot" className="w-8 h-8 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {isMakeup ? (
                      <Field label="Date" type="date" value={s.date} onChange={setSlot(i, "date")} required />
                    ) : (
                      <Field as="select" label="Day" value={s.weekday} onChange={setSlot(i, "weekday")}>
                        {ORDER.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                      </Field>
                    )}
                    <Field label="Start" type="time" value={s.startTime} onChange={setSlot(i, "startTime")} required />
                    <Field label="End" type="time" value={s.endTime} onChange={setSlot(i, "endTime")} required />
                    <Field as="select" label="Type" value={s.classType} onChange={setSlot(i, "classType")}>
                      {CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </Field>
                    <Field label="Room" value={s.room} onChange={setSlot(i, "room")} placeholder="LH-201" className="col-span-1 sm:col-span-2" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Field label="Note for the history (optional)" value={form.note} onChange={set("note")} />
          <Button type="submit" loading={saving}>
            {creating ? (slots.length > 1 ? `Add ${slots.length} classes` : "Add class") : "Save changes"}
          </Button>
        </form>
      </Modal>
    </div>
  );
};

export default OfficialRules;
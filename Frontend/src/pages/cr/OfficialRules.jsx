import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronDown, Plus, X } from "lucide-react";
import { officialSchedulesApi, errMsg, toDateInput } from "../../api/endpoints";
import { WEEKDAYS } from "../../lib/dates";
import { isWithdrawn } from "../../lib/prompt";
import { Alert, Badge, Button, Card, EmptyState, Field, PageSpinner, cx, fmtDate } from "../../components/Ui";
import { FormLabel, FormModal, RowActions, focusFirstInvalid, shortOf, useNoteDialog } from "../../components/FormKit";

const CLASS_TYPES = ["lecture", "lab", "tutorial"]; // edit if your backend allows more
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const idOf = (x) => x?._id || x?.id; // works whether the backend returns `_id` or `id`
const keyOf = (s) => s.key || idOf(s);

const blankShared = { subjectKey: "", entryType: "weekly", group: "", professor: "", attendanceUnits: "1", note: "" };
const blankSlot = { weekday: "1", date: "", startTime: "09:00", endTime: "10:00", classType: "lecture", room: "" };

// "09:30" -> "10:30" (stays inside the same day)
const plusHour = (t) => {
  const [h, m] = (t || "09:00").split(":").map(Number);
  return h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const Row = ({ r, name, readOnly, showDate, onEdit, onToggle }) => {
  const w = isWithdrawn(r);
  const meta = [showDate && fmtDate(r.effectiveStartDate), r.room, r.professor].filter(Boolean);
  return (
    <div className={cx("flex items-center gap-3 rounded-2xl bg-white/65 border border-white/80 px-3 sm:px-4 py-2.5", w && "opacity-60")}>
      <div className="w-[52px] shrink-0 text-center leading-tight">
        <p className="text-[13.5px] font-semibold text-[#161827] tabular-nums">{r.startTime}</p>
        <p className="text-[11.5px] text-[#6A6F85] tabular-nums">{r.endTime}</p>
      </div>
      <span className="w-px self-stretch bg-[#161827]/10" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[14.5px] font-semibold text-[#161827]">{name}</p>
          {r.classType && <Badge>{r.classType}</Badge>}
          {r.group && <Badge tone="brand">{r.group}</Badge>}
          {w && <Badge tone="amber">Withdrawn</Badge>}
        </div>
        {meta.length > 0 && <p className="text-[12.5px] text-[#6A6F85] mt-0.5 break-words">{meta.join(" · ")}</p>}
      </div>
      {!readOnly && <RowActions withdrawn={w} onEdit={() => onEdit(r)} onToggle={() => onToggle(r)} />}
    </div>
  );
};

// One collapsible day. Closed, it still shows the class count and short subject names.
const DayGroup = ({ id, title, count, shorts, today, open, onToggle, children }) => (
  <Card className="overflow-hidden">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={id}
      className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-white/50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15.5px] font-semibold text-[#161827]">{title}</span>
          {today && <Badge tone="green">Today</Badge>}
          <span className="text-[12.5px] text-[#6A6F85]">{count} class{count === 1 ? "" : "es"}</span>
        </span>
        {shorts.length > 0 && (
          <span className="flex flex-wrap gap-1 mt-1.5">
            {shorts.slice(0, 6).map((x) => <Badge key={x} tone="brand">{x}</Badge>)}
            {shorts.length > 6 && <Badge>+{shorts.length - 6}</Badge>}
          </span>
        )}
      </span>
      <ChevronDown className={cx("w-5 h-5 shrink-0 text-[#6A6F85] transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
    </button>
    <div id={id} className={cx("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className={cx("overflow-hidden", !open && "invisible")}>
        <div className="px-3 sm:px-4 pb-3.5 pt-0.5 space-y-2">{children}</div>
      </div>
    </div>
  </Card>
);

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
  const [initial, setInitial] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [ask, noteDialog] = useNoteDialog();
  const [openDays, setOpenDays] = useState(null); // null = default (today, else first day with classes)

  const load = useCallback(async () => {
    if (!scheduleId) return;
    try {
      const [r, s] = await Promise.all([api.list(scheduleId), officialSchedulesApi.subjects.list(scheduleId)]);
      setRules(r);
      setSubjects(s.filter((x) => !isWithdrawn(x)));
      setError("");
    } catch (e) {
      setError(errMsg(e, "Could not load classes"));
    } finally {
      setLoading(false);
    }
  }, [scheduleId, api]);

  useEffect(() => {
    load();
  }, [load]);

  const { nameOf, shortOfRule } = useMemo(() => {
    const names = {};
    const codes = {};
    subjects.forEach((s) => {
      [keyOf(s), idOf(s)].forEach((k) => {
        names[k] = s.name;
        codes[k] = s.code;
      });
    });
    const ref = (r) => r.subjectKey?._id || r.subjectKey;
    const nameOf = (r) => r.subjectName || r.subject?.name || names[ref(r)] || "Subject";
    const shortOfRule = (r) => shortOf(nameOf(r), codes[ref(r)] || r.subject?.code || r.subjectCode);
    return { nameOf, shortOfRule };
  }, [subjects]);

  const creating = editing === "new";
  const isMakeup = form.entryType === "makeup";
  const dirty = Boolean(editing) && JSON.stringify({ form, slots }) !== initial;

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => ({ ...x, [k]: undefined, form: undefined }));
  };

  // Changing a start time also pushes the end time when it would become invalid.
  const setSlot = (i, k) => (e) => {
    const v = e.target.value;
    setSlots((a) =>
      a.map((x, j) => {
        if (j !== i) return x;
        const next = { ...x, [k]: v };
        if (k === "startTime" && v && next.endTime <= v) next.endTime = plusHour(v);
        return next;
      })
    );
    setErrors((x) => ({ ...x, [`${i}.${k}`]: undefined, [`${i}.endTime`]: k === "startTime" ? undefined : x[`${i}.endTime`], form: undefined }));
  };

  const open = (r) => {
    let f = blankShared;
    let s = [blankSlot];
    if (r) {
      f = {
        subjectKey: r.subjectKey?._id || r.subjectKey || "",
        entryType: r.entryType || "weekly",
        group: r.group || "",
        professor: r.professor || "",
        attendanceUnits: String(r.attendanceUnits ?? 1),
        note: "",
      };
      s = [
        {
          weekday: String(r.weekday ?? 1),
          date: toDateInput(r.effectiveStartDate),
          startTime: r.startTime || "09:00",
          endTime: r.endTime || "10:00",
          classType: r.classType || "lecture",
          room: r.room || "",
        },
      ];
    }
    setEditing(r || "new");
    setForm(f);
    setSlots(s);
    setInitial(JSON.stringify({ form: f, slots: s }));
    setErrors({});
    setFormError("");
  };

  // Copies the last slot onto the next weekday: "Mon/Wed/Fri 9-10" is quick to build.
  const addSlot = () =>
    setSlots((a) => {
      const last = a[a.length - 1] || blankSlot;
      const next = ORDER[(ORDER.indexOf(Number(last.weekday)) + 1) % ORDER.length];
      return [...a, { ...last, weekday: String(next), date: "" }];
    });

  const removeSlot = (i) => {
    setSlots((a) => a.filter((_, j) => j !== i));
    setErrors({});
  };

  const slotLabel = (s) => (isMakeup ? s.date || "no date" : WEEKDAYS[Number(s.weekday)]);

  const validate = () => {
    const errs = {};
    if (!form.subjectKey) errs.subjectKey = "Choose a subject.";
    const units = Number(form.attendanceUnits);
    if (!Number.isInteger(units) || units < 1 || units > 6) errs.attendanceUnits = "Use a whole number from 1 to 6.";
    slots.forEach((s, i) => {
      if (!s.startTime) errs[`${i}.startTime`] = "Required";
      if (!s.endTime) errs[`${i}.endTime`] = "Required";
      else if (s.startTime && s.endTime <= s.startTime) errs[`${i}.endTime`] = "Must be after start";
      if (isMakeup && !s.date) errs[`${i}.date`] = "Pick a date";
    });
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        const sameDay = isMakeup ? a.date && a.date === b.date : a.weekday === b.weekday;
        if (sameDay && a.startTime < b.endTime && b.startTime < a.endTime) {
          errs[`${j}.startTime`] = `Overlaps slot ${i + 1}`;
          errs.form = `Slots ${i + 1} and ${j + 1} overlap on ${slotLabel(a)}.`;
        }
      }
    }
    return errs;
  };

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
    // The server forbids changing entryType on an existing class, so only send it when creating.
    if (!isEdit) body.entryType = form.entryType;
    if (form.note.trim()) body.note = form.note.trim();
    if (isMakeup) {
      body.effectiveStartDate = slot.date;
      body.effectiveEndDate = slot.date;
      body.weekday = new Date(`${slot.date}T00:00:00Z`).getUTCDay();
    } else {
      body.weekday = Number(slot.weekday);
    }
    return body;
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    const errs = validate();
    setErrors(errs);
    setFormError(errs.form || "");
    if (Object.keys(errs).length) return focusFirstInvalid();

    setSaving(true);
    try {
      if (!creating) {
        await api.update(scheduleId, idOf(editing), buildBody(slots[0], { isEdit: true }));
        setEditing(null);
        await load();
        onChanged?.();
        return;
      }

      // several slots: one request per slot, in order
      const failed = [];
      let created = 0;
      for (let i = 0; i < slots.length; i++) {
        try {
          await api.create(scheduleId, buildBody(slots[i]));
          created++;
        } catch (err) {
          failed.push({ slot: slots[i], message: errMsg(err, "failed") });
        }
      }
      if (created > 0) {
        await load();
        onChanged?.();
      }
      if (failed.length === 0) {
        setEditing(null);
      } else {
        // keep only the failed slots so they can be fixed and retried (no duplicates)
        setSlots(failed.map((f) => f.slot));
        setInitial("");
        setFormError(`${created} added, ${failed.length} failed. ` + failed.map((f) => `${slotLabel(f.slot)} ${f.slot.startTime}–${f.slot.endTime}: ${f.message}`).join(" | "));
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = (r) => {
    const w = isWithdrawn(r);
    ask({
      title: w ? "Restore class" : "Withdraw class",
      message: w ? "This class will appear again for joined students." : "Joined students will lose this class. You can restore it later.",
      confirmLabel: w ? "Restore" : "Withdraw",
      tone: w ? "primary" : "danger",
      run: async (note) => {
        if (w) await api.restore(scheduleId, idOf(r), note);
        else await api.withdraw(scheduleId, idOf(r), note);
        await load();
        onChanged?.();
      },
    });
  };

  if (loading) return <PageSpinner />;

  const weekly = rules.filter((r) => r.entryType !== "makeup");
  const makeups = rules.filter((r) => r.entryType === "makeup");
  const dayGroups = ORDER.filter((d) => weekly.some((r) => r.weekday === d)).map((d) => ({
    key: d,
    title: WEEKDAYS[d],
    rows: weekly.filter((r) => r.weekday === d).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));
  const groupsList = [
    ...dayGroups,
    ...(makeups.length
      ? [{
          key: "makeup",
          title: "Makeup classes",
          makeup: true,
          rows: [...makeups].sort((a, b) => String(a.effectiveStartDate).localeCompare(String(b.effectiveStartDate)) || a.startTime.localeCompare(b.startTime)),
        }]
      : []),
  ];
  const todayKey = new Date().getDay();
  const defaultKey = dayGroups.some((g) => g.key === todayKey) ? todayKey : groupsList[0]?.key;
  const isOpen = (k) => (openDays ? Boolean(openDays[k]) : k === defaultKey);
  const toggleDay = (k) =>
    setOpenDays((cur) => {
      const base = cur || { [defaultKey]: true };
      return { ...base, [k]: !base[k] };
    });
  const allOpen = groupsList.length > 0 && groupsList.every((g) => isOpen(g.key));
  const setAll = (v) => setOpenDays(Object.fromEntries(groupsList.map((g) => [g.key, v])));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-[#6A6F85]">{weekly.length} weekly · {makeups.length} makeup</p>
        {!readOnly && <Button size="sm" onClick={() => open(null)} disabled={subjects.length === 0}><CalendarPlus className="w-4 h-4" />Add class</Button>}
      </div>

      <Alert type="error">{error}</Alert>
      {subjects.length === 0 && !readOnly && <Alert type="warning">Add an official subject first. Classes are attached to subjects.</Alert>}

      {rules.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="No classes yet" text="Add the weekly timetable and any one-day makeup classes." />
      ) : (
        <>
          {groupsList.length > 1 && (
            <div className="flex justify-end -mb-2">
              <button type="button" onClick={() => setAll(!allOpen)} className="h-9 px-2 text-[13px] font-medium text-indigo-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-full">
                {allOpen ? "Collapse all" : "Expand all"}
              </button>
            </div>
          )}
          <div className="space-y-3">
            {groupsList.map((g) => (
              <DayGroup
                key={g.key}
                id={`day-${g.key}`}
                title={g.title}
                count={g.rows.length}
                shorts={[...new Set(g.rows.filter((r) => !isWithdrawn(r)).map(shortOfRule))]}
                today={g.key === todayKey}
                open={isOpen(g.key)}
                onToggle={() => toggleDay(g.key)}
              >
                {g.rows.map((r) => (
                  <Row key={idOf(r)} r={r} name={nameOf(r)} readOnly={readOnly} showDate={g.makeup} onEdit={open} onToggle={toggle} />
                ))}
              </DayGroup>
            ))}
          </div>
        </>
      )}

      <FormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={creating ? "Add class" : "Edit class"}
        size="xl"
        onSubmit={save}
        submitLabel={creating ? (slots.length > 1 ? `Add ${slots.length} classes` : "Add class") : "Save changes"}
        saving={saving}
        dirty={dirty}
        error={formError}
      >
        <Field as="select" label="Subject" value={form.subjectKey} onChange={set("subjectKey")} error={errors.subjectKey}>
          <option value="">Choose a subject…</option>
          {subjects.map((s) => <option key={idOf(s)} value={keyOf(s)}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field as="select" label="Kind" value={form.entryType} onChange={set("entryType")} disabled={!creating} hint={!creating ? "To change this, withdraw the class and add a new one." : undefined}>
            <option value="weekly">Weekly class</option>
            <option value="makeup">Makeup class (one day)</option>
          </Field>
          <Field label="Attendance units" type="number" inputMode="numeric" min="1" max="6" step="1" value={form.attendanceUnits} onChange={set("attendanceUnits")} error={errors.attendanceUnits} />
          <Field as="select" label="Group (optional)" value={form.group} onChange={set("group")} hint="Leave on “Whole section” for everyone.">
            <option value="">Whole section</option>
            {(schedule?.groups || []).map((g) => <option key={g.key} value={g.key}>{g.label || g.key}</option>)}
          </Field>
          <Field label="Professor (optional)" value={form.professor} onChange={set("professor")} placeholder="Dr. Sharma" autoCapitalize="words" maxLength={80} />
        </div>

        <div>
          <FormLabel
            right={creating && (
              <button type="button" onClick={addSlot} className="h-9 px-2 text-[13px] text-indigo-600 font-medium hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />Add another slot
              </button>
            )}
          >
            {creating ? `Time slots (${slots.length})` : "Time slot"}
          </FormLabel>

          <div className="space-y-3">
            {slots.map((s, i) => (
              <div key={i} className="rounded-2xl bg-white/60 border border-white/80 p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 min-h-8">
                  <span className="text-[13px] font-semibold text-[#161827]">{creating && slots.length > 1 ? `Slot ${i + 1}` : isMakeup ? "Makeup class" : "Weekly class"}</span>
                  {creating && slots.length > 1 && (
                    <button type="button" onClick={() => removeSlot(i)} aria-label={`Remove slot ${i + 1}`} className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {isMakeup ? (
                    <Field label="Date" type="date" value={s.date} onChange={setSlot(i, "date")} error={errors[`${i}.date`]} className="col-span-2 sm:col-span-1" />
                  ) : (
                    <Field as="select" label="Day" value={s.weekday} onChange={setSlot(i, "weekday")} className="col-span-2 sm:col-span-1">
                      {ORDER.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                    </Field>
                  )}
                  <Field label="Start" type="time" value={s.startTime} onChange={setSlot(i, "startTime")} error={errors[`${i}.startTime`]} />
                  <Field label="End" type="time" value={s.endTime} onChange={setSlot(i, "endTime")} error={errors[`${i}.endTime`]} />
                  <Field as="select" label="Type" value={s.classType} onChange={setSlot(i, "classType")}>
                    {CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Field>
                  <Field label="Room (optional)" value={s.room} onChange={setSlot(i, "room")} placeholder="LH-201" maxLength={30} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <Field label="Note for the history (optional)" value={form.note} onChange={set("note")} maxLength={200} />
      </FormModal>
      {noteDialog}
    </div>
  );
};

export default OfficialRules;
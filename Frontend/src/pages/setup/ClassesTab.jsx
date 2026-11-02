import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Scale,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { rulesApi, subjectsApi, extraApi, errMsg } from "../../api/endpoints";
import { WEEKDAYS } from "../../lib/dates";
import { Alert, Badge, Button, Card, EmptyState, Field, PageSpinner, cx } from "../../components/Ui";
import { FormLabel, FormModal, focusFirstInvalid, shortOf, useNoteDialog } from "../../components/FormKit";

/*
  Student's own classes: weekly timetable + extra-class adjustments.
  Same look as cr/OfficialRules.jsx, with a summary, day / subject views and attendance info.

  Needs this in api/endpoints.js (the backend route already exists):
    extraApi.list = async (id) => unwrap(await API.get(`${S(id)}/extra-classes`));
*/

const CLASS_TYPES = ["lecture", "lab", "tutorial"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const idOf = (x) => x?._id || x?.id;
const refId = (x) => (x && typeof x === "object" ? idOf(x) : x);

const blankShared = { subjectId: "", professor: "", attendanceUnits: "1" };
const blankSlot = { weekday: "1", startTime: "09:00", endTime: "10:00", classType: "lecture", room: "" };

const plusHour = (t) => {
  const [h, m] = (t || "09:00").split(":").map(Number);
  return h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const toInt = (v) => (v === "" || v == null ? NaN : Number(v));
const validCount = (v) => Number.isInteger(toInt(v)) && toInt(v) >= 0;

const toMin = (t) => {
  const [h, m] = String(t || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};
const durOf = (r) => Math.max(0, toMin(r.endTime) - toMin(r.startTime));
const fmtDur = (m) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`);
const day3 = (d) => WEEKDAYS[d]?.slice(0, 3) || "";

/* ---------------- small pieces ---------------- */

const IconBtn = ({ label, danger, children, ...rest }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={cx(
      "w-10 h-10 rounded-full flex items-center justify-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
      danger ? "text-rose-600 hover:bg-rose-50" : "text-[#6A6F85] hover:bg-white/80 hover:text-[#161827]"
    )}
    {...rest}
  >
    {children}
  </button>
);

const Stat = ({ icon: Icon, label, value, sub }) => (
  <div className="rounded-2xl bg-white/60 border border-white/80 shadow-[inset_0_1px_0_#fff] px-3.5 py-3 min-w-0">
    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-[#6A6F85]">
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </p>
    <p className="text-[19px] sm:text-[21px] font-semibold text-[#161827] mt-1 leading-tight tabular-nums break-words">{value}</p>
    {sub && <p className="text-[12px] text-[#6A6F85] mt-0.5 break-words">{sub}</p>}
  </div>
);

const Dot = ({ color }) => (
  <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white" style={{ background: color || "#5B52EE" }} />
);

const Seg = ({ value, onChange, items }) => (
  <div role="group" aria-label="View" className="inline-flex p-1 rounded-full bg-white/55 border border-white/80 shadow-[inset_0_1px_0_#fff]">
    {items.map((it) => (
      <button
        key={it.key}
        type="button"
        aria-pressed={value === it.key}
        onClick={() => onChange(it.key)}
        className={cx(
          "h-8 px-3.5 rounded-full text-[13px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
          value === it.key ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-sm shadow-indigo-500/25" : "text-[#161827]/70 hover:bg-white/70"
        )}
      >
        {it.label}
      </button>
    ))}
  </div>
);

const Row = ({ r, subj, lead, readOnly, isNow, onEdit, onToggle, onDelete }) => {
  const off = r.isActive === false;
  const meta = [r.room, r.professor, r.attendanceUnits > 1 && `${r.attendanceUnits} units`].filter(Boolean);
  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-2xl bg-white/65 border px-3 sm:px-4 py-2.5 transition",
        isNow ? "border-indigo-300 ring-1 ring-indigo-200 bg-white/85" : "border-white/80",
        off && "opacity-60"
      )}
    >
      <div className="w-[52px] shrink-0 text-center leading-tight">
        <p className="text-[13.5px] font-semibold text-[#161827] tabular-nums">{r.startTime}</p>
        <p className="text-[11.5px] text-[#6A6F85] tabular-nums">{r.endTime}</p>
      </div>
      <span className="w-px self-stretch bg-[#161827]/10" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {lead === "subject" ? (
            <>
              <Dot color={subj.color} />
              <p className="text-[14.5px] font-semibold text-[#161827]">{subj.name}</p>
            </>
          ) : (
            <p className="text-[14.5px] font-semibold text-[#161827]">{WEEKDAYS[r.weekday]}</p>
          )}
          {r.classType && <Badge>{r.classType}</Badge>}
          {isNow && <Badge tone="green">Now</Badge>}
          {r.origin === "official" && <Badge tone="brand">Official</Badge>}
          {off && <Badge tone="amber">Archived</Badge>}
        </div>
        <p className="text-[12.5px] text-[#6A6F85] mt-0.5 break-words">{[fmtDur(durOf(r)), ...meta].join(" · ")}</p>
      </div>
      {!readOnly && (
        <div className="flex items-center shrink-0 -mr-1.5">
          {!off && (
            <IconBtn label="Edit class" onClick={() => onEdit(r)}>
              <Pencil className="w-4 h-4" />
            </IconBtn>
          )}
          <IconBtn label={off ? "Restore class" : "Archive class"} onClick={() => onToggle(r)}>
            {off ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </IconBtn>
          <IconBtn label="Delete class" danger onClick={() => onDelete(r)}>
            <Trash2 className="w-4 h-4" />
          </IconBtn>
        </div>
      )}
    </div>
  );
};

// One collapsible group. Closed, it still shows the count, the hours and badges.
const Group = ({ id, title, dot, today, count, hours, badges, open, onToggle, children }) => (
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
          {dot !== undefined && <Dot color={dot} />}
          <span className="text-[15.5px] font-semibold text-[#161827]">{title}</span>
          {today && <Badge tone="green">Today</Badge>}
          <span className="text-[12.5px] text-[#6A6F85]">
            {count} class{count === 1 ? "" : "es"}
            {hours > 0 ? ` · ${fmtDur(hours)}` : ""}
          </span>
        </span>
        {badges?.length > 0 && (
          <span className="flex flex-wrap gap-1 mt-1.5">
            {badges.slice(0, 6).map((x) => <Badge key={x} tone="brand">{x}</Badge>)}
            {badges.length > 6 && <Badge>+{badges.length - 6}</Badge>}
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

const ExtraCard = ({ a, subj, readOnly, onEdit, onRemove }) => {
  const total = a.totalCount ?? (a.attendedCount || 0) + (a.missedCount || 0);
  const pct = total > 0 ? Math.round(((a.attendedCount || 0) / total) * 100) : null;
  return (
    <div className="rounded-2xl bg-white/65 border border-white/80 px-4 py-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Dot color={subj.color} />
            <p className="text-[14.5px] font-semibold text-[#161827] break-words">{subj.name}</p>
          </div>
          <p className="text-[12.5px] text-[#6A6F85] mt-1 tabular-nums">
            {a.attendedCount ?? 0} attended · {a.missedCount ?? 0} missed · {total} total
          </p>
        </div>
        {!readOnly && (
          <div className="flex items-center shrink-0 -mr-2 -mt-1.5">
            <IconBtn label="Edit extra classes" onClick={() => onEdit(a)}>
              <Pencil className="w-4 h-4" />
            </IconBtn>
            <IconBtn label="Remove extra classes" danger onClick={() => onRemove(a)}>
              <Trash2 className="w-4 h-4" />
            </IconBtn>
          </div>
        )}
      </div>
      {pct != null && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="h-1.5 flex-1 rounded-full bg-[#161827]/10 overflow-hidden" role="img" aria-label={`${pct}% attended`}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0]" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[12px] font-medium text-[#161827] tabular-nums w-9 text-right">{pct}%</span>
        </div>
      )}
      {a.note && <p className="text-[12.5px] text-[#6A6F85] mt-2 break-words">{a.note}</p>}
    </div>
  );
};

/* ---------------- main ---------------- */

const ClassesTab = ({ setupId, setup, readOnly }) => {
  const [rules, setRules] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [extras, setExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ask, noteDialog] = useNoteDialog();
  const [view, setView] = useState("day"); // day | subject
  const [showArchived, setShowArchived] = useState(false);
  const [openMap, setOpenMap] = useState({}); // `${view}:${key}` -> boolean (unset = default)

  // weekly form
  const [editing, setEditing] = useState(null); // null | "new" | rule
  const [form, setForm] = useState(blankShared);
  const [slots, setSlots] = useState([blankSlot]);
  const [initial, setInitial] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [overlapOk, setOverlapOk] = useState(false);

  // extra form
  const [extraEdit, setExtraEdit] = useState(null);
  const [xf, setXf] = useState({ subjectId: "", attendedCount: "0", missedCount: "0", note: "" });
  const [xInitial, setXInitial] = useState("");
  const [xErrors, setXErrors] = useState({});
  const [xSaving, setXSaving] = useState(false);
  const [xError, setXError] = useState("");

  // match college record
  const [matchOpen, setMatchOpen] = useState(false);
  const [mf, setMf] = useState({ subjectId: "", collegeAttended: "", collegeHeld: "", note: "" });
  const [mErrors, setMErrors] = useState({});
  const [mSaving, setMSaving] = useState(false);
  const [mError, setMError] = useState("");
  const [undo, setUndo] = useState(null);

  const load = useCallback(async () => {
    try {
      const [r, s, x] = await Promise.all([
        rulesApi.list(setupId),
        subjectsApi.list(setupId, { limit: 100, sort: "name" }),
        extraApi.list(setupId).catch(() => ({ adjustments: [] })),
      ]);
      setRules(r);
      setSubjects((s?.subjects || []).filter((x) => x.isActive !== false));
      setExtras(x?.adjustments || []);
      setError("");
    } catch (e) {
      setError(errMsg(e, "Could not load classes"));
    } finally {
      setLoading(false);
    }
  }, [setupId]);

  useEffect(() => {
    load();
  }, [load]);

  // subject lookup that also copes with populated refs on rules / adjustments
  const subjOf = useMemo(() => {
    const m = {};
    subjects.forEach((s) => (m[idOf(s)] = s));
    return (ref) => {
      const base = m[refId(ref)] || {};
      const pop = ref && typeof ref === "object" ? ref : {};
      return {
        id: refId(ref),
        name: base.name || pop.name || "Subject",
        code: base.code || pop.code,
        color: base.color || pop.color,
      };
    };
  }, [subjects]);

  const creating = editing === "new";
  const dirty = Boolean(editing) && JSON.stringify({ form, slots }) !== initial;

  /* ---- weekly form handlers ---- */
  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => ({ ...x, [k]: undefined, form: undefined }));
  };

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
    setOverlapOk(false);
    setErrors((x) => ({ ...x, [`${i}.${k}`]: undefined, [`${i}.endTime`]: k === "startTime" ? undefined : x[`${i}.endTime`], form: undefined }));
  };

  const openRule = (r, preset) => {
    let f = { ...blankShared, ...(preset || {}) };
    let s = [blankSlot];
    if (r) {
      f = { subjectId: refId(r.subjectId) || "", professor: r.professor || "", attendanceUnits: String(r.attendanceUnits ?? 1) };
      s = [{ weekday: String(r.weekday ?? 1), startTime: r.startTime || "09:00", endTime: r.endTime || "10:00", classType: r.classType || "lecture", room: r.room || "" }];
    }
    setEditing(r || "new");
    setForm(f);
    setSlots(s);
    setInitial(JSON.stringify({ form: f, slots: s }));
    setErrors({});
    setFormError("");
    setOverlapOk(false);
  };

  const addSlot = () =>
    setSlots((a) => {
      const last = a[a.length - 1] || blankSlot;
      const next = ORDER[(ORDER.indexOf(Number(last.weekday)) + 1) % ORDER.length];
      return [...a, { ...last, weekday: String(next) }];
    });

  const removeSlot = (i) => {
    setSlots((a) => a.filter((_, j) => j !== i));
    setErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.subjectId) errs.subjectId = "Choose a subject.";
    const units = Number(form.attendanceUnits);
    if (!Number.isInteger(units) || units < 1 || units > 6) errs.attendanceUnits = "Use a whole number from 1 to 6.";
    slots.forEach((s, i) => {
      if (!s.startTime) errs[`${i}.startTime`] = "Required";
      if (!s.endTime) errs[`${i}.endTime`] = "Required";
      else if (s.startTime && s.endTime <= s.startTime) errs[`${i}.endTime`] = "Must be after start";
    });
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        if (a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime) {
          errs[`${j}.startTime`] = `Overlaps slot ${i + 1}`;
          errs.form = `Slots ${i + 1} and ${j + 1} overlap on ${WEEKDAYS[Number(a.weekday)]}.`;
        }
      }
    }
    return errs;
  };

  const buildBody = (slot, isEdit) => {
    const body = {
      subjectId: form.subjectId,
      weekday: Number(slot.weekday),
      startTime: slot.startTime,
      endTime: slot.endTime,
      classType: slot.classType,
      group: null,
      room: slot.room.trim(),
      professor: form.professor.trim(),
      attendanceUnits: Number(form.attendanceUnits) || 1,
    };
    if (!isEdit && setup?.startDate && setup?.endDate) {
      body.effectiveStartDate = String(setup.startDate).slice(0, 10);
      body.effectiveEndDate = String(setup.endDate).slice(0, 10);
    }
    if (overlapOk) body.confirmOverlap = true;
    return body;
  };

  const slotLabel = (s) => `${WEEKDAYS[Number(s.weekday)]} ${s.startTime}–${s.endTime}`;

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
        try {
          await rulesApi.update(setupId, idOf(editing), buildBody(slots[0], true));
          setEditing(null);
          setNotice("Class updated.");
          await load();
        } catch (err) {
          if (err?.response?.status === 409) {
            setOverlapOk(true);
            setFormError(`${errMsg(err, "This class overlaps another one.")} Press save again to keep it anyway.`);
          } else setFormError(errMsg(err, "Could not save changes"));
        }
        return;
      }

      const failed = [];
      let created = 0;
      let sawOverlap = false;
      for (const slot of slots) {
        try {
          await rulesApi.create(setupId, buildBody(slot, false));
          created++;
        } catch (err) {
          if (err?.response?.status === 409) sawOverlap = true;
          failed.push({ slot, message: errMsg(err, "failed") });
        }
      }
      if (created > 0) await load();
      if (failed.length === 0) {
        setEditing(null);
        setNotice(created === 1 ? "Class added." : `${created} classes added.`);
      } else {
        setSlots(failed.map((f) => f.slot));
        setInitial("");
        if (sawOverlap) setOverlapOk(true);
        setFormError(
          `${created} added, ${failed.length} failed. ` +
            failed.map((f) => `${slotLabel(f.slot)}: ${f.message}`).join(" | ") +
            (sawOverlap ? " Press save again to keep overlapping classes anyway." : "")
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (r) => {
    const off = r.isActive === false;
    ask({
      title: off ? "Restore class" : "Archive class",
      message: off ? "This class will be counted in your timetable again." : "Future occurrences of this class will stop showing. Past attendance is kept.",
      confirmLabel: off ? "Restore" : "Archive",
      tone: off ? "primary" : "danger",
      run: async () => {
        await rulesApi.update(setupId, idOf(r), { isActive: off });
        await load();
      },
    });
  };

  const deleteRule = async (r) => {
    let impact = null;
    try {
      impact = await rulesApi.deleteImpact(setupId, idOf(r));
    } catch {
      /* generic message below */
    }
    const recorded = impact?.recordedClasses || 0;
    ask({
      title: "Delete class",
      message: impact
        ? `This removes ${impact.classes ?? 0} scheduled class${impact.classes === 1 ? "" : "es"}${recorded ? `, including ${recorded} with attendance already marked. Archive instead to keep that history.` : "."}`
        : "This permanently removes the class and its scheduled occurrences.",
      confirmLabel: "Delete",
      tone: "danger",
      run: async () => {
        await rulesApi.remove(setupId, idOf(r), recorded > 0);
        await load();
      },
    });
  };

  /* ---- extra classes ---- */
  const openExtra = (a) => {
    const f = a
      ? { subjectId: refId(a.subjectId) || "", attendedCount: String(a.attendedCount ?? 0), missedCount: String(a.missedCount ?? 0), note: a.note || "" }
      : { subjectId: "", attendedCount: "0", missedCount: "0", note: "" };
    setExtraEdit(a || "new");
    setXf(f);
    setXInitial(JSON.stringify(f));
    setXErrors({});
    setXError("");
  };

  const setX = (k) => (e) => {
    const v = e.target.value;
    setXf((f) => ({ ...f, [k]: v }));
    setXErrors((x) => ({ ...x, [k]: undefined }));
  };

  const saveExtra = async (e) => {
    e.preventDefault();
    if (xSaving) return;
    const errs = {};
    if (!xf.subjectId) errs.subjectId = "Choose a subject.";
    if (!validCount(xf.attendedCount)) errs.attendedCount = "Use a whole number, 0 or more.";
    if (!validCount(xf.missedCount)) errs.missedCount = "Use a whole number, 0 or more.";
    setXErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();

    const attended = toInt(xf.attendedCount);
    const missed = toInt(xf.missedCount);
    setXSaving(true);
    setXError("");
    try {
      await extraApi.set(setupId, xf.subjectId, { totalCount: attended + missed, attendedCount: attended, missedCount: missed, note: xf.note.trim() });
      setExtraEdit(null);
      setNotice("Extra classes saved.");
      await load();
    } catch (err) {
      setXError(errMsg(err, "Could not save extra classes"));
    } finally {
      setXSaving(false);
    }
  };

  const removeExtra = (a) =>
    ask({
      title: "Remove extra classes",
      message: `This clears the extra classes added for ${subjOf(a.subjectId).name}.`,
      confirmLabel: "Remove",
      tone: "danger",
      run: async () => {
        await extraApi.remove(setupId, refId(a.subjectId));
        await load();
      },
    });

  /* ---- match college record ---- */
  const openMatch = () => {
    setMf({ subjectId: "", collegeAttended: "", collegeHeld: "", note: "" });
    setMErrors({});
    setMError("");
    setMatchOpen(true);
  };

  const setM = (k) => (e) => {
    const v = e.target.value;
    setMf((f) => ({ ...f, [k]: v }));
    setMErrors((x) => ({ ...x, [k]: undefined }));
  };

  const saveMatch = async (e) => {
    e.preventDefault();
    if (mSaving) return;
    const errs = {};
    if (!mf.subjectId) errs.subjectId = "Choose a subject.";
    if (!validCount(mf.collegeAttended)) errs.collegeAttended = "Whole number, 0 or more.";
    if (!validCount(mf.collegeHeld)) errs.collegeHeld = "Whole number, 0 or more.";
    else if (validCount(mf.collegeAttended) && toInt(mf.collegeAttended) > toInt(mf.collegeHeld)) errs.collegeAttended = "Can't be more than classes held.";
    setMErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();

    setMSaving(true);
    setMError("");
    try {
      const res = await extraApi.matchCollege(setupId, mf.subjectId, {
        collegeAttended: toInt(mf.collegeAttended),
        collegeHeld: toInt(mf.collegeHeld),
        ...(mf.note.trim() ? { note: mf.note.trim() } : {}),
      });
      setUndo(res?.previous ? { subjectId: mf.subjectId, previous: res.previous } : null);
      setNotice(res?.changed === false ? "Already matches your college record." : "Matched to your college record.");
      setMatchOpen(false);
      await load();
    } catch (err) {
      setMError(errMsg(err, "Could not match the college record"));
    } finally {
      setMSaving(false);
    }
  };

  const undoMatch = async () => {
    if (!undo) return;
    try {
      await extraApi.set(setupId, undo.subjectId, undo.previous);
      setUndo(null);
      setNotice("Match undone.");
      await load();
    } catch (err) {
      setError(errMsg(err, "Could not undo"));
    }
  };

  /* ---- derived data ---- */
  const active = useMemo(() => rules.filter((r) => r.isActive !== false), [rules]);
  const archivedCount = rules.length - active.length;
  const shown = showArchived ? rules : active;

  const stats = useMemo(() => {
    const minutes = active.reduce((n, r) => n + durOf(r), 0);
    const used = new Set(active.map((r) => refId(r.subjectId)));
    const extraTotal = extras.reduce((n, a) => n + (a.totalCount ?? (a.attendedCount || 0) + (a.missedCount || 0)), 0);
    const todayWd = new Date().getDay();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const todays = active.filter((r) => r.weekday === todayWd).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const current = todays.find((r) => toMin(r.startTime) <= nowMin && nowMin < toMin(r.endTime));
    const next = todays.find((r) => toMin(r.startTime) > nowMin);
    const spot = current || next;
    const missing = subjects.filter((s) => !used.has(idOf(s)));
    return { minutes, used: used.size, extraTotal, todays, current, spot, missing };
  }, [active, extras, subjects]);

  const groups = useMemo(() => {
    if (view === "day") {
      return ORDER.filter((d) => shown.some((r) => r.weekday === d)).map((d) => {
        const rows = shown.filter((r) => r.weekday === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
        const uniq = [...new Set(rows.filter((r) => r.isActive !== false).map((r) => refId(r.subjectId)))];
        return {
          key: d,
          title: WEEKDAYS[d],
          today: d === new Date().getDay(),
          rows,
          hours: rows.filter((r) => r.isActive !== false).reduce((n, r) => n + durOf(r), 0),
          badges: uniq.map((id) => {
            const s = subjOf(id);
            return shortOf(s.name, s.code);
          }),
        };
      });
    }
    const ids = [...new Set(shown.map((r) => refId(r.subjectId)))];
    return ids
      .map((id) => {
        const s = subjOf(id);
        const rows = shown
          .filter((r) => refId(r.subjectId) === id)
          .sort((a, b) => ORDER.indexOf(a.weekday) - ORDER.indexOf(b.weekday) || a.startTime.localeCompare(b.startTime));
        const days = [...new Set(rows.filter((r) => r.isActive !== false).map((r) => r.weekday))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
        return {
          key: id,
          title: s.name,
          dot: s.color || "#5B52EE",
          rows,
          hours: rows.filter((r) => r.isActive !== false).reduce((n, r) => n + durOf(r), 0),
          badges: days.map(day3),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [shown, view, subjOf]);

  const defaultKey = view === "day" ? (groups.find((g) => g.today) || groups[0])?.key : groups[0]?.key;
  const isOpen = (k) => {
    const v = openMap[`${view}:${k}`];
    return v === undefined ? k === defaultKey : v;
  };
  const toggleGroup = (k) => setOpenMap((m) => ({ ...m, [`${view}:${k}`]: !isOpen(k) }));
  const allOpen = groups.length > 0 && groups.every((g) => isOpen(g.key));
  const setAll = (v) => setOpenMap((m) => ({ ...m, ...Object.fromEntries(groups.map((g) => [`${view}:${g.key}`, v])) }));

  if (loading) return <PageSpinner />;

  const noSubjects = subjects.length === 0;
  const spot = stats.spot;

  return (
    <div className="space-y-8">
      <Alert type="error">{error}</Alert>
      {notice && (
        <Alert type="success">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {notice}
            {undo && (
              <button type="button" onClick={undoMatch} className="font-semibold underline">
                Undo
              </button>
            )}
            <button type="button" onClick={() => { setNotice(""); setUndo(null); }} className="ml-auto text-[12.5px] underline">
              Dismiss
            </button>
          </span>
        </Alert>
      )}
      {noSubjects && !readOnly && <Alert type="warning">Add a subject in the Subjects tab first. Classes are attached to subjects.</Alert>}

      {/* summary */}
      {active.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <Stat icon={CalendarClock} label="Weekly classes" value={active.length} sub={`${stats.used} subject${stats.used === 1 ? "" : "s"}`} />
          <Stat icon={Clock} label="Hours a week" value={fmtDur(stats.minutes)} sub="Across all classes" />
          <Stat
            icon={Sparkles}
            label={stats.current ? "Happening now" : spot ? "Next today" : "Today"}
            value={spot ? subjOf(spot.subjectId).name : stats.todays.length ? "Done for today" : "No classes"}
            sub={spot ? `${spot.startTime} – ${spot.endTime}` : stats.todays.length ? `${stats.todays.length} class${stats.todays.length === 1 ? "" : "es"} held` : "Enjoy the day"}
          />
          <Stat icon={Layers} label="Extra classes" value={stats.extraTotal} sub={extras.length ? `${extras.length} subject${extras.length === 1 ? "" : "s"}` : "None added"} />
        </div>
      )}

      {stats.missing.length > 0 && active.length > 0 && !readOnly && (
        <Alert type="info">
          No weekly class yet for {stats.missing.slice(0, 3).map((s) => s.name).join(", ")}
          {stats.missing.length > 3 ? ` and ${stats.missing.length - 3} more` : ""}.
        </Alert>
      )}

      {/* weekly classes */}
      <section className="space-y-4" aria-labelledby="weekly-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="weekly-h" className="text-[17px] font-semibold text-[#161827]">Weekly classes</h2>
            <p className="text-[13.5px] text-[#6A6F85]">Repeats every week for the whole semester.</p>
          </div>
          {!readOnly && (
            <Button size="sm" onClick={() => openRule(null)} disabled={noSubjects}>
              <CalendarPlus className="w-4 h-4" />Add class
            </Button>
          )}
        </div>

        {rules.length === 0 ? (
          <EmptyState icon={CalendarPlus} title="No classes yet" text="Add your weekly timetable. You can add several days for one subject in one go." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Seg value={view} onChange={setView} items={[{ key: "day", label: "By day" }, { key: "subject", label: "By subject" }]} />
              <div className="flex items-center gap-1">
                {archivedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    className="h-9 px-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6A6F85] hover:text-[#161827] rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    {showArchived ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showArchived ? "Hide" : "Show"} archived ({archivedCount})
                  </button>
                )}
                {groups.length > 1 && (
                  <button type="button" onClick={() => setAll(!allOpen)} className="h-9 px-2 text-[13px] font-medium text-indigo-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-full">
                    {allOpen ? "Collapse all" : "Expand all"}
                  </button>
                )}
              </div>
            </div>

            {groups.length === 0 ? (
              <EmptyState icon={Archive} title="Nothing to show" text="All your classes are archived. Show archived classes to restore them." />
            ) : (
              <div className="space-y-3">
                {groups.map((g) => (
                  <Group
                    key={`${view}-${g.key}`}
                    id={`my-${view}-${g.key}`}
                    title={g.title}
                    dot={g.dot}
                    today={g.today}
                    count={g.rows.length}
                    hours={g.hours}
                    badges={g.badges}
                    open={isOpen(g.key)}
                    onToggle={() => toggleGroup(g.key)}
                  >
                    {g.rows.map((r) => (
                      <Row
                        key={idOf(r)}
                        r={r}
                        subj={subjOf(r.subjectId)}
                        lead={view === "day" ? "subject" : "day"}
                        readOnly={readOnly}
                        isNow={stats.current && idOf(stats.current) === idOf(r)}
                        onEdit={openRule}
                        onToggle={toggleActive}
                        onDelete={deleteRule}
                      />
                    ))}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          openRule(null, view === "subject" ? { subjectId: String(g.key) } : undefined)
                        }
                        className="w-full h-10 rounded-2xl border border-dashed border-[#161827]/15 text-[13px] font-medium text-indigo-600 hover:bg-white/60 transition flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        <Plus className="w-4 h-4" />
                        {view === "subject" ? `Add another ${g.title} class` : "Add class"}
                      </button>
                    )}
                  </Group>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* extra classes */}
      <section className="space-y-4" aria-labelledby="extra-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="extra-h" className="text-[17px] font-semibold text-[#161827]">Extra classes</h2>
            <p className="text-[13.5px] text-[#6A6F85] max-w-xl">Classes that aren't in your timetable, or an earlier balance, added to your attendance totals.</p>
          </div>
          {!readOnly && (
            <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
              <Button variant="glass" size="sm" onClick={openMatch} disabled={noSubjects}>
                <Scale className="w-4 h-4" />Match college
              </Button>
              <Button size="sm" onClick={() => openExtra(null)} disabled={noSubjects}>
                <Plus className="w-4 h-4" />Add extra
              </Button>
            </div>
          )}
        </div>

        {extras.length === 0 ? (
          <EmptyState icon={Layers} title="No extra classes" text="Add them when your college counted classes that aren't in this app, or use Match college to sync with your portal." />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {extras.map((a) => (
              <ExtraCard key={refId(a.subjectId)} a={a} subj={subjOf(a.subjectId)} readOnly={readOnly} onEdit={openExtra} onRemove={removeExtra} />
            ))}
          </div>
        )}
      </section>

      {/* weekly modal */}
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
        <Field as="select" label="Subject" value={form.subjectId} onChange={set("subjectId")} error={errors.subjectId}>
          <option value="">Choose a subject…</option>
          {subjects.map((s) => <option key={idOf(s)} value={idOf(s)}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Attendance units" type="number" inputMode="numeric" min="1" max="6" step="1" value={form.attendanceUnits} onChange={set("attendanceUnits")} error={errors.attendanceUnits} hint="Use 2 for a double lab." />
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
                  <span className="text-[13px] font-semibold text-[#161827]">{creating && slots.length > 1 ? `Slot ${i + 1}` : "Weekly class"}</span>
                  {creating && slots.length > 1 && (
                    <button type="button" onClick={() => removeSlot(i)} aria-label={`Remove slot ${i + 1}`} className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field as="select" label="Day" value={s.weekday} onChange={setSlot(i, "weekday")} className="col-span-2 sm:col-span-1">
                    {ORDER.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                  </Field>
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
      </FormModal>

      {/* extra classes modal */}
      <FormModal
        open={Boolean(extraEdit)}
        onClose={() => setExtraEdit(null)}
        title={extraEdit === "new" ? "Add extra classes" : "Edit extra classes"}
        onSubmit={saveExtra}
        submitLabel="Save"
        saving={xSaving}
        dirty={Boolean(extraEdit) && JSON.stringify(xf) !== xInitial}
        error={xError}
      >
        <Field as="select" label="Subject" value={xf.subjectId} onChange={setX("subjectId")} error={xErrors.subjectId} disabled={extraEdit !== "new"} hint={extraEdit !== "new" ? "Each subject has one set of extra classes." : undefined}>
          <option value="">Choose a subject…</option>
          {subjects.map((s) => <option key={idOf(s)} value={idOf(s)}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Attended" type="number" inputMode="numeric" min="0" step="1" value={xf.attendedCount} onChange={setX("attendedCount")} error={xErrors.attendedCount} />
          <Field label="Missed" type="number" inputMode="numeric" min="0" step="1" value={xf.missedCount} onChange={setX("missedCount")} error={xErrors.missedCount} />
        </div>
        <p className="text-[12.5px] text-[#6A6F85]">
          Total extra classes: {(validCount(xf.attendedCount) ? toInt(xf.attendedCount) : 0) + (validCount(xf.missedCount) ? toInt(xf.missedCount) : 0)}
        </p>
        <Field label="Note (optional)" value={xf.note} onChange={setX("note")} maxLength={200} placeholder="Makeup labs" />
      </FormModal>

      {/* match college record modal */}
      <FormModal
        open={matchOpen}
        onClose={() => setMatchOpen(false)}
        title="Match college record"
        onSubmit={saveMatch}
        submitLabel="Match"
        saving={mSaving}
        dirty={Boolean(mf.subjectId || mf.collegeAttended || mf.collegeHeld)}
        error={mError}
      >
        <Alert type="info">Enter what your college portal shows for one subject. We'll add the difference as extra classes so your totals match.</Alert>
        <Field as="select" label="Subject" value={mf.subjectId} onChange={setM("subjectId")} error={mErrors.subjectId}>
          <option value="">Choose a subject…</option>
          {subjects.map((s) => <option key={idOf(s)} value={idOf(s)}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Classes attended" type="number" inputMode="numeric" min="0" step="1" value={mf.collegeAttended} onChange={setM("collegeAttended")} error={mErrors.collegeAttended} />
          <Field label="Classes held" type="number" inputMode="numeric" min="0" step="1" value={mf.collegeHeld} onChange={setM("collegeHeld")} error={mErrors.collegeHeld} />
        </div>
        <Field label="Note (optional)" value={mf.note} onChange={setM("note")} maxLength={200} placeholder="Synced with ERP" />
      </FormModal>

      {noteDialog}
    </div>
  );
};

export default ClassesTab;
import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, RotateCcw } from "lucide-react";
import { Alert, Button, Field, cx } from "./Ui";
import { toDateInput } from "../api/endpoints";
import { BRANCHES, SECTIONS, SEMESTERS, academicYearOptions, pickOption, withCurrent } from "../lib/academic";

/* ------------------------------------------------------------------------------------------
   Helpers
------------------------------------------------------------------------------------------ */

const TARGETS = [70, 75, 80, 85];

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const parseYmd = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtDate = (s) =>
  parseYmd(s)?.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) || "";

// "2026-27" for any date from July 2026 to June 2027.
const currentAcademicYear = (now = new Date()) => {
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${pad((y + 1) % 100)}`;
};

// Odd semesters run in the autumn term, even semesters in the spring term of the next calendar year.
// These are typical dates only; the student adjusts them to their own academic calendar.
const typicalDates = (academicYear, semesterLabel) => {
  const y = parseInt(academicYear, 10);
  const n = parseInt(String(semesterLabel || "").match(/\d+/)?.[0], 10);
  if (!y || !n) return null;
  return n % 2 === 1
    ? { startDate: ymd(y, 8, 1), endDate: ymd(y, 12, 15) }
    : { startDate: ymd(y + 1, 1, 5), endDate: ymd(y + 1, 5, 15) };
};

const presetsFor = (academicYear) => {
  const y = parseInt(academicYear, 10);
  if (!y) return [];
  return [
    { key: "odd", label: "Autumn term", sub: "Aug to Dec", startDate: ymd(y, 8, 1), endDate: ymd(y, 12, 15) },
    { key: "even", label: "Spring term", sub: "Jan to May", startDate: ymd(y + 1, 1, 5), endDate: ymd(y + 1, 5, 15) },
  ];
};

// Built from whatever we know so far, so the name is already filled in before a semester is chosen:
// "Saurav's CSE A (2026-27)" first, then "Saurav's CSE A Sem 5 (2026-27)". The owner part is optional.
const suggestName = ({ branch, section, semesterLabel, academicYear }, owner) => {
  const core = [[branch, section].filter(Boolean).join(" "), semesterLabel].filter(Boolean).join(" ");
  if (!core) return "";
  const withYear = academicYear ? `${core} (${academicYear})` : core;
  return owner ? `${owner}'s ${withYear}` : withYear;
};

const build = (initial) => ({
  name: initial?.name || "",
  academicYear: String(initial?.academicYear || "").trim() || (initial?.startDate ? "" : currentAcademicYear()),
  semesterLabel: pickOption(SEMESTERS, initial?.semesterLabel),
  branch: pickOption(BRANCHES, initial?.branch),
  section: pickOption(SECTIONS, initial?.section),
  startDate: toDateInput(initial?.startDate),
  endDate: toDateInput(initial?.endDate),
  timezone: initial?.timezone || "Asia/Kolkata",
  targetPercentage: String(initial?.targetPercentage ?? 75),
});

/* ------------------------------------------------------------------------------------------
   Small pieces
------------------------------------------------------------------------------------------ */

const labelCls = "text-[13px] font-medium text-[color:var(--body)]";

const chipBase = "h-11 px-4 rounded-xl border text-[14px] font-semibold transition-colors motion-reduce:transition-none active:scale-[0.98] disabled:opacity-60";
const chipOn = "bg-[#4F46E5] border-[#4F46E5] text-white";
const chipOff = "bg-[color:var(--surface)] border-[color:var(--line)] text-[color:var(--body)] hover:bg-[color:var(--inset)]";

// A dropdown that always starts on "Select ..." so nothing is chosen by accident.
const Choice = ({ label, value, options, onChange, disabled, hint }) => (
  <Field as="select" label={label} value={value} onChange={onChange} required disabled={disabled} hint={hint}>
    <option value="">Select {label.toLowerCase()}</option>
    {options.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ))}
  </Field>
);

// One tap per option. Used for short lists such as the semester.
const Chips = ({ id, label, value, options, onChange, disabled }) => (
  <div className="min-w-0">
    <span id={id} className={cx(labelCls, "block mb-1.5 px-1")}>{label}</span>
    <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o)}
            className={cx("min-w-[3rem]", chipBase, FOCUS, on ? chipOn : chipOff)}
          >
            {o}
          </button>
        );
      })}
    </div>
  </div>
);

/* ------------------------------------------------------------------------------------------
   Form
------------------------------------------------------------------------------------------ */

// allowArchivePrevious: shows the "archive my previous setup" option (create mode only)
// ownerName: the student's first name, used in the suggested setup name (optional)
const SetupForm = ({ initial, ownerName, onSubmit, submitLabel = "Save", loading, disabled, allowArchivePrevious }) => {
  const [form, setForm] = useState(() => {
    const f = build(initial);
    if (!initial?.name) f.name = suggestName(f, ownerName);
    return f;
  });
  const [archivePrevious, setArchivePrevious] = useState(false);
  const [error, setError] = useState("");

  // Auto-fill rules. In edit mode (a saved name or saved dates) nothing is overwritten.
  const [nameTouched, setNameTouched] = useState(() => Boolean(initial?.name));
  const [datesTouched, setDatesTouched] = useState(() => Boolean(initial?.startDate || initial?.endDate));

  const classPrefilled = Boolean(build(initial).branch && build(initial).section);
  const [editClass, setEditClass] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // A value saved earlier that is not in the list is kept, so editing an old setup never blanks it.
  const years = useMemo(() => withCurrent(academicYearOptions(), form.academicYear), [form.academicYear]);
  const semesters = useMemo(() => withCurrent(SEMESTERS, form.semesterLabel), [form.semesterLabel]);
  const branches = useMemo(() => withCurrent(BRANCHES, form.branch), [form.branch]);
  const sections = useMemo(() => withCurrent(SECTIONS, form.section), [form.section]);

  const suggested = suggestName(form, ownerName);
  const presets = useMemo(() => presetsFor(form.academicYear), [form.academicYear]);

  // One place that updates a field and keeps the name and dates in step with it.
  const update = (patch) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      if (!nameTouched) next.name = suggestName(next, ownerName);
      if (!datesTouched && ("academicYear" in patch || "semesterLabel" in patch)) {
        const t = typicalDates(next.academicYear, next.semesterLabel);
        if (t) Object.assign(next, t);
      }
      return next;
    });

  const set = (k) => (e) => update({ [k]: e.target.value });

  const setDate = (k) => (e) => {
    setDatesTouched(true);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const applyPreset = (p) => {
    setDatesTouched(true);
    setForm((f) => ({ ...f, startDate: p.startDate, endDate: p.endDate }));
  };

  const onName = (e) => {
    setNameTouched(true);
    setForm((f) => ({ ...f, name: e.target.value }));
  };

  const useSuggestedName = () => {
    setNameTouched(false);
    setForm((f) => ({ ...f, name: suggested }));
  };

  // Live date feedback
  const start = parseYmd(form.startDate);
  const end = parseYmd(form.endDate);
  const dateOrderBad = Boolean(start && end && end < start);
  const days = start && end && !dateOrderBad ? Math.round((end - start) / 86400000) + 1 : 0;
  const weeks = days ? Math.max(1, Math.round(days / 7)) : 0;

  const submit = (e) => {
    e.preventDefault();
    setError("");
    if (!form.academicYear || !form.semesterLabel || !form.branch || !form.section) {
      setError("Choose the academic year, semester, branch and section.");
      return;
    }
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    const target = Number(form.targetPercentage);
    if (form.targetPercentage === "" || !(target >= 0 && target <= 100)) {
      setError("Target attendance must be between 0 and 100.");
      return;
    }
    const name = form.name.trim() || suggested;
    if (!name) {
      setError("Give your setup a name.");
      return;
    }
    onSubmit({
      name,
      academicYear: form.academicYear.trim(),
      semesterLabel: form.semesterLabel.trim(),
      branch: form.branch.trim(),
      section: form.section.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      timezone: form.timezone.trim(),
      targetPercentage: target,
      ...(allowArchivePrevious ? { archivePrevious } : {}),
    });
  };

  // The @container wrapper makes every layout switch follow the width of the card or dialog
  // this form sits in, so fields never overlap in a narrow popup.
  return (
    <form onSubmit={submit} className="@container space-y-6 min-w-0">
      <Alert type="error">{error}</Alert>

      {/* Class: taken from the account when we already know it */}
      {classPrefilled && !editClass ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[color:var(--inset)] px-4 py-3 min-w-0">
          <div className="min-w-0">
            <p className="text-[12px] text-[color:var(--muted)]">Your class</p>
            <p className="text-[15px] font-semibold text-[color:var(--ink)] truncate">
              {form.branch} Section {form.section}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditClass(true)}
            disabled={disabled}
            className={cx("h-11 px-3 shrink-0 text-[13.5px] font-semibold text-indigo-600 hover:underline rounded-lg", FOCUS)}
          >
            Change
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 min-w-0">
          <Choice label="Branch" value={form.branch} options={branches} onChange={set("branch")} disabled={disabled} />
          <Choice label="Section" value={form.section} options={sections} onChange={set("section")} disabled={disabled} />
        </div>
      )}

      {/* Term */}
      <div className="space-y-4 min-w-0">
        <Chips id="semester-label" label="Semester" value={form.semesterLabel} options={semesters} onChange={(v) => update({ semesterLabel: v })} disabled={disabled} />
        <div className="@md:max-w-[16rem]">
          <Choice label="Academic year" value={form.academicYear} options={years} onChange={set("academicYear")} disabled={disabled} />
        </div>
      </div>

      {/* Dates */}
      <fieldset className="rounded-xl bg-[color:var(--inset)] p-4 min-w-0" disabled={disabled}>
        <legend className="sr-only">Semester dates</legend>

        <div className="flex items-center gap-3 mb-3 min-w-0">
          <span className="w-8 h-8 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <CalendarDays className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[color:var(--ink)] leading-tight">Semester dates</p>
            <p className="text-[12.5px] text-[color:var(--muted)]">Classes are counted only between these two days.</p>
          </div>
        </div>

        {presets.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Typical dates">
            {presets.map((p) => {
              const on = form.startDate === p.startDate && form.endDate === p.endDate;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p)}
                  aria-pressed={on}
                  className={cx(
                    "inline-flex items-center gap-1.5 h-11 @md:h-9 px-3.5 rounded-full border text-[13px] font-medium transition-colors motion-reduce:transition-none active:scale-[0.98]",
                    FOCUS,
                    on ? chipOn : chipOff
                  )}
                >
                  {on && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                  {p.label}
                  <span className={cx("font-normal", on ? "text-white/80" : "text-[color:var(--muted)]")}>{p.sub}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3 @sm:gap-4 min-w-0">
          <Field label="Starts" type="date" value={form.startDate} onChange={setDate("startDate")} max={form.endDate || undefined} required disabled={disabled} />
          <Field label="Ends" type="date" value={form.endDate} onChange={setDate("endDate")} min={form.startDate || undefined} required disabled={disabled} />
        </div>

        <div className="mt-3 min-h-[1.25rem] text-[13px]" aria-live="polite">
          {dateOrderBad ? (
            <p className="text-[#A32A42]">The end date is before the start date. Swap them or pick a later end date.</p>
          ) : days ? (
            <p className="text-[color:var(--body)] tabular-nums">
              {fmtDate(form.startDate)} to {fmtDate(form.endDate)}, about <strong className="font-semibold text-[color:var(--ink)]">{weeks} weeks</strong>.
            </p>
          ) : (
            <p className="text-[color:var(--muted)]">Pick the first and last day of your semester.</p>
          )}
        </div>

        {!datesTouched && form.startDate && (
          <p className="text-[12.5px] text-[color:var(--muted)] mt-1">These are typical dates for this term. Change them to match your college calendar.</p>
        )}
      </fieldset>

      {/* Target */}
      <div className="min-w-0">
        <span id="target-label" className={cx(labelCls, "block mb-1.5 px-1")}>Attendance target</span>
        <div role="radiogroup" aria-labelledby="target-label" className="flex flex-wrap items-center gap-2">
          {TARGETS.map((t) => {
            const on = Number(form.targetPercentage) === t && form.targetPercentage !== "";
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => setForm((f) => ({ ...f, targetPercentage: String(t) }))}
                className={cx("tabular-nums", chipBase, FOCUS, on ? chipOn : chipOff)}
              >
                {t}%
              </button>
            );
          })}
        </div>
        <p className="text-[12.5px] text-[color:var(--muted)] mt-2 px-1">Most colleges ask for 75%. Use More options for another value.</p>
      </div>

      {/* Name */}
      <div className="min-w-0">
        <Field
          label="Setup name"
          value={form.name}
          onChange={onName}
          placeholder={suggested || "e.g. Sem 5 Autumn"}
          hint={nameTouched ? undefined : suggested ? "Made from your details. It updates when you change the semester, and you can rename it." : "Choose your class and semester and we will suggest a name."}
          required
          disabled={disabled}
        />
        {nameTouched && suggested && form.name.trim() !== suggested && (
          <button
            type="button"
            onClick={useSuggestedName}
            className={cx("mt-1.5 px-1 min-h-11 text-left inline-flex items-center gap-1.5 text-[12.5px] font-medium text-indigo-600 hover:underline rounded-lg", FOCUS)}
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">Use "{suggested}"</span>
          </button>
        )}
      </div>

      <p className="text-[12.5px] text-[color:var(--muted)] px-1 -mt-2">
        Academic year, semester, branch and section decide which official schedule you can join, so pick the same ones your CR used.
      </p>

      {/* Rarely changed */}
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => setShowMore((s) => !s)}
          aria-expanded={showMore}
          className={cx("inline-flex items-center gap-1.5 min-h-11 text-[13.5px] font-semibold text-[color:var(--body)] hover:text-[color:var(--ink)] rounded-lg", FOCUS)}
        >
          More options
          <ChevronDown className={cx("w-4 h-4 transition-transform motion-reduce:transition-none", showMore && "rotate-180")} aria-hidden="true" />
        </button>
        {showMore && (
          <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 mt-2 min-w-0">
            <Field label="Target attendance %" type="number" min="0" max="100" value={form.targetPercentage} onChange={set("targetPercentage")} disabled={disabled} />
            <Field label="Timezone" value={form.timezone} onChange={set("timezone")} hint="e.g. Asia/Kolkata" disabled={disabled} />
          </div>
        )}
      </div>

      {allowArchivePrevious && (
        <label className="flex items-start gap-2.5 text-[13.5px] text-[color:var(--ink)]">
          <input type="checkbox" checked={archivePrevious} onChange={(e) => setArchivePrevious(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-indigo-600" />
          <span className="min-w-0">Archive my previous active setup for this class if one exists.</span>
        </label>
      )}

      <Button type="submit" loading={loading} disabled={disabled} className="w-full @sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  );
};

export default SetupForm;
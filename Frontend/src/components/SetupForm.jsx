import { useMemo, useState } from "react";
import { Alert, Button, Field } from "./Ui";
import { toDateInput } from "../api/endpoints";
import { BRANCHES, SECTIONS, SEMESTERS, academicYearOptions, pickOption, withCurrent } from "../lib/academic";

const build = (initial) => ({
  name: initial?.name || "",
  academicYear: String(initial?.academicYear || "").trim(),
  semesterLabel: pickOption(SEMESTERS, initial?.semesterLabel),
  branch: pickOption(BRANCHES, initial?.branch),
  section: pickOption(SECTIONS, initial?.section),
  startDate: toDateInput(initial?.startDate),
  endDate: toDateInput(initial?.endDate),
  timezone: initial?.timezone || "Asia/Kolkata",
  targetPercentage: String(initial?.targetPercentage ?? 75),
});

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

// allowArchivePrevious: shows the "archive my previous setup" option (create mode only)
const SetupForm = ({ initial, onSubmit, submitLabel = "Save", loading, disabled, allowArchivePrevious }) => {
  const [form, setForm] = useState(() => build(initial));
  const [archivePrevious, setArchivePrevious] = useState(false);
  const [error, setError] = useState("");

  // A value saved earlier that is not in the list is kept, so editing an old setup never blanks it.
  const years = useMemo(() => withCurrent(academicYearOptions(), form.academicYear), [form.academicYear]);
  const semesters = useMemo(() => withCurrent(SEMESTERS, form.semesterLabel), [form.semesterLabel]);
  const branches = useMemo(() => withCurrent(BRANCHES, form.branch), [form.branch]);
  const sections = useMemo(() => withCurrent(SECTIONS, form.section), [form.section]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
    onSubmit({
      name: form.name.trim(),
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

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert type="error">{error}</Alert>

      <Field label="Setup name" value={form.name} onChange={set("name")} placeholder="e.g. Sem 5 Autumn" required disabled={disabled} />

      <div className="grid sm:grid-cols-2 gap-4">
        <Choice label="Academic year" value={form.academicYear} options={years} onChange={set("academicYear")} disabled={disabled} />
        <Choice label="Semester" value={form.semesterLabel} options={semesters} onChange={set("semesterLabel")} disabled={disabled} />
        <Choice label="Branch" value={form.branch} options={branches} onChange={set("branch")} disabled={disabled} />
        <Choice label="Section" value={form.section} options={sections} onChange={set("section")} disabled={disabled} />
        <Field label="Start date" type="date" value={form.startDate} onChange={set("startDate")} required disabled={disabled} />
        <Field label="End date" type="date" value={form.endDate} onChange={set("endDate")} required disabled={disabled} />
        <Field label="Target attendance %" type="number" min="0" max="100" value={form.targetPercentage} onChange={set("targetPercentage")} disabled={disabled} />
        <Field label="Timezone" value={form.timezone} onChange={set("timezone")} hint="e.g. Asia/Kolkata" disabled={disabled} />
      </div>
      <p className="text-[12.5px] text-[#6A6F85] px-1">
        Academic year, semester, branch and section decide which official schedule you can join, so pick the same ones your CR used.
      </p>

      {allowArchivePrevious && (
        <label className="flex items-start gap-2.5 text-[13.5px] text-[#161827]">
          <input type="checkbox" checked={archivePrevious} onChange={(e) => setArchivePrevious(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
          <span>Archive my previous active setup for this class if one exists.</span>
        </label>
      )}

      <Button type="submit" loading={loading} disabled={disabled} className="w-full sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  );
};

export default SetupForm;
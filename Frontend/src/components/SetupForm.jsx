import { useState } from "react";
import { Alert, Button, Field } from "./Ui";
import { toDateInput } from "../api/endpoints";

const TEXT_FIELDS = ["name", "academicYear", "semesterLabel", "branch", "section", "startDate", "endDate", "timezone"];

const build = (initial) => ({
  name: initial?.name || "",
  academicYear: initial?.academicYear || "",
  semesterLabel: initial?.semesterLabel || "",
  branch: initial?.branch || "",
  section: initial?.section || "",
  startDate: toDateInput(initial?.startDate),
  endDate: toDateInput(initial?.endDate),
  timezone: initial?.timezone || "Asia/Kolkata",
  targetPercentage: String(initial?.targetPercentage ?? 75),
});

// allowArchivePrevious: shows the "archive my previous setup" option (create mode only)
const SetupForm = ({ initial, onSubmit, submitLabel = "Save", loading, disabled, allowArchivePrevious }) => {
  const [form, setForm] = useState(() => build(initial));
  const [archivePrevious, setArchivePrevious] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    setError("");
    if (form.endDate < form.startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    const target = Number(form.targetPercentage);
    if (!(target >= 0 && target <= 100)) {
      setError("Target attendance must be between 0 and 100.");
      return;
    }
    const body = { targetPercentage: target };
    TEXT_FIELDS.forEach((k) => {
      body[k] = form[k].trim();
    });
    if (allowArchivePrevious) body.archivePrevious = archivePrevious;
    onSubmit(body);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert type="error">{error}</Alert>

      <Field label="Setup name" value={form.name} onChange={set("name")} placeholder="e.g. Sem 5 Autumn" required disabled={disabled} />

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Academic year" value={form.academicYear} onChange={set("academicYear")} placeholder="2026-27" required disabled={disabled} />
        <Field label="Semester" value={form.semesterLabel} onChange={set("semesterLabel")} placeholder="Sem 5" required disabled={disabled} />
        <Field label="Branch" value={form.branch} onChange={set("branch")} placeholder="CSE" required disabled={disabled} />
        <Field label="Section" value={form.section} onChange={set("section")} placeholder="A" required disabled={disabled} />
        <Field label="Start date" type="date" value={form.startDate} onChange={set("startDate")} required disabled={disabled} />
        <Field label="End date" type="date" value={form.endDate} onChange={set("endDate")} required disabled={disabled} />
        <Field label="Target attendance %" type="number" min="0" max="100" value={form.targetPercentage} onChange={set("targetPercentage")} disabled={disabled} />
        <Field label="Timezone" value={form.timezone} onChange={set("timezone")} hint="e.g. Asia/Kolkata" disabled={disabled} />
      </div>

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
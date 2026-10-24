import { useState } from "react";
import { Alert, Button, Field } from "./Ui";
import { toDateInput } from "../api/endpoints";

const FIELDS = ["name", "academicYear", "semesterLabel", "branch", "section", "startDate", "endDate", "timezone"];

const build = (initial) => ({
  name: initial?.name || "",
  academicYear: initial?.academicYear || "",
  semesterLabel: initial?.semesterLabel || "",
  branch: initial?.branch || "",
  section: initial?.section || "",
  startDate: toDateInput(initial?.startDate),
  endDate: toDateInput(initial?.endDate),
  timezone: initial?.timezone || "Asia/Kolkata",
});

const SetupForm = ({ initial, onSubmit, submitLabel = "Save", loading, disabled }) => {
  const [form, setForm] = useState(() => build(initial));
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    setError("");
    if (form.endDate < form.startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    const body = {};
    FIELDS.forEach((k) => {
      body[k] = form[k].trim();
    });
    onSubmit(body);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert type="error">{error}</Alert>

      <Field label="Setup name" value={form.name} onChange={set("name")} placeholder="e.g. Semester 5 Timetable" required disabled={disabled} />

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Academic year" value={form.academicYear} onChange={set("academicYear")} placeholder="2026-27" required disabled={disabled} />
        <Field label="Semester" value={form.semesterLabel} onChange={set("semesterLabel")} placeholder="Semester 5" required disabled={disabled} />
        <Field label="Branch" value={form.branch} onChange={set("branch")} placeholder="CSE" required disabled={disabled} />
        <Field label="Section" value={form.section} onChange={set("section")} placeholder="A" required disabled={disabled} />
        <Field label="Start date" type="date" value={form.startDate} onChange={set("startDate")} required disabled={disabled} />
        <Field label="End date" type="date" value={form.endDate} onChange={set("endDate")} required disabled={disabled} />
      </div>

      <Field label="Timezone" value={form.timezone} onChange={set("timezone")} hint="IANA zone, e.g. Asia/Kolkata" disabled={disabled} />

      <Button type="submit" loading={loading} disabled={disabled} className="w-full sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  );
};

export default SetupForm;
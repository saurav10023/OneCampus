import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { eventsApi, errMsg, toDateInput } from "../../api/endpoints";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageSpinner, Warnings, cx, fmtDate } from "../../components/Ui";

const TYPES = [
  { key: "holiday", label: "Holiday", tone: "red" },
  { key: "break", label: "Break", tone: "amber" },
  { key: "exam", label: "Exam", tone: "brand" },
  { key: "quiz", label: "Quiz", tone: "brand" },
  { key: "event", label: "Event", tone: "green" },
];
const typeInfo = (k) => TYPES.find((t) => t.key === k) || { label: k, tone: "neutral" };
const TIMED = ["quiz", "event"];

const blank = { title: "", type: "holiday", startDate: "", endDate: "", startTime: "", endTime: "", affectsClasses: "", note: "" };

const CalendarTab = ({ setupId, readOnly }) => {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setEvents(await eventsApi.list(setupId, filter ? { type: filter } : undefined));
    } catch (e) {
      setError(errMsg(e, "Could not load calendar events"));
    } finally {
      setLoading(false);
    }
  }, [setupId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openForm = (ev) => {
    setEditing(ev || "new");
    setForm(
      ev
        ? {
            title: ev.title || "",
            type: ev.type || "holiday",
            startDate: toDateInput(ev.startDate),
            endDate: toDateInput(ev.endDate),
            startTime: ev.startTime || "",
            endTime: ev.endTime || "",
            affectsClasses: typeof ev.affectsClasses === "boolean" ? String(ev.affectsClasses) : "",
            note: ev.note || "",
          }
        : blank
    );
    setFormError("");
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    if (form.endDate < form.startDate) return setFormError("End date must be on or after the start date.");

    const body = { title: form.title.trim(), type: form.type, startDate: form.startDate, endDate: form.endDate };
    if (form.note.trim()) body.note = form.note.trim();
    if (form.affectsClasses !== "") body.affectsClasses = form.affectsClasses === "true";
    if (TIMED.includes(form.type) && form.startTime && form.endTime) {
      if (form.startDate !== form.endDate) return setFormError("Timed events must be on a single date.");
      if (form.endTime <= form.startTime) return setFormError("End time must be after the start time.");
      body.startTime = form.startTime;
      body.endTime = form.endTime;
    }

    setSaving(true);
    try {
      const data = editing === "new" ? await eventsApi.create(setupId, body) : await eventsApi.update(setupId, editing._id, body);
      setResult(data);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(errMsg(err, "Could not save the event"));
    } finally {
      setSaving(false);
    }
  };

  const confirm = async (ev) => {
    try {
      setResult(await eventsApi.confirm(setupId, ev._id));
      await load();
    } catch (err) {
      setError(errMsg(err, "Could not confirm the event"));
    }
  };

  const remove = async (ev) => {
    if (!window.confirm(`Delete "${ev.title}"? Classes it cancelled will be restored.`)) return;
    try {
      setResult(await eventsApi.remove(setupId, ev._id));
      await load();
    } catch (err) {
      setError(errMsg(err, "Could not delete the event"));
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {[{ key: "", label: "All" }, ...TYPES].map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cx(
                "h-8 px-3.5 rounded-full text-[12.5px] font-medium border transition",
                filter === t.key ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] border-transparent" : "bg-white/55 border-white/80 text-[#161827]/75 hover:bg-white/85"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!readOnly && <Button size="sm" onClick={() => openForm(null)}><Plus className="w-4 h-4" />Add event</Button>}
      </div>

      <Alert type="error">{error}</Alert>
      <Warnings data={result} />

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No calendar events"
          text="Add holidays, breaks, exams and quizzes. Confirmed holidays and breaks cancel the classes they cover."
          action={!readOnly && <Button onClick={() => openForm(null)}><Plus className="w-4 h-4" />Add event</Button>}
        />
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
            const info = typeInfo(ev.type);
            const draft = !ev.confirmedAt && ev.confirmed !== true;
            return (
              <Card key={ev._id} className="p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15.5px] font-semibold text-[#161827]">{ev.title}</p>
                    <Badge tone={info.tone}>{info.label}</Badge>
                    {draft && <Badge tone="amber">Draft</Badge>}
                    {ev.origin === "official" && <Badge tone="green">Official</Badge>}
                  </div>
                  <p className="text-[13px] text-[#6A6F85] mt-1">
                    {fmtDate(ev.startDate)}
                    {toDateInput(ev.startDate) !== toDateInput(ev.endDate) && ` → ${fmtDate(ev.endDate)}`}
                    {ev.startTime && ` · ${ev.startTime}–${ev.endTime}`}
                    {ev.affectsClasses ? " · cancels classes" : ""}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1">
                    {draft && <Button size="sm" variant="glass" onClick={() => confirm(ev)}><Check className="w-4 h-4" />Confirm</Button>}
                    <button onClick={() => openForm(ev)} aria-label="Edit" className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(ev)} aria-label="Delete" className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add calendar event" : "Edit event"}>
        <form onSubmit={save} className="space-y-4">
          <Alert type="error">{formError}</Alert>
          <Field label="Title" value={form.title} onChange={set("title")} placeholder="Diwali break" maxLength={120} required />
          <Field as="select" label="Type" value={form.type} onChange={set("type")}>
            {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Start date" type="date" value={form.startDate} onChange={set("startDate")} required />
            <Field label="End date" type="date" value={form.endDate} onChange={set("endDate")} required />
          </div>
          {TIMED.includes(form.type) && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Start time (optional)" type="time" value={form.startTime} onChange={set("startTime")} />
              <Field label="End time (optional)" type="time" value={form.endTime} onChange={set("endTime")} />
            </div>
          )}
          <Field as="select" label="Cancels classes?" value={form.affectsClasses} onChange={set("affectsClasses")} hint="Default: yes for holidays and breaks, no for the rest.">
            <option value="">Use default for this type</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Field>
          <Field label="Note (optional)" value={form.note} onChange={set("note")} placeholder="Festival holidays" />
          <Button type="submit" loading={saving}>{editing === "new" ? "Add event" : "Save changes"}</Button>
        </form>
      </Modal>
    </div>
  );
};

export default CalendarTab;
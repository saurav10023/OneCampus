import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CalendarRange, Check, ChevronDown, ClipboardCheck, Coffee, GraduationCap, Info, Pencil, Plus, Sparkles, Sun, Trash2 } from "lucide-react";
import { eventsApi, errMsg, toDateInput } from "../../api/endpoints";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, Warnings, cx, fmtDate } from "../../components/Ui";
import { ConfirmDialog, FadeIn, Flash, SkeletonList, Tabs, useFlash } from "../../components/Ux";
import { daysBetween, dayNum, isoOf, monthKey, monthLabel, monthShort, todayISO } from "../../lib/dateui";

const TYPES = [
  { key: "holiday", label: "Holiday", tone: "red", icon: Sun, tile: "from-rose-400 to-rose-500" },
  { key: "break", label: "Break", tone: "amber", icon: Coffee, tile: "from-amber-400 to-orange-500" },
  { key: "exam", label: "Exam", tone: "brand", icon: GraduationCap, tile: "from-indigo-500 to-indigo-600" },
  { key: "quiz", label: "Quiz", tone: "brand", icon: ClipboardCheck, tile: "from-violet-500 to-purple-600" },
  { key: "event", label: "Event", tone: "green", icon: Sparkles, tile: "from-emerald-400 to-teal-500" },
];
const typeInfo = (k) => TYPES.find((t) => t.key === k) || { label: k, tone: "neutral", icon: CalendarRange, tile: "from-slate-400 to-slate-500" };

// Only these types may carry start and end times.
const TIMED = ["quiz", "event"];

const blank = { title: "", type: "holiday", startDate: "", endDate: "", startTime: "", endTime: "", affectsClasses: "", note: "" };

const endOf = (ev) => isoOf(ev.endDate || ev.startDate);
const byStart = (a, b) => isoOf(a.startDate).localeCompare(isoOf(b.startDate)) || (a.startTime || "").localeCompare(b.startTime || "");

/* ---------- one event row ---------- */

const EventRow = ({ ev, readOnly, past, onEdit, onRemove, onConfirm }) => {
  const info = typeInfo(ev.type);
  const official = ev.source === "official";
  const draft = !ev.confirmedAt && ev.confirmed !== true;
  const multi = isoOf(ev.startDate) !== endOf(ev);

  return (
    <Card className={cx("p-4 sm:p-5 flex items-center gap-4 hover:shadow-[0_24px_48px_-28px_rgba(30,32,70,0.4)] transition-shadow", past && "opacity-70")}>
      <div className={cx("w-14 shrink-0 rounded-2xl text-white text-center py-2 bg-gradient-to-br shadow-md", info.tile)} aria-hidden>
        <p className="text-[10.5px] font-semibold uppercase tracking-wider opacity-90">{monthShort(ev.startDate)}</p>
        <p className="text-[22px] font-semibold leading-none mt-0.5">{dayNum(ev.startDate)}</p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15.5px] font-semibold text-[#161827]">{ev.title}</p>
          <Badge tone={info.tone}>{info.label}</Badge>
          {draft && <Badge tone="amber">Draft</Badge>}
          {official && <Badge tone="green">Official</Badge>}
          {ev.lastAutoUpdate && <Badge tone="brand">Updated automatically</Badge>}
        </div>

        <p className="text-[13px] text-[#6A6F85] mt-1">
          {multi ? `${fmtDate(ev.startDate)} to ${fmtDate(endOf(ev))} · ${daysBetween(ev.startDate, endOf(ev))} days` : fmtDate(ev.startDate)}
          {ev.startTime && ` · ${ev.startTime}–${ev.endTime}`}
        </p>

        {ev.affectsClasses && (
          <p className="inline-flex items-center gap-1.5 text-[12.5px] text-rose-600 mt-1.5">
            <Ban className="w-3.5 h-3.5" />Cancels classes on these days
          </p>
        )}
        {draft && !official && (
          <p className="inline-flex items-center gap-1.5 text-[12.5px] text-amber-700 mt-1.5">
            <Info className="w-3.5 h-3.5" />Not active yet. Confirm it to apply.
          </p>
        )}
      </div>

      {!readOnly && (
        <div className="flex items-center gap-1 shrink-0">
          {draft && !official && (
            <Button size="sm" variant="glass" onClick={() => onConfirm(ev)}>
              <Check className="w-4 h-4" /><span className="hidden sm:inline">Confirm</span>
            </Button>
          )}
          <button onClick={() => onEdit(ev)} aria-label={`Edit ${ev.title}`} className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/65 hover:bg-white/85 hover:text-[#161827] transition-colors"><Pencil className="w-4 h-4" /></button>
          <button onClick={() => onRemove(ev)} aria-label={`Delete ${ev.title}`} className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
      )}
    </Card>
  );
};

/* ---------- tab ---------- */

const CalendarTab = ({ setupId, readOnly }) => {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [flashMsg, flash] = useFlash();

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [toRemove, setToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setEvents(await eventsApi.list(setupId));
    } catch (e) {
      setError(errMsg(e, "Could not load calendar events"));
    } finally {
      setLoading(false);
    }
  }, [setupId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Changing the type resets what the new type does not allow.
  const applyType = (type) =>
    setForm((f) => ({
      ...f,
      type,
      affectsClasses: type === "quiz" ? "false" : "",
      startTime: TIMED.includes(type) ? f.startTime : "",
      endTime: TIMED.includes(type) ? f.endTime : "",
    }));

  // Rules from the backend:
  //  - a quiz never cancels classes
  //  - an event with start and end times is on one date and never cancels classes
  const timedFilled = TIMED.includes(form.type) && Boolean(form.startTime && form.endTime);
  const cannotCancel = form.type === "quiz" || timedFilled;

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

    const endDate = timedFilled ? form.startDate : form.endDate;
    if (endDate < form.startDate) return setFormError("End date must be on or after the start date.");
    if (TIMED.includes(form.type) && Boolean(form.startTime) !== Boolean(form.endTime)) {
      return setFormError("Add both start and end times, or leave both empty.");
    }
    if (timedFilled && form.endTime <= form.startTime) return setFormError("End time must be after the start time.");

    const body = { title: form.title.trim(), type: form.type, startDate: form.startDate, endDate };
    if (form.note.trim()) body.note = form.note.trim();
    if (cannotCancel) body.affectsClasses = false;
    else if (form.affectsClasses !== "") body.affectsClasses = form.affectsClasses === "true";
    if (timedFilled) {
      body.startTime = form.startTime;
      body.endTime = form.endTime;
    }

    const isNew = editing === "new";
    setSaving(true);
    try {
      const data = isNew ? await eventsApi.create(setupId, body) : await eventsApi.update(setupId, editing._id, body);
      setResult(data);
      setEditing(null);
      flash(isNew ? `"${body.title}" added` : "Event updated");
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
      flash(`"${ev.title}" confirmed`);
      await load();
    } catch (err) {
      setError(errMsg(err, "Could not confirm the event"));
    }
  };

  const doRemove = async () => {
    const ev = toRemove;
    setRemoving(true);
    try {
      setResult(await eventsApi.remove(setupId, ev._id));
      flash(ev.source === "official" ? `"${ev.title}" hidden` : `"${ev.title}" deleted`);
      setToRemove(null);
      await load();
    } catch (err) {
      setError(errMsg(err, "Could not delete the event"));
      setToRemove(null);
    } finally {
      setRemoving(false);
    }
  };

  /* ---- derived lists ---- */
  const today = todayISO();

  const counts = useMemo(() => {
    const c = { "": events.length };
    TYPES.forEach((t) => (c[t.key] = events.filter((e) => e.type === t.key).length));
    return c;
  }, [events]);

  const filtered = useMemo(() => events.filter((e) => !filter || e.type === filter), [events, filter]);
  const upcoming = useMemo(() => filtered.filter((e) => endOf(e) >= today).sort(byStart), [filtered, today]);
  const past = useMemo(() => filtered.filter((e) => endOf(e) < today).sort((a, b) => byStart(b, a)), [filtered, today]);

  const groups = useMemo(() => {
    const out = [];
    upcoming.forEach((ev) => {
      const key = monthKey(ev.startDate);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(ev);
      else out.push({ key, label: monthLabel(ev.startDate), items: [ev] });
    });
    return out;
  }, [upcoming]);

  const draftCount = events.filter((e) => !e.confirmedAt && e.confirmed !== true && e.source !== "official").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          size="sm"
          value={filter}
          onChange={setFilter}
          items={[{ key: "", label: "All", count: counts[""] }, ...TYPES.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] || undefined }))]}
        />
        {!readOnly && <Button size="sm" onClick={() => openForm(null)}><Plus className="w-4 h-4" />Add event</Button>}
      </div>

      <Alert type="error">{error}</Alert>
      <Flash message={flashMsg} />
      <Warnings data={result} />
      {draftCount > 0 && !readOnly && (
        <Alert type="info">
          {draftCount} draft event{draftCount === 1 ? " is" : "s are"} waiting. Confirm {draftCount === 1 ? "it" : "them"} so holidays and breaks start cancelling classes.
        </Alert>
      )}

      {loading ? (
        <SkeletonList count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={filter ? `No ${typeInfo(filter).label.toLowerCase()}s yet` : "No calendar events"}
          text="Add holidays, breaks, exams and quizzes. Confirmed holidays and breaks cancel the classes they cover."
          action={!readOnly && <Button onClick={() => openForm(null)}><Plus className="w-4 h-4" />Add event</Button>}
        />
      ) : (
        <div className="space-y-7">
          {groups.length === 0 && (
            <Card className="p-6 text-center text-[14px] text-[#6A6F85]">Nothing coming up. Past events are below.</Card>
          )}

          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h3 className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6A6F85] mb-3 px-1">
                {g.label}
                <span className="flex-1 h-px bg-gradient-to-r from-[#161827]/15 to-transparent" />
              </h3>
              <div className="space-y-3">
                {g.items.map((ev, i) => (
                  <FadeIn key={ev._id} delay={Math.min(i, 6) * 40}>
                    <EventRow ev={ev} readOnly={readOnly} onEdit={openForm} onRemove={setToRemove} onConfirm={confirm} />
                  </FadeIn>
                ))}
              </div>
            </section>
          ))}

          {past.length > 0 && (
            <section>
              <button
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                className="flex items-center gap-2 text-[13px] font-medium text-[#6A6F85] hover:text-[#161827] transition-colors px-1"
              >
                <ChevronDown className={cx("w-4 h-4 transition-transform", showPast && "rotate-180")} />
                {showPast ? "Hide" : "Show"} past events ({past.length})
              </button>
              {showPast && (
                <div className="space-y-3 mt-3">
                  {past.map((ev) => (
                    <FadeIn key={ev._id}>
                      <EventRow ev={ev} past readOnly={readOnly} onEdit={openForm} onRemove={setToRemove} onConfirm={confirm} />
                    </FadeIn>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* add / edit */}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add calendar event" : "Edit event"}>
        <form onSubmit={save} className="space-y-5">
          <Alert type="error">{formError}</Alert>

          <div>
            <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-2 px-1">What kind of event?</span>
            <div className="grid grid-cols-5 gap-2">
              {TYPES.map((t) => {
                const on = form.type === t.key;
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => applyType(t.key)}
                    aria-pressed={on}
                    className={cx(
                      "flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 text-[11.5px] sm:text-[12px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
                      on ? "bg-indigo-500/10 border-indigo-300 text-indigo-700 shadow-sm" : "bg-white/60 border-white/80 text-[#161827]/75 hover:bg-white/90"
                    )}
                  >
                    <span className={cx("w-8 h-8 rounded-xl flex items-center justify-center text-white bg-gradient-to-br", t.tile)}>
                      <Icon className="w-4 h-4" />
                    </span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Title" value={form.title} onChange={set("title")} placeholder="Diwali break" maxLength={120} required autoFocus />

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Start date" type="date" value={form.startDate} onChange={set("startDate")} required />
            <Field
              label="End date"
              type="date"
              value={timedFilled ? form.startDate : form.endDate}
              onChange={set("endDate")}
              disabled={timedFilled}
              hint={timedFilled ? "A timed event is on one date." : undefined}
              required
            />
          </div>

          {TIMED.includes(form.type) && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Start time (optional)" type="time" value={form.startTime} onChange={set("startTime")} />
              <Field label="End time (optional)" type="time" value={form.endTime} onChange={set("endTime")} />
            </div>
          )}

          <Field
            as="select"
            label="Cancels classes?"
            value={cannotCancel ? "false" : form.affectsClasses}
            onChange={set("affectsClasses")}
            disabled={cannotCancel}
            hint={
              form.type === "quiz"
                ? "A quiz never cancels classes."
                : timedFilled
                ? "An event with times never cancels classes."
                : "Default: yes for holidays and breaks, no for the rest."
            }
          >
            {!cannotCancel && <option value="">Use default for this type</option>}
            {!cannotCancel && <option value="true">Yes</option>}
            <option value="false">No</option>
          </Field>

          <Field label="Note (optional)" value={form.note} onChange={set("note")} placeholder="Festival holidays" />

          <Button type="submit" loading={saving} className="w-full sm:w-auto">{editing === "new" ? "Add event" : "Save changes"}</Button>
        </form>
      </Modal>

      {/* delete / hide */}
      <ConfirmDialog
        open={Boolean(toRemove)}
        title={toRemove?.source === "official" ? "Hide this event?" : "Delete this event?"}
        confirmLabel={toRemove?.source === "official" ? "Hide event" : "Delete event"}
        busy={removing}
        onConfirm={doRemove}
        onClose={() => setToRemove(null)}
      >
        {toRemove?.source === "official" ? (
          <p>
            <span className="font-semibold text-[#161827]">{toRemove?.title}</span> will be hidden from your calendar. It will not come back when your official schedule syncs.
          </p>
        ) : (
          <p>
            <span className="font-semibold text-[#161827]">{toRemove?.title}</span> will be deleted. Any classes it cancelled will be restored.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
};

export default CalendarTab;
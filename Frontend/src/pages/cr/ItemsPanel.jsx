import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronDown, Eye, Plus } from "lucide-react";
import { officialSchedulesApi, errMsg, toDateInput } from "../../api/endpoints";
import { isWithdrawn } from "../../lib/prompt";
import { Alert, Badge, Button, Card, EmptyState, Field, PageSpinner, Summary, cx, fmtDate } from "../../components/Ui";
import { FormLabel, FormModal, RowActions, focusFirstInvalid, shortOf, useNoteDialog } from "../../components/FormKit";

const CLASS_TYPES = ["lecture", "lab", "tutorial"]; // edit if your backend allows more
const api = officialSchedulesApi.items;

const idOf = (x) => x?._id || x?.id; // works whether the backend returns `_id` or `id`
const keyOf = (s) => s.key || idOf(s);

// What each kind needs (matches the backend schedule item rules)
//   subject: true = required, "optional" = may be empty
//   times:   true = required, "optional" = may be empty, missing = not allowed
//   single:  always one date
const KINDS = {
  quiz: { label: "Quiz", tone: "brand", help: "A quiz for one subject, on one date and time.", slots: ["quiz_1", "quiz_2"], subject: true, times: true, single: true },
  exam: { label: "Exam", tone: "brand", help: "Mid-sem or end-sem exam period. Times are not used.", slots: ["midsem", "endsem"], subject: "optional" },
  holiday: { label: "Holiday", tone: "red", help: "No classes on these dates." },
  event: { label: "Event", tone: "green", help: "Add times only if it happens on a single day.", times: "optional" },
  mass_bunk: { label: "Mass bunk", tone: "amber", help: "The section skips classes. Narrow it down by subject, time, type or group.", subject: "optional", times: "optional", classType: "optional", group: true },
  class_cancel: { label: "Class cancel", tone: "red", help: "One subject’s class is cancelled on one date.", subject: true, times: true, single: true, classType: "optional", group: true },
};

const blank = { kind: "holiday", title: "", startDate: "", endDate: "", startTime: "", endTime: "", subjectKey: "", slotKey: "", classType: "", group: "", note: "" };

const ymdLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Small calendar tile: "12 / Nov"
const DateTile = ({ ymd, past }) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return (
    <span aria-hidden="true" className={cx("w-12 shrink-0 rounded-2xl py-1.5 text-center leading-none border", past ? "bg-[#161827]/5 border-white/80 text-[#6A6F85]" : "bg-indigo-500/10 border-indigo-200 text-indigo-700")}>
      <span className="block text-[17px] font-semibold">{d.getUTCDate()}</span>
      <span className="block text-[10.5px] uppercase tracking-wide mt-1">{d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</span>
    </span>
  );
};

// One collapsible kind. Closed, it still shows the count, the next date and a few short names.
const Group = ({ id, title, tone, count, next, chips, open, onToggle, children }) => (
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
          <Badge tone={tone}>{count}</Badge>
          {next && <span className="text-[12.5px] text-[#6A6F85]">Next: {next}</span>}
        </span>
        {chips.length > 0 && (
          <span className="flex flex-wrap gap-1 mt-1.5">
            {chips.slice(0, 6).map((c) => <Badge key={c}>{c}</Badge>)}
            {chips.length > 6 && <Badge>+{chips.length - 6}</Badge>}
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

const ItemsPanel = ({ schedule, scheduleId: scheduleIdProp, readOnly, onChanged }) => {
  const scheduleId = scheduleIdProp || idOf(schedule);

  const [items, setItems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [openKinds, setOpenKinds] = useState(null); // null = default (the group with the next upcoming item)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [initial, setInitial] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);
  const [ask, noteDialog] = useNoteDialog();

  const load = useCallback(async () => {
    if (!scheduleId) return;
    try {
      const [i, s] = await Promise.all([api.list(scheduleId), officialSchedulesApi.subjects.list(scheduleId)]);
      setItems(i);
      setSubjects(s.filter((x) => !isWithdrawn(x)));
      setError("");
    } catch (e) {
      setError(errMsg(e, "Could not load items"));
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const { nameOf, shortOfItem } = useMemo(() => {
    const names = {};
    const codes = {};
    subjects.forEach((s) => {
      [keyOf(s), idOf(s)].forEach((k) => {
        names[k] = s.name;
        codes[k] = s.code;
      });
    });
    const ref = (it) => it.subjectKey?._id || it.subjectKey;
    const nameOf = (it) => it.subjectName || it.subject?.name || names[ref(it)] || "";
    const shortOfItem = (it) => {
      const n = nameOf(it);
      return n ? shortOf(n, codes[ref(it)] || it.subject?.code) : "";
    };
    return { nameOf, shortOfItem };
  }, [subjects]);

  const cfg = KINDS[form.kind] || {};
  const timedEvent = form.kind === "event" && Boolean(form.startTime || form.endTime);
  const singleDate = Boolean(cfg.single) || timedEvent;
  const creating = editing === "new";
  const dirty = Boolean(editing) && JSON.stringify(form) !== initial;

  const set = (k) => (e) => {
    const v = e.target.value;
    setPreview(null);
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => ({ ...x, [k]: undefined, times: undefined }));
  };

  // Start date moves the end date along if it would end up before it.
  const setStartDate = (e) => {
    const v = e.target.value;
    setPreview(null);
    setForm((f) => ({ ...f, startDate: v, endDate: !f.endDate || f.endDate < v ? v : f.endDate }));
    setErrors((x) => ({ ...x, startDate: undefined, endDate: undefined }));
  };

  // Changing the kind clears the fields the new kind does not use.
  const setKind = (e) => {
    const kind = e.target.value;
    setPreview(null);
    setErrors({});
    setForm((f) => ({ ...blank, kind, title: f.title, startDate: f.startDate, endDate: f.endDate, note: f.note }));
  };

  const open = (it) => {
    const f = it
      ? {
          kind: it.kind,
          title: it.title || "",
          startDate: toDateInput(it.startDate),
          endDate: toDateInput(it.endDate),
          startTime: it.startTime || "",
          endTime: it.endTime || "",
          subjectKey: it.subjectKey?._id || it.subjectKey || "",
          slotKey: it.slotKey || "",
          classType: it.classType || "",
          group: it.group || "",
          note: "",
        }
      : blank;
    setEditing(it || "new");
    setForm(f);
    setInitial(JSON.stringify(f));
    setErrors({});
    setFormError("");
    setPreview(null);
  };

  const validate = () => {
    const errs = {};
    const endDate = singleDate ? form.startDate : form.endDate;
    if (!form.title.trim()) errs.title = "Give it a title.";
    if (!form.startDate) errs.startDate = singleDate ? "Pick a date." : "Pick a start date.";
    if (!singleDate && !form.endDate) errs.endDate = "Pick an end date.";
    else if (form.startDate && endDate < form.startDate) errs.endDate = "Must be on or after the start date.";
    if (cfg.slots && !form.slotKey) errs.slotKey = "Choose one.";
    if (cfg.subject === true && !form.subjectKey) errs.subjectKey = "Choose a subject.";
    if (cfg.times === true && !form.startTime) errs.startTime = "Required.";
    if (cfg.times === true && !form.endTime) errs.endTime = "Required.";
    if (cfg.times && Boolean(form.startTime) !== Boolean(form.endTime)) errs[form.startTime ? "endTime" : "startTime"] = "Add both times, or leave both empty.";
    if (form.startTime && form.endTime && form.endTime <= form.startTime) errs.endTime = "Must be after the start time.";
    return errs;
  };

  const buildBody = () => {
    const endDate = singleDate ? form.startDate : form.endDate;
    const body = { kind: form.kind, title: form.title.trim(), startDate: form.startDate, endDate };
    if (cfg.slots) body.slotKey = form.slotKey;
    if (cfg.subject && form.subjectKey) body.subjectKey = form.subjectKey;
    if (cfg.times && form.startTime && form.endTime) {
      body.startTime = form.startTime;
      body.endTime = form.endTime;
    }
    // "Any" (empty) is sent as null so a lab cancel is not matched against "lecture" by default.
    if (cfg.classType) body.classType = form.classType || null;
    if (cfg.group) body.group = form.group || null;
    if (form.note.trim()) body.note = form.note.trim();
    return body;
  };

  const check = () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("Check the highlighted fields.");
      focusFirstInvalid();
      return false;
    }
    setFormError("");
    return true;
  };

  const runPreview = async () => {
    if (previewing || saving || !check()) return;
    setPreviewing(true);
    try {
      setPreview(await officialSchedulesApi.actions.impactPreview(scheduleId, buildBody()));
      setTimeout(() => previewRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
    } catch (e) {
      setFormError(errMsg(e, "Could not preview the impact"));
    } finally {
      setPreviewing(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving || !check()) return;
    setSaving(true);
    try {
      if (creating) await api.create(scheduleId, buildBody());
      else await api.update(scheduleId, idOf(editing), buildBody());
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      setFormError(errMsg(err, "Could not save the item"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (it) => {
    const w = isWithdrawn(it);
    ask({
      title: w ? "Restore item" : "Withdraw item",
      message: w ? `"${it.title}" will apply to students again.` : `"${it.title}" will be removed and students get their classes back. You can restore it later.`,
      confirmLabel: w ? "Restore" : "Withdraw",
      tone: w ? "primary" : "danger",
      run: async (note) => {
        if (w) await api.restore(scheduleId, idOf(it), note);
        else await api.withdraw(scheduleId, idOf(it), note);
        await load();
        onChanged?.();
      },
    });
  };

  if (loading) return <PageSpinner />;

  const todayYmd = ymdLocal();
  const isPast = (it) => toDateInput(it.endDate) < todayYmd;
  const groupsList = Object.entries(KINDS)
    .map(([key, k]) => ({
      key,
      k,
      rows: items
        .filter((i) => i.kind === key)
        .sort((a, b) => Number(isWithdrawn(a)) - Number(isWithdrawn(b)) || toDateInput(a.startDate).localeCompare(toDateInput(b.startDate))),
    }))
    .filter((g) => g.rows.length > 0);

  const upcoming = (g) => g.rows.filter((r) => !isWithdrawn(r) && !isPast(r));
  const nextDate = (g) => upcoming(g).map((r) => toDateInput(r.startDate)).sort()[0];
  // default: open the group whose next item is soonest, else the first group
  const defaultKey = [...groupsList].filter((g) => nextDate(g)).sort((a, b) => nextDate(a).localeCompare(nextDate(b)))[0]?.key || groupsList[0]?.key;
  const isOpen = (k) => (openKinds ? Boolean(openKinds[k]) : k === defaultKey);
  const toggleGroup = (k) =>
    setOpenKinds((cur) => {
      const base = cur || { [defaultKey]: true };
      return { ...base, [k]: !base[k] };
    });
  const allOpen = groupsList.length > 0 && groupsList.every((g) => isOpen(g.key));
  const setAll = (v) => setOpenKinds(Object.fromEntries(groupsList.map((g) => [g.key, v])));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-[#6A6F85]">{items.length} item{items.length === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-1">
          {groupsList.length > 1 && (
            <button type="button" onClick={() => setAll(!allOpen)} className="h-9 px-2 text-[13px] font-medium text-indigo-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-full">
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
          {!readOnly && <Button size="sm" className="shrink-0" onClick={() => open(null)}><Plus className="w-4 h-4" />Add<span className="hidden sm:inline"> item</span></Button>}
        </div>
      </div>

      <Alert type="error">{error}</Alert>

      {groupsList.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Nothing here yet" text="Declare quizzes, exams, holidays, mass bunks and single-class cancellations for your section." />
      ) : (
        <div className="space-y-3">
          {groupsList.map(({ key, k, rows }) => {
            const live = rows.filter((r) => !isWithdrawn(r));
            const shorts = [...new Set(live.map(shortOfItem).filter(Boolean))];
            const chips = shorts.length ? shorts : live.slice(0, 6).map((r) => (r.title.length > 18 ? `${r.title.slice(0, 17)}…` : r.title));
            const nd = nextDate({ rows });
            return (
              <Group
                key={key}
                id={`kind-${key}`}
                title={k.label}
                tone={k.tone}
                count={rows.length}
                next={nd ? fmtDate(nd) : ""}
                chips={chips}
                open={isOpen(key)}
                onToggle={() => toggleGroup(key)}
              >
                {rows.map((it) => {
                  const w = isWithdrawn(it);
                  const past = isPast(it);
                  const multiDay = toDateInput(it.startDate) !== toDateInput(it.endDate);
                  const short = shortOfItem(it);
                  const meta = [
                    multiDay && `until ${fmtDate(it.endDate)}`,
                    it.startTime && `${it.startTime}–${it.endTime}`,
                    nameOf(it),
                    it.classType,
                    it.group,
                  ].filter(Boolean);
                  return (
                    <div key={idOf(it)} className={cx("flex items-center gap-3 rounded-2xl bg-white/65 border border-white/80 px-3 sm:px-4 py-2.5", (w || past) && "opacity-60")}>
                      <DateTile ymd={toDateInput(it.startDate)} past={past || w} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-[14.5px] font-semibold text-[#161827] break-words">{it.title}</p>
                          {short && <Badge tone="brand">{short}</Badge>}
                          {it.slotKey && <Badge>{it.slotKey}</Badge>}
                          {past && !w && <Badge>Past</Badge>}
                          {w && <Badge tone="amber">Withdrawn</Badge>}
                        </div>
                        {meta.length > 0 && <p className="text-[12.5px] text-[#6A6F85] mt-0.5 break-words">{meta.join(" · ")}</p>}
                      </div>
                      {!readOnly && <RowActions withdrawn={w} onEdit={() => open(it)} onToggle={() => toggle(it)} />}
                    </div>
                  );
                })}
              </Group>
            );
          })}
        </div>
      )}

      <FormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={creating ? "Add item" : "Edit item"}
        onSubmit={save}
        submitLabel={creating ? "Save and sync" : "Save changes"}
        saving={saving}
        dirty={dirty}
        error={formError}
        extra={
          <Button type="button" variant="glass" loading={previewing} disabled={saving} onClick={runPreview}>
            <Eye className="w-4 h-4" />Preview impact
          </Button>
        }
      >
        <Field as="select" label="Kind" value={form.kind} onChange={setKind} disabled={!creating} hint={cfg.help}>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Field>
        <Field label="Title" value={form.title} onChange={set("title")} error={errors.title} placeholder="OS lecture cancelled" maxLength={100} autoCapitalize="sentences" enterKeyHint="next" />

        {cfg.slots && (
          <Field as="select" label="Which one" value={form.slotKey} onChange={set("slotKey")} error={errors.slotKey}>
            <option value="">Choose…</option>
            {cfg.slots.map((s) => <option key={s} value={s}>{s}</option>)}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Field label={singleDate ? "Date" : "Start date"} type="date" value={form.startDate} onChange={setStartDate} error={errors.startDate} />
          {!singleDate && <Field label="End date" type="date" min={form.startDate || undefined} value={form.endDate} onChange={set("endDate")} error={errors.endDate} />}
        </div>

        {cfg.subject && (
          <Field as="select" label={cfg.subject === true ? "Subject" : "Subject (optional)"} value={form.subjectKey} onChange={set("subjectKey")} error={errors.subjectKey} hint={cfg.subject === "optional" ? "Leave on “All subjects” to cover everything." : undefined}>
            <option value="">{cfg.subject === true ? "Choose a subject…" : "All subjects"}</option>
            {subjects.map((s) => <option key={idOf(s)} value={keyOf(s)}>{s.name}</option>)}
          </Field>
        )}

        {cfg.times && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Field label={cfg.times === true ? "Start time" : "Start (optional)"} type="time" value={form.startTime} onChange={set("startTime")} error={errors.startTime} />
            <Field label={cfg.times === true ? "End time" : "End (optional)"} type="time" value={form.endTime} onChange={set("endTime")} error={errors.endTime} />
          </div>
        )}

        {(cfg.classType || cfg.group) && (
          <div className="grid sm:grid-cols-2 gap-4">
            {cfg.classType && (
              <Field as="select" label="Class type" value={form.classType} onChange={set("classType")}>
                <option value="">Any</option>
                {CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Field>
            )}
            {cfg.group && (
              <Field as="select" label="Group (optional)" value={form.group} onChange={set("group")}>
                <option value="">Whole section</option>
                {(schedule?.groups || []).map((g) => <option key={g.key} value={g.key}>{g.label || g.key}</option>)}
              </Field>
            )}
          </div>
        )}

        <Field label="Note (optional)" value={form.note} onChange={set("note")} placeholder="Professor is out of station" maxLength={200} />

        {preview && (
          <div ref={previewRef}>
            <FormLabel>Impact on joined students</FormLabel>
            <Summary data={preview} />
          </div>
        )}
      </FormModal>
      {noteDialog}
    </div>
  );
};

export default ItemsPanel;
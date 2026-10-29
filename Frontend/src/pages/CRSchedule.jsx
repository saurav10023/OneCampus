import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Archive, ArrowLeft, BookOpen, CalendarClock, CalendarRange, Check, History, ImagePlus, Layers, Pencil, Rocket, Undo2 } from "lucide-react";
import { officialSchedulesApi, scheduleRolesApi, errMsg, toDateInput } from "../api/endpoints";
import { fromApiGroups, cleanGroups } from "../lib/groups";
import { Alert, Badge, Button, Field, PageSpinner, cx, fmtDate } from "../components/Ui";
import { FormModal, focusFirstInvalid } from "../components/FormKit";
import ActionDialog from "../components/ActionDialog";
import GroupsEditor from "../components/GroupsEditor";
import SemesterMeter from "../components/SemesterMeter";
import ImportFromImages from "../components/ImportFromImages";
import SubjectsPanel from "./cr/SubjectsPanel";
import OfficialRules from "./cr/OfficialRules";
import ItemsPanel from "./cr/ItemsPanel";
import HistoryPanel from "./cr/HistoryPanel";

// `short` is the label on phones, `label` from sm up.
const TABS = [
  { key: "subjects", label: "Subjects", short: "Subjects", icon: BookOpen },
  { key: "rules", label: "Weekly and makeup classes", short: "Weekly", icon: CalendarClock },
  { key: "items", label: "Exams, holidays and cancellations", short: "Calendar", icon: CalendarRange },
  { key: "history", label: "History", short: "History", icon: History },
];
const tone = { published: "green", draft: "amber", archived: "neutral" };
const statusText = { published: "Live", draft: "Draft", archived: "Archived" };

const STAGES = [
  { key: "draft", label: "Draft" },
  { key: "published", label: "Live" },
  { key: "archived", label: "Archived" },
];

const LIFECYCLE = {
  publish: {
    title: "Publish this schedule?",
    text: "Students in this class will be able to find and join it. After that, every change you save syncs to them automatically.",
    confirmLabel: "Publish",
    tone: "primary",
  },
  unpublish: {
    title: "Move back to draft?",
    text: "Students won't see this schedule until you publish it again.",
    confirmLabel: "Move to draft",
    tone: "primary",
  },
  archive: {
    title: "Archive this schedule?",
    text: "Use this at the end of the semester. An archived schedule becomes read-only.",
    confirmLabel: "Archive",
    tone: "danger",
  },
};

// Draft -> Live -> Archived, with the current stage highlighted.
const Stages = ({ status }) => {
  const current = Math.max(0, STAGES.findIndex((s) => s.key === status));
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Schedule stage">
      {STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex items-center gap-2 sm:gap-3" aria-current={active ? "step" : undefined}>
            <span className="flex items-center gap-1.5">
              <span
                className={cx(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold",
                  done && "bg-emerald-500 text-white",
                  active && "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-sm shadow-indigo-500/30",
                  !done && !active && "bg-[#161827]/10 text-[#6A6F85]"
                )}
              >
                {done ? <Check className="w-3 h-3" aria-hidden="true" /> : i + 1}
              </span>
              <span className={cx("text-[12.5px]", active ? "font-semibold text-[#161827]" : "text-[#6A6F85]")}>{s.label}</span>
            </span>
            {i < STAGES.length - 1 && <span className="w-5 sm:w-8 h-px bg-[#161827]/15" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
};

const Fact = ({ icon: Icon, label, children }) => (
  <div className="rounded-2xl bg-white/60 border border-white/80 shadow-[inset_0_1px_0_#fff] px-3.5 py-3 min-w-0">
    <p className="flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.1em] text-[#6A6F85]">
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {label}
    </p>
    <div className="text-[14px] font-semibold text-[#161827] mt-1 break-words">{children}</div>
  </div>
);

// Normal in-flow tab bar (not sticky). Equal-width icon tabs on phones, pill row on larger screens.
// Arrow keys, Home and End move between tabs.
const SectionTabs = ({ value, onChange }) => {
  const refs = useRef({});
  const onKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.key === value);
    let n = null;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    if (n === null) return;
    e.preventDefault();
    onChange(TABS[n].key);
    refs.current[TABS[n].key]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Schedule sections"
      onKeyDown={onKeyDown}
      className="grid grid-cols-4 sm:flex gap-1 p-1 sm:p-1.5 mb-5 rounded-3xl sm:rounded-full bg-white/55 border border-white/80 shadow-[inset_0_1px_0_#fff] sm:w-fit max-w-full"
    >
      {TABS.map(({ key, label, short, icon: Icon }) => {
        const on = value === key;
        return (
          <button
            key={key}
            ref={(el) => (refs.current[key] = el)}
            id={`tab-${key}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="schedule-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(key)}
            className={cx(
              "flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 h-14 sm:h-10 px-1 sm:px-4 rounded-[20px] sm:rounded-full text-[11.5px] sm:text-[13.5px] font-medium transition whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
              on ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/25" : "text-[#161827]/70 hover:bg-white/70"
            )}
          >
            <Icon className="w-[18px] h-[18px] sm:w-4 sm:h-4" aria-hidden="true" />
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

const CRSchedule = () => {
  const { scheduleId } = useParams();
  const [schedule, setSchedule] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("subjects");
  const [version, setVersion] = useState(0); // bump to refresh History after changes

  /* ---- import from images ---- */
  const [importOpen, setImportOpen] = useState(false);
  const [importKey, setImportKey] = useState(0); // remounts the tab panels so imported rows show up

  /* ---- publish / back to draft / archive ---- */
  const [life, setLife] = useState(null);
  const [lifeBusy, setLifeBusy] = useState(false);
  const [lifeError, setLifeError] = useState("");

  /* ---- edit schedule ---- */
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({});
  const [groups, setGroups] = useState([]);
  const [initial, setInitial] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!scheduleId || scheduleId === "undefined") {
      setError("This schedule link isn't valid.");
      setLoading(false);
      return;
    }
    try {
      const [s, roles] = await Promise.all([officialSchedulesApi.get(scheduleId), scheduleRolesApi.mine().catch(() => [])]);
      // Expose both `_id` and `id` so child panels reading either one work.
      const sid = s?._id || s?.id || scheduleId;
      setSchedule({ ...s, _id: sid, id: sid });
      setIsAdmin(roles.some((r) => r.role === "admin" && (r.status === "approved" || r.status === "active")));
      setError("");
    } catch (e) {
      console.error("Schedule load failed:", e?.response?.status, e?.response?.data || e);
      setError(errMsg(e, "We couldn't load this schedule. Please refresh and try again."));
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = () => setVersion((v) => v + 1);

  const openLife = (kind) => {
    setLifeError("");
    setLife(kind);
  };

  const runLife = async (note) => {
    setLifeBusy(true);
    setLifeError("");
    try {
      await officialSchedulesApi[life](scheduleId, note);
      setLife(null);
      await load();
      changed();
    } catch (e) {
      setLifeError(errMsg(e, `We couldn't ${LIFECYCLE[life].confirmLabel.toLowerCase()} this schedule. Please try again.`));
    } finally {
      setLifeBusy(false);
    }
  };

  /* ---- edit handlers ----
     The backend only changes the semester dates and the groups of an existing schedule.
     College, academic year, semester, branch and section decide which CRs and students can see
     the schedule, so they are shown read-only and never sent. */
  const openEdit = () => {
    const f = {
      semesterStart: toDateInput(schedule.semesterStart),
      semesterEnd: toDateInput(schedule.semesterEnd),
    };
    const g = fromApiGroups(schedule.groups);
    setForm(f);
    setGroups(g);
    setInitial(JSON.stringify({ f, g }));
    setErrors({});
    setFormError("");
    setEditOpen(true);
  };

  const setF = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  // Moving the start date past the end date drags the end date along.
  const setStart = (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, semesterStart: v, semesterEnd: f.semesterEnd && f.semesterEnd < v ? v : f.semesterEnd }));
    setErrors((x) => ({ ...x, semesterStart: undefined, semesterEnd: undefined }));
  };

  const dirty = editOpen && JSON.stringify({ f: form, g: groups }) !== initial;

  const saveEdit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const errs = {};
    if (!form.semesterStart) errs.semesterStart = "Pick the start date.";
    if (!form.semesterEnd) errs.semesterEnd = "Pick the end date.";
    else if (form.semesterStart && form.semesterEnd < form.semesterStart) errs.semesterEnd = "Must be on or after the start date.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("Check the highlighted fields.");
      return focusFirstInvalid();
    }

    const { groups: cleaned, error: groupError } = cleanGroups(groups);
    if (groupError) return setFormError(groupError);

    const body = { semesterStart: form.semesterStart, semesterEnd: form.semesterEnd, groups: cleaned };

    setSaving(true);
    setFormError("");
    try {
      await officialSchedulesApi.update(scheduleId, body);
      setEditOpen(false);
      await load();
      changed();
    } catch (err) {
      setFormError(errMsg(err, "We couldn't save your changes. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSpinner />;

  if (!schedule) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14 space-y-4">
        <Alert type="error">{error || "We couldn't find this schedule."}</Alert>
        <Link to="/cr-studio" className="inline-flex items-center gap-1.5 text-indigo-600 text-[14px] font-medium hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to CR Studio
        </Link>
      </div>
    );
  }

  const archived = schedule.status === "archived";
  const published = schedule.status === "published";
  const lifeCfg = life ? LIFECYCLE[life] : {};
  const groupList = Array.isArray(schedule.groups) ? schedule.groups : [];

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
      <Link to="/cr-studio" className="inline-flex items-center gap-1.5 h-9 text-[13.5px] text-[#6A6F85] hover:text-[#161827] mb-3 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
        <ArrowLeft className="w-4 h-4" />
        CR Studio
      </Link>

      {/* header */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/55 backdrop-blur-xl shadow-[inset_0_1px_0_#fff,0_28px_56px_-32px_rgba(30,32,70,0.4)] p-4 sm:p-7 mb-5 sm:mb-6">
        <span aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full bg-[#5B52EE]/20 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-16 w-64 h-64 rounded-full bg-[#2B8DE0]/15 blur-3xl" />

        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="text-[24px] sm:text-[30px] font-semibold tracking-tight text-[#161827] leading-tight break-words">
                  {[schedule.branch, schedule.section && `Section ${schedule.section}`].filter(Boolean).join(" ") || "Schedule"}
                </h1>
                <Badge tone={tone[schedule.status] || "neutral"}>{statusText[schedule.status] || schedule.status}</Badge>
              </div>
              <p className="text-[14px] text-[#6A6F85] mt-1 break-words">{schedule.college}</p>
              {schedule.createdByName && (
                <p className="text-[12.5px] text-[#6A6F85] mt-0.5 break-words">
                  Created by {schedule.mine ? "you" : schedule.createdByName}
                </p>
              )}
            </div>

            {!archived && (
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
                {published ? (
                  <Button variant="glass" size="sm" className="col-span-2 sm:col-span-1 !h-10 sm:!h-9" onClick={() => openLife("unpublish")}>
                    <Undo2 className="w-4 h-4" />
                    Move to draft
                  </Button>
                ) : (
                  <Button size="sm" className="col-span-2 sm:col-span-1 sm:order-2 !h-10 sm:!h-9" onClick={() => openLife("publish")}>
                    <Rocket className="w-4 h-4" />
                    Publish
                  </Button>
                )}
                <Button variant="glass" size="sm" className="sm:order-1 !h-10 sm:!h-9" onClick={openEdit}>
                  <Pencil className="w-4 h-4" />
                  Edit details
                </Button>
                <Button variant="glass" size="sm" className="col-span-2 sm:col-span-1 sm:order-1 !h-10 sm:!h-9" onClick={() => setImportOpen(true)}>
                  <ImagePlus className="w-4 h-4" />
                  Import from images
                </Button>
                <Button variant="ghost" size="sm" className="sm:order-3 !h-10 sm:!h-9" onClick={() => openLife("archive")}>
                  <Archive className="w-4 h-4" />
                  Archive
                </Button>
              </div>
            )}
          </div>

          <div className="mt-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Stages status={schedule.status} />
          </div>

          <div className="grid sm:grid-cols-3 gap-2.5 sm:gap-3 mt-5">
            <Fact icon={BookOpen} label="Semester">
              {[schedule.semesterLabel, schedule.academicYear].filter(Boolean).join(" · ") || "-"}
            </Fact>
            <Fact icon={CalendarRange} label="Dates">
              {fmtDate(schedule.semesterStart)} to {fmtDate(schedule.semesterEnd)}
            </Fact>
            <Fact icon={Layers} label="Groups">
              {groupList.length === 0 ? (
                <span className="font-normal text-[#6A6F85]">Whole section</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {groupList.map((g, i) => <Badge key={g.key || i} tone="brand">{g.label || g.key}</Badge>)}
                </span>
              )}
            </Fact>
          </div>

          <SemesterMeter start={schedule.semesterStart} end={schedule.semesterEnd} className="mt-4" />

          {!published && !archived && <Alert type="info" className="mt-4">This is a draft, so students can't see it yet. Publish it when your subjects and classes are ready.</Alert>}
          {published && <Alert type="success" className="mt-4">This schedule is live. Every change you save below syncs to joined students automatically.</Alert>}
          {archived && <Alert type="warning" className="mt-4">This schedule is archived and read-only.</Alert>}
        </div>
      </section>

      <Alert type="error" className="mb-5">{error}</Alert>

      <SectionTabs value={tab} onChange={setTab} />

      <div role="tabpanel" id="schedule-panel" aria-labelledby={`tab-${tab}`}>
        {/* key={importKey} remounts the panel after an import so it reloads its data */}
        {tab === "subjects" && <SubjectsPanel key={importKey} scheduleId={scheduleId} readOnly={archived} onChanged={changed} />}
        {tab === "rules" && <OfficialRules key={importKey} schedule={schedule} scheduleId={scheduleId} readOnly={archived} onChanged={changed} />}
        {tab === "items" && <ItemsPanel key={importKey} schedule={schedule} scheduleId={scheduleId} readOnly={archived} onChanged={changed} />}
        {tab === "history" && <HistoryPanel scheduleId={scheduleId} isAdmin={isAdmin} readOnly={archived} version={version} onChanged={changed} />}
      </div>

      {/* import from images */}
      <ImportFromImages
        open={importOpen}
        onClose={() => setImportOpen(false)}
        schedule={schedule}
        scheduleId={scheduleId}
        onDone={() => {
          setImportKey((k) => k + 1);
          changed();
        }}
      />

      {/* edit schedule */}
      <FormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit schedule details"
        size="xl"
        onSubmit={saveEdit}
        submitLabel="Save changes"
        saving={saving}
        dirty={dirty}
        error={formError}
      >
        <Alert type="info">
          The college, academic year, semester, branch and section decide which CRs and students can see this schedule, so they can't be changed here. You can change the semester dates and groups. If the class details are wrong, archive this schedule and create a new one.
        </Alert>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Fact icon={BookOpen} label="Academic year">{schedule.academicYear || "-"}</Fact>
          <Fact icon={BookOpen} label="Semester">{schedule.semesterLabel || "-"}</Fact>
          <Fact icon={Layers} label="Branch">{schedule.branch || "-"}</Fact>
          <Fact icon={Layers} label="Section">{schedule.section || "-"}</Fact>
          <Field label="Semester start" type="date" value={form.semesterStart || ""} onChange={setStart} error={errors.semesterStart} />
          <Field label="Semester end" type="date" min={form.semesterStart || undefined} value={form.semesterEnd || ""} onChange={setF("semesterEnd")} error={errors.semesterEnd} />
        </div>

        <GroupsEditor groups={groups} setGroups={setGroups} lockExisting />
      </FormModal>

      {/* publish / back to draft / archive */}
      <ActionDialog
        open={Boolean(life)}
        title={lifeCfg.title}
        noteLabel="Note for your history (optional)"
        notePlaceholder="For example: added the new lab timings"
        confirmLabel={lifeCfg.confirmLabel}
        tone={lifeCfg.tone}
        busy={lifeBusy}
        error={lifeError}
        onConfirm={runLife}
        onClose={() => setLife(null)}
      >
        {lifeCfg.text}
      </ActionDialog>
    </div>
  );
};

export default CRSchedule;
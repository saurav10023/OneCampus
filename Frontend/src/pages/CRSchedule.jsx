import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Archive, ArrowLeft, BookOpen, CalendarClock, CalendarRange, History, Pencil, Rocket, Trash2, Undo2 } from "lucide-react";
import { officialSchedulesApi, scheduleRolesApi, errMsg, toDateInput } from "../api/endpoints";
import { askNote } from "../lib/prompt";
import { GROUP_KINDS, emptyGroup, fromApiGroups, cleanGroups, updateRow, removeRow } from "../lib/groups";
import { Alert, Badge, Button, Card, Field, Modal, PageSpinner, cx, fmtDate } from "../components/Ui";
import SubjectsPanel from "./cr/SubjectsPanel";
import OfficialRules from "./cr/OfficialRules";
import ItemsPanel from "./cr/ItemsPanel";
import HistoryPanel from "./cr/HistoryPanel";

const TABS = [
  { key: "subjects", label: "Subjects", icon: BookOpen },
  { key: "rules", label: "Weekly & makeup", icon: CalendarClock },
  { key: "items", label: "Exams, holidays & cancels", icon: CalendarRange },
  { key: "history", label: "History", icon: History },
];
const tone = { published: "green", draft: "amber", archived: "neutral" };

const CRSchedule = () => {
  const { scheduleId } = useParams();
  const [schedule, setSchedule] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("subjects");
  const [version, setVersion] = useState(0); // bump to refresh History after changes

  /* ---- edit schedule ---- */
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({});
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!scheduleId || scheduleId === "undefined") {
      setError("Invalid schedule link.");
      setLoading(false);
      return;
    }
    try {
      const [s, roles] = await Promise.all([officialSchedulesApi.get(scheduleId), scheduleRolesApi.mine().catch(() => [])]);
      // Expose both `_id` and `id` so child panels reading either one work.
      const sid = s?._id || s?.id || scheduleId;
      setSchedule({ ...s, _id: sid, id: sid });
      setIsAdmin(roles.some((r) => r.role === "admin" && (r.status === "approved" || r.status === "active")));
    } catch (e) {
      setError(errMsg(e, "Could not load this schedule"));
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = () => setVersion((v) => v + 1);

  const lifecycle = async (kind) => {
    const labels = { publish: "Publish", unpublish: "Move back to draft", archive: "Archive" };
    const note = askNote(`${labels[kind]}: add a note for your history (optional)`);
    if (note === null) return;
    if (kind === "archive" && !window.confirm("Archive this schedule? Use this at the end of the semester.")) return;
    setBusy(kind);
    setError("");
    try {
      await officialSchedulesApi[kind](scheduleId, note);
      await load();
      changed();
    } catch (e) {
      setError(errMsg(e, `Could not ${kind}`));
    } finally {
      setBusy("");
    }
  };

  /* ---- edit handlers ---- */
  // Once a schedule has been published at any point, the backend locks its scope fields.
  const scopeLocked = Boolean(schedule?.publishedAt) || schedule?.status === "published";

  const openEdit = () => {
    setForm({
      academicYear: schedule.academicYear || "",
      semesterLabel: schedule.semesterLabel || "",
      branch: schedule.branch || "",
      section: schedule.section || "",
      semesterStart: toDateInput(schedule.semesterStart),
      semesterEnd: toDateInput(schedule.semesterEnd),
    });
    setGroups(fromApiGroups(schedule.groups));
    setFormError("");
    setEditOpen(true);
  };

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveEdit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (form.semesterEnd < form.semesterStart) return setFormError("End date must be on or after the start date.");

    const { groups: cleaned, error: groupError } = cleanGroups(groups);
    if (groupError) return setFormError(groupError);

    const body = { semesterStart: form.semesterStart, semesterEnd: form.semesterEnd, groups: cleaned };
    // Scope fields are only sent while the schedule has never been published.
    if (!scopeLocked) {
      body.academicYear = form.academicYear.trim();
      body.semesterLabel = form.semesterLabel.trim();
      body.branch = form.branch.trim();
      body.section = form.section.trim();
    }

    setSaving(true);
    try {
      await officialSchedulesApi.update(scheduleId, body);
      setEditOpen(false);
      await load();
      changed();
    } catch (err) {
      setFormError(errMsg(err, "Could not save the changes"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSpinner />;

  if (!schedule) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14 space-y-4">
        <Alert type="error">{error || "Schedule not found."}</Alert>
        <Link to="/cr-studio" className="text-indigo-600 text-[14px] font-medium hover:underline">← Back to CR Studio</Link>
      </div>
    );
  }

  const archived = schedule.status === "archived";
  const published = schedule.status === "published";

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <Link to="/cr-studio" className="inline-flex items-center gap-1.5 text-[13.5px] text-[#6A6F85] hover:text-[#161827] mb-4">
        <ArrowLeft className="w-4 h-4" />CR Studio
      </Link>

      <Card className="p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-semibold tracking-tight text-[#161827]">
                {[schedule.branch, schedule.section && `Section ${schedule.section}`].filter(Boolean).join(" ")}
              </h1>
              <Badge tone={tone[schedule.status] || "neutral"}>{schedule.status}</Badge>
            </div>
            <p className="text-[14px] text-[#6A6F85] mt-1">
              {[schedule.college, schedule.semesterLabel, schedule.academicYear].filter(Boolean).join(" · ")}
            </p>
            <p className="text-[13px] text-[#6A6F85] mt-0.5">{fmtDate(schedule.semesterStart)} → {fmtDate(schedule.semesterEnd)}</p>
          </div>

          {!archived && (
            <div className="flex flex-wrap gap-2">
              <Button variant="glass" size="sm" onClick={openEdit}><Pencil className="w-4 h-4" />Edit details</Button>
              {published ? (
                <Button variant="glass" size="sm" loading={busy === "unpublish"} onClick={() => lifecycle("unpublish")}><Undo2 className="w-4 h-4" />Back to draft</Button>
              ) : (
                <Button size="sm" loading={busy === "publish"} onClick={() => lifecycle("publish")}><Rocket className="w-4 h-4" />Publish</Button>
              )}
              <Button variant="ghost" size="sm" loading={busy === "archive"} onClick={() => lifecycle("archive")}><Archive className="w-4 h-4" />Archive</Button>
            </div>
          )}
        </div>

        {Array.isArray(schedule.groups) && schedule.groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {schedule.groups.map((g, i) => <Badge key={g.key || i} tone="brand">{g.label || g.key}</Badge>)}
          </div>
        )}

        {!published && !archived && <Alert type="info" className="mt-4">This is a draft. Students cannot see it until you publish.</Alert>}
        {published && <Alert type="success" className="mt-4">Live. Every change you save below syncs to joined students automatically.</Alert>}
        {archived && <Alert type="warning" className="mt-4">Archived and read-only.</Alert>}
      </Card>

      <Alert type="error" className="mb-5">{error}</Alert>

      <div className="flex gap-1.5 p-1.5 rounded-full bg-white/45 border border-white/70 w-fit mb-6 max-w-full overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx(
              "flex items-center gap-2 h-9 px-4 rounded-full text-[13.5px] font-medium transition whitespace-nowrap",
              tab === key ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/25" : "text-[#161827]/70 hover:bg-white/70"
            )}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === "subjects" && <SubjectsPanel scheduleId={scheduleId} readOnly={archived} onChanged={changed} />}
      {tab === "rules" && <OfficialRules schedule={schedule} scheduleId={scheduleId} readOnly={archived} onChanged={changed} />}
      {tab === "items" && <ItemsPanel schedule={schedule} scheduleId={scheduleId} readOnly={archived} onChanged={changed} />}
      {tab === "history" && <HistoryPanel scheduleId={scheduleId} isAdmin={isAdmin} readOnly={archived} version={version} onChanged={changed} />}

      {/* edit schedule */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit schedule details">
        <form onSubmit={saveEdit} className="space-y-4">
          <Alert type="error">{formError}</Alert>
          {scopeLocked && (
            <Alert type="info">
              This schedule has been published, so college, academic year, semester, branch and section are locked. You can still change the semester dates and groups.
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Academic year" value={form.academicYear || ""} onChange={setF("academicYear")} placeholder="2026-27" disabled={scopeLocked} required />
            <Field label="Semester" value={form.semesterLabel || ""} onChange={setF("semesterLabel")} placeholder="Sem 5" disabled={scopeLocked} required />
            <Field label="Branch" value={form.branch || ""} onChange={setF("branch")} disabled={scopeLocked} required />
            <Field label="Section" value={form.section || ""} onChange={setF("section")} disabled={scopeLocked} required />
            <Field label="Semester start" type="date" value={form.semesterStart || ""} onChange={setF("semesterStart")} required />
            <Field label="Semester end" type="date" value={form.semesterEnd || ""} onChange={setF("semesterEnd")} required />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85]">Lab batches / groups</span>
              <button type="button" onClick={() => setGroups((g) => [...g, emptyGroup()])} className="text-[13px] text-indigo-600 font-medium hover:underline">
                + Add group
              </button>
            </div>
            <div className="space-y-2">
              {groups.map((g, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                  {/* the key of an existing group is locked: classes may already point at it */}
                  <Field value={g.key} onChange={(e) => setGroups((a) => updateRow(a, i, "key", e.target.value))} placeholder="lab-b1 (optional)" disabled={g.existing} />
                  <Field value={g.label} onChange={(e) => setGroups((a) => updateRow(a, i, "label", e.target.value))} placeholder="Lab Batch B1" />
                  <Field as="select" value={g.kind} onChange={(e) => setGroups((a) => updateRow(a, i, "kind", e.target.value))}>
                    {GROUP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </Field>
                  <button
                    type="button"
                    onClick={() => setGroups((a) => removeRow(a, i))}
                    aria-label="Remove"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {groups.length === 0 && <p className="text-[13px] text-[#6A6F85] px-1">No groups. Everything applies to the whole section.</p>}
            </div>
            <p className="text-[12px] text-[#6A6F85] mt-2 px-1">
              Leave the key empty to generate it from the label. Keys of existing groups can't be renamed, because weekly classes may refer to them. Removing a group that classes already use may be rejected by the server.
            </p>
          </div>

          <Button type="submit" loading={saving}>Save changes</Button>
        </form>
      </Modal>
    </div>
  );
};

export default CRSchedule;
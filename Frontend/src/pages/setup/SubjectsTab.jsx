import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, BookOpen, Check, ListPlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { subjectsApi, errMsg } from "../../api/endpoints";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, Warnings, cx } from "../../components/Ui";
import { FadeIn, Flash, SkeletonCards, Tabs, useFlash } from "../../components/Ux";
import BulkSubjects from "../../components/BulkSubjects";

const COLORS = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6", "#14B8A6"];

const VIEWS = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

const blank = { name: "", code: "", credits: "", targetPercentage: "", color: COLORS[0] };

const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

const IconBtn = ({ children, tone = "neutral", ...rest }) => (
  <button
    {...rest}
    className={cx(
      "w-9 h-9 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
      tone === "danger" ? "text-rose-600 hover:bg-rose-50" : "text-[#161827]/65 hover:bg-white/85 hover:text-[#161827]"
    )}
  >
    {children}
  </button>
);

const SubjectsTab = ({ setupId, readOnly }) => {
  const [subjects, setSubjects] = useState([]);
  const [view, setView] = useState("active");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [flashMsg, flash] = useFlash();

  const [editing, setEditing] = useState(null); // null | "new" | subject
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [bulkOpen, setBulkOpen] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [impact, setImpact] = useState(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = { limit: 100, sort: "name" };
      if (view === "active") params.isActive = true;
      if (view === "archived") params.isActive = false;
      const data = await subjectsApi.list(setupId, params);
      setSubjects(data.subjects || []);
    } catch (e) {
      setError(errMsg(e, "Could not load subjects"));
    } finally {
      setLoading(false);
    }
  }, [setupId, view]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) => `${s.name} ${s.code || ""}`.toLowerCase().includes(q));
  }, [subjects, query]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openForm = (s) => {
    setEditing(s || "new");
    setForm(
      s
        ? { name: s.name || "", code: s.code || "", credits: s.credits ?? "", targetPercentage: s.targetPercentage ?? "", color: s.color || COLORS[0] }
        : blank
    );
    setFormError("");
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    const isNew = editing === "new";
    const body = { name: form.name.trim(), code: form.code.trim(), color: form.color };

    // On edit an empty box means "clear it" (null), so the setup default applies again.
    // On create an empty box is simply left out.
    if (form.credits !== "") body.credits = Number(form.credits);
    else if (!isNew) body.credits = null;

    if (form.targetPercentage !== "") body.targetPercentage = Number(form.targetPercentage);
    else if (!isNew) body.targetPercentage = null;

    try {
      const data = isNew ? await subjectsApi.create(setupId, body) : await subjectsApi.update(setupId, editing._id, body);
      setResult(data);
      setEditing(null);
      flash(isNew ? `"${body.name}" added` : "Subject updated");
      await load();
    } catch (err) {
      setFormError(errMsg(err, "Could not save the subject"));
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (s) => {
    try {
      if (s.isActive === false) await subjectsApi.restore(setupId, s._id);
      else await subjectsApi.archive(setupId, s._id);
      flash(s.isActive === false ? `"${s.name}" restored` : `"${s.name}" archived. Its history is kept.`);
      await load();
    } catch (err) {
      setError(errMsg(err, "Could not update the subject"));
    }
  };

  const askDelete = async (s) => {
    setToDelete(s);
    setConfirmName("");
    setDeleteError("");
    setImpact(null);
    try {
      setImpact(await subjectsApi.deleteImpact(setupId, s._id));
    } catch {
      /* preview is optional */
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await subjectsApi.remove(setupId, toDelete._id, confirmName);
      flash(`"${toDelete.name}" deleted`);
      setToDelete(null);
      await load();
    } catch (err) {
      setDeleteError(errMsg(err, "Could not delete the subject"));
    } finally {
      setDeleting(false);
    }
  };

  const impactRows = impact ? Object.entries(impact).filter(([, v]) => typeof v === "number") : [];
  const canAdd = !readOnly && view !== "archived";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs size="sm" value={view} onChange={setView} items={VIEWS} />
        <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
          <div className="relative flex-1 sm:w-56 sm:flex-none">
            <Search className="w-4 h-4 text-[#6A6F85] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search subjects"
              aria-label="Search subjects"
              className="w-full h-10 pl-10 pr-3 rounded-full bg-white/60 border border-white/80 shadow-[inset_0_1px_0_#fff] text-[13.5px] text-[#161827] placeholder:text-[#6A6F85]/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
          {canAdd && (
            <>
              <Button size="sm" variant="glass" className="h-10" onClick={() => setBulkOpen(true)}>
                <ListPlus className="w-4 h-4" />Add many
              </Button>
              <Button size="sm" className="h-10" onClick={() => openForm(null)}>
                <Plus className="w-4 h-4" />Add subject
              </Button>
            </>
          )}
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      <Flash message={flashMsg} />
      <Warnings data={result} />

      {loading ? (
        <SkeletonCards count={4} height="h-[120px]" cols="sm:grid-cols-2" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={query ? Search : BookOpen}
          title={query ? "No subjects match your search" : view === "archived" ? "No archived subjects" : "No subjects yet"}
          text={
            query
              ? "Try a different name or code."
              : view === "archived"
              ? "Subjects you archive keep their history and appear here."
              : "Add the subjects you study this semester, then build your weekly classes on top."
          }
          action={
            canAdd &&
            !query && (
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={() => setBulkOpen(true)}><ListPlus className="w-4 h-4" />Add all at once</Button>
                <Button variant="glass" onClick={() => openForm(null)}><Plus className="w-4 h-4" />Add one subject</Button>
              </div>
            )
          }
        />
      ) : (
        <>
          <p className="text-[13px] text-[#6A6F85] px-1">{shown.length} subject{shown.length === 1 ? "" : "s"}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {shown.map((s, i) => {
              const c = s.color || "#6366F1";
              const archived = s.isActive === false;
              return (
                <FadeIn key={s._id} delay={Math.min(i, 8) * 40}>
                  <Card className={cx("overflow-hidden p-0 hover:shadow-[0_24px_48px_-28px_rgba(30,32,70,0.45)] transition-shadow", archived && "opacity-80")}>
                    <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${c}, ${c}88)` }} />
                    <div className="p-5 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <span
                          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-[15px] font-semibold shrink-0 shadow-md"
                          style={{ background: c }}
                          aria-hidden
                        >
                          {initials(s.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[15.5px] font-semibold text-[#161827] truncate">{s.name}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {s.code && <Badge tone="brand">{s.code}</Badge>}
                            {s.credits != null && <Badge>{s.credits} credits</Badge>}
                            {s.targetPercentage != null && <Badge>{s.targetPercentage}% target</Badge>}
                            {s.origin === "official" && <Badge tone="green">Official</Badge>}
                            {archived && <Badge tone="amber">Archived</Badge>}
                          </div>
                        </div>
                      </div>

                      {!readOnly && (
                        <div className="flex gap-0.5 shrink-0 -mr-1">
                          {!archived && (
                            <IconBtn onClick={() => openForm(s)} aria-label={`Edit ${s.name}`} title="Edit">
                              <Pencil className="w-4 h-4" />
                            </IconBtn>
                          )}
                          <IconBtn onClick={() => toggleArchive(s)} aria-label={archived ? `Restore ${s.name}` : `Archive ${s.name}`} title={archived ? "Restore" : "Archive (keeps history)"}>
                            {archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </IconBtn>
                          <IconBtn tone="danger" onClick={() => askDelete(s)} aria-label={`Delete ${s.name}`} title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </IconBtn>
                        </div>
                      )}
                    </div>
                  </Card>
                </FadeIn>
              );
            })}
          </div>
        </>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add subject" : "Edit subject"}>
        <form onSubmit={save} className="space-y-5">
          <Alert type="error">{formError}</Alert>

          {/* live preview */}
          <div className="flex items-center gap-3 rounded-2xl bg-white/60 border border-white/80 p-3">
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-[15px] font-semibold shadow-md transition-colors" style={{ background: form.color }}>
              {initials(form.name)}
            </span>
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold text-[#161827] truncate">{form.name.trim() || "Subject name"}</p>
              <p className="text-[12.5px] text-[#6A6F85]">{form.code.trim() || "Code"}</p>
            </div>
          </div>

          <Field label="Subject name" value={form.name} onChange={set("name")} placeholder="Operating Systems" required autoFocus />
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Code" value={form.code} onChange={set("code")} placeholder="CS301" />
            <Field label="Credits" type="number" min="0" max="30" value={form.credits} onChange={set("credits")} />
            <Field label="Target %" type="number" min="0" max="100" value={form.targetPercentage} onChange={set("targetPercentage")} placeholder="Setup default" hint={editing !== "new" ? "Empty = use the setup target." : undefined} />
          </div>

          <div>
            <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-2 px-1">Colour</span>
            <div className="flex flex-wrap gap-2.5">
              {COLORS.map((c) => {
                const on = form.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    aria-label={`Colour ${c}`}
                    aria-pressed={on}
                    className={cx("w-9 h-9 rounded-full flex items-center justify-center text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500", on ? "scale-110 shadow-lg ring-2 ring-white" : "hover:scale-105")}
                    style={{ background: c }}
                  >
                    {on && <Check className="w-4 h-4" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          <Button type="submit" loading={saving} className="w-full sm:w-auto">{editing === "new" ? "Add subject" : "Save changes"}</Button>
        </form>
      </Modal>

      <BulkSubjects
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        existing={subjects}
        withCredits
        createOne={({ name, code, credits }, i) =>
          subjectsApi.create(setupId, {
            name,
            ...(code ? { code } : {}),
            ...(credits !== "" ? { credits: Number(credits) } : {}),
            color: COLORS[(subjects.length + i) % COLORS.length],
          })
        }
        onDone={(n) => {
          flash(`${n} subject${n === 1 ? "" : "s"} added`);
          load();
        }}
      />

      <Modal open={Boolean(toDelete)} onClose={() => !deleting && setToDelete(null)} title="Delete subject?">
        <div className="space-y-4">
          <Alert type="warning">
            Deleting <span className="font-semibold">{toDelete?.name}</span> permanently removes its classes and attendance. If you only want it out of the way,
            archive it instead. History is kept.
          </Alert>
          {impactRows.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {impactRows.map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-white/60 border border-white/80 px-3 py-2">
                  <p className="text-[17px] font-semibold text-[#161827] leading-none">{v}</p>
                  <p className="text-[11px] text-[#6A6F85] mt-1">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</p>
                </div>
              ))}
            </div>
          )}
          <Alert type="error">{deleteError}</Alert>
          <Field label="Type the subject name to confirm" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={toDelete?.name} />
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" loading={deleting} disabled={confirmName !== toDelete?.name} onClick={doDelete}>Delete subject</Button>
            <Button variant="glass" disabled={deleting} onClick={() => setToDelete(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SubjectsTab;
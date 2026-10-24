import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Megaphone, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { officialSchedulesApi, scheduleRolesApi, errMsg } from "../api/endpoints";
import { askNote } from "../lib/prompt";
import { GROUP_KINDS, emptyGroup, cleanGroups, updateRow, removeRow } from "../lib/groups";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, PageSpinner, fmtDate } from "../components/Ui";

const roleTone = { approved: "green", active: "green", pending: "amber", rejected: "red", revoked: "red", withdrawn: "neutral" };
const schedTone = { published: "green", draft: "amber", archived: "neutral" };
const isApproved = (r) => r.status === "approved" || r.status === "active";

// Works whether the backend returns `_id` or `id`
const idOf = (x) => x?._id || x?.id;

const CRStudio = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const approvedRoles = roles.filter(isApproved);
  const canManage = approvedRoles.length > 0;
  const isAdmin = approvedRoles.some((r) => r.role === "admin");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await scheduleRolesApi.mine();
      setRoles(r);
      const ok = r.filter(isApproved);
      if (ok.length) {
        setSchedules(await officialSchedulesApi.list().catch(() => []));
        if (ok.some((x) => x.role === "admin")) setRequests(await scheduleRolesApi.requests({ status: "pending" }).catch(() => []));
      }
    } catch (e) {
      setError(errMsg(e, "Could not load your roles"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ---- request a role ---- */
  const [reqOpen, setReqOpen] = useState(false);
  const [req, setReq] = useState({ college: "", role: "cr", branch: "", section: "", requestNote: "" });
  const [reqBusy, setReqBusy] = useState(false);
  const [reqError, setReqError] = useState("");

  const openReq = () => {
    setReq({ college: user?.college || "", role: "cr", branch: user?.branch || "", section: user?.section || "", requestNote: "" });
    setReqError("");
    setReqOpen(true);
  };

  const submitReq = async (e) => {
    e.preventDefault();
    setReqBusy(true);
    setReqError("");
    const body = { college: req.college.trim(), role: req.role };
    if (req.role === "cr") {
      body.branch = req.branch.trim();
      body.section = req.section.trim();
    }
    if (req.requestNote.trim()) body.requestNote = req.requestNote.trim();
    try {
      await scheduleRolesApi.request(body);
      setReqOpen(false);
      await load();
    } catch (err) {
      setReqError(errMsg(err, "Could not send the request"));
    } finally {
      setReqBusy(false);
    }
  };

  const roleAction = async (fn, role, ask) => {
    const note = ask ? askNote(ask) : "";
    if (note === null) return;
    try {
      await fn(idOf(role), note);
      await load();
    } catch (e) {
      setError(errMsg(e, "That did not work"));
    }
  };

  /* ---- create schedule ---- */
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({});
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const openNew = () => {
    const base = approvedRoles.find((r) => r.role === "cr") || approvedRoles[0] || {};
    setForm({
      college: base.college || user?.college || "",
      academicYear: "",
      semesterLabel: "",
      branch: base.branch || user?.branch || "",
      section: base.section || user?.section || "",
      semesterStart: "",
      semesterEnd: "",
    });
    setGroups([]);
    setFormError("");
    setNewOpen(true);
  };

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const createSchedule = async (e) => {
    e.preventDefault();
    setFormError("");
    if (form.semesterEnd < form.semesterStart) return setFormError("End date must be on or after the start date.");

    const { groups: cleaned, error: groupError } = cleanGroups(groups);
    if (groupError) return setFormError(groupError);

    setSaving(true);
    try {
      await officialSchedulesApi.create({
        ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])),
        groups: cleaned,
      });
      setNewOpen(false);
      await load();
    } catch (err) {
      setFormError(errMsg(err, "Could not create the schedule"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader
        title="CR Studio"
        subtitle="Class representatives and college admins publish the official timetable. Changes reach every joined student automatically."
        action={canManage && <Button onClick={openNew}><Plus className="w-4 h-4" />New schedule</Button>}
      />

      <Alert type="error" className="mb-5">{error}</Alert>

      {/* roles */}
      <Card className="p-6 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-[17px] font-semibold text-[#161827] flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-600" />Your roles</h2>
          <Button size="sm" variant="glass" onClick={openReq}>Request a role</Button>
        </div>

        {roles.length === 0 ? (
          <p className="text-[14px] text-[#6A6F85]">You are a regular student. Elected as your class CR? Request the role and a college admin will review it.</p>
        ) : (
          <div className="space-y-2.5">
            {roles.map((r) => (
              <div key={idOf(r)} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 border border-white/80 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-semibold text-[#161827] uppercase">{r.role}</span>
                    <Badge tone={roleTone[r.status] || "neutral"}>{r.status}</Badge>
                  </div>
                  <p className="text-[12.5px] text-[#6A6F85] mt-0.5">{[r.college, r.branch, r.section && `Section ${r.section}`].filter(Boolean).join(" · ")}</p>
                </div>
                {(r.status === "pending" || isApproved(r)) && (
                  <Button size="sm" variant="ghost" onClick={() => roleAction(async (id) => scheduleRolesApi.withdraw(id), r, null)}>
                    {r.status === "pending" ? "Cancel request" : "Step down"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* admin: pending requests */}
      {isAdmin && (
        <Card className="p-6 mb-8">
          <h2 className="text-[17px] font-semibold text-[#161827] mb-4">Role requests</h2>
          {requests.length === 0 ? (
            <p className="text-[14px] text-[#6A6F85]">No pending requests.</p>
          ) : (
            <div className="space-y-2.5">
              {requests.map((r) => (
                <div key={idOf(r)} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 border border-white/80 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-[#161827]">
                      <span className="uppercase">{r.role}</span> · {r.userId?.fullName || r.user?.fullName || r.username || "Student"}
                    </p>
                    <p className="text-[12.5px] text-[#6A6F85] mt-0.5">
                      {[r.college, r.branch, r.section && `Section ${r.section}`].filter(Boolean).join(" · ")}
                      {r.requestNote && ` — "${r.requestNote}"`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => roleAction(scheduleRolesApi.approve, r, "Note for the student (optional)")}>Approve</Button>
                    <Button size="sm" variant="glass" onClick={() => roleAction(scheduleRolesApi.reject, r, "Reason for rejecting (optional)")}>Reject</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* schedules */}
      {canManage ? (
        schedules.length === 0 ? (
          <EmptyState icon={Megaphone} title="No official schedules yet" text="Create a draft, add subjects and weekly classes, then publish it for your class." action={<Button onClick={openNew}><Plus className="w-4 h-4" />New schedule</Button>} />
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            {schedules.map((s) => {
              const sid = idOf(s);
              return (
                <Link key={sid} to={`/cr-studio/${sid}`}>
                  <Card className="p-6 hover:bg-white/75 transition h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-[17px] font-semibold text-[#161827]">{[s.branch, s.section && `Section ${s.section}`].filter(Boolean).join(" ") || "Schedule"}</h3>
                        <p className="text-[13.5px] text-[#6A6F85] mt-0.5">{[s.semesterLabel, s.academicYear].filter(Boolean).join(" · ")}</p>
                        <p className="text-[12.5px] text-[#6A6F85] mt-0.5">{s.college}</p>
                      </div>
                      <Badge tone={schedTone[s.status] || "neutral"}>{s.status}</Badge>
                    </div>
                    <p className="text-[13px] text-[#6A6F85] mt-3">{fmtDate(s.semesterStart)} → {fmtDate(s.semesterEnd)}</p>
                    <p className="text-[13px] text-indigo-600 font-medium mt-4 flex items-center gap-1">Open studio <ChevronRight className="w-4 h-4" /></p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )
      ) : (
        <Alert type="info">Once your role is approved, you can create and publish your class schedule here.</Alert>
      )}

      {/* request role */}
      <Modal open={reqOpen} onClose={() => setReqOpen(false)} title="Request a role">
        <form onSubmit={submitReq} className="space-y-4">
          <Alert type="error">{reqError}</Alert>
          <Field as="select" label="Role" value={req.role} onChange={(e) => setReq({ ...req, role: e.target.value })}>
            <option value="cr">Class Representative (one branch and section)</option>
            <option value="admin">College Admin (whole college)</option>
          </Field>
          <Field label="College" value={req.college} onChange={(e) => setReq({ ...req, college: e.target.value })} required />
          {req.role === "cr" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Branch" value={req.branch} onChange={(e) => setReq({ ...req, branch: e.target.value })} required />
              <Field label="Section" value={req.section} onChange={(e) => setReq({ ...req, section: e.target.value })} required />
            </div>
          )}
          <Field label="Note for the reviewer (optional)" value={req.requestNote} onChange={(e) => setReq({ ...req, requestNote: e.target.value })} placeholder="Elected CR for CSE-A" />
          <Button type="submit" loading={reqBusy}>Send request</Button>
        </form>
      </Modal>

      {/* new schedule */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New official schedule">
        <form onSubmit={createSchedule} className="space-y-4">
          <Alert type="error">{formError}</Alert>
          <Field label="College" value={form.college || ""} onChange={setF("college")} required />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Academic year" value={form.academicYear || ""} onChange={setF("academicYear")} placeholder="2026-27" required />
            <Field label="Semester" value={form.semesterLabel || ""} onChange={setF("semesterLabel")} placeholder="Sem 5" required />
            <Field label="Branch" value={form.branch || ""} onChange={setF("branch")} required />
            <Field label="Section" value={form.section || ""} onChange={setF("section")} required />
            <Field label="Semester start" type="date" value={form.semesterStart || ""} onChange={setF("semesterStart")} required />
            <Field label="Semester end" type="date" value={form.semesterEnd || ""} onChange={setF("semesterEnd")} required />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85]">Lab batches / groups</span>
              <button type="button" onClick={() => setGroups((g) => [...g, emptyGroup()])} className="text-[13px] text-indigo-600 font-medium hover:underline">+ Add group</button>
            </div>
            <div className="space-y-2">
              {groups.map((g, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                  <Field value={g.key} onChange={(e) => setGroups((a) => updateRow(a, i, "key", e.target.value))} placeholder="lab-b1 (optional)" />
                  <Field value={g.label} onChange={(e) => setGroups((a) => updateRow(a, i, "label", e.target.value))} placeholder="Lab Batch B1" />
                  <Field as="select" value={g.kind} onChange={(e) => setGroups((a) => updateRow(a, i, "kind", e.target.value))}>
                    {GROUP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </Field>
                  <button type="button" onClick={() => setGroups((a) => removeRow(a, i))} aria-label="Remove" className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {groups.length === 0 && <p className="text-[13px] text-[#6A6F85] px-1">No groups. Everything applies to the whole section.</p>}
            </div>
            <p className="text-[12px] text-[#6A6F85] mt-2 px-1">Leave the key empty to generate it from the label.</p>
          </div>

          <Button type="submit" loading={saving}>Create draft</Button>
        </form>
      </Modal>
    </div>
  );
};

export default CRStudio;
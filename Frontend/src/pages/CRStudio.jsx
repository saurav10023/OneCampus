import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  BookOpen,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  FileText,
  Inbox,
  Megaphone,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { officialSchedulesApi, scheduleRolesApi, errMsg } from "../api/endpoints";
import { cleanGroups } from "../lib/groups";
import { Alert, Badge, Button, Card, EmptyState, Field, PageSpinner, cx, fmtDate } from "../components/Ui";
import { FormModal, focusFirstInvalid } from "../components/FormKit";
import ActionDialog from "../components/ActionDialog";
import GroupsEditor from "../components/GroupsEditor";
import SemesterMeter from "../components/SemesterMeter";
import Choice from "../components/Choice";
import { BRANCHES, SECTIONS, SEMESTERS, academicYearOptions, pickOption, withCurrent } from "../lib/academic";

const roleTone = { approved: "green", active: "green", pending: "amber", rejected: "red", revoked: "red", withdrawn: "neutral" };
const statusLabel = { approved: "Approved", active: "Approved", pending: "Awaiting review", rejected: "Rejected", revoked: "Removed", withdrawn: "Withdrawn" };
const roleName = { cr: "Class Representative", admin: "College Admin" };
const schedTone = { published: "green", draft: "amber", archived: "neutral" };
const schedLabel = { published: "Live", draft: "Draft", archived: "Archived" };
const schedAccent = {
  published: "bg-gradient-to-r from-emerald-400 to-emerald-500",
  draft: "bg-gradient-to-r from-amber-300 to-amber-500",
  archived: "bg-[#161827]/20",
};
const isApproved = (r) => r.status === "approved" || r.status === "active";

const idOf = (x) => x?._id || x?.id; // works whether the backend returns `_id` or `id`
const scopeOf = (r) => [r.college, r.branch, r.section && `Section ${r.section}`].filter(Boolean).join(" · ");

// The requests endpoint may answer with a bare list or wrap it in an object.
const asList = (data) => (Array.isArray(data) ? data : data?.requests || data?.items || data?.roles || []);

const norm = (v) => String(v || "").trim().toLowerCase();
const semesterNumberOf = (s) => {
  if (Number.isFinite(s?.semesterNumber)) return s.semesterNumber;
  const m = String(s?.semesterLabel || "").match(/\d+/);
  return m ? Number(m[0]) : null;
};

const EXISTING_PREFIX = "existingScheduleId:";

const STEPS = [
  { icon: ShieldCheck, title: "Request your role", text: "Tell us your college, branch and section." },
  { icon: Users, title: "A college admin approves", text: "They check that you are your class's CR." },
  { icon: Rocket, title: "Publish your schedule", text: "Students join it and stay in sync with you." },
];

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "published", label: "Live" },
  { key: "draft", label: "Drafts" },
  { key: "archived", label: "Archived" },
];

const OWNER_FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "mine", label: "Created by me" },
  { key: "others", label: "Created by classmates" },
];

const SORTS = [
  { key: "updated", label: "Recently updated" },
  { key: "semester", label: "Semester, newest first" },
  { key: "students", label: "Most students" },
  { key: "name", label: "Branch and section" },
];

const selectCls =
  "h-10 rounded-full bg-white/70 border border-white/80 shadow-[inset_0_1px_0_#fff] px-3.5 text-[13.5px] text-[#161827] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

const StatTile = ({ icon: Icon, value, label, tint }) => (
  <div className="rounded-2xl bg-white/60 border border-white/80 shadow-[inset_0_1px_0_#fff] px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
    <span className={cx("w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0", tint)}>
      <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
    </span>
    <div className="min-w-0">
      <p className="text-[22px] font-semibold text-[#161827] leading-none">{value}</p>
      <p className="text-[12px] sm:text-[12.5px] text-[#6A6F85] mt-1 truncate">{label}</p>
    </div>
  </div>
);

const SectionTitle = ({ icon: Icon, title, text, action }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div className="min-w-0">
      <h2 className="text-[17px] font-semibold text-[#161827] flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 text-indigo-600 shrink-0" aria-hidden="true" />}
        {title}
      </h2>
      {text && <p className="text-[13px] text-[#6A6F85] mt-0.5">{text}</p>}
    </div>
    {action}
  </div>
);

// Small count shown on a schedule card: icon, number, label.
const Count = ({ icon: Icon, value, label }) => (
  <span className="flex items-center gap-1.5 text-[12.5px] text-[#444A63] min-w-0">
    <Icon className="w-3.5 h-3.5 text-[#6A6F85] shrink-0" aria-hidden="true" />
    <span className="font-semibold text-[#161827]">{value}</span>
    <span className="text-[#6A6F85] truncate">{label}</span>
  </span>
);

const FilterChip = ({ active, onClick, children, count }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cx(
      "h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
      active
        ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/25"
        : "text-[#161827]/70 bg-white/60 border border-white/80 hover:bg-white/80"
    )}
  >
    {children}
    {count !== undefined && <span className={cx("ml-1.5 text-[12px]", active ? "text-white/80" : "text-[#6A6F85]")}>{count}</span>}
  </button>
);

const blankReq = { college: "", role: "cr", branch: "", section: "", requestNote: "" };

// Removes repeated schedules (same id) while keeping the first one seen.
const dedupeById = (list) => {
  const seen = new Set();
  return list.filter((s) => {
    const id = String(idOf(s));
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const CRStudio = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [schedules, setSchedules] = useState([]); // live + draft + archived, every creator
  const [requests, setRequests] = useState([]);
  const [reqLoadError, setReqLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /* ---- list filters ---- */
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [semFilter, setSemFilter] = useState("all");
  const [sort, setSort] = useState("updated");

  const approvedRoles = roles.filter(isApproved);
  const canManage = approvedRoles.length > 0;
  // A college admin is either approved through a schedule role, or has the account-level admin role.
  const isAdmin = approvedRoles.some((r) => r.role === "admin") || user?.role === "admin";
  const hasPending = roles.some((r) => r.status === "pending");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await scheduleRolesApi.mine();
      setRoles(r);
      const ok = r.filter(isApproved);

      if (ok.length) {
        // The backend hides archived schedules unless asked, so fetch them separately.
        // The list holds every schedule of the CR's college, branch and section, whoever created it.
        // allSettled: one failing request must not hide the other, and must never look like "no schedules".
        const [activeRes, archivedRes] = await Promise.allSettled([
          officialSchedulesApi.list(),
          officialSchedulesApi.list({ status: "archived" }),
        ]);

        if (activeRes.status === "rejected") {
          console.error(
            "Schedule list failed:",
            activeRes.reason?.response?.status,
            activeRes.reason?.response?.data || activeRes.reason
          );
          setSchedules([]);
          setError(errMsg(activeRes.reason, "We couldn't load your schedules. Please refresh and try again."));
        } else {
          let archived = [];
          if (archivedRes.status === "fulfilled") {
            archived = archivedRes.value;
          } else {
            console.error(
              "Archived schedule list failed:",
              archivedRes.reason?.response?.status,
              archivedRes.reason?.response?.data || archivedRes.reason
            );
            setError("Archived schedules couldn't be loaded. Your live and draft schedules are shown.");
          }
          setSchedules(dedupeById([...activeRes.value, ...archived]));
        }
      } else {
        setSchedules([]);
      }

      // Admins load the waiting requests. This does not depend on the admin also being a CR,
      // and a failure is shown instead of looking like an empty list.
      const admin = ok.some((x) => x.role === "admin") || user?.role === "admin";
      if (admin) {
        try {
          setRequests(asList(await scheduleRolesApi.requests({ status: "pending" })));
          setReqLoadError("");
        } catch (e) {
          console.error("Role requests failed:", e?.response?.status, e?.response?.data || e);
          setRequests([]);
          setReqLoadError(errMsg(e, "Could not load role requests."));
        }
      } else {
        setRequests([]);
        setReqLoadError("");
      }
    } catch (e) {
      setError(errMsg(e, "We couldn't load your roles. Please refresh and try again."));
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  /* ---- request a role ---- */
  const [reqOpen, setReqOpen] = useState(false);
  const [req, setReq] = useState(blankReq);
  const [reqInitial, setReqInitial] = useState("");
  const [reqErrors, setReqErrors] = useState({});
  const [reqBusy, setReqBusy] = useState(false);
  const [reqError, setReqError] = useState("");

  const openReq = () => {
    const f = {
      college: user?.college || "",
      role: "cr",
      branch: pickOption(BRANCHES, user?.branch),
      section: pickOption(SECTIONS, user?.section),
      requestNote: "",
    };
    setReq(f);
    setReqInitial(JSON.stringify(f));
    setReqErrors({});
    setReqError("");
    setReqOpen(true);
  };

  const setR = (k) => (e) => {
    const v = e.target.value;
    setReq((r) => ({ ...r, [k]: v }));
    setReqErrors((x) => ({ ...x, [k]: undefined }));
  };

  const submitReq = async (e) => {
    e.preventDefault();
    if (reqBusy) return;
    const errs = {};
    if (!req.college.trim()) errs.college = "Enter your college name.";
    if (req.role === "cr") {
      if (!req.branch.trim()) errs.branch = "Choose your branch.";
      if (!req.section.trim()) errs.section = "Choose your section.";
    }
    setReqErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();

    setReqBusy(true);
    setReqError("");
    // Single spaces and trimmed, so "ABC  College " and "ABC College" are the same college.
    const body = { college: req.college.trim().replace(/\s+/g, " "), role: req.role };
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
      setReqError(errMsg(err, "We couldn't send your request. Please try again."));
    } finally {
      setReqBusy(false);
    }
  };

  /* ---- withdraw / approve / reject, all through one dialog ---- */
  const [dialog, setDialog] = useState(null); // { kind, role }
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const openDialog = (kind, role) => {
    setDialogError("");
    setDialog({ kind, role });
  };

  const runDialog = async (note) => {
    const { kind, role } = dialog;
    setDialogBusy(true);
    setDialogError("");
    try {
      if (kind === "withdraw") await scheduleRolesApi.withdraw(idOf(role));
      else if (kind === "approve") await scheduleRolesApi.approve(idOf(role), note);
      else await scheduleRolesApi.reject(idOf(role), note);
      setDialog(null);
      await load();
    } catch (e) {
      setDialogError(errMsg(e, "That didn't work. Please try again."));
    } finally {
      setDialogBusy(false);
    }
  };

  const who = (r) => r.userId?.fullName || r.user?.fullName || r.username || "this student";
  const dialogCfg = !dialog
    ? {}
    : {
        withdraw: {
          title: dialog.role.status === "pending" ? "Cancel this request?" : "Step down from this role?",
          text:
            dialog.role.status === "pending"
              ? "Your request will be withdrawn. You can send a new one any time."
              : "You will lose access to create and publish schedules for this role. You can request it again later.",
          confirmLabel: dialog.role.status === "pending" ? "Cancel request" : "Step down",
          cancelLabel: "Keep it",
          tone: "danger",
        },
        approve: {
          title: "Approve this request?",
          text: `${who(dialog.role)} will become ${roleName[dialog.role.role] || dialog.role.role} for ${scopeOf(dialog.role) || "their college"}.`,
          noteLabel: "Note for the student (optional)",
          confirmLabel: "Approve",
        },
        reject: {
          title: "Reject this request?",
          text: `${who(dialog.role)} will be told their request was rejected.`,
          noteLabel: "Reason (optional)",
          notePlaceholder: "For example: please ask your class teacher to confirm",
          confirmLabel: "Reject",
          tone: "danger",
        },
      }[dialog.kind];

  /* ---- create schedule ---- */
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({});
  const [groups, setGroups] = useState([]);
  const [newInitial, setNewInitial] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [existingId, setExistingId] = useState(""); // set when the server says the class already has a schedule

  const openNew = () => {
    const base = approvedRoles.find((r) => r.role === "cr") || approvedRoles[0] || {};
    const f = {
      college: base.college || user?.college || "",
      academicYear: "",
      semesterLabel: "",
      branch: pickOption(BRANCHES, base.branch || user?.branch),
      section: pickOption(SECTIONS, base.section || user?.section),
      semesterStart: "",
      semesterEnd: "",
    };
    setForm(f);
    setGroups([]);
    setNewInitial(JSON.stringify({ f, g: [] }));
    setErrors({});
    setFormError("");
    setExistingId("");
    setNewOpen(true);
  };

  const setF = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => ({ ...x, [k]: undefined }));
    setExistingId("");
  };

  // Moving the start date past the end date drags the end date along.
  const setStart = (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, semesterStart: v, semesterEnd: f.semesterEnd && f.semesterEnd < v ? v : f.semesterEnd }));
    setErrors((x) => ({ ...x, semesterStart: undefined, semesterEnd: undefined }));
  };

  const newDirty = newOpen && JSON.stringify({ f: form, g: groups }) !== newInitial;

  // A schedule for the same year, semester, branch and section that is not archived. Checked while
  // the CR fills the form, so they find a classmate's schedule before trying to create a second one.
  const duplicate = useMemo(() => {
    if (!newOpen || !form.academicYear || !form.semesterLabel || !form.branch || !form.section) return null;
    const sem = semesterNumberOf({ semesterLabel: form.semesterLabel });
    return (
      schedules.find(
        (s) =>
          s.status !== "archived" &&
          norm(s.academicYear) === norm(form.academicYear) &&
          semesterNumberOf(s) === sem &&
          norm(s.branch) === norm(form.branch) &&
          norm(s.section) === norm(form.section)
      ) || null
    );
  }, [newOpen, form.academicYear, form.semesterLabel, form.branch, form.section, schedules]);

  const createSchedule = async (e) => {
    e.preventDefault();
    if (saving) return;
    const errs = {};
    const labels = { college: "college", academicYear: "academic year", semesterLabel: "semester", branch: "branch", section: "section" };
    Object.entries(labels).forEach(([k, l]) => {
      if (!(form[k] || "").trim()) errs[k] = `${k === "college" ? "Enter" : "Choose"} the ${l}.`;
    });
    if (!form.semesterStart) errs.semesterStart = "Pick the start date.";
    if (!form.semesterEnd) errs.semesterEnd = "Pick the end date.";
    else if (form.semesterStart && form.semesterEnd < form.semesterStart) errs.semesterEnd = "Must be on or after the start date.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("Check the highlighted fields.");
      return focusFirstInvalid();
    }
    if (duplicate) {
      setFormError("This class already has a schedule for that semester. Open it instead of creating a second one.");
      return;
    }

    const { groups: cleaned, error: groupError } = cleanGroups(groups);
    if (groupError) return setFormError(groupError);

    setSaving(true);
    setFormError("");
    setExistingId("");
    try {
      await officialSchedulesApi.create({
        ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])),
        groups: cleaned,
      });
      setNewOpen(false);
      await load();
    } catch (err) {
      // 409: the server names the schedule that is already there, so offer a link to it
      const details = Array.isArray(err?.response?.data?.errors) ? err.response.data.errors : [];
      const found = details.find((d) => typeof d === "string" && d.startsWith(EXISTING_PREFIX));
      if (found) {
        setExistingId(found.slice(EXISTING_PREFIX.length));
        setFormError(err.response.data.message || "This class already has a schedule.");
      } else {
        setFormError(errMsg(err, "We couldn't create the schedule. Please check the details and try again."));
      }
    } finally {
      setSaving(false);
    }
  };

  /* ---- list: counts, semester options, filtered and sorted view ---- */
  const live = schedules.filter((s) => s.status === "published").length;
  const drafts = schedules.filter((s) => s.status === "draft").length;
  const archivedCount = schedules.filter((s) => s.status === "archived").length;
  const notArchived = schedules.length - archivedCount;

  const semesterOptions = useMemo(() => {
    const nums = new Set();
    schedules.forEach((s) => {
      const n = semesterNumberOf(s);
      if (n !== null) nums.add(n);
    });
    return [...nums].sort((a, b) => b - a);
  }, [schedules]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = schedules.filter((s) => {
      // Archived schedules only show under the Archived filter, like the backend default
      if (statusFilter === "archived" ? s.status !== "archived" : s.status === "archived") return false;
      if (statusFilter !== "all" && statusFilter !== "archived" && s.status !== statusFilter) return false;
      if (ownerFilter === "mine" && !s.mine) return false;
      if (ownerFilter === "others" && s.mine) return false;
      if (semFilter !== "all" && semesterNumberOf(s) !== Number(semFilter)) return false;
      if (needle) {
        const hay = [s.branch, s.section, s.semesterLabel, s.academicYear, s.college, s.createdByName].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const byUpdated = (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    const sorters = {
      updated: byUpdated,
      semester: (a, b) => (semesterNumberOf(b) ?? -1) - (semesterNumberOf(a) ?? -1) || byUpdated(a, b),
      students: (a, b) => (b.students || 0) - (a.students || 0) || byUpdated(a, b),
      name: (a, b) => `${a.branch} ${a.section}`.localeCompare(`${b.branch} ${b.section}`) || byUpdated(a, b),
    };
    return [...list].sort(sorters[sort] || byUpdated);
  }, [schedules, q, statusFilter, ownerFilter, semFilter, sort]);

  const filtersActive = q.trim() || statusFilter !== "all" || ownerFilter !== "all" || semFilter !== "all";
  const clearFilters = () => {
    setQ("");
    setStatusFilter("all");
    setOwnerFilter("all");
    setSemFilter("all");
  };

  const statusCount = (key) => {
    if (key === "all") return notArchived;
    if (key === "published") return live;
    if (key === "draft") return drafts;
    return archivedCount;
  };

  if (loading) return <PageSpinner />;

  const requestsCard = isAdmin && (
    <Card className="p-4 sm:p-6 mb-5 sm:mb-6">
      <SectionTitle
        icon={Inbox}
        title="Role requests"
        text="Students asking to publish schedules. Approve only people you know."
        action={<Button size="sm" variant="glass" onClick={load}>Refresh</Button>}
      />
      <Alert type="error" className="mb-3">{reqLoadError}</Alert>
      {requests.length === 0 ? (
        !reqLoadError && (
          <p className="rounded-2xl border border-dashed border-[#161827]/15 px-4 py-5 text-center text-[13.5px] text-[#6A6F85]">No requests are waiting for review.</p>
        )
      ) : (
        <div className="space-y-2.5">
          {requests.map((r) => (
            <div key={idOf(r)} className="rounded-2xl bg-white/60 border border-white/80 px-4 py-3.5">
              <p className="text-[14.5px] font-semibold text-[#161827] break-words">
                {who(r)} <span className="font-normal text-[#6A6F85]">wants to be</span> {roleName[r.role] || r.role}
              </p>
              <p className="text-[12.5px] text-[#6A6F85] mt-0.5 break-words">{scopeOf(r)}</p>
              {r.requestNote && <p className="text-[13px] text-[#444A63] mt-2 rounded-xl bg-white/70 px-3 py-2 break-words">“{r.requestNote}”</p>}
              <div className="grid grid-cols-2 sm:flex gap-2 mt-3">
                <Button size="sm" onClick={() => openDialog("approve", r)}>Approve</Button>
                <Button size="sm" variant="glass" onClick={() => openDialog("reject", r)}>Reject</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
      {/* hero */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/55 backdrop-blur-xl shadow-[inset_0_1px_0_#fff,0_28px_56px_-32px_rgba(30,32,70,0.4)] p-5 sm:p-8 mb-5 sm:mb-6">
        <span aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-[#5B52EE]/25 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-16 w-72 h-72 rounded-full bg-[#2B8DE0]/20 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 h-8 pl-2 pr-3.5 rounded-full bg-white/60 border border-white/80 shadow-[inset_0_1px_0_#fff] text-[12.5px] font-medium text-[#161827]/80">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-white bg-gradient-to-br from-[#4F46E5] to-[#0EA5E9]">
                <Megaphone className="w-3 h-3" aria-hidden="true" />
              </span>
              For class representatives and college admins
            </span>
            <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-tight text-[#161827] leading-[1.08] mt-4">CR Studio</h1>
            <p className="text-[14.5px] sm:text-[15.5px] leading-relaxed text-[#444A63] mt-2">
              Publish your class's official timetable once. Every change you make reaches the students who joined, automatically.
            </p>
          </div>
          {canManage && (
            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <Button variant="glass" onClick={refresh} disabled={refreshing} className="!h-12 px-4" aria-label="Refresh schedules">
                <RefreshCw className={cx("w-4 h-4", refreshing && "animate-spin motion-reduce:animate-none")} />
              </Button>
              <Button onClick={openNew} className="flex-1 sm:flex-none !h-12 px-6">
                <Plus className="w-4 h-4" />
                New schedule
              </Button>
            </div>
          )}
        </div>

        {canManage && (
          <div className="relative grid grid-cols-3 gap-2 sm:gap-4 mt-6">
            <StatTile icon={Rocket} value={live} label="Live" tint="bg-emerald-500/12 text-emerald-600" />
            <StatTile icon={FileText} value={drafts} label="Drafts" tint="bg-amber-500/15 text-amber-600" />
            {isAdmin ? (
              <StatTile icon={Inbox} value={requests.length} label="Requests" tint="bg-indigo-500/12 text-indigo-600" />
            ) : (
              <StatTile icon={Archive} value={archivedCount} label="Archived" tint="bg-[#161827]/8 text-[#6A6F85]" />
            )}
          </div>
        )}
      </section>

      <Alert type="error" className="mb-5">{error}</Alert>

      {/* admins see waiting requests (or a load error) first: it is the thing that needs action */}
      {(requests.length > 0 || reqLoadError) && requestsCard}

      {/* schedules */}
      {canManage &&
        (schedules.length === 0 ? (
          // When loading failed, the error alert above explains it. Never claim "no schedules" then.
          error ? (
            <div className="mb-5 sm:mb-6">
              <Button variant="glass" onClick={refresh} disabled={refreshing}>
                <RefreshCw className={cx("w-4 h-4", refreshing && "animate-spin motion-reduce:animate-none")} />
                Try again
              </Button>
            </div>
          ) : (
            <div className="mb-5 sm:mb-6">
              <EmptyState
                icon={Megaphone}
                title="No official schedules yet"
                text="Create a draft, add your subjects and weekly classes, then publish it so your class can join."
                action={<Button onClick={openNew}><Plus className="w-4 h-4" />New schedule</Button>}
              />
            </div>
          )
        ) : (
          <section className="mb-5 sm:mb-6">
            <SectionTitle
              title="Your schedules"
              text="Every schedule of your class appears here, including the ones your classmate CRs created. You can open and edit all of them."
            />

            {/* search and filters */}
            <Card className="p-3 sm:p-4 mb-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <label className="relative flex-1 min-w-0">
                  <span className="sr-only">Search schedules</span>
                  <Search className="w-4 h-4 text-[#6A6F85] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by branch, section, semester or creator"
                    className="w-full h-10 rounded-full bg-white/70 border border-white/80 shadow-[inset_0_1px_0_#fff] pl-10 pr-4 text-[13.5px] text-[#161827] placeholder:text-[#6A6F85] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  />
                </label>
                <select value={semFilter} onChange={(e) => setSemFilter(e.target.value)} className={selectCls} aria-label="Filter by semester">
                  <option value="all">All semesters</option>
                  {semesterOptions.map((n) => (
                    <option key={n} value={n}>Semester {n}</option>
                  ))}
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectCls} aria-label="Sort schedules">
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-0.5" role="group" aria-label="Filter by status">
                {STATUS_FILTERS.map((f) => (
                  <FilterChip key={f.key} active={statusFilter === f.key} onClick={() => setStatusFilter(f.key)} count={statusCount(f.key)}>
                    {f.label}
                  </FilterChip>
                ))}
              </div>
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-0.5" role="group" aria-label="Filter by creator">
                {OWNER_FILTERS.map((f) => (
                  <FilterChip key={f.key} active={ownerFilter === f.key} onClick={() => setOwnerFilter(f.key)}>
                    {f.label}
                  </FilterChip>
                ))}
              </div>
            </Card>

            <p className="text-[12.5px] text-[#6A6F85] mb-3 px-1" aria-live="polite">
              Showing {view.length} of {statusFilter === "archived" ? archivedCount : notArchived}
              {filtersActive && (
                <button type="button" onClick={clearFilters} className="ml-2 inline-flex items-center gap-1 text-indigo-600 font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded">
                  <X className="w-3 h-3" aria-hidden="true" />
                  Clear filters
                </button>
              )}
            </p>

            {view.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[#161827]/15 px-4 py-8 text-center text-[13.5px] text-[#6A6F85]">
                No schedules match these filters.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
                {view.map((s) => {
                  const sid = idOf(s);
                  const counts = s.counts || {};
                  return (
                    <Link key={sid} to={`/cr-studio/${sid}`} className="group block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                      <Card className="relative overflow-hidden p-5 sm:p-6 h-full flex flex-col transition group-hover:bg-white/80 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                        <span aria-hidden="true" className={cx("absolute inset-x-0 top-0 h-1", schedAccent[s.status] || schedAccent.archived)} />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-[18px] font-semibold text-[#161827] break-words leading-snug">
                              {[s.branch, s.section && `Section ${s.section}`].filter(Boolean).join(" ") || "Schedule"}
                            </h3>
                            <p className="text-[13.5px] text-[#444A63] mt-0.5">{[s.semesterLabel, s.academicYear].filter(Boolean).join(" · ")}</p>
                            <p className="text-[12.5px] text-[#6A6F85] mt-0.5 break-words">{s.college}</p>
                          </div>
                          <Badge tone={schedTone[s.status] || "neutral"}>{schedLabel[s.status] || s.status}</Badge>
                        </div>

                        <p className="flex items-center gap-1.5 text-[12.5px] mt-3 min-w-0">
                          <User className="w-3.5 h-3.5 text-[#6A6F85] shrink-0" aria-hidden="true" />
                          {s.mine ? (
                            <span className="font-medium text-indigo-600">Created by you</span>
                          ) : (
                            <span className="text-[#6A6F85] truncate">Created by {s.createdByName || "a classmate CR"}</span>
                          )}
                        </p>

                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3">
                          <Count icon={BookOpen} value={counts.subjects ?? 0} label="subjects" />
                          <Count icon={CalendarClock} value={counts.rules ?? 0} label="weekly classes" />
                          <Count icon={CalendarRange} value={counts.items ?? 0} label="calendar items" />
                          <Count icon={Users} value={s.students ?? 0} label="students joined" />
                        </div>

                        <p className="flex items-center gap-1.5 text-[13px] text-[#6A6F85] mt-4">
                          <CalendarRange className="w-4 h-4 shrink-0" aria-hidden="true" />
                          {fmtDate(s.semesterStart)} to {fmtDate(s.semesterEnd)}
                        </p>
                        <SemesterMeter start={s.semesterStart} end={s.semesterEnd} className="mt-3" />

                        <p className="text-[13px] text-indigo-600 font-medium mt-auto pt-4 flex items-center gap-1">
                          Open schedule
                          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                        </p>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        ))}

      {/* how it works, shown until a role is approved */}
      {!canManage && (
        <Card className="p-5 sm:p-6 mb-5 sm:mb-6">
          <SectionTitle
            title="How it works"
            text="Three steps to publish a schedule for your class."
            action={!hasPending && <Button size="sm" onClick={openReq}><Sparkles className="w-4 h-4" />Request a role</Button>}
          />
          <ol className="grid sm:grid-cols-3 gap-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="rounded-2xl bg-white/60 border border-white/80 p-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] text-white text-[13px] font-semibold flex items-center justify-center">{i + 1}</span>
                  <Icon className="w-[18px] h-[18px] text-indigo-600" aria-hidden="true" />
                </div>
                <p className="text-[14.5px] font-semibold text-[#161827] mt-3">{title}</p>
                <p className="text-[13px] leading-snug text-[#6A6F85] mt-1">{text}</p>
              </li>
            ))}
          </ol>
          {hasPending && <Alert type="info" className="mt-4">Your request is with a college admin. You can create schedules as soon as it is approved.</Alert>}
        </Card>
      )}

      {/* roles */}
      <Card className="p-4 sm:p-6 mb-5 sm:mb-6">
        <SectionTitle
          icon={ShieldCheck}
          title="Your roles"
          text="A role lets you publish a schedule for your class or college."
          action={canManage && <Button size="sm" variant="glass" onClick={openReq}>Request another role</Button>}
        />

        {roles.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-[#6A6F85]">You are a regular student right now. Use “Request a role” if you are your class's CR.</p>
        ) : (
          <div className="space-y-2.5">
            {roles.map((r) => {
              const RoleIcon = r.role === "admin" ? ShieldCheck : Users;
              return (
                <div key={idOf(r)} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-white/60 border border-white/80 px-3.5 sm:px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                      <RoleIcon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[14.5px] font-semibold text-[#161827]">{roleName[r.role] || r.role}</span>
                        <Badge tone={roleTone[r.status] || "neutral"}>{statusLabel[r.status] || r.status}</Badge>
                      </div>
                      <p className="text-[12.5px] text-[#6A6F85] mt-0.5 break-words">{scopeOf(r)}</p>
                    </div>
                  </div>
                  {(r.status === "pending" || isApproved(r)) && (
                    <Button size="sm" variant="ghost" className="self-start sm:self-auto shrink-0" onClick={() => openDialog("withdraw", r)}>
                      {r.status === "pending" ? "Cancel request" : "Step down"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {requests.length === 0 && !reqLoadError && requestsCard}

      {/* request role */}
      <FormModal
        open={reqOpen}
        onClose={() => setReqOpen(false)}
        title="Request a role"
        onSubmit={submitReq}
        submitLabel="Send request"
        saving={reqBusy}
        dirty={reqOpen && JSON.stringify(req) !== reqInitial}
        error={reqError}
      >
        <Field as="select" label="Role" value={req.role} onChange={setR("role")}>
          <option value="cr">Class Representative (one branch and section)</option>
          <option value="admin">College Admin (whole college)</option>
        </Field>
        <Field label="College" value={req.college} onChange={setR("college")} error={reqErrors.college} autoCapitalize="words" maxLength={120} />
        {req.role === "cr" && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Choice label="Branch" value={req.branch} options={withCurrent(BRANCHES, req.branch)} onChange={setR("branch")} error={reqErrors.branch} />
            <Choice label="Section" value={req.section} options={withCurrent(SECTIONS, req.section)} onChange={setR("section")} error={reqErrors.section} />
          </div>
        )}
        <Field
          label="Note for the reviewer (optional)"
          hint="Helps the admin trust your request, for example who elected you."
          value={req.requestNote}
          onChange={setR("requestNote")}
          placeholder="Elected CR for CSE-A"
          maxLength={300}
        />
      </FormModal>

      {/* new schedule */}
      <FormModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New official schedule"
        size="xl"
        onSubmit={createSchedule}
        submitLabel="Create draft"
        saving={saving}
        dirty={newDirty}
        error={formError}
      >
        <p className="text-[13.5px] leading-relaxed text-[#6A6F85]">This creates a draft. Students can't see it until you add your classes and publish.</p>

        {(duplicate || existingId) && (
          <Alert type="warning">
            This class already has a schedule for that semester
            {duplicate && !existingId && duplicate.createdByName && !duplicate.mine ? `, created by ${duplicate.createdByName}` : ""}.{" "}
            <Link
              to={`/cr-studio/${existingId || idOf(duplicate)}`}
              onClick={() => setNewOpen(false)}
              className="font-semibold text-indigo-600 underline underline-offset-2"
            >
              Open it
            </Link>{" "}
            and add your changes there instead of creating a second one.
          </Alert>
        )}

        <Field label="College" value={form.college || ""} onChange={setF("college")} error={errors.college} autoCapitalize="words" maxLength={120} />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Choice label="Academic year" value={form.academicYear || ""} options={withCurrent(academicYearOptions(), form.academicYear)} onChange={setF("academicYear")} error={errors.academicYear} />
          <Choice label="Semester" value={form.semesterLabel || ""} options={withCurrent(SEMESTERS, form.semesterLabel)} onChange={setF("semesterLabel")} error={errors.semesterLabel} />
          <Choice label="Branch" value={form.branch || ""} options={withCurrent(BRANCHES, form.branch)} onChange={setF("branch")} error={errors.branch} />
          <Choice label="Section" value={form.section || ""} options={withCurrent(SECTIONS, form.section)} onChange={setF("section")} error={errors.section} />
          <Field label="Semester start" type="date" value={form.semesterStart || ""} onChange={setStart} error={errors.semesterStart} />
          <Field label="Semester end" type="date" min={form.semesterStart || undefined} value={form.semesterEnd || ""} onChange={setF("semesterEnd")} error={errors.semesterEnd} />
        </div>
        <p className="text-[12.5px] text-[#6A6F85] px-1">
          Students find your schedule by matching these four values, so they must be the same ones they choose in their setup.
        </p>

        <GroupsEditor groups={groups} setGroups={setGroups} />
      </FormModal>

      <ActionDialog
        open={Boolean(dialog)}
        title={dialogCfg.title}
        noteLabel={dialogCfg.noteLabel}
        notePlaceholder={dialogCfg.notePlaceholder}
        confirmLabel={dialogCfg.confirmLabel}
        cancelLabel={dialogCfg.cancelLabel}
        tone={dialogCfg.tone}
        busy={dialogBusy}
        error={dialogError}
        onConfirm={runDialog}
        onClose={() => setDialog(null)}
      >
        {dialogCfg.text}
      </ActionDialog>
    </div>
  );
};

export default CRStudio;
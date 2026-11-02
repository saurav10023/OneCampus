import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Copy, KeyRound, LogOut, RotateCcw, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { adminUsersApi, errMsg } from "../api/endpoints";
import { Alert, Badge, Button, Card, Field, Modal, PageHeader, fmtDate } from "../components/Ui";

const ROLES = ["student", "cr", "moderator", "admin"];
const roleLabel = { student: "Student", cr: "CR", moderator: "Moderator", admin: "Admin" };
const PAGE_SIZE = 20;

// Schedule roles (CR for one branch + section, or college admin) come from the ScheduleRole collection.
const isActiveRole = (r) => String(r.status).toLowerCase() === "active";
const scheduleRoleText = (r) => {
  const kind = String(r.role).toLowerCase() === "cr" ? "CR" : "College admin";
  const scope = r.branch && r.section ? ` ${r.branch}-${r.section}` : "";
  return `${kind}${scope}${isActiveRole(r) ? "" : " (pending)"}`;
};

const selectCls =
  "h-10 rounded-xl border border-[#E3E5EF] bg-white px-3 text-[14px] text-[#161827] outline-none focus:border-[#5B52EE]";

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------

const AdminUsers = () => {
  const { user: me } = useAuth();

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState({ type: "", text: "" });

  // filters
  const [search, setSearch] = useState("");
  const [q, setQ] = useState(""); // debounced search
  const [role, setRole] = useState("");
  const [status, setStatus] = useState(""); // "", "true", "false"
  const [deleted, setDeleted] = useState(false);
  const [page, setPage] = useState(1);

  // row actions
  const [busy, setBusy] = useState("");
  const [resetFor, setResetFor] = useState(null); // user being reset
  const [customPw, setCustomPw] = useState("");
  const [resetResult, setResetResult] = useState(null); // { username, temporaryPassword? }
  const [resetError, setResetError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await adminUsersApi.stats());
    } catch {
      /* stats are optional */
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminUsersApi.list({
        q: q || undefined,
        role: role || undefined,
        isActive: status || undefined,
        isDeleted: deleted ? "true" : "false",
        page,
        limit: PAGE_SIZE,
      });
      setUsers(d.users || []);
      setPagination(d.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setFlash({ type: "error", text: errMsg(err, "Could not load users") });
    } finally {
      setLoading(false);
    }
  }, [q, role, status, deleted, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (me && me.role !== "admin") return <Navigate to="/" replace />;

  const refresh = () => {
    loadUsers();
    loadStats();
  };

  // Runs one action, shows the result, reloads the list.
  const run = async (key, fn, okText) => {
    setBusy(key);
    setFlash({ type: "", text: "" });
    try {
      await fn();
      setFlash({ type: "success", text: okText });
      refresh();
    } catch (err) {
      setFlash({ type: "error", text: errMsg(err, "Action failed") });
    } finally {
      setBusy("");
    }
  };

  const changeRole = (u, next) => {
    if (next === u.role) return;
    if (!window.confirm(`Change ${u.username} from ${roleLabel[u.role]} to ${roleLabel[next]}?`)) return;
    run(`role-${u.username}`, () => adminUsersApi.setRole(u.username, next), `${u.username} is now ${roleLabel[next]}.`);
  };

  const toggleActive = (u) => {
    const next = !u.isActive;
    const text = next ? `Activate ${u.username}?` : `Deactivate ${u.username}? They will be signed out everywhere.`;
    if (!window.confirm(text)) return;
    run(`status-${u.username}`, () => adminUsersApi.setStatus(u.username, next), next ? "Account activated." : "Account deactivated.");
  };

  const forceLogout = (u) => {
    if (!window.confirm(`Sign ${u.username} out of all devices?`)) return;
    run(`logout-${u.username}`, () => adminUsersApi.forceLogout(u.username), "User signed out from all devices.");
  };

  const restore = (u) =>
    run(`restore-${u.username}`, () => adminUsersApi.restore(u.username), "Account restored.");

  /* ---------------- reset password ---------------- */
  const openReset = (u) => {
    setResetFor(u);
    setCustomPw("");
    setResetResult(null);
    setResetError("");
    setCopied(false);
  };

  const closeReset = () => {
    if (busy.startsWith("reset-")) return;
    setResetFor(null);
    setResetResult(null);
  };

  const submitReset = async () => {
    const pw = customPw.trim();
    if (pw && pw.length < 8) {
      setResetError("Password must be at least 8 characters, or leave it empty to generate one.");
      return;
    }
    setBusy(`reset-${resetFor.username}`);
    setResetError("");
    try {
      const d = await adminUsersApi.resetPassword(resetFor.username, pw || undefined);
      setResetResult(d);
      loadUsers();
    } catch (err) {
      setResetError(errMsg(err, "Could not reset the password"));
    } finally {
      setBusy("");
    }
  };

  /* ---------------- render ---------------- */
  const statCards = stats
    ? [
        ["Total users", stats.total],
        ["Active", stats.active],
        ["Inactive", stats.inactive],
        ["New this week", stats.newThisWeek],
        ["Pending deletion", stats.pendingDeletion],
      ]
    : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <PageHeader title="Manage users" subtitle="Search accounts, change roles, reset passwords and control access." />

      <div className="space-y-6">
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {statCards.map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-[12.5px] text-[#6A6F85]">{label}</p>
                <p className="text-[24px] font-semibold text-[#161827] leading-tight">{value}</p>
              </Card>
            ))}
          </div>
        )}

        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#9AA0B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, username, mobile, email or roll no"
                className={`${selectCls} w-full pl-9`}
              />
            </div>
            <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{roleLabel[r]}</option>
              ))}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">Any status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <label className="flex items-center gap-2 text-[14px] text-[#444A63] select-none">
              <input
                type="checkbox"
                checked={deleted}
                onChange={(e) => { setDeleted(e.target.checked); setPage(1); }}
              />
              Pending deletion
            </label>
          </div>

          <Alert type={flash.type || "info"}>{flash.text}</Alert>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="text-[12.5px] uppercase tracking-wide text-[#6A6F85] border-b border-[#EEF0F6]">
                  <th className="py-2 pr-3 font-medium">User</th>
                  <th className="py-2 pr-3 font-medium">Class</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Last login</th>
                  <th className="py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.username === me?.username;
                  const protectedAdmin = u.role === "admin" && !self;
                  const rowBusy = busy.endsWith(`-${u.username}`);
                  return (
                    <tr key={u._id || u.username} className="border-b border-[#F3F4F9] align-middle">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          {typeof u.avatar === "string" && u.avatar ? (
                            <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                          ) : (
                            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] text-white text-[14px] font-semibold flex items-center justify-center uppercase">
                              {(u.fullName || u.username || "?").charAt(0)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-[#161827] truncate">{u.fullName}{self && " (you)"}</p>
                            <p className="text-[12.5px] text-[#6A6F85] truncate">@{u.username} · {u.mobile}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-[#444A63] whitespace-nowrap">
                        {u.branch} {u.section}
                        {u.rollNo && <span className="block text-[12.5px] text-[#6A6F85]">{u.rollNo}</span>}
                      </td>
                      <td className="py-3 pr-3">
                        {u.isDeleted || self ? (
                          <Badge tone="brand">{roleLabel[u.role]}</Badge>
                        ) : (
                          <select
                            value={u.role}
                            disabled={rowBusy}
                            onChange={(e) => changeRole(u, e.target.value)}
                            className={`${selectCls} h-9`}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{roleLabel[r]}</option>
                            ))}
                          </select>
                        )}
                        {/* CR / college-admin roles live in ScheduleRole, not in the account role */}
                        {(u.scheduleRoles || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {u.scheduleRoles.map((r) => (
                              <Badge key={r._id} tone={isActiveRole(r) ? "brand" : undefined}>
                                {scheduleRoleText(r)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {u.isDeleted ? (
                          <Badge>Deleted {u.deletedAt ? fmtDate(u.deletedAt) : ""}</Badge>
                        ) : u.isActive ? (
                          <Badge tone="brand">Active</Badge>
                        ) : (
                          <Badge>Inactive</Badge>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-[#6A6F85] whitespace-nowrap">
                        {u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Never"}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          {u.isDeleted ? (
                            <Button variant="glass" loading={rowBusy} onClick={() => restore(u)}>
                              <RotateCcw className="w-4 h-4 mr-1" /> Restore
                            </Button>
                          ) : (
                            !self &&
                            !protectedAdmin && (
                              <>
                                <Button variant="glass" disabled={rowBusy} onClick={() => openReset(u)} title="Reset password">
                                  <KeyRound className="w-4 h-4" />
                                </Button>
                                <Button variant="glass" disabled={rowBusy} onClick={() => forceLogout(u)} title="Sign out everywhere">
                                  <LogOut className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant={u.isActive ? "danger" : "glass"}
                                  disabled={rowBusy}
                                  onClick={() => toggleActive(u)}
                                  title={u.isActive ? "Deactivate" : "Activate"}
                                >
                                  {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                </Button>
                              </>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#6A6F85]">No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {loading && <p className="py-6 text-center text-[#6A6F85]">Loading...</p>}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[13px] text-[#6A6F85]">
              {pagination.total} user{pagination.total === 1 ? "" : "s"} · page {pagination.page} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="glass" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="glass" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Modal open={Boolean(resetFor)} onClose={closeReset} title={`Reset password for @${resetFor?.username || ""}`}>
        {resetResult ? (
          <div className="space-y-4">
            {resetResult.temporaryPassword ? (
              <>
                <Alert type="success">Password reset. Share this temporary password with the user. It is not shown again.</Alert>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-xl bg-[#F3F4F9] px-3 py-2.5 text-[16px] tracking-wide text-[#161827] select-all">
                    {resetResult.temporaryPassword}
                  </code>
                  <Button
                    variant="glass"
                    onClick={async () => setCopied(await copyText(resetResult.temporaryPassword))}
                  >
                    <Copy className="w-4 h-4 mr-1" /> {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </>
            ) : (
              <Alert type="success">Password updated. The user has been signed out everywhere.</Alert>
            )}
            <Button onClick={closeReset}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[14px] text-[#444A63]">
              Leave the field empty to generate a random temporary password. The user is signed out on all devices.
            </p>
            <Alert type="error">{resetError}</Alert>
            <Field
              label="New password (optional)"
              type="text"
              value={customPw}
              onChange={(e) => setCustomPw(e.target.value)}
              placeholder="Auto-generate"
              autoComplete="off"
            />
            <div className="flex gap-3">
              <Button loading={busy.startsWith("reset-")} onClick={submitReset}>
                <ShieldCheck className="w-4 h-4 mr-1" /> Reset password
              </Button>
              <Button variant="glass" disabled={busy.startsWith("reset-")} onClick={closeReset}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminUsers;
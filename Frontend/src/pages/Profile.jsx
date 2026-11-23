import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, GraduationCap, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { changePassword } from "../api/axios";
import { profileApi, errMsg } from "../api/endpoints";
import { Alert, Badge, Button, Card, Field, Modal, PageHeader, fmtDate } from "../components/Ui";

// Fields PATCH /users/me accepts (college is not editable).
const FIELDS = [
  { name: "fullName", label: "Full name", type: "text", placeholder: "Your name", required: true },
  { name: "username", label: "Username", type: "text", placeholder: "yourname", required: true },
  { name: "mobile", label: "Mobile number", type: "tel", placeholder: "9876543210", required: true, hint: "10-digit Indian mobile number" },
  { name: "email", label: "Email", type: "email", placeholder: "you@college.edu" },
  { name: "branch", label: "Branch", type: "text", placeholder: "CSE" },
  { name: "section", label: "Section", type: "text", placeholder: "A" },
  { name: "rollNo", label: "Roll number", type: "text", placeholder: "2023UGCS001" },
];

const fromUser = (u) =>
  Object.fromEntries(FIELDS.map((f) => [f.name, u?.[f.name] != null ? String(u[f.name]) : ""]));

const avatarOf = (u) => (typeof u?.avatar === "string" ? u.avatar : u?.avatar?.url) || "";

const roleLabel = { student: "Student", cr: "Class Representative", moderator: "Moderator", admin: "Admin" };

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1";
const CARD_PAD = "p-3.5 min-[380px]:p-4 sm:p-5";

// ---------------------------------------------------------------------------

const Profile = () => {
  const { user, refreshUser, logout } = useAuth();
  const fileRef = useRef(null);

  /* ---------------- profile form ---------------- */
  const base = useMemo(() => fromUser(user), [user]);
  const [form, setForm] = useState(base);
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  // Re-sync the form whenever the stored user changes (e.g. after saving)
  useEffect(() => setForm(base), [base]);

  // Local preview for a picked image
  useEffect(() => {
    if (!avatarFile) {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(avatarFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const changes = useMemo(() => {
    const out = {};
    FIELDS.forEach(({ name }) => {
      const v = form[name].trim();
      if (v !== base[name]) out[name] = v;
    });
    return out;
  }, [form, base]);

  const dirty = Object.keys(changes).length > 0 || Boolean(avatarFile) || removeAvatar;

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg({ type: "error", text: "Please choose an image file." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: "error", text: "Image must be under 5 MB." });
      return;
    }
    setMsg({ type: "", text: "" });
    setRemoveAvatar(false);
    setAvatarFile(file);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setMsg({ type: "", text: "" });

    if ("mobile" in changes) {
      const digits = changes.mobile.replace(/[\s-]/g, "").replace(/^(\+91|91)(?=\d{10}$)/, "");
      if (!/^\d{10}$/.test(digits)) {
        setMsg({ type: "error", text: "Enter a valid 10-digit mobile number." });
        return;
      }
      changes.mobile = digits;
    }

    const payload = { ...changes };
    if (removeAvatar && !avatarFile) payload.removeAvatar = "true";

    setSaving(true);
    try {
      await profileApi.update(payload, avatarFile);
      await refreshUser();
      setAvatarFile(null);
      setRemoveAvatar(false);
      setMsg({ type: "success", text: "Profile updated." });
    } catch (err) {
      setMsg({ type: "error", text: errMsg(err, "Could not update the profile") });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(base);
    setAvatarFile(null);
    setRemoveAvatar(false);
    setMsg({ type: "", text: "" });
  };

  /* ---------------- password ---------------- */
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState({ type: "", text: "" });

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg({ type: "", text: "" });

    if (pw.next.length < 8) return setPwMsg({ type: "error", text: "New password must be at least 8 characters." });
    if (pw.next !== pw.confirm) return setPwMsg({ type: "error", text: "New passwords do not match." });
    if (pw.next === pw.current) return setPwMsg({ type: "error", text: "New password must differ from the current one." });

    setPwSaving(true);
    try {
      await changePassword({ currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      setPwMsg({ type: "success", text: "Password changed. Other devices have been signed out." });
    } catch (err) {
      setPwMsg({ type: "error", text: errMsg(err, "Could not change the password") });
    } finally {
      setPwSaving(false);
    }
  };

  /* ---------------- delete account ---------------- */
  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState("");

  const deleteAccount = async () => {
    setDeleting(true);
    setDelError("");
    try {
      await profileApi.requestDeletion();
      await logout();
    } catch (err) {
      setDelError(errMsg(err, "Could not delete the account"));
      setDeleting(false);
    }
  };

  /* ---------------- render ---------------- */
  const shownAvatar = removeAvatar ? "" : preview || avatarOf(user);
  const name = user?.fullName || user?.username || "Student";

  return (
    <div className="max-w-3xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 py-6 sm:py-10">
      <PageHeader title="Your account" subtitle="Update your details, photo and password." />

      <div className="space-y-2.5 sm:space-y-4">
        {/* identity */}
        <Card className={`${CARD_PAD} flex flex-col sm:flex-row sm:items-center gap-5`}>
          <div className="relative shrink-0 self-start">
            {shownAvatar ? (
              <img src={shownAvatar} alt="" className="w-24 h-24 rounded-full object-cover border border-[color:var(--line)]" />
            ) : (
              <span className="w-24 h-24 rounded-full bg-[#4F46E5] text-white text-[34px] font-semibold flex items-center justify-center uppercase">
                {name.charAt(0)}
              </span>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Change photo"
              className={`absolute -bottom-1 -right-1 w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-[color:var(--ink)] text-white border-2 border-white flex items-center justify-center hover:bg-[color:var(--body)] transition-colors ${FOCUS}`}
            >
              <Camera className="w-4 h-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-semibold tracking-tight text-[color:var(--ink)] truncate">{name}</h2>
            <p className="text-[14px] text-[color:var(--muted)]">@{user?.username}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge tone="brand">{roleLabel[user?.role] || "Student"}</Badge>
              {user?.college && (
                <Badge>
                  <GraduationCap className="w-3.5 h-3.5 mr-1" />
                  {user.college}
                </Badge>
              )}
              {user?.createdAt && <Badge>Joined {fmtDate(user.createdAt)}</Badge>}
            </div>
            {(avatarOf(user) || avatarFile) && !removeAvatar && (
              <button
                type="button"
                onClick={() => {
                  setAvatarFile(null);
                  setRemoveAvatar(true);
                }}
                className={`mt-3 text-[13px] text-[#A32A42] hover:underline rounded ${FOCUS}`}
              >
                Remove photo
              </button>
            )}
            {removeAvatar && (
              <button type="button" onClick={() => setRemoveAvatar(false)} className={`mt-3 text-[13px] text-[#4F46E5] hover:underline rounded ${FOCUS}`}>
                Keep current photo
              </button>
            )}
          </div>
        </Card>

        {/* admin tools (admins only) */}
        {user?.role === "admin" && (
          <Card className={`${CARD_PAD} flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-[17px] font-semibold text-[color:var(--ink)]">Admin tools</h2>
                <p className="text-[13.5px] text-[color:var(--muted)]">
                  Search users, change roles, reset passwords and manage account access.
                </p>
              </div>
            </div>
            <Link to="/admin/users" className="shrink-0">
              <Button type="button">Manage users</Button>
            </Link>
          </Card>
        )}

        {/* details */}
        <Card className={CARD_PAD}>
          <h2 className="text-[17px] font-semibold text-[color:var(--ink)] mb-1">Personal details</h2>
          <p className="text-[13.5px] text-[color:var(--muted)] mb-5">Your college cannot be changed here.</p>

          <form onSubmit={saveProfile} className="space-y-4">
            <Alert type={msg.type || "info"}>{msg.text}</Alert>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="College" value={user?.college || ""} disabled readOnly className="sm:col-span-2" />
              {FIELDS.map((f) => (
                <Field
                  key={f.name}
                  label={f.label}
                  type={f.type}
                  placeholder={f.placeholder}
                  hint={f.hint}
                  value={form[f.name]}
                  onChange={set(f.name)}
                  required={f.required}
                  autoComplete="off"
                />
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <Button type="submit" loading={saving} disabled={!dirty}>
                Save changes
              </Button>
              {dirty && (
                <Button type="button" variant="ghost" onClick={reset} disabled={saving}>
                  Discard
                </Button>
              )}
            </div>
          </form>
        </Card>

        {/* password */}
        <Card className={CARD_PAD}>
          <h2 className="text-[17px] font-semibold text-[color:var(--ink)] mb-1">Change password</h2>
          <p className="text-[13.5px] text-[color:var(--muted)] mb-5">At least 8 characters. Your other devices will be signed out.</p>

          <form onSubmit={savePassword} className="space-y-4 max-w-md">
            <Alert type={pwMsg.type || "info"}>{pwMsg.text}</Alert>
            <Field label="Current password" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required />
            <Field label="New password" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" minLength={8} required />
            <Field label="Confirm new password" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" required />
            <Button type="submit" loading={pwSaving}>
              Update password
            </Button>
          </form>
        </Card>

        {/* danger */}
        <Card className={`${CARD_PAD} border-rose-200`}>
          <div className="flex items-center gap-2 text-[#A32A42] mb-1">
            <Trash2 className="w-5 h-5" />
            <h2 className="text-[17px] font-semibold">Delete account</h2>
          </div>
          <p className="text-[13.5px] text-[color:var(--muted)] mb-4 max-w-xl">
            Your account is deactivated right away. If you log in again within the grace period, it is restored with your data.
          </p>
          <Button variant="danger" onClick={() => { setDelConfirm(""); setDelError(""); setDelOpen(true); }}>
            Delete my account
          </Button>
        </Card>
      </div>

      <Modal open={delOpen} onClose={() => !deleting && setDelOpen(false)} title="Delete your account?">
        <div className="space-y-4">
          <p className="text-[14px] text-[color:var(--body)]">
            Type your username <span className="font-semibold text-[color:var(--ink)]">{user?.username}</span> to confirm.
          </p>
          <Alert type="error">{delError}</Alert>
          <Field value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder={user?.username} />
          <div className="flex gap-3">
            <Button variant="danger" loading={deleting} disabled={delConfirm !== user?.username} onClick={deleteAccount}>
              Delete account
            </Button>
            <Button variant="glass" disabled={deleting} onClick={() => setDelOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Profile;
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { changePassword } from "../api/axios";
import { profileApi, errMsg } from "../api/endpoints";
import { Alert, Button, Card, Field, PageHeader } from "../components/Ui";

const Profile = () => {
  const { user, refreshUser, logout } = useAuth();

  // --- profile ---
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [avatar, setAvatar] = useState(null);
  const [pSaving, setPSaving] = useState(false);
  const [pMsg, setPMsg] = useState({ type: "", text: "" });

  const saveProfile = async (e) => {
    e.preventDefault();
    setPSaving(true);
    setPMsg({ type: "", text: "" });
    try {
      await profileApi.update({ displayName: displayName.trim() }, avatar);
      await refreshUser();
      setAvatar(null);
      setPMsg({ type: "success", text: "Profile updated." });
    } catch (err) {
      setPMsg({ type: "error", text: errMsg(err, "Could not update the profile") });
    } finally {
      setPSaving(false);
    }
  };

  // --- password ---
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState({ type: "", text: "" });

  const savePassword = async (e) => {
    e.preventDefault();
    setPwSaving(true);
    setPwMsg({ type: "", text: "" });
    try {
      await changePassword({ oldPassword, newPassword });
      setOldPassword("");
      setNewPassword("");
      setPwMsg({ type: "success", text: "Password changed." });
    } catch (err) {
      setPwMsg({ type: "error", text: errMsg(err, "Could not change the password") });
    } finally {
      setPwSaving(false);
    }
  };

  // --- account deletion ---
  const [delMsg, setDelMsg] = useState({ type: "", text: "" });
  const [deleting, setDeleting] = useState(false);

  const requestDeletion = async () => {
    if (!window.confirm("Request deletion of your account? This cannot be undone.")) return;
    setDeleting(true);
    setDelMsg({ type: "", text: "" });
    try {
      await profileApi.requestDeletion();
      await logout();
    } catch (err) {
      setDelMsg({ type: "error", text: errMsg(err, "Could not request deletion") });
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <PageHeader title="Your account" subtitle={user?.email || user?.username} />

      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-[17px] font-semibold text-[#161827] mb-4">Profile</h2>
          <form onSubmit={saveProfile} className="space-y-4">
            <Alert type={pMsg.type || "info"}>{pMsg.text}</Alert>
            <Field label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            <Field
              label="Avatar (optional)"
              type="file"
              accept="image/*"
              onChange={(e) => setAvatar(e.target.files?.[0] || null)}
              className="h-auto py-2.5 file:mr-3 file:rounded-full file:border-0 file:bg-indigo-500/10 file:px-3 file:py-1 file:text-indigo-700"
            />
            <Button type="submit" loading={pSaving}>Save profile</Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="text-[17px] font-semibold text-[#161827] mb-4">Change password</h2>
          <form onSubmit={savePassword} className="space-y-4">
            <Alert type={pwMsg.type || "info"}>{pwMsg.text}</Alert>
            <Field label="Current password" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" required />
            <Field label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
            <Button type="submit" loading={pwSaving}>Update password</Button>
          </form>
        </Card>

        <Card className="p-6 border-rose-200/80">
          <h2 className="text-[17px] font-semibold text-rose-600 mb-1">Delete account</h2>
          <p className="text-[13.5px] text-[#6A6F85] mb-4">Submits a request to delete your account and its data.</p>
          <Alert type={delMsg.type || "info"} className="mb-3">{delMsg.text}</Alert>
          <Button variant="danger" loading={deleting} onClick={requestDeletion}>Request account deletion</Button>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
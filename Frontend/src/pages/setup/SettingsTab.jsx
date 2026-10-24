import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { setupsApi, errMsg, pick } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { Alert, Button, Card, Field, Warnings } from "../../components/Ui";
import SetupForm from "../../components/SetupForm";

const pretty = (k) => k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const SettingsTab = ({ setup, onUpdated, readOnly }) => {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);

  const [impact, setImpact] = useState(null);
  const [impactError, setImpactError] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [alsoUnpublish, setAlsoUnpublish] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let alive = true;
    setupsApi
      .deleteImpact(setup._id)
      .then((d) => alive && setImpact(d))
      .catch((e) => alive && setImpactError(errMsg(e, "Could not load delete preview")));
    return () => {
      alive = false;
    };
  }, [setup._id]);

  const save = async (body) => {
    setSaving(true);
    setError("");
    setSaved(null);
    try {
      const data = await setupsApi.update(setup._id, body);
      const updated = pick(data, "setup");
      onUpdated({ ...setup, ...updated });
      setSaved(data);
    } catch (e) {
      setError(errMsg(e, "Could not save changes"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await setupsApi.remove(setup._id, { confirmName, alsoUnpublish });
      await refreshUser();
      navigate("/setups", { replace: true });
    } catch (e) {
      setDeleteError(errMsg(e, "Could not delete the setup"));
      setDeleting(false);
    }
  };

  // Show only simple values from the delete-impact preview
  const impactRows = impact
    ? Object.entries(impact).filter(([, v]) => ["number", "boolean"].includes(typeof v))
    : [];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-[17px] font-semibold text-[#161827] mb-1">Setup details</h2>
        <p className="text-[13.5px] text-[#6A6F85] mb-5">
          Changing the start or end date re-counts classes. You will see a warning describing what changed.
        </p>
        <div className="space-y-4">
          <Alert type="error">{error}</Alert>
          {saved && <Alert type="success">Changes saved.</Alert>}
          <Warnings data={saved} />
          <SetupForm initial={setup} submitLabel="Save changes" loading={saving} disabled={readOnly} onSubmit={save} />
        </div>
      </Card>

      <Card className="p-6 border-rose-200/80">
        <div className="flex items-center gap-2 text-rose-600 mb-1">
          <AlertTriangle className="w-5 h-5" />
          <h2 className="text-[17px] font-semibold">Delete this setup</h2>
        </div>
        <p className="text-[13.5px] text-[#6A6F85] mb-4">
          This permanently removes the setup and everything inside it. It cannot be undone.
        </p>

        <Alert type="error" className="mb-3">{impactError}</Alert>

        {impactRows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
            {impactRows.map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/60 border border-white/80 px-3.5 py-2.5">
                <p className="text-[18px] font-semibold text-[#161827] leading-none">{typeof v === "boolean" ? (v ? "Yes" : "No") : v}</p>
                <p className="text-[11.5px] text-[#6A6F85] mt-1">{pretty(k)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4 max-w-md">
          <Field
            label="Type the setup name to confirm"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={setup.name}
          />
          <label className="flex items-start gap-2.5 text-[13.5px] text-[#161827]">
            <input type="checkbox" checked={alsoUnpublish} onChange={(e) => setAlsoUnpublish(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
            <span>
              Also unpublish it if it is shared. Copies other students already made are not affected.
            </span>
          </label>
          <Alert type="error">{deleteError}</Alert>
          <Button variant="danger" loading={deleting} disabled={confirmName !== setup.name} onClick={remove}>
            Delete setup permanently
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default SettingsTab;
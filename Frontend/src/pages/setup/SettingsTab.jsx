import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronDown, Lock, SlidersHorizontal } from "lucide-react";
import { setupsApi, errMsg, pick, toDateInput } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { Alert, Button, Card, Field, Warnings, cx } from "../../components/Ui";
import SetupForm from "../../components/SetupForm";
import { FadeIn, Skeleton } from "../../components/Ux";

const pretty = (k) => k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// Fields a joined setup will not let you change unless it leaves the official schedule.
const SCOPE = ["academicYear", "semesterLabel", "branch", "section"];
const FIELDS = ["name", ...SCOPE, "startDate", "endDate", "timezone", "targetPercentage"];

const norm = (k, v) => {
  if (k === "startDate" || k === "endDate") return toDateInput(v);
  if (k === "targetPercentage") return Number(v);
  return String(v ?? "");
};

// Only the fields that really changed are sent.
const diff = (setup, body) => {
  const out = {};
  FIELDS.forEach((k) => {
    if (body[k] === undefined) return;
    if (norm(k, body[k]) !== norm(k, setup[k])) out[k] = body[k];
  });
  return out;
};

const SectionTitle = ({ icon: Icon, title, text, tone = "indigo" }) => (
  <div className="flex items-start gap-3.5 mb-5">
    <span
      className={cx(
        "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0",
        tone === "rose" ? "bg-rose-500/10 text-rose-600" : "bg-indigo-500/10 text-indigo-600"
      )}
    >
      <Icon className="w-5 h-5" />
    </span>
    <div>
      <h2 className="text-[17px] font-semibold text-[#161827]">{title}</h2>
      {text && <p className="text-[13.5px] text-[#6A6F85] mt-0.5">{text}</p>}
    </div>
  </div>
);

const SettingsTab = ({ setup, onUpdated, readOnly }) => {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [pendingLeave, setPendingLeave] = useState(null); // changes waiting for "leave official schedule"

  const [impact, setImpact] = useState(null);
  const [impactError, setImpactError] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [alsoUnpublish, setAlsoUnpublish] = useState(null); // true | false | null (not chosen)
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [dangerOpen, setDangerOpen] = useState(false);

  const published = Boolean(setup.publishedAs);

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

  const send = async (changes, leaveOfficial) => {
    setSaving(true);
    setError("");
    setSaved(null);
    try {
      const payload = leaveOfficial ? { ...changes, leaveOfficial: true } : changes;
      const data = await setupsApi.update(setup._id, payload);
      onUpdated({ ...setup, ...pick(data, "setup") });
      setSaved(data);
      setPendingLeave(null);
    } catch (e) {
      const message = errMsg(e, "Could not save changes");
      // The server refuses scope changes on a joined setup: offer to leave the schedule.
      if (!leaveOfficial && setup.officialScheduleId && /official|leave/i.test(message)) {
        setPendingLeave(changes);
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const save = async (body) => {
    setSaved(null);
    setError("");
    const changes = diff(setup, body);
    if (Object.keys(changes).length === 0) {
      setError("Nothing was changed.");
      return;
    }
    const touchesScope = SCOPE.some((k) => k in changes);
    if (setup.officialScheduleId && touchesScope) {
      setPendingLeave(changes);
      return;
    }
    setPendingLeave(null);
    await send(changes, false);
  };

  const remove = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await setupsApi.remove(setup._id, confirmName, published ? alsoUnpublish : undefined);
      await refreshUser();
      navigate("/setups", { replace: true });
    } catch (e) {
      setDeleteError(errMsg(e, "Could not delete the setup"));
      setDeleting(false);
    }
  };

  const impactRows = impact ? Object.entries(impact).filter(([, v]) => ["number", "boolean"].includes(typeof v)) : [];

  return (
    <div className="space-y-6">
      {/* ---------- details ---------- */}
      <Card className="p-6 sm:p-7">
        <SectionTitle
          icon={SlidersHorizontal}
          title="Setup details"
          text="Changing the start or end date re-counts your classes. You will see exactly what changed."
        />

        <div className="space-y-4">
          {setup.officialScheduleId && !readOnly && (
            <div className="flex items-start gap-3 rounded-2xl bg-indigo-500/8 border border-indigo-200/70 px-4 py-3 text-[13.5px] text-[#2F3FA3]">
              <Lock className="w-4 h-4 mt-0.5 shrink-0" />
              <p>
                This setup follows your CR&apos;s official schedule, so branch, section, semester and year are locked. You can still rename it or change dates,
                timezone and your target. Changing the locked ones means leaving the schedule first.
              </p>
            </div>
          )}

          <Alert type="error">{error}</Alert>
          {saved && (
            <div role="status" className="oc-fade-up rounded-2xl border border-emerald-200 bg-emerald-50/85 text-emerald-800 px-4 py-3 text-[13.5px]">
              Changes saved.
            </div>
          )}
          <Warnings data={saved} />

          {pendingLeave && (
            <Alert type="warning" className="space-y-3">
              <p>
                To change {Object.keys(pendingLeave).filter((k) => SCOPE.includes(k)).map(pretty).join(", ").toLowerCase()}, you must leave the official schedule first.
                Your subjects and classes are kept, but updates from your CR will stop.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="danger" loading={saving} onClick={() => send(pendingLeave, true)}>
                  Leave the official schedule and save
                </Button>
                <Button size="sm" variant="glass" disabled={saving} onClick={() => setPendingLeave(null)}>Cancel</Button>
              </div>
            </Alert>
          )}

          <SetupForm initial={setup} submitLabel="Save changes" loading={saving} disabled={readOnly} onSubmit={save} />
        </div>
      </Card>

      {/* ---------- danger zone (collapsed by default) ---------- */}
      <Card className="p-0 overflow-hidden border-rose-200/80">
        <button
          type="button"
          onClick={() => setDangerOpen((v) => !v)}
          aria-expanded={dangerOpen}
          className="w-full flex items-center justify-between gap-3 px-6 sm:px-7 py-5 text-left hover:bg-rose-50/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 focus-visible:ring-inset"
        >
          <span className="flex items-center gap-3.5">
            <span className="w-11 h-11 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <span>
              <span className="block text-[17px] font-semibold text-[#161827]">Danger zone</span>
              <span className="block text-[13.5px] text-[#6A6F85]">Delete this setup permanently</span>
            </span>
          </span>
          <ChevronDown className={cx("w-5 h-5 text-[#6A6F85] transition-transform duration-300", dangerOpen && "rotate-180")} />
        </button>

        {dangerOpen && (
          <FadeIn>
            <div className="px-6 sm:px-7 pb-7 pt-1 border-t border-rose-100">
              <p className="text-[13.5px] text-[#6A6F85] mt-4 mb-4">
                This removes the setup and everything inside it. It cannot be undone. If you only want it out of the way, archive it from the Setups page instead.
              </p>

              <Alert type="error" className="mb-3">{impactError}</Alert>

              {!impact && !impactError && <Skeleton className="h-16 mb-5" />}

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
                {published && (
                  <fieldset className="space-y-2.5 rounded-2xl bg-amber-500/10 border border-amber-300/60 p-4">
                    <legend className="px-1 text-[13px] font-semibold text-[#161827]">This setup is published for classmates. What should happen to the listing?</legend>
                    <label className="flex items-start gap-2.5 text-[13.5px] text-[#161827] cursor-pointer">
                      <input type="radio" name="alsoUnpublish" checked={alsoUnpublish === true} onChange={() => setAlsoUnpublish(true)} className="mt-0.5 accent-indigo-600" />
                      <span>Take the listing down (copies people already made keep working)</span>
                    </label>
                    <label className="flex items-start gap-2.5 text-[13.5px] text-[#161827] cursor-pointer">
                      <input type="radio" name="alsoUnpublish" checked={alsoUnpublish === false} onChange={() => setAlsoUnpublish(false)} className="mt-0.5 accent-indigo-600" />
                      <span>Keep it listed (it can no longer be refreshed)</span>
                    </label>
                  </fieldset>
                )}

                <Field label="Type the setup name to confirm" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={setup.name} />
                <Alert type="error">{deleteError}</Alert>
                <Button
                  variant="danger"
                  loading={deleting}
                  disabled={confirmName !== setup.name || (published && alsoUnpublish === null)}
                  onClick={remove}
                >
                  Delete setup permanently
                </Button>
              </div>
            </div>
          </FadeIn>
        )}
      </Card>
    </div>
  );
};

export default SettingsTab;
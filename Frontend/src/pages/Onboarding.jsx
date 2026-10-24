import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { setupsApi, errMsg, pick } from "../api/endpoints";
import { Alert, Button, Card, PageHeader, cx } from "../components/Ui";
import SetupForm from "../components/SetupForm";
import OfficialJoin from "../components/OfficialJoin";

const STEPS = ["Create your setup", "Join your class schedule"];

const Onboarding = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [setupId, setSetupId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const create = async (body) => {
    setSaving(true);
    setError("");
    try {
      const data = await setupsApi.create(body);
      const created = pick(data, "setup");
      await refreshUser();
      setSetupId(created._id);
      setStep(1);
    } catch (e) {
      setError(
        e?.response?.status === 409
          ? `${errMsg(e)}. Tick "Archive my previous active setup" to replace it.`
          : errMsg(e, "Could not create the setup")
      );
    } finally {
      setSaving(false);
    }
  };

  const finish = () => navigate("/dashboard", { replace: true });

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <PageHeader title="Let's set up your semester" subtitle="It takes a minute. You can change everything later." />

      <ol className="flex items-center gap-3 mb-8">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2 text-[13.5px] font-medium">
            <span
              className={cx(
                "w-7 h-7 rounded-full flex items-center justify-center text-[12px]",
                i < step ? "bg-emerald-500 text-white" : i === step ? "bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] text-white" : "bg-white/70 text-[#6A6F85] border border-white"
              )}
            >
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </span>
            <span className={i === step ? "text-[#161827]" : "text-[#6A6F85]"}>{label}</span>
            {i < STEPS.length - 1 && <span className="w-8 h-px bg-[#161827]/15 mx-1" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="p-6 sm:p-7">
          <Alert type="error" className="mb-4">{error}</Alert>
          <SetupForm
            initial={{ branch: user?.branch, section: user?.section }}
            submitLabel="Create setup and continue"
            loading={saving}
            allowArchivePrevious
            onSubmit={create}
          />
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <OfficialJoin setupId={setupId} onJoined={finish} />
          <div className="flex justify-end">
            <Button variant="glass" onClick={finish}>Skip, I will add classes myself</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
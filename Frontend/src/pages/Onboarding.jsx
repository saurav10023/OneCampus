import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { setupsApi, errMsg, pick } from "../api/endpoints";
import { Alert, Button, Card, PageHeader, cx } from "../components/Ui";
import SetupForm from "../components/SetupForm";
import OfficialJoin from "../components/OfficialJoin";

const STEPS = [
  { title: "Create your setup", short: "Create setup" },
  { title: "Join your class schedule", short: "Join schedule" },
];

// Step tracker: a progress bar with "Step X of Y" on phones, numbered dots with labels from sm up.
const Progress = ({ step }) => (
  <nav aria-label="Setup progress" className="mb-6 sm:mb-8">
    {/* phones */}
    <div className="sm:hidden">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold text-[#161827]">{STEPS[step].title}</span>
        <span className="text-[#6A6F85]">Step {step + 1} of {STEPS.length}</span>
      </div>
      <div className="flex gap-1.5 mt-2" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s.title} className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0]" : "bg-[#161827]/10")} />
        ))}
      </div>
    </div>

    {/* larger screens */}
    <ol className="hidden sm:flex items-center gap-3">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex items-center gap-2 text-[13.5px] font-medium" aria-current={i === step ? "step" : undefined}>
          <span
            className={cx(
              "w-7 h-7 rounded-full flex items-center justify-center text-[12px]",
              i < step ? "bg-emerald-500 text-white" : i === step ? "bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] text-white" : "bg-white/70 text-[#6A6F85] border border-white"
            )}
          >
            {i < step ? <Check className="w-4 h-4" aria-hidden="true" /> : i + 1}
          </span>
          <span className={i === step ? "text-[#161827]" : "text-[#6A6F85]"}>{s.title}</span>
          {i < STEPS.length - 1 && <span className="w-8 h-px bg-[#161827]/15 mx-1" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  </nav>
);

const Onboarding = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [setupId, setSetupId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Start each step at the top, which matters on phones where the form is long.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

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
          ? `${errMsg(e).replace(/[.\s]+$/, "")}. To replace it, tick "Archive my previous active setup" and try again.`
          : errMsg(e, "We couldn't create your setup. Please check the details and try again.")
      );
    } finally {
      setSaving(false);
    }
  };

  const finish = () => navigate("/dashboard", { replace: true });

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
      <PageHeader title="Set up your semester" subtitle="This takes about a minute, and you can change everything later." />

      <Progress step={step} />

      {step === 0 && (
        <Card className="p-4 sm:p-7">
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
        <div className="space-y-5 sm:space-y-6">
          <Alert type="success">Your setup is ready. Next, add your classes.</Alert>
          <OfficialJoin setupId={setupId} onJoined={finish} />
          <div className="border-t border-white/70 pt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-[13px] text-[#6A6F85]">No schedule for your class? You can add subjects and classes yourself.</p>
            <Button variant="glass" className="w-full sm:w-auto" onClick={finish}>
              Skip for now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
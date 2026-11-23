import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
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
  <nav aria-label="Setup progress" className="mb-5 sm:mb-6">
    {/* phones */}
    <div className="sm:hidden">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold text-[color:var(--ink)]">{STEPS[step].title}</span>
        <span className="text-[color:var(--muted)] tabular-nums">Step {step + 1} of {STEPS.length}</span>
      </div>
      <div className="flex gap-1.5 mt-2" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s.title} className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-[#4F46E5]" : "bg-[color:var(--track)]")} />
        ))}
      </div>
    </div>

    {/* larger screens */}
    <ol className="hidden sm:flex items-center gap-3">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex items-center gap-2 text-[13.5px] font-medium" aria-current={i === step ? "step" : undefined}>
          <span
            className={cx(
              "w-7 h-7 rounded-full flex items-center justify-center text-[12px] tabular-nums",
              i < step ? "bg-emerald-500 text-white" : i === step ? "bg-[#4F46E5] text-white" : "bg-[color:var(--surface)] text-[color:var(--muted)] border border-[color:var(--line)]"
            )}
          >
            {i < step ? <Check className="w-4 h-4" aria-hidden="true" /> : i + 1}
          </span>
          <span className={i === step ? "text-[color:var(--ink)]" : "text-[color:var(--muted)]"}>{s.title}</span>
          {i < STEPS.length - 1 && <span className="w-8 h-px bg-[color:var(--line)] mx-1" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  </nav>
);

const Onboarding = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  // Someone who already has a current setup is adding another semester, not signing up.
  const [returning] = useState(() => Boolean(user?.activeSetupId)); // fixed on first render

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
      await setupsApi.activate(created._id).catch(() => {}); // already active is fine
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
    <div className="max-w-3xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 py-6 sm:py-10">
      {returning && step === 0 && (
        <Link
          to="/setups"
          className="inline-flex items-center gap-1.5 h-9 mb-3 text-[13.5px] font-medium text-[color:var(--muted)] hover:text-[color:var(--ink)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />Back to setups
        </Link>
      )}

      <PageHeader
        title={returning ? "New semester" : "Set up your semester"}
        subtitle={
          returning
            ? "Create a setup for the new semester, then join your class schedule."
            : "This takes about a minute, and you can change everything later."
        }
      />

      <Progress step={step} />

      {step === 0 && (
        <Card className="p-3.5 min-[380px]:p-4 sm:p-6">
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
        <div className="space-y-2.5 sm:space-y-4">
          <OfficialJoin setupId={setupId} onJoined={finish} autoContinue />
          <Alert type="success">Your setup is ready. Next, add your classes.</Alert>
          <OfficialJoin setupId={setupId} onJoined={finish} />
          <div className="border-t border-[color:var(--line)] pt-4 sm:pt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-[13px] text-[color:var(--muted)]">No schedule for your class? You can add subjects and classes yourself.</p>
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
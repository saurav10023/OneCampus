import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CalendarRange, CheckCircle2, ImagePlus, Link2, Settings } from "lucide-react"; // NEW: ImagePlus
import { useAuth } from "../context/AuthContext";
import { setupsApi, errMsg } from "../api/endpoints";
import { Alert, Button, Card, fmtDate } from "../components/Ui";
import SubjectsTab from "./setup/SubjectsTab";
import CalendarTab from "./setup/CalendarTab";
import SettingsTab from "./setup/SettingsTab";
import OfficialJoin from "../components/OfficialJoin";
import ImportToSetup from "../components/ImportToSetup";
import { FadeIn, Flash, SemesterBar, Skeleton, Tabs, useFlash } from "../components/Ux";

const TABS = [
  { key: "subjects", label: "Subjects", icon: BookOpen },
  { key: "calendar", label: "Calendar", icon: CalendarRange },
  { key: "official", label: "Official schedule", icon: Link2 },
  { key: "settings", label: "Settings", icon: Settings },
];

const Fact = ({ label, children }) => (
  <div className="px-5 py-3.5">
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6A6F85]">{label}</p>
    <p className="text-[14px] font-medium text-[#161827] mt-0.5">{children}</p>
  </div>
);

const SetupDetail = () => {
  const { setupId } = useParams();
  const { user, refreshUser } = useAuth();
  const [params, setParams] = useSearchParams();

  const [setup, setSetup] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [flashMsg, flash] = useFlash();

  // NEW: import from images
  const [importOpen, setImportOpen] = useState(false);
  const [importKey, setImportKey] = useState(0); // remounts the open tab so imported rows show up

  // The open tab lives in the URL (?tab=calendar) so a refresh or shared link keeps it.
  const wanted = params.get("tab");
  const tab = TABS.some((t) => t.key === wanted) ? wanted : "subjects";
  const setTab = (key) => setParams({ tab: key }, { replace: true });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setupsApi
      .get(setupId)
      .then((s) => alive && setSetup(s))
      .catch((e) => alive && setError(errMsg(e, "Could not load this setup")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [setupId]);

  const makeCurrent = async () => {
    setActivating(true);
    setError("");
    try {
      await setupsApi.activate(setupId);
      await refreshUser();
      flash("This is now your current setup");
    } catch (e) {
      setError(errMsg(e, "Could not make this setup current"));
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-5" aria-busy="true">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-52 rounded-[32px]" />
        <Skeleton className="h-12 w-80 rounded-full" />
        <Skeleton className="h-40 rounded-3xl" />
      </div>
    );
  }

  if (error && !setup) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14 space-y-4">
        <Alert type="error">{error || "Setup not found."}</Alert>
        <Link to="/setups" className="inline-flex items-center gap-1.5 text-indigo-600 text-[14px] font-medium hover:underline">
          <ArrowLeft className="w-4 h-4" />Back to setups
        </Link>
      </div>
    );
  }

  if (!setup) return null;

  const readOnly = setup.status === "archived";
  const isCurrent = setup._id === user?.activeSetupId && !readOnly;
  const scope = [setup.branch, setup.section && `Section ${setup.section}`, setup.semesterLabel, setup.academicYear].filter(Boolean).join(" · ");

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <Link to="/setups" className="inline-flex items-center gap-1.5 text-[13.5px] text-[#6A6F85] hover:text-[#161827] mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />All setups
      </Link>

      <FadeIn>
        <Card className="overflow-hidden p-0 mb-6">
          <div className="relative px-6 sm:px-8 pt-7 pb-6 text-white bg-gradient-to-br from-[#4F46E5] via-[#5B52EE] to-[#0EA5E9]">
            <span aria-hidden className="pointer-events-none absolute -right-14 -top-20 w-72 h-72 rounded-full bg-white/20 blur-3xl" />

            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2 mb-3">
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 border border-white/30 px-3 py-1 text-[12px] font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />Current setup
                    </span>
                  )}
                  {readOnly && <span className="rounded-full bg-amber-300/90 text-amber-950 px-3 py-1 text-[12px] font-semibold">Archived</span>}
                  {setup.officialScheduleId && <span className="rounded-full bg-white/20 border border-white/30 px-3 py-1 text-[12px] font-medium">Official schedule</span>}
                </div>
                <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight leading-tight">{setup.name}</h1>
                <p className="text-[14px] text-white/80 mt-1">{scope}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* NEW */}
                {!readOnly && (
                  <Button variant="glass" onClick={() => setImportOpen(true)}>
                    <ImagePlus className="w-4 h-4" />Import from images
                  </Button>
                )}
                {isCurrent ? (
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-white text-[#3B33C9] text-[14px] font-semibold shadow-lg hover:bg-white/90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    Today&apos;s classes <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  !readOnly && (
                    <Button variant="glass" loading={activating} onClick={makeCurrent}>
                      <CheckCircle2 className="w-4 h-4" />Make current
                    </Button>
                  )
                )}
              </div>
            </div>

            {!readOnly && (
              <div className="relative mt-6 max-w-md">
                <SemesterBar start={setup.startDate} end={setup.endDate} dark />
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#161827]/10 bg-white/40">
            <Fact label="Semester">{fmtDate(setup.startDate)} → {fmtDate(setup.endDate)}</Fact>
            <Fact label="Attendance target">{setup.targetPercentage != null ? `${setup.targetPercentage}%` : "Not set"}</Fact>
            <Fact label="Source">{setup.officialScheduleId ? "Follows your CR's schedule" : "Added by you"}</Fact>
          </div>
        </Card>
      </FadeIn>

      <div className="space-y-4 mb-6">
        <Alert type="error">{error}</Alert>
        <Flash message={flashMsg} />
        {readOnly && <Alert type="warning">This setup is archived and read-only. You can look around, but changes are turned off.</Alert>}
      </div>

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={TABS}
      />

      {/* NEW: importKey in the key remounts the tab after an import so it reloads its data */}
      <FadeIn key={`${tab}-${importKey}`}>
        {tab === "subjects" && <SubjectsTab setupId={setupId} readOnly={readOnly} />}
        {tab === "calendar" && <CalendarTab setupId={setupId} readOnly={readOnly} />}
        {tab === "official" && <OfficialJoin setupId={setupId} readOnly={readOnly} />}
        {tab === "settings" && <SettingsTab setup={setup} onUpdated={setSetup} readOnly={readOnly} />}
      </FadeIn>

      {/* NEW: import from images */}
      <ImportToSetup
        open={importOpen}
        onClose={() => setImportOpen(false)}
        setup={setup}
        onDone={() => {
          setImportKey((k) => k + 1);
          flash("Import finished");
        }}
      />
    </div>
  );
};

export default SetupDetail;
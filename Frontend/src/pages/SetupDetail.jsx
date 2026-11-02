import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  Target,
  ImagePlus,
  Link2,
  Settings,
  Timer,
  UserPen,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { setupsApi, errMsg } from "../api/endpoints";
import { Alert, Button, Card, cx, fmtDate } from "../components/Ui";
import SubjectsTab from "./setup/SubjectsTab";
import ClassesTab from "./setup/ClassesTab";
import CalendarTab from "./setup/CalendarTab";
import SettingsTab from "./setup/SettingsTab";
import OfficialJoin from "../components/OfficialJoin";
import ImportToSetup from "../components/ImportToSetup";
import { FadeIn, Flash, SemesterBar, Skeleton, useFlash } from "../components/Ux";

// `short` is the label under the icon on phones, `label` shows from sm up.
const TABS = [
  { key: "subjects", label: "Subjects", short: "Subjects", icon: BookOpen },
  { key: "classes", label: "Classes", short: "Classes", icon: CalendarClock },
  { key: "calendar", label: "Calendar", short: "Calendar", icon: CalendarRange },
  { key: "official", label: "Official schedule", short: "Official", icon: Link2 },
  { key: "settings", label: "Settings", short: "Settings", icon: Settings },
];

/* Days between today and a date (negative once it has passed). */
const daysUntil = (d) => {
  if (!d) return null;
  const end = new Date(String(d).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - today) / 86400000);
};

const semesterNote = (setup) => {
  const toEnd = daysUntil(setup.endDate);
  const toStart = daysUntil(setup.startDate);
  if (toStart != null && toStart > 0) return `Starts in ${toStart} day${toStart === 1 ? "" : "s"}`;
  if (toEnd == null) return null;
  if (toEnd < 0) return "Semester ended";
  if (toEnd === 0) return "Last day today";
  return `${toEnd} day${toEnd === 1 ? "" : "s"} left`;
};

const Fact = ({ icon: Icon, label, note, children }) => (
  <div className="flex items-start gap-3 px-4 sm:px-5 py-3.5 min-w-0">
    <span className="mt-0.5 w-8 h-8 shrink-0 rounded-xl bg-[#5B52EE]/10 text-[#4F46E5] flex items-center justify-center" aria-hidden="true">
      <Icon className="w-4 h-4" />
    </span>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6A6F85]">{label}</p>
      <p className="text-[14px] font-medium text-[#161827] mt-0.5 break-words">{children}</p>
      {note && <p className="text-[12.5px] text-[#6A6F85] mt-0.5">{note}</p>}
    </div>
  </div>
);

/* Equal-width icon tabs on phones, a pill row from sm up.
   Arrow keys, Home and End move between tabs. */
const SectionTabs = ({ value, onChange }) => {
  const refs = useRef({});

  const onKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.key === value);
    let n = null;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    if (n === null) return;
    e.preventDefault();
    onChange(TABS[n].key);
    refs.current[TABS[n].key]?.focus();
  };

  return (
    <div className="mb-5 sm:mb-6 sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden">
      <div
        role="tablist"
        aria-label="Setup sections"
        onKeyDown={onKeyDown}
        className="grid grid-cols-5 sm:inline-flex gap-1 p-1 sm:p-1.5 rounded-3xl sm:rounded-full bg-white/55 border border-white/80 shadow-[inset_0_1px_0_#fff] max-w-full"
      >
        {TABS.map(({ key, label, short, icon: Icon }) => {
          const on = value === key;
          return (
            <button
              key={key}
              ref={(el) => (refs.current[key] = el)}
              id={`setup-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="setup-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(key)}
              className={cx(
                "flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 h-14 sm:h-10 px-0.5 sm:px-4 rounded-[20px] sm:rounded-full text-[10.5px] min-[400px]:text-[11.5px] sm:text-[13.5px] font-medium transition whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                on ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/25" : "text-[#161827]/70 hover:bg-white/70"
              )}
            >
              <Icon className="w-[18px] h-[18px] sm:w-4 sm:h-4" aria-hidden="true" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Chip = ({ children, tone = "light" }) => (
  <span
    className={cx(
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium border",
      tone === "light" && "bg-white/20 border-white/30 text-white",
      tone === "amber" && "bg-amber-300/90 border-amber-200 text-amber-950 font-semibold"
    )}
  >
    {children}
  </span>
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

  // import from images
  const [importOpen, setImportOpen] = useState(false);
  const [importKey, setImportKey] = useState(0); // remounts the open tab so imported rows show up

  // The open tab lives in the URL (?tab=classes) so a refresh or shared link keeps it.
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
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-10 space-y-4 sm:space-y-5" aria-busy="true" aria-label="Loading setup">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-60 sm:h-52 rounded-[28px] sm:rounded-[32px]" />
        <Skeleton className="h-16 sm:h-12 w-full sm:w-[34rem] rounded-3xl sm:rounded-full" />
        <Skeleton className="h-40 rounded-3xl" />
      </div>
    );
  }

  if (error && !setup) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14 space-y-4">
        <Alert type="error">{error || "Setup not found."}</Alert>
        <Link to="/setups" className="inline-flex items-center gap-1.5 h-9 text-indigo-600 text-[14px] font-medium hover:underline">
          <ArrowLeft className="w-4 h-4" />Back to setups
        </Link>
      </div>
    );
  }

  if (!setup) return null;

  const readOnly = setup.status === "archived";
  const isCurrent = setup._id === user?.activeSetupId && !readOnly;
  const scope = [setup.branch, setup.section && `Section ${setup.section}`, setup.semesterLabel, setup.academicYear].filter(Boolean).join(" · ");
  const note = semesterNote(setup);

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
      <Link
        to="/setups"
        className="inline-flex items-center gap-1.5 h-9 text-[13.5px] text-[#6A6F85] hover:text-[#161827] mb-3 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <ArrowLeft className="w-4 h-4" />All setups
      </Link>

      <FadeIn>
        <Card className="overflow-hidden p-0 mb-5 sm:mb-6">
          <div className="relative px-4 sm:px-8 pt-5 sm:pt-7 pb-5 sm:pb-6 text-white bg-gradient-to-br from-[#4F46E5] via-[#5B52EE] to-[#0EA5E9]">
            <span aria-hidden="true" className="pointer-events-none absolute -right-14 -top-20 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
            <span aria-hidden="true" className="pointer-events-none absolute -left-16 -bottom-24 w-64 h-64 rounded-full bg-sky-300/20 blur-3xl" />

            <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div className="min-w-0">
                {(isCurrent || readOnly || setup.officialScheduleId) && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {isCurrent && (
                      <Chip>
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />Current setup
                      </Chip>
                    )}
                    {readOnly && <Chip tone="amber">Archived</Chip>}
                    {setup.officialScheduleId && (
                      <Chip>
                        <Link2 className="w-3.5 h-3.5" aria-hidden="true" />Official schedule
                      </Chip>
                    )}
                  </div>
                )}
                <h1 className="text-[24px] sm:text-[30px] font-semibold tracking-tight leading-tight break-words">{setup.name}</h1>
                {scope && <p className="text-[13.5px] sm:text-[14px] text-white/80 mt-1 break-words">{scope}</p>}
              </div>

              {/* actions: full-width stacked on phones, inline from sm up */}
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full lg:w-auto lg:justify-end shrink-0">
                {!readOnly && (
                  <Button variant="glass" className="w-full sm:w-auto" onClick={() => setImportOpen(true)}>
                    <ImagePlus className="w-4 h-4" />Import from images
                  </Button>
                )}
                {isCurrent ? (
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-white text-[#3B33C9] text-[14px] font-semibold shadow-lg hover:bg-white/90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    Today&apos;s classes <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  !readOnly && (
                    <Button variant="glass" className="w-full sm:w-auto" loading={activating} onClick={makeCurrent}>
                      <CheckCircle2 className="w-4 h-4" />Make current
                    </Button>
                  )
                )}
              </div>
            </div>

            {!readOnly && (
              <div className="relative mt-5 sm:mt-6 max-w-md">
                <SemesterBar start={setup.startDate} end={setup.endDate} dark />
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#161827]/10 bg-white/40">
            <Fact icon={Timer} label="Semester" note={note}>
              {fmtDate(setup.startDate)} → {fmtDate(setup.endDate)}
            </Fact>
            <Fact icon={Target} label="Attendance target">
              {setup.targetPercentage != null ? `${setup.targetPercentage}%` : "Not set"}
            </Fact>
            <Fact icon={setup.officialScheduleId ? Link2 : UserPen} label="Source">
              {setup.officialScheduleId ? "Follows your CR's schedule" : "Added by you"}
            </Fact>
          </div>
        </Card>
      </FadeIn>

      {(error || flashMsg || readOnly) && (
        <div className="space-y-3 sm:space-y-4 mb-5 sm:mb-6" aria-live="polite">
          <Alert type="error">{error}</Alert>
          <Flash message={flashMsg} />
          {readOnly && <Alert type="warning">This setup is archived and read-only. You can look around, but changes are turned off.</Alert>}
        </div>
      )}

      <SectionTabs value={tab} onChange={setTab} />

      {/* key includes importKey so the open tab reloads its data after an import */}
      <div role="tabpanel" id="setup-panel" aria-labelledby={`setup-tab-${tab}`} tabIndex={-1} className="focus:outline-none">
        <FadeIn key={`${tab}-${importKey}`}>
          {tab === "subjects" && <SubjectsTab setupId={setupId} readOnly={readOnly} />}
          {tab === "classes" && <ClassesTab setupId={setupId} setup={setup} readOnly={readOnly} />}
          {tab === "calendar" && <CalendarTab setupId={setupId} readOnly={readOnly} />}
          {tab === "official" && <OfficialJoin setupId={setupId} readOnly={readOnly} />}
          {tab === "settings" && <SettingsTab setup={setup} onUpdated={setSetup} readOnly={readOnly} />}
        </FadeIn>
      </div>

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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArrowRight, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Layers, Link2, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { setupsApi, errMsg } from "../api/endpoints";
import { Alert, Badge, Button, Card, PageHeader, cx, fmtDate } from "../components/Ui";
import { ConfirmDialog, FadeIn, Flash, SemesterBar, SkeletonCards, Tabs, useFlash } from "../components/Ux";
import "../styles/tones";

/* Creating a setup always happens in the onboarding flow (create, then join the class schedule).
   Change this if your onboarding route is different. */
const NEW_SETUP_PATH = "/onboarding/setup";

const FOCUS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)]";

const scopeOf = (s) => [s.branch, s.section && `Section ${s.section}`, s.semesterLabel, s.academicYear].filter(Boolean).join(" · ");

const STEPS = [
  { icon: Layers, title: "Create a setup", text: "Name your semester and set its start and end dates." },
  { icon: Link2, title: "Join your class schedule", text: "Follow your CR's official timetable, or add subjects yourself." },
  { icon: ClipboardCheck, title: "Mark attendance", text: "Tap present or absent each day and watch your percentage." },
];

const Setups = () => {
  const { user, refreshUser } = useAuth();

  const [all, setAll] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [flashMsg, flash] = useFlash();

  const [toArchive, setToArchive] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setAll(await setupsApi.list());
    } catch (e) {
      setError(errMsg(e, "Could not load setups"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = useMemo(() => all.find((s) => s._id === user?.activeSetupId && s.status !== "archived"), [all, user]);
  const counts = useMemo(
    () => ({
      all: all.length,
      active: all.filter((s) => s.status !== "archived").length,
      archived: all.filter((s) => s.status === "archived").length,
    }),
    [all]
  );

  const showHero = Boolean(current) && filter !== "archived";
  const visible = all
    .filter((s) => (filter === "all" ? true : filter === "archived" ? s.status === "archived" : s.status !== "archived"))
    .filter((s) => !(showHero && s._id === current._id));

  const act = async (id, fn, failText, okText) => {
    setBusyId(id);
    setError("");
    try {
      await fn(id);
      await Promise.all([load(), refreshUser()]);
      if (okText) flash(okText);
    } catch (e) {
      setError(errMsg(e, failText));
    } finally {
      setBusyId(null);
    }
  };

  const confirmArchive = async () => {
    const s = toArchive;
    await act(s._id, setupsApi.archive, "Could not archive", `"${s.name}" archived`);
    setToArchive(null);
  };

  return (
    <div className="max-w-6xl xl:max-w-7xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title="Your setups"
        subtitle="One setup is one semester. Keep the current one up to date and archive the old ones."
        action={
          <Link to={NEW_SETUP_PATH}>
            <Button>
              <Plus className="w-4 h-4" />New setup
            </Button>
          </Link>
        }
      />

      <div className="space-y-3 sm:space-y-4">
        <Alert type="error">{error}</Alert>
        <Flash message={flashMsg} />

        {loading ? (
          <SkeletonCards count={4} />
        ) : all.length === 0 ? (
          /* ---------- first-time journey ---------- */
          <FadeIn>
            <Card className="p-4 min-[380px]:p-5 sm:p-8">
              <div className="max-w-2xl">
                <h2 className="text-[22px] font-semibold tracking-tight text-[color:var(--ink)]">Let&apos;s get your semester started</h2>
                <p className="text-[14.5px] text-[color:var(--muted)] mt-1.5">Three quick steps and your timetable is ready.</p>
              </div>
              <ol className="grid md:grid-cols-3 gap-2.5 sm:gap-4 mt-6">
                {STEPS.map(({ icon: Icon, title, text }, i) => (
                  <li key={title} className="relative rounded-2xl bg-[color:var(--inset)] border border-[color:var(--line-soft)] p-4 sm:p-5">
                    <span className="absolute top-4 right-5 text-[28px] font-semibold text-[color:var(--line-strong)] leading-none tabular-nums" aria-hidden="true">{i + 1}</span>
                    <span className="tn tn-brand tn-soft w-11 h-11 rounded-xl flex items-center justify-center">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <h3 className="text-[15px] font-semibold text-[color:var(--ink)] mt-4">{title}</h3>
                    <p className="text-[13.5px] text-[color:var(--muted)] mt-1">{text}</p>
                  </li>
                ))}
              </ol>
              <Link to={NEW_SETUP_PATH} className="inline-block mt-6">
                <Button>
                  <Plus className="w-4 h-4" />Create my first setup
                </Button>
              </Link>
            </Card>
          </FadeIn>
        ) : (
          <>
            {/* ---------- current setup hero ---------- */}
            {showHero && (
              <FadeIn>
                <Card className="relative overflow-hidden p-4 min-[380px]:p-5 sm:p-6">
                  <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] ac-bg" />

                  <div className="flex flex-wrap items-start justify-between gap-5">
                    <div className="min-w-0">
                      <span className="tn tn-brand tn-soft inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />Current setup
                      </span>
                      <h2 className="text-[24px] sm:text-[26px] font-semibold tracking-tight leading-tight text-[color:var(--ink)] mt-3 break-words">{current.name}</h2>
                      <p className="text-[14px] text-[color:var(--muted)] mt-1">{scopeOf(current)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                      <Link
                        to="/dashboard"
                        className={cx("ac-btn inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-[14px] font-medium transition-colors active:scale-[0.98] flex-1 sm:flex-none", FOCUS)}
                      >
                        Today&apos;s classes <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </Link>
                      <Link
                        to={`/setups/${current._id}`}
                        className={cx(
                          "inline-flex items-center justify-center h-11 px-5 rounded-xl bg-[color:var(--surface)] border border-[color:var(--line)] text-[14px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--inset)] hover:border-[color:var(--line-strong)] transition-colors flex-1 sm:flex-none",
                          FOCUS
                        )}
                      >
                        Manage
                      </Link>
                    </div>
                  </div>

                  <div className="mt-5 grid sm:grid-cols-[1fr_auto] gap-3 sm:gap-4 items-end">
                    <div className="max-w-md">
                      <SemesterBar start={current.startDate} end={current.endDate} />
                    </div>
                    <p className="text-[12.5px] text-[color:var(--muted)] tabular-nums">{fmtDate(current.startDate)} → {fmtDate(current.endDate)}</p>
                  </div>
                </Card>
              </FadeIn>
            )}

            {/* ---------- filters ---------- */}
            <Tabs
              size="sm"
              value={filter}
              onChange={setFilter}
              items={[
                { key: "all", label: "All", count: counts.all },
                { key: "active", label: "Active", count: counts.active },
                { key: "archived", label: "Archived", count: counts.archived },
              ]}
            />

            {/* ---------- the rest ---------- */}
            {visible.length === 0 ? (
              <FadeIn>
                <Card className="p-6 sm:p-8 text-center">
                  <span className="tn tn-brand tn-soft mx-auto w-12 h-12 rounded-xl flex items-center justify-center">
                    <CalendarDays className="w-6 h-6" aria-hidden="true" />
                  </span>
                  <p className="text-[15.5px] font-semibold text-[color:var(--ink)] mt-3">
                    {filter === "archived" ? "No archived setups" : showHero ? "That's your only active setup" : "Nothing here"}
                  </p>
                  <p className="text-[13.5px] text-[color:var(--muted)] mt-1">
                    {filter === "archived" ? "Old semesters will appear here when you archive them." : "Create another one whenever a new semester begins."}
                  </p>
                </Card>
              </FadeIn>
            ) : (
              <div className="grid md:grid-cols-2 gap-2.5 sm:gap-4">
                {visible.map((s, i) => {
                  const archived = s.status === "archived";
                  const busy = busyId === s._id;
                  return (
                    <FadeIn key={s._id} delay={i * 50} className="h-full">
                      <Card className="overflow-hidden p-0 h-full flex flex-col">
                        <div className={cx("h-1", archived ? "bg-[color:var(--line-strong)]" : "ac-bg")} aria-hidden="true" />
                        <div className="p-4 sm:p-5 flex flex-col flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-[18px] font-semibold text-[color:var(--ink)] truncate">{s.name}</h3>
                              <p className="text-[13.5px] text-[color:var(--muted)] mt-0.5">{scopeOf(s)}</p>
                            </div>
                            {archived ? <Badge tone="amber">Archived</Badge> : s.officialScheduleId ? <Badge tone="green">Official</Badge> : null}
                          </div>

                          <div className="mt-4">
                            {archived ? (
                              <p className="text-[13px] text-[color:var(--muted)] tabular-nums">{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</p>
                            ) : (
                              <>
                                <SemesterBar start={s.startDate} end={s.endDate} />
                                <p className="text-[12.5px] text-[color:var(--muted)] mt-0.5 tabular-nums">{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</p>
                              </>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-auto pt-5">
                            <Link to={`/setups/${s._id}`}>
                              <Button size="sm">Open<ChevronRight className="w-4 h-4" /></Button>
                            </Link>
                            {!archived && (
                              <Button size="sm" variant="glass" loading={busy} onClick={() => act(s._id, setupsApi.activate, "Could not activate", `"${s.name}" is now your current setup`)}>
                                <CheckCircle2 className="w-4 h-4" />Make current
                              </Button>
                            )}
                            {!archived && (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setToArchive(s)}>
                                <Archive className="w-4 h-4" />Archive
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    </FadeIn>
                  );
                })}
              </div>
            )}

            {showHero && (
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => setToArchive(current)}>
                  <Archive className="w-4 h-4" />Archive current setup
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(toArchive)}
        title="Archive this setup?"
        confirmLabel="Archive setup"
        busy={busyId === toArchive?._id}
        onConfirm={confirmArchive}
        onClose={() => setToArchive(null)}
      >
        <p>
          <span className="font-semibold text-[color:var(--ink)]">{toArchive?.name}</span> becomes read-only: you can still look at it, but you can no longer
          change its classes or attendance.
        </p>
        {toArchive?._id === user?.activeSetupId && (
          <p className="mt-2">It is your current setup, so you will need to make another one current afterwards.</p>
        )}
      </ConfirmDialog>
    </div>
  );
};

export default Setups;
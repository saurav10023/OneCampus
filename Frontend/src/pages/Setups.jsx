import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArrowRight, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Layers, Link2, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { setupsApi, errMsg } from "../api/endpoints";
import { Alert, Badge, Button, Card, PageHeader, cx, fmtDate } from "../components/Ui";
import { ConfirmDialog, FadeIn, Flash, SemesterBar, SkeletonCards, Tabs, useFlash } from "../components/Ux";

/* Creating a setup always happens in the onboarding flow (create, then join the class schedule).
   Change this if your onboarding route is different. */
const NEW_SETUP_PATH = "/onboarding/setup";

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
    <div className="max-w-6xl mx-auto px-4 py-10">
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

      <div className="space-y-5">
        <Alert type="error">{error}</Alert>
        <Flash message={flashMsg} />

        {loading ? (
          <SkeletonCards count={4} />
        ) : all.length === 0 ? (
          /* ---------- first-time journey ---------- */
          <FadeIn>
            <Card className="p-7 sm:p-10">
              <div className="max-w-2xl">
                <h2 className="text-[22px] font-semibold tracking-tight text-[#161827]">Let&apos;s get your semester started</h2>
                <p className="text-[14.5px] text-[#6A6F85] mt-1.5">Three quick steps and your timetable is ready.</p>
              </div>
              <ol className="grid md:grid-cols-3 gap-4 mt-7">
                {STEPS.map(({ icon: Icon, title, text }, i) => (
                  <li key={title} className="relative rounded-3xl bg-white/60 border border-white/80 p-5">
                    <span className="absolute top-4 right-5 text-[34px] font-semibold text-[#161827]/[0.07] leading-none">{i + 1}</span>
                    <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] text-white flex items-center justify-center shadow-md shadow-indigo-500/25">
                      <Icon className="w-5 h-5" />
                    </span>
                    <h3 className="text-[15px] font-semibold text-[#161827] mt-4">{title}</h3>
                    <p className="text-[13.5px] text-[#6A6F85] mt-1">{text}</p>
                  </li>
                ))}
              </ol>
              <Link to={NEW_SETUP_PATH} className="inline-block mt-7">
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
                <div className="relative overflow-hidden rounded-[32px] p-6 sm:p-8 text-white bg-gradient-to-br from-[#4F46E5] via-[#5B52EE] to-[#0EA5E9] shadow-[0_28px_60px_-28px_rgba(79,70,229,0.75)]">
                  <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
                  <span aria-hidden className="pointer-events-none absolute -left-10 bottom-0 w-64 h-40 rounded-full bg-sky-300/30 blur-3xl" />

                  <div className="relative flex flex-wrap items-start justify-between gap-5">
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 border border-white/30 px-3 py-1 text-[12px] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />Current setup
                      </span>
                      <h2 className="text-[26px] sm:text-[30px] font-semibold tracking-tight leading-tight mt-3">{current.name}</h2>
                      <p className="text-[14px] text-white/80 mt-1">{scopeOf(current)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to="/dashboard"
                        className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-white text-[#3B33C9] text-[14px] font-semibold shadow-lg hover:bg-white/90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                      >
                        Today&apos;s classes <ArrowRight className="w-4 h-4" />
                      </Link>
                      <Link
                        to={`/setups/${current._id}`}
                        className="inline-flex items-center h-11 px-5 rounded-full bg-white/15 border border-white/30 text-[14px] font-medium hover:bg-white/25 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                      >
                        Manage
                      </Link>
                    </div>
                  </div>

                  <div className="relative mt-6 grid sm:grid-cols-[1fr_auto] gap-4 items-end">
                    <div className="max-w-md">
                      <SemesterBar start={current.startDate} end={current.endDate} dark />
                    </div>
                    <p className="text-[12.5px] text-white/75">{fmtDate(current.startDate)} → {fmtDate(current.endDate)}</p>
                  </div>
                </div>
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
                <Card className="p-8 text-center">
                  <span className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                    <CalendarDays className="w-6 h-6" />
                  </span>
                  <p className="text-[15.5px] font-semibold text-[#161827] mt-3">
                    {filter === "archived" ? "No archived setups" : showHero ? "That's your only active setup" : "Nothing here"}
                  </p>
                  <p className="text-[13.5px] text-[#6A6F85] mt-1">
                    {filter === "archived" ? "Old semesters will appear here when you archive them." : "Create another one whenever a new semester begins."}
                  </p>
                </Card>
              </FadeIn>
            ) : (
              <div className="grid md:grid-cols-2 gap-5">
                {visible.map((s, i) => {
                  const archived = s.status === "archived";
                  const busy = busyId === s._id;
                  return (
                    <FadeIn key={s._id} delay={i * 50} className="h-full">
                      <Card className="overflow-hidden p-0 h-full flex flex-col hover:shadow-[0_30px_60px_-30px_rgba(30,32,70,0.5)] transition-shadow">
                        <div className={cx("h-1.5", archived ? "bg-slate-300" : "bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0]")} />
                        <div className="p-6 flex flex-col flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-[18px] font-semibold text-[#161827] truncate">{s.name}</h3>
                              <p className="text-[13.5px] text-[#6A6F85] mt-0.5">{scopeOf(s)}</p>
                            </div>
                            {archived ? <Badge tone="amber">Archived</Badge> : s.officialScheduleId ? <Badge tone="green">Official</Badge> : null}
                          </div>

                          <div className="mt-4">
                            {archived ? (
                              <p className="text-[13px] text-[#6A6F85]">{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</p>
                            ) : (
                              <>
                                <SemesterBar start={s.startDate} end={s.endDate} />
                                <p className="text-[12.5px] text-[#6A6F85] mt-0.5">{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</p>
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
          <span className="font-semibold text-[#161827]">{toArchive?.name}</span> becomes read-only: you can still look at it, but you can no longer
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
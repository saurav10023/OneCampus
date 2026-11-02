import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, LayoutDashboard, Megaphone, Moon, RefreshCw, Sun, Sunrise, Sunset } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { cx } from "../components/Ui";
import { useRemainingClasses } from "../lib/useRemainingClasses";
import { css } from "../components/home/homeStyles";
import { Card, ROUTES, fmtLong, greeting, ghost, glassGhost, linkBase, linkPrimary, toIso } from "../components/home/Shared";
import { useLive } from "../components/home/useHomeData";
import DashboardView from "../components/home/DashboardView";
import Landing from "../components/home/Landing";

const Skeleton = () => (
  <div className="space-y-3 animate-pulse" aria-busy="true" aria-label="Loading your home page">
    <div className="h-14 w-72 lq-in" />
    <div className="h-40 lq" />
    <div className="grid lg:grid-cols-[1.25fr_1fr] gap-3"><div className="h-72 lq" /><div className="h-48 lq" /></div>
    <div className="h-40 lg" />
  </div>
);

/* Time-of-day icon next to the date. */
const DayIcon = () => {
  const h = new Date().getHours();
  const Icon = h < 5 ? Moon : h < 12 ? Sunrise : h < 17 ? Sun : h < 20 ? Sunset : Moon;
  return <Icon className="w-4 h-4 text-[#4F46E5]" aria-hidden="true" />;
};

/* Signed-in dashboard: fetches the classes still to come, then renders the shared view. */
const LiveDashboard = ({ vm, note, onMark, onReadAll, onLoadDay }) => {
  const remaining = useRemainingClasses(vm.setup);
  return <DashboardView vm={vm} remaining={remaining} note={note} onMark={onMark} onReadAll={onReadAll} onLoadDay={onLoadDay} />;
};

const LiveHome = ({ user }) => {
  const live = useLive(true);
  const name = user.fullName || user.username || "there";
  const first = name.split(" ")[0];
  const vm = live.vm;
  return (
    <>
      <header className="hm-rise flex flex-wrap items-center justify-between gap-x-4 gap-y-4 mb-5 sm:mb-6">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <span aria-hidden="true" className="hm-grad shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-2xl sm:rounded-[22px] flex items-center justify-center text-[20px] sm:text-[26px] font-semibold uppercase">
            {first.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#6A6F85]">
              <DayIcon />{fmtLong(vm?.today?.date || toIso(new Date()))}
            </p>
            <h1 className="text-[24px] min-[380px]:text-[28px] sm:text-[38px] font-semibold tracking-[-0.025em] leading-[1.08] text-[#161827] mt-0.5 break-words">
              {greeting()}, <span className="hm-grad-text">{first}</span>
            </h1>
            {vm && (
              <p className="inline-flex max-w-full items-center gap-2 mt-2 rounded-full lq-btn px-3 py-1 text-[12.5px] text-[#444A63]">
                <span aria-hidden="true" className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,.2)]" />
                <span className="truncate">{vm.setup.name}</span>
                <span aria-hidden="true" className="text-[#6A6F85]">·</span>
                <span className="shrink-0 tabular-nums">target {vm.target}%</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button type="button" aria-label="Refresh" title="Refresh" onClick={live.reload} className={cx(glassGhost, "!w-11 sm:!w-10 !h-11 sm:!h-10 !px-0")}>
            <RefreshCw className={cx("w-4 h-4", live.loading && "animate-spin")} aria-hidden="true" />
          </button>
          <Link to={ROUTES.dashboard} className={cx(glassGhost, "!h-11 sm:!h-10 flex-1 sm:flex-none")}>
            <LayoutDashboard className="w-4 h-4 text-[#4F46E5]" aria-hidden="true" />Dashboard
          </Link>
          {vm && (
            <Link to={vm.cr ? ROUTES.crStudio : ROUTES.crRequest} className={cx(glassGhost, "hm-grad !border-transparent !h-11 sm:!h-10 flex-1 sm:flex-none")}>
              <Megaphone className="w-4 h-4" aria-hidden="true" />{vm.cr ? "CR Studio" : "Become a CR"}
            </Link>
          )}
        </div>
      </header>

      {live.loading && !vm && <Skeleton />}
      {live.error && (
        <Card className="p-4 mb-3 !border-rose-200" role="alert">
          <p className="text-[14.5px] font-semibold text-[#161827]">We couldn't load your home page</p>
          <p className="text-[13px] text-[#6A6F85] mt-1">{live.error}. If the server was asleep, it can take up to a minute to wake up.</p>
          <button type="button" onClick={live.reload} className={cx(ghost, "mt-3")}><RefreshCw className="w-4 h-4" aria-hidden="true" />Try again</button>
        </Card>
      )}
      {live.noSetup && (
        <Card className="p-6 sm:p-10 text-center">
          <span className="hm-grad mx-auto w-14 h-14 rounded-2xl flex items-center justify-center"><CalendarDays className="w-7 h-7" aria-hidden="true" /></span>
          <h2 className="text-[21px] font-semibold text-[#161827] mt-4">Set up your semester</h2>
          <p className="text-[14px] text-[#6A6F85] mt-2 max-w-md mx-auto">Add your semester dates, then your subjects and weekly classes. You can also join your CR's official timetable once it's published.</p>
          <Link to={ROUTES.setup} className={cx(linkBase, linkPrimary, "mt-6")}>Create your first setup<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
        </Card>
      )}
      {vm && <LiveDashboard vm={vm} note={live.note} onMark={live.mark} onReadAll={live.readAll} onLoadDay={live.loadDay} />}
    </>
  );
};

/* ================= page ================= */
export default function Home() {
  const { user, loading } = useAuth();
  return (
    <div className="hm relative z-[1] w-full min-w-0 max-w-6xl xl:max-w-7xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 pt-4 sm:pt-10 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-20 overflow-x-clip">
      <style>{css}</style>
      <div aria-hidden="true" className="hm-wash">
        <span className="hm-orb -top-10 left-[6%] h-56 w-56 bg-sky-300" />
        <span className="hm-orb top-4 right-[8%] h-60 w-60 bg-indigo-300" style={{ animationDelay: "-5s" }} />
      </div>
      {user ? <LiveHome key={user._id} user={user} /> : loading ? <Skeleton /> : <Landing />}
    </div>
  );
}
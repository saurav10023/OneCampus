import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Megaphone, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { cx } from "../components/Ui";
import { useRemainingClasses } from "../lib/useRemainingClasses";
import { css } from "../components/home/homeStyles";
import { Card, ROUTES, fmtLong, greeting, ghost, linkBase, linkPrimary, toIso } from "../components/home/Shared";
import { useLive } from "../components/home/useHomeData";
import DashboardView from "../components/home/DashboardView";
import Landing from "../components/home/Landing";

const Skeleton = () => (
  <div className="space-y-3 animate-pulse" aria-busy="true" aria-label="Loading your home page">
    <div className="h-10 w-64 lg-in" />
    <div className="h-32 lg" />
    <div className="grid lg:grid-cols-[1.25fr_1fr] gap-3"><div className="h-72 lg" /><div className="h-48 lg" /></div>
    <div className="h-40 lg" />
  </div>
);

/* Signed-in dashboard: fetches the classes still to come, then renders the shared view. */
const LiveDashboard = ({ vm, note, onMark, onReadAll, onLoadDay }) => {
  const remaining = useRemainingClasses(vm.setup);
  return <DashboardView vm={vm} remaining={remaining} note={note} onMark={onMark} onReadAll={onReadAll} onLoadDay={onLoadDay} />;
};

const LiveHome = ({ user }) => {
  const live = useLive(true);
  const first = (user.fullName || user.username || "there").split(" ")[0];
  const vm = live.vm;
  return (
    <>
      <header className="hm-rise flex flex-wrap items-end justify-between gap-3 mb-4 sm:mb-5">
        <div className="min-w-0">
          <p className="text-[12.5px] text-[#6A6F85]">{fmtLong(vm?.today?.date || toIso(new Date()))}</p>
          <h1 className="text-[24px] min-[380px]:text-[26px] sm:text-[32px] font-semibold tracking-tight leading-[1.1] text-[#161827] mt-0.5 break-words">{greeting()}, {first}</h1>
          {vm && <p className="text-[13px] text-[#6A6F85] mt-1">{vm.setup.name}, target {vm.target}%</p>}
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button type="button" aria-label="Refresh" onClick={live.reload} className={ghost}><RefreshCw className={cx("w-4 h-4", live.loading && "animate-spin")} aria-hidden="true" /><span className="hidden sm:inline">Refresh</span></button>
          {vm && <Link to={vm.cr ? ROUTES.crStudio : ROUTES.crRequest} className={ghost}><Megaphone className="w-4 h-4" aria-hidden="true" />{vm.cr ? "CR Studio" : "Become a CR"}</Link>}
          <Link to={ROUTES.dashboard} className={ghost}>Dashboard</Link>
        </div>
      </header>

      {live.loading && !vm && <Skeleton />}
      {live.error && (
        <Card className="p-4 mb-3 border-rose-200" role="alert">
          <p className="text-[14.5px] font-semibold text-[#161827]">We couldn't load your home page</p>
          <p className="text-[13px] text-[#6A6F85] mt-1">{live.error}. If the server was asleep, it can take up to a minute to wake up.</p>
          <button type="button" onClick={live.reload} className={cx(ghost, "mt-3")}><RefreshCw className="w-4 h-4" aria-hidden="true" />Try again</button>
        </Card>
      )}
      {live.noSetup && (
        <Card className="p-6 sm:p-10 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-white border border-[#161827]/10 text-[#161827] flex items-center justify-center"><CalendarDays className="w-6 h-6" aria-hidden="true" /></span>
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
      <div aria-hidden="true" className="hm-wash" />
      {user ? <LiveHome key={user._id} user={user} /> : loading ? <Skeleton /> : <Landing />}
    </div>
  );
}
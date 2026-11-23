import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, LayoutDashboard, Megaphone, Moon, RefreshCw, Sun, Sunrise, Sunset } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { cx } from "../components/Ui";
import { useRemainingClasses } from "../lib/useRemainingClasses";
import { css } from "../components/home/homeStyles";
import { Card, ROUTES, fmtLong, greeting, ghost, linkBase, linkPrimary, toIso } from "../components/home/Shared";
import { useLive } from "../components/home/useHomeData";
import DashboardView from "../components/home/DashboardView";
import Landing from "../components/home/Landing";

/*
  Design tokens

  LIGHT (unchanged)
  page    #F5F6FA   soft cool grey, one flat colour
  surface #FFFFFF   cards
  line    #E4E7EF   hairline borders
  ink     #1B1F33   headings
  muted   #636A82   secondary text
  accent  #4F46E5   single indigo accent, used sparingly

  DARK (new)
  page    #0D1018   deep blue-black (not pure black, so cards can lift off it)
  surface #151A26   cards
  surface2#1B2130   chips, hover, inset areas
  line    #2B3347   borders, clearly visible but quiet
  ink     #F2F4FA   headings         (contrast ~16:1 on surface)
  body    #CDD2E1   normal text      (~11:1)
  muted   #9BA4BA   secondary text   (~6.8:1)
  faint   #7F89A1   tertiary / separators (~4.8:1)
  accent  #8B93FF   links, icons, accent text (~6.5:1)
*/

/* Dark mode is detected from any of the usual switches:
   <html class="dark">, <body class="dark">, data-theme="dark" or data-mode="dark".
   If your app uses something else, change DARK below and nothing else. */
const DARK = ':is(.dark,[data-theme="dark"],[data-mode="dark"]) .hm';
const DARK_PAGE = 'html:is(.dark,[data-theme="dark"],[data-mode="dark"]) body,body:is(.dark,[data-theme="dark"],[data-mode="dark"])';

/* Overrides appended AFTER the existing stylesheet: they calm the neon / liquid-glass
   look globally (cards, chips, gradient avatar, orbs) without touching homeStyles.js. */
const polish = `
.hm{--pg:#F5F6FA;--surface:#fff;--surface2:#F0F2F8;--line:#E4E7EF;--ink:#1B1F33;--body:#434A63;--muted:#636A82;--faint:#8A91A8;--accent:#4F46E5}
body{background:var(--pg)}

/* remove decorative blobs and washes */
.hm-wash,.hm-orb{display:none!important}

/* cards & panels: flat white, hairline border, one very soft shadow */
.hm .lq,.hm .lg,.hm .lq-in{
  background:var(--surface)!important;
  border:1px solid var(--line)!important;
  border-radius:16px!important;
  box-shadow:0 1px 2px rgba(27,31,51,.04)!important;
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
}
.hm .lq::before,.hm .lq::after,.hm .lg::before,.hm .lg::after{display:none!important}

/* chips / small buttons: subtle frosted tint, no glow */
.hm .lq-btn{
  background:rgba(255,255,255,.72)!important;
  border:1px solid var(--line)!important;
  box-shadow:none!important;
  backdrop-filter:blur(8px) saturate(120%);-webkit-backdrop-filter:blur(8px) saturate(120%);
}

/* gradient avatar and gradient text become solid */
.hm .hm-grad{background:var(--accent)!important;color:#fff!important;box-shadow:none!important}
.hm .hm-grad-text{background:none!important;-webkit-text-fill-color:currentColor!important;color:var(--accent)!important}

/* buttons used in this page */
.hm-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  height:40px;padding:0 14px;border-radius:12px;
  font-size:13.5px;font-weight:500;color:var(--ink);
  background:rgba(255,255,255,.7);
  border:1px solid var(--line);
  backdrop-filter:blur(10px) saturate(130%);-webkit-backdrop-filter:blur(10px) saturate(130%);
  transition:background .15s,border-color .15s,color .15s;
}
.hm-btn:hover{background:#fff;border-color:#CBD0DE}
.hm-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.hm-btn-primary{background:var(--accent);border-color:var(--accent);color:#fff;backdrop-filter:none;-webkit-backdrop-filter:none}
.hm-btn-primary:hover{background:#4338CA;border-color:#4338CA}
.hm-btn-icon{width:40px;padding:0}
@media (max-width:639px){.hm-btn{height:44px}.hm-btn-icon{width:44px}}

/* entrance: one quiet fade only, respect reduced motion */
@media (prefers-reduced-motion:reduce){.hm *{animation:none!important;transition:none!important}}

/* ======================= DARK MODE ======================= */
${DARK_PAGE}{background:#0D1018}
${DARK}{
  color-scheme:dark;
  --pg:#0D1018;--surface:#151A26;--surface2:#1B2130;--line:#2B3347;
  --ink:#F2F4FA;--body:#CDD2E1;--muted:#9BA4BA;--faint:#7F89A1;--accent:#8B93FF;
  color:var(--body);
}

/* cards: lifted off the page by colour + a visible border, shadow only adds depth */
${DARK} .lq,${DARK} .lg,${DARK} .lq-in{
  background:var(--surface)!important;
  border-color:var(--line)!important;
  box-shadow:0 1px 0 rgba(255,255,255,.03) inset,0 6px 20px rgba(0,0,0,.28)!important;
}
${DARK} .lq-btn{
  background:var(--surface2)!important;
  border-color:var(--line)!important;
  color:var(--body);
  backdrop-filter:none;-webkit-backdrop-filter:none;
}

/* buttons */
${DARK} .hm-btn{background:var(--surface2);border-color:var(--line);color:var(--ink)}
${DARK} .hm-btn:hover{background:#242B3D;border-color:#3A4560}
${DARK} .hm-btn-primary{background:#5B54EA;border-color:#6E68F2;color:#fff}
${DARK} .hm-btn-primary:hover{background:#6E68F2;border-color:#8B93FF}

/* avatar keeps a solid indigo with white letter (good contrast on dark) */
${DARK} .hm-grad{background:#5B54EA!important;color:#fff!important}

/* error card */
${DARK} .hm-err{border-color:rgba(251,113,133,.5)!important;background:#1E1620!important}

/* skeleton shimmer blocks stay visible */
${DARK} .animate-pulse .lq,${DARK} .animate-pulse .lg,${DARK} .animate-pulse .lq-in{background:#1A2030!important}

/* form controls and dividers inside the shared views */
${DARK} input,${DARK} select,${DARK} textarea{background:var(--surface2);color:var(--ink);border-color:var(--line)}
${DARK} input::placeholder,${DARK} textarea::placeholder{color:var(--faint)}
${DARK} hr{border-color:var(--line)}

/* Safety net for light-only Tailwind colours used inside DashboardView / Landing,
   which are not in this file. They are remapped so no text or panel disappears. */
${DARK} .bg-white,${DARK} [class*="bg-white/"]{background-color:var(--surface)!important}
${DARK} .bg-slate-50,${DARK} .bg-gray-50,${DARK} .bg-slate-100,${DARK} .bg-gray-100{background-color:var(--surface2)!important}
${DARK} .text-slate-900,${DARK} .text-slate-800,${DARK} .text-gray-900,${DARK} .text-gray-800,${DARK} .text-black{color:var(--ink)!important}
${DARK} .text-slate-700,${DARK} .text-slate-600,${DARK} .text-gray-700,${DARK} .text-gray-600{color:var(--body)!important}
${DARK} .text-slate-500,${DARK} .text-gray-500{color:var(--muted)!important}
${DARK} .text-slate-400,${DARK} .text-gray-400{color:var(--faint)!important}
${DARK} .border-slate-100,${DARK} .border-slate-200,${DARK} .border-gray-100,${DARK} .border-gray-200{border-color:var(--line)!important}
${DARK} .text-indigo-600,${DARK} .text-indigo-700,${DARK} .text-indigo-500{color:var(--accent)!important}
${DARK} .bg-indigo-50{background-color:rgba(139,147,255,.14)!important}
${DARK} .text-emerald-600,${DARK} .text-emerald-700{color:#5EE0A8!important}
${DARK} .bg-emerald-50{background-color:rgba(52,211,153,.14)!important}
${DARK} .text-rose-600,${DARK} .text-rose-700{color:#FF8FA3!important}
${DARK} .bg-rose-50{background-color:rgba(251,113,133,.14)!important}
${DARK} .text-amber-600,${DARK} .text-amber-700{color:#FBBF58!important}
${DARK} .bg-amber-50{background-color:rgba(251,191,36,.14)!important}

/* keyboard focus is clearly visible on dark */
${DARK} :focus-visible{outline-color:var(--accent)}
`;

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
  return <Icon className="w-4 h-4 text-[color:var(--muted)]" aria-hidden="true" />;
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
      <header className="hm-rise flex flex-wrap items-center justify-between gap-x-4 gap-y-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <span aria-hidden="true" className="hm-grad shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-[20px] sm:text-[22px] font-semibold uppercase">
            {first.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--muted)]">
              <DayIcon />{fmtLong(vm?.today?.date || toIso(new Date()))}
            </p>
            <h1 className="text-[24px] min-[380px]:text-[26px] sm:text-[32px] font-semibold tracking-[-0.02em] leading-[1.1] text-[color:var(--ink)] mt-0.5 break-words">
              {greeting()}, {first}
            </h1>
            {vm && (
              <p className="inline-flex max-w-full items-center gap-2 mt-2 rounded-full lq-btn px-3 py-1 text-[12.5px] text-[color:var(--body)]">
                <span aria-hidden="true" className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="truncate">{vm.setup.name}</span>
                <span aria-hidden="true" className="text-[color:var(--faint)]">/</span>
                <span className="shrink-0 tabular-nums">Target {vm.target}%</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button type="button" aria-label="Refresh" title="Refresh" onClick={live.reload} className="hm-btn hm-btn-icon">
            <RefreshCw className={cx("w-4 h-4", live.loading && "animate-spin")} aria-hidden="true" />
          </button>
          <Link to={ROUTES.dashboard} className={cx("hm-btn", "flex-1 sm:flex-none")}>
            <LayoutDashboard className="w-4 h-4 text-[color:var(--accent)]" aria-hidden="true" />Dashboard
          </Link>
          {vm && (
            <Link to={vm.cr ? ROUTES.crStudio : ROUTES.crRequest} className={cx("hm-btn hm-btn-primary", "flex-1 sm:flex-none")}>
              <Megaphone className="w-4 h-4" aria-hidden="true" />{vm.cr ? "CR Studio" : "Become a CR"}
            </Link>
          )}
        </div>
      </header>

      {live.loading && !vm && <Skeleton />}
      {live.error && (
        <Card className="hm-err p-4 mb-3 !border-rose-200" role="alert">
          <p className="text-[14.5px] font-semibold text-[color:var(--ink)]">We couldn't load your home page</p>
          <p className="text-[13px] text-[color:var(--muted)] mt-1">{live.error}. If the server was asleep, it can take up to a minute to wake up.</p>
          <button type="button" onClick={live.reload} className={cx(ghost, "mt-3")}><RefreshCw className="w-4 h-4" aria-hidden="true" />Try again</button>
        </Card>
      )}
      {live.noSetup && (
        <Card className="p-6 sm:p-10 text-center">
          <span className="hm-grad mx-auto w-12 h-12 rounded-xl flex items-center justify-center"><CalendarDays className="w-6 h-6" aria-hidden="true" /></span>
          <h2 className="text-[20px] font-semibold text-[color:var(--ink)] mt-4">Set up your semester</h2>
          <p className="text-[14px] text-[color:var(--muted)] mt-2 max-w-md mx-auto">Add your semester dates, then your subjects and weekly classes. You can also join your CR's official timetable once it's published.</p>
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
      <style>{polish}</style>
      {user ? <LiveHome key={user._id} user={user} /> : loading ? <Skeleton /> : <Landing />}
    </div>
  );
}
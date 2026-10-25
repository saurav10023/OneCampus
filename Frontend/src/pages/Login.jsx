import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarCheck, Check, Eye, EyeOff, Lock, PartyPopper, Sparkles, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, cx } from "../components/Ui";
import { errMsg } from "../api/endpoints";

/* ------------------------------------------------------------------------------------------
   Motion and responsive sizing of the product preview.

   The preview is drawn on a fixed 540 x 400 canvas and scaled with --s. The scale (and whether
   it shows at all) depends on BOTH width and height, so it never pushes the page into a scroll
   on laptops and never looks tiny on big monitors.
------------------------------------------------------------------------------------------ */

const CSS = `
  @keyframes lg-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
  @keyframes lg-drift { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(36px,-24px,0) scale(1.1); } }
  @keyframes lg-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  .lg-float { animation: lg-float 7s ease-in-out infinite; }
  .lg-drift { animation: lg-drift 20s ease-in-out infinite; }
  .lg-up { animation: lg-up .7s cubic-bezier(.22,1,.36,1) both; }

  .lg-prev { --s: .7; display: none; width: calc(540px * var(--s)); height: calc(400px * var(--s)); }
  .lg-prev > div { width: 540px; height: 400px; transform: scale(var(--s)); transform-origin: top left; }
  @media (min-width: 1024px) and (min-height: 740px) { .lg-prev { display: block; } }
  @media (min-width: 1024px) and (min-height: 820px) { .lg-prev { --s: .8; } }
  @media (min-width: 1280px) and (min-height: 820px) { .lg-prev { --s: .88; } }
  @media (min-width: 1280px) and (min-height: 900px) { .lg-prev { --s: 1; } }
  @media (min-width: 1536px) and (min-height: 1000px) { .lg-prev { --s: 1.1; } }

  @media (prefers-reduced-motion: reduce) { .lg-float, .lg-drift, .lg-up { animation: none; } }
`;

/* ------------------------------------------------------------------------------------------
   Background: soft colour fields plus a faded dot grid.
------------------------------------------------------------------------------------------ */

const DOT_MASK = "radial-gradient(ellipse at 50% 45%, #000 25%, transparent 75%)";

const Backdrop = () => (
  <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-gradient-to-b from-[#E9E8FB] via-[#F1F3FC] to-[#EAF2FB]">
    <div className="lg-drift absolute -top-40 -left-32 w-[360px] h-[360px] sm:w-[520px] sm:h-[520px] lg:w-[620px] lg:h-[620px] rounded-full bg-[#5B52EE]/35 blur-[90px] sm:blur-[110px]" />
    <div className="lg-drift absolute top-1/4 -right-40 w-[340px] h-[340px] sm:w-[500px] sm:h-[500px] lg:w-[580px] lg:h-[580px] rounded-full bg-[#2B8DE0]/35 blur-[90px] sm:blur-[110px]" style={{ animationDelay: "-7s" }} />
    <div className="lg-drift absolute -bottom-44 left-1/4 w-[320px] h-[320px] sm:w-[460px] sm:h-[460px] lg:w-[540px] lg:h-[540px] rounded-full bg-fuchsia-400/25 blur-[100px] sm:blur-[120px]" style={{ animationDelay: "-13s" }} />
    <div
      className="absolute inset-0 opacity-60"
      style={{
        backgroundImage: "radial-gradient(rgba(22,24,39,.14) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
        maskImage: DOT_MASK,
        WebkitMaskImage: DOT_MASK,
      }}
    />
  </div>
);

/* ------------------------------------------------------------------------------------------
   Brand
------------------------------------------------------------------------------------------ */

// A small glass pill in the same style as the navbar's controls. The navbar already carries the brand,
// so the page does not repeat the logo.
const Eyebrow = ({ children }) => (
  <span className="inline-flex items-center gap-2 h-9 pl-2 pr-4 rounded-full bg-white/45 border border-white/70 shadow-[inset_0_1px_0_#fff] backdrop-blur-md text-[13px] font-medium text-[#161827]/80">
    <span className="w-5 h-5 rounded-full flex items-center justify-center text-white bg-gradient-to-br from-[#4F46E5] to-[#0EA5E9]">
      <Sparkles className="w-3 h-3" aria-hidden="true" />
    </span>
    {children}
  </span>
);

/* ------------------------------------------------------------------------------------------
   Decorative product preview (desktop only). Sample data, hidden from assistive tech.
------------------------------------------------------------------------------------------ */

const glass =
  "rounded-3xl bg-white/70 backdrop-blur-xl backdrop-saturate-150 border border-white/90 " +
  "shadow-[inset_0_1px_0_#fff,0_30px_60px_-30px_rgba(30,32,70,0.45)]";

const SAMPLE = [
  { time: "09:00", name: "Data Structures", tag: "Present", tone: "bg-emerald-500/12 text-emerald-700 border-emerald-200", bar: "#5B52EE" },
  { time: "10:00", name: "Operating Systems", tag: "Present", tone: "bg-emerald-500/12 text-emerald-700 border-emerald-200", bar: "#2B8DE0" },
  { time: "11:30", name: "Database Lab", tag: "Pending", tone: "bg-[#161827]/6 text-[#6A6F85] border-[#161827]/10", bar: "#14B8A6" },
];

const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;

const Preview = () => (
  <div aria-hidden="true" className="lg-prev select-none">
    <div className="relative">
      {/* today */}
      <div className="absolute left-0 top-3 w-[300px]" style={{ transform: "rotate(-2.5deg)" }}>
        <div className={cx(glass, "lg-float p-4")}>
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold text-[#161827]">Today</p>
            <span className="text-[12px] text-[#6A6F85]">2 of 3 marked</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#161827]/10 mt-2.5 overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0]" />
          </div>
          <div className="mt-3 space-y-2">
            {SAMPLE.map((c) => (
              <div key={c.name} className="flex items-center gap-2.5 rounded-2xl bg-white/70 border border-white/90 px-3 py-2.5">
                <span className="text-[12px] font-semibold text-[#161827] w-10">{c.time}</span>
                <span className="w-1 h-7 rounded-full" style={{ background: c.bar }} />
                <span className="text-[13px] font-medium text-[#161827] flex-1 truncate">{c.name}</span>
                <span className={cx("h-5 px-2 rounded-full border text-[11px] font-medium inline-flex items-center", c.tone)}>{c.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* attendance ring */}
      <div className="absolute right-0 top-24 w-[212px]" style={{ transform: "rotate(2deg)" }}>
        <div className={cx(glass, "lg-float p-4")} style={{ animationDelay: "-2.5s" }}>
          <p className="text-[13px] font-semibold text-[#161827]">Overall attendance</p>
          <div className="flex items-center gap-3 mt-3">
            <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
              <defs>
                <linearGradient id="lg-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#5B52EE" />
                  <stop offset="100%" stopColor="#2B8DE0" />
                </linearGradient>
              </defs>
              <circle cx="42" cy="42" r={RING_R} fill="none" stroke="rgba(22,24,39,.1)" strokeWidth="8" />
              <circle
                cx="42"
                cy="42"
                r={RING_R}
                fill="none"
                stroke="url(#lg-ring)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - 0.82)}
                transform="rotate(-90 42 42)"
              />
              <text x="42" y="47" textAnchor="middle" fontSize="17" fontWeight="600" fill="#161827">82%</text>
            </svg>
            <div>
              <p className="text-[13px] font-semibold text-emerald-600">On track</p>
              <p className="text-[11.5px] text-[#6A6F85] mt-0.5">Target 75%</p>
            </div>
          </div>
        </div>
      </div>

      {/* cancellation chip */}
      <div className="absolute left-10 bottom-2">
        <div className={cx(glass, "lg-float flex items-center gap-3 pl-3 pr-5 py-3")} style={{ animationDelay: "-5s", transform: "rotate(-1deg)" }}>
          <span className="w-9 h-9 rounded-xl bg-fuchsia-500 text-white flex items-center justify-center shrink-0">
            <PartyPopper className="w-[18px] h-[18px]" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-[#161827] whitespace-nowrap">Mass bunk tomorrow</p>
            <p className="text-[11.5px] text-[#6A6F85] whitespace-nowrap">Classes cancelled, percentage unchanged</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const POINTS = [
  "See today's classes and mark them in one tap",
  "Know exactly where you stand against your target",
  "Get schedule changes from your CR automatically",
];

/* ------------------------------------------------------------------------------------------
   Form pieces
------------------------------------------------------------------------------------------ */

// 16px text on phones so iOS doesn't zoom the page when a field is focused.
const Input = ({ id, label, icon: Icon, trailing, hint, ...props }) => (
  <div>
    <label htmlFor={id} className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-1.5 px-1">
      {label}
    </label>
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#6A6F85] pointer-events-none" aria-hidden="true" />
      <input
        id={id}
        {...props}
        className={cx(
          "block w-full h-12 pl-11 rounded-2xl bg-white/70 border border-white/90 shadow-[inset_0_1px_0_#fff]",
          "text-[16px] sm:text-[15px] text-[#161827] placeholder:text-[#6A6F85]/60 transition",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:bg-white",
          trailing ? "pr-12" : "pr-4"
        )}
      />
      {trailing}
    </div>
    {hint && <p className="text-[12.5px] text-[#6A6F85] mt-1.5 px-1">{hint}</p>}
  </div>
);

/* ------------------------------------------------------------------------------------------
   Page
------------------------------------------------------------------------------------------ */

const Login = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || "/dashboard";
  const notice = location.state?.registered ? "Your account is ready. Log in to get started." : "";

  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // The backend detects a 10-digit mobile vs a username from `identifier`.
      await login({ identifier: identifier.trim(), password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(errMsg(err, "We couldn't log you in. Check your details and try again."));
    } finally {
      setLoading(false);
    }
  };

  const watchCaps = (e) => setCapsOn(Boolean(e.getModifierState?.("CapsLock")));

  return (
    <>
      <style>{CSS}</style>
      {/* Fixed behind the whole page, navbar included, so the glass navbar floats over the same backdrop. */}
      <Backdrop />
      <div className="relative z-10 min-h-[calc(100dvh-5rem)] flex items-center">

      {/*
        < 1024px : one centred column (phones, tablets, landscape phones).
        >= 1024px: brand column on the left, form on the right, both vertically centred.
      */}
      <div
        className={cx(
          "w-full max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-8 lg:px-10",
          "py-8 sm:py-12 lg:py-10 [@media(max-height:560px)]:py-4",
          "pb-[max(2rem,env(safe-area-inset-bottom))]",
          "grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-10 lg:gap-14 xl:gap-20 items-center"
        )}
      >
        {/* brand side: desktop only */}
        <section className="hidden lg:flex flex-col items-start max-w-[580px] lg-up">
          <Eyebrow>Your campus, in one place</Eyebrow>
          <h2 className="mt-6 xl:mt-8 text-[clamp(34px,min(4.4vw,6.4vh),56px)] leading-[1.06] font-semibold tracking-tight text-[#161827]">
            Your semester,
            <br />
            <span className="bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0] bg-clip-text text-transparent">always in view.</span>
          </h2>
          <p className="mt-4 text-[15.5px] xl:text-[16px] leading-relaxed text-[#444A63] max-w-md">
            Timetable, attendance and your CR's updates, together in one calm place.
          </p>
          <ul className="mt-6 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[14.5px] leading-snug text-[#161827]/85">
                <span className="mt-px w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-8 xl:mt-10">
            <Preview />
          </div>
        </section>

        {/* form side */}
        <section className="w-full max-w-[420px] sm:max-w-[460px] lg:max-w-[440px] mx-auto lg:mx-0 lg:justify-self-end">
          <div className="lg:hidden flex justify-center mb-5 sm:mb-6 lg-up">
            <Eyebrow>Your campus, in one place</Eyebrow>
          </div>

          <Card className="p-5 min-[380px]:p-6 sm:p-9 bg-white/70 lg-up" style={{ animationDelay: "120ms" }}>
            <span className="hidden lg:flex w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 items-center justify-center">
              <CalendarCheck className="w-6 h-6" aria-hidden="true" />
            </span>
            <h1 className="text-[24px] min-[380px]:text-[26px] sm:text-[28px] font-semibold tracking-tight text-[#161827] leading-tight lg:mt-5">Welcome back</h1>
            <p className="text-[14px] leading-relaxed text-[#6A6F85] mt-1">Log in to see today's classes and your attendance.</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <Alert type="success">{notice}</Alert>
              <Alert type="error">{error}</Alert>

              <Input
                id="identifier"
                label="Username or mobile number"
                icon={User}
                type="text"
                placeholder="yourname or 10-digit mobile"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                required
              />

              <Input
                id="password"
                label="Password"
                icon={Lock}
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={watchCaps}
                onKeyUp={watchCaps}
                autoComplete="current-password"
                enterKeyHint="go"
                required
                hint={capsOn ? "Caps Lock is on." : undefined}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-[#6A6F85] hover:text-[#161827] hover:bg-white/80 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                }
              />

              <Button type="submit" loading={loading} className="w-full !h-12 text-[15px] group">
                {loading ? "Logging in..." : "Log in"}
                {!loading && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />}
              </Button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#161827]/10 text-center">
              <p className="text-[13.5px] text-[#6A6F85]">
                New here?{" "}
                <Link to="/register" className="font-semibold text-indigo-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded">
                  Create an account
                </Link>
              </p>
            </div>
          </Card>
        </section>
      </div>
      </div>
    </>
  );
};

export default Login;
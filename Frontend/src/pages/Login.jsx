import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarCheck, Check, Eye, EyeOff, Lock, PartyPopper, Sparkles, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, cx } from "../components/Ui";
import { errMsg } from "../api/endpoints";

/* ------------------------------------------------------------------------------------------
   Responsive sizing of the product preview, plus one soft entrance.

   The preview is drawn on a fixed 540 x 400 canvas and scaled with --s. The scale (and whether
   it shows at all) depends on BOTH width and height, so it never pushes the page into a scroll
   on laptops and never looks tiny on big monitors.
------------------------------------------------------------------------------------------ */

const CSS = `
  @keyframes lg-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  .lg-up { animation: lg-up .6s cubic-bezier(0.32,0.72,0,1) both; }

  .lg-prev { --s: .7; display: none; width: calc(540px * var(--s)); height: calc(400px * var(--s)); }
  .lg-prev > div { width: 540px; height: 400px; transform: scale(var(--s)); transform-origin: top left; }
  @media (min-width: 1024px) and (min-height: 740px) { .lg-prev { display: block; } }
  @media (min-width: 1024px) and (min-height: 820px) { .lg-prev { --s: .8; } }
  @media (min-width: 1280px) and (min-height: 820px) { .lg-prev { --s: .88; } }
  @media (min-width: 1280px) and (min-height: 900px) { .lg-prev { --s: 1; } }
  @media (min-width: 1536px) and (min-height: 1000px) { .lg-prev { --s: 1.1; } }

  @media (prefers-reduced-motion: reduce) { .lg-up { animation: none; } }
`;

/* ------------------------------------------------------------------------------------------
   Brand chip (soft indigo tag). The navbar already carries the logo, so the page does not repeat it.
------------------------------------------------------------------------------------------ */

const Eyebrow = ({ children }) => (
  <span className="inline-flex items-center gap-2 h-8 px-3.5 rounded-full bg-[#EEF2FF] border border-indigo-100 text-[13px] font-medium text-indigo-700">
    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
    {children}
  </span>
);

/* ------------------------------------------------------------------------------------------
   Decorative product preview (desktop only). Sample data, hidden from assistive tech.
------------------------------------------------------------------------------------------ */

const flat = "rounded-2xl bg-[color:var(--surface)] border border-[color:var(--line)] shadow-[0_1px_2px_rgba(27,31,51,0.04)]";

const SAMPLE = [
  { time: "09:00", name: "Data Structures", tag: "Present", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "#4F46E5" },
  { time: "10:00", name: "Operating Systems", tag: "Present", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "#0EA5E9" },
  { time: "11:30", name: "Database Lab", tag: "Pending", tone: "bg-[color:var(--inset)] text-[color:var(--muted)] border-[color:var(--line)]", bar: "#10B981" },
];

const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;

const Preview = () => (
  <div aria-hidden="true" className="lg-prev select-none">
    <div className="relative">
      {/* today */}
      <div className="absolute left-0 top-3 w-[300px]">
        <div className={cx(flat, "p-4")}>
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold text-[color:var(--ink)]">Today</p>
            <span className="text-[12px] text-[color:var(--muted)] tabular-nums">2 of 3 marked</span>
          </div>
          <div className="h-1.5 rounded-full bg-[color:var(--track)] mt-2.5 overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-[#4F46E5]" />
          </div>
          <div className="mt-3 space-y-2">
            {SAMPLE.map((c) => (
              <div key={c.name} className="flex items-center gap-2.5 rounded-xl bg-[color:var(--inset)] px-3 py-2.5">
                <span className="text-[12px] font-semibold text-[color:var(--ink)] w-10 tabular-nums">{c.time}</span>
                <span className="w-1 h-7 rounded-full" style={{ background: c.bar }} />
                <span className="text-[13px] font-medium text-[color:var(--ink)] flex-1 truncate">{c.name}</span>
                <span className={cx("h-5 px-2 rounded-full border text-[11px] font-medium inline-flex items-center", c.tone)}>{c.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* attendance ring */}
      <div className="absolute right-0 top-24 w-[212px]">
        <div className={cx(flat, "p-4")}>
          <p className="text-[13px] font-semibold text-[color:var(--ink)]">Overall attendance</p>
          <div className="flex items-center gap-3 mt-3">
            <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
              <circle cx="42" cy="42" r={RING_R} fill="none" stroke="#E9ECF3" strokeWidth="8" />
              <circle
                cx="42"
                cy="42"
                r={RING_R}
                fill="none"
                stroke="#10B981"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - 0.82)}
                transform="rotate(-90 42 42)"
              />
              <text x="42" y="47" textAnchor="middle" fontSize="17" fontWeight="600" fill="#1B1F33">82%</text>
            </svg>
            <div>
              <p className="text-[13px] font-semibold text-emerald-700">On track</p>
              <p className="text-[11.5px] text-[color:var(--muted)] mt-0.5">Target 75%</p>
            </div>
          </div>
        </div>
      </div>

      {/* cancellation note (frosted chip) */}
      <div className="absolute left-10 bottom-2">
        <div className="flex items-center gap-3 pl-3 pr-5 py-3 rounded-2xl bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] backdrop-blur-md border border-[color:var(--line)]">
          <span className="w-9 h-9 rounded-xl bg-violet-500 text-white flex items-center justify-center shrink-0">
            <PartyPopper className="w-[18px] h-[18px]" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-[color:var(--ink)] whitespace-nowrap">Mass bunk tomorrow</p>
            <p className="text-[11.5px] text-[color:var(--muted)] whitespace-nowrap">Classes cancelled, percentage unchanged</p>
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

// 16px text on phones so iOS doesn't zoom the page when a field is focused. 44px high, 12px radius.
const Input = ({ id, label, icon: Icon, trailing, hint, ...props }) => (
  <div>
    <label htmlFor={id} className="block text-[13px] font-medium text-[color:var(--body)] mb-1.5">
      {label}
    </label>
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[color:var(--faint)] pointer-events-none" aria-hidden="true" />
      <input
        id={id}
        {...props}
        className={cx(
          "block w-full h-11 pl-10 rounded-xl bg-[color:var(--surface)] border border-[color:var(--line)]",
          "text-[16px] sm:text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--faint)] transition-colors",
          "hover:border-[color:var(--line-strong)] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25",
          trailing ? "pr-12" : "pr-4"
        )}
      />
      {trailing}
    </div>
    {hint && <p className="text-[12.5px] text-[color:var(--muted)] mt-1.5">{hint}</p>}
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
      <div className="min-h-[calc(100dvh-5rem)] flex items-center">
        {/*
          < 1024px : one centred column (phones, tablets, landscape phones).
          >= 1024px: brand column on the left, form on the right, both vertically centred.
        */}
        <div
          className={cx(
            "w-full max-w-6xl 2xl:max-w-7xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 lg:px-10",
            "py-8 sm:py-12 lg:py-10 [@media(max-height:560px)]:py-4",
            "pb-[max(2rem,env(safe-area-inset-bottom))]",
            "grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-10 lg:gap-14 xl:gap-20 items-center"
          )}
        >
          {/* brand side: desktop only */}
          <section className="hidden lg:flex flex-col items-start max-w-[580px] lg-up">
            <Eyebrow>Your campus, in one place</Eyebrow>
            <h2 className="mt-6 xl:mt-8 text-[clamp(34px,min(4.4vw,6.4vh),56px)] leading-[1.08] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">
              Your semester, always in view.
            </h2>
            <p className="mt-4 text-[15px] xl:text-[15.5px] leading-relaxed text-[color:var(--body)] max-w-md">
              Timetable, attendance and your CR's updates, together in one calm place.
            </p>
            <ul className="mt-6 space-y-3">
              {POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[14.5px] leading-snug text-[color:var(--body)]">
                  <span className="mt-px w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
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

            <Card className="p-4 min-[380px]:p-5 sm:p-8 lg-up" style={{ animationDelay: "120ms" }}>
              <span className="hidden lg:flex w-12 h-12 rounded-xl bg-indigo-50 text-[#4F46E5] items-center justify-center">
                <CalendarCheck className="w-6 h-6" aria-hidden="true" />
              </span>
              <h1 className="text-[24px] sm:text-[26px] font-semibold tracking-tight text-[color:var(--ink)] leading-tight lg:mt-5">Welcome back</h1>
              <p className="text-[14px] leading-relaxed text-[color:var(--muted)] mt-1">Log in to see today's classes and your attendance.</p>

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
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--ink)] hover:bg-[color:var(--inset)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                    </button>
                  }
                />

                <Button type="submit" loading={loading} className="w-full !h-11 text-[15px]">
                  {loading ? "Logging in..." : "Log in"}
                  {!loading && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                </Button>
              </form>

              <div className="mt-6 pt-5 border-t border-[color:var(--line-soft)] text-center">
                <p className="text-[13.5px] text-[color:var(--muted)]">
                  New here?{" "}
                  <Link to="/register" className="font-semibold text-[#4F46E5] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded">
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
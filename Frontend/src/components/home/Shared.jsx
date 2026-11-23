import { cx } from "../Ui";

/* Change these if your routes differ. */
export const ROUTES = {
  dashboard: "/dashboard", attendance: "/attendance", calendar: "/calendar", official: "/official",
  setup: "/onboarding/setup", crStudio: "/cr-studio", crRequest: "/cr-studio", register: "/register", login: "/login",
};

/* ---------- layout primitives ---------- */
export const Card = ({ className, ...p }) => <div className={cx("lg", className)} {...p} />;
export const Glass = ({ className, ...p }) => <div className={cx("lq", className)} {...p} />;

export const Title = ({ children, right }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
    <h2 className="text-[16px] sm:text-[17px] font-semibold tracking-tight text-[color:var(--ink)]">{children}</h2>
    {right}
  </div>
);

/* ---------- shared class strings (44px touch targets on phones, compact on desktop) ----------
   Style: solid indigo for the main action, light frosted surface with a hairline border for the rest.
   Every colour is a theme token, so light and dark both come from index.css. */
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1";
const SOFT = "bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] backdrop-blur-md border border-[color:var(--line)] text-[color:var(--ink)] hover:bg-[color:var(--surface)] hover:border-[color:var(--line-strong)] transition-colors";
export const linkBase =
  "inline-flex w-full min-[420px]:w-auto items-center justify-center gap-2 h-12 sm:h-11 px-6 rounded-xl text-[14.5px] font-medium active:scale-[0.98] " + FOCUS;
export const linkPrimary = "bg-[color:var(--accent)] border border-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] transition-colors";
export const linkGlass = SOFT;
export const ghost = cx(SOFT, "inline-flex items-center gap-1.5 h-11 sm:h-9 min-w-11 sm:min-w-10 justify-center px-3.5 rounded-xl text-[13px] font-medium", FOCUS);
export const glassGhost = ghost;
export const H2 = "text-[22px] sm:text-[28px] font-semibold tracking-tight leading-[1.15] text-[color:var(--ink)]";

/* ---------- date helpers (setup dates arrive as plain YYYY-MM-DD) ---------- */
export const pad = (n) => String(n).padStart(2, "0");
export const local = (s) => new Date(`${s}T00:00:00`);
export const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const fmtLong = (s) => local(s).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
export const fmtShort = (s) => local(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const dayName = (d, f = "short") => local(d).toLocaleDateString("en-IN", { weekday: f });
export const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
export const mins = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
export const tone = { holiday: "red", exam: "brand", quiz: "brand", event: "green" };

export const MAX_OFF = 60;
export const LOOKAHEAD = 14;
import { useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  AtSign,
  BookOpen,
  Building2,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  Lock,
  Mail,
  Phone,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, cx } from "../components/Ui";
import { errMsg } from "../api/endpoints";

/* ------------------------------------------------------------------------------------------
   Options for the class fields.
   These mirror DEFAULT_COLLEGE, BRANCHES and SECTIONS in the backend's src/utils/constants.js.
   The backend file is temporary for branches and sections (they move to CollegeAcademicConfig),
   so when that endpoint exists, replace these three lines with data fetched from it.
------------------------------------------------------------------------------------------ */

const COLLEGES = ["BIT Mesra, Ranchi"];
const BRANCHES = ["CSE", "IT", "ECE", "EEE", "ME", "CE"];
const SECTIONS = ["A", "B", "C", "D"];

/* ------------------------------------------------------------------------------------------
   Motion and responsive sizing of the decorative preview (same approach as the Login page).
   The preview is drawn on a fixed 480 x 230 canvas and scaled with --s by width AND height.
------------------------------------------------------------------------------------------ */

const CSS = `
  @keyframes rg-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  @keyframes rg-drift { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(36px,-24px,0) scale(1.1); } }
  @keyframes rg-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @keyframes rg-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .rg-float { animation: rg-float 7s ease-in-out infinite; }
  .rg-drift { animation: rg-drift 20s ease-in-out infinite; }
  .rg-up { animation: rg-up .7s cubic-bezier(.22,1,.36,1) both; }
  .rg-pop { animation: rg-pop .25s ease-out both; }

  .rg-prev { --s: .8; display: none; width: calc(480px * var(--s)); height: calc(230px * var(--s)); }
  .rg-prev > div { width: 480px; height: 230px; transform: scale(var(--s)); transform-origin: top left; }
  @media (min-width: 1024px) and (min-height: 720px) { .rg-prev { display: block; } }
  @media (min-width: 1280px) { .rg-prev { --s: .95; } }
  @media (min-width: 1536px) and (min-height: 1000px) { .rg-prev { --s: 1.1; } }

  @media (prefers-reduced-motion: reduce) { .rg-float, .rg-drift, .rg-up, .rg-pop { animation: none; } }
`;

const DOT_MASK = "radial-gradient(ellipse at 50% 40%, #000 25%, transparent 75%)";

const Backdrop = () => (
  <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-gradient-to-b from-[#E9E8FB] via-[#F1F3FC] to-[#EAF2FB]">
    <div className="rg-drift absolute -top-40 -left-32 w-[360px] h-[360px] sm:w-[520px] sm:h-[520px] lg:w-[620px] lg:h-[620px] rounded-full bg-[#5B52EE]/35 blur-[90px] sm:blur-[110px]" />
    <div className="rg-drift absolute top-1/3 -right-40 w-[340px] h-[340px] sm:w-[500px] sm:h-[500px] lg:w-[580px] lg:h-[580px] rounded-full bg-[#2B8DE0]/35 blur-[90px] sm:blur-[110px]" style={{ animationDelay: "-7s" }} />
    <div className="rg-drift absolute -bottom-44 left-1/4 w-[320px] h-[320px] sm:w-[460px] sm:h-[460px] lg:w-[540px] lg:h-[540px] rounded-full bg-fuchsia-400/25 blur-[100px] sm:blur-[120px]" style={{ animationDelay: "-13s" }} />
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

const glass =
  "rounded-3xl bg-white/70 backdrop-blur-xl backdrop-saturate-150 border border-white/90 " +
  "shadow-[inset_0_1px_0_#fff,0_30px_60px_-30px_rgba(30,32,70,0.45)]";

// Decorative only: shows what students get once they join. Sample data, hidden from assistive tech.
const Preview = () => (
  <div aria-hidden="true" className="rg-prev select-none">
    <div className="relative">
      <div className="absolute left-0 top-2 w-[330px]" style={{ transform: "rotate(-2deg)" }}>
        <div className={cx(glass, "rg-float p-4")}>
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-500/12 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-[#161827]">Your class schedule is ready</p>
              <p className="text-[12px] text-[#6A6F85] mt-0.5">CSE - Section A - Semester 5</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            {["7 subjects", "34 classes a week", "Synced with CR"].map((t) => (
              <span key={t} className="h-6 px-2.5 rounded-full bg-white/80 border border-white text-[11px] font-medium text-[#444A63] inline-flex items-center whitespace-nowrap">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute right-0 bottom-0 w-[210px]" style={{ transform: "rotate(2deg)" }}>
        <div className={cx(glass, "rg-float p-4")} style={{ animationDelay: "-3s" }}>
          <p className="text-[12px] text-[#6A6F85]">Attendance target</p>
          <div className="flex items-end justify-between mt-1">
            <p className="text-[26px] font-semibold text-[#161827] leading-none">75%</p>
            <span className="text-[12px] font-medium text-emerald-600">On track</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#161827]/10 mt-3 overflow-hidden">
            <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0]" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const STEPS = [
  { title: "Create your account", text: "Tell us who you are and which class you are in." },
  { title: "Set up your semester", text: "Add your semester dates and attendance target." },
  { title: "Join your class schedule", text: "Pick the schedule your CR published, or add classes yourself." },
];

/* ------------------------------------------------------------------------------------------
   Form pieces
------------------------------------------------------------------------------------------ */

const labelCls = "text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85]";

const fieldBase =
  "block w-full h-12 rounded-2xl bg-white/70 border shadow-[inset_0_1px_0_#fff] " +
  "text-[16px] sm:text-[15px] transition focus:outline-none focus:ring-2 focus:bg-white";

// 16px text on phones so iOS doesn't zoom the page when a field is focused.
const Input = ({ id, label, optional, icon: Icon, trailing, hint, error, wrapClass, ...props }) => {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={wrapClass}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 mb-1.5 px-1">
        <span className={labelCls}>{label}</span>
        {optional && <span className="text-[11.5px] text-[#6A6F85]/80">Optional</span>}
      </label>
      <div className="relative">
        {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#6A6F85] pointer-events-none" aria-hidden="true" />}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
          className={cx(
            fieldBase,
            "text-[#161827] placeholder:text-[#6A6F85]/60",
            Icon ? "pl-11" : "pl-4",
            trailing ? "pr-12" : "pr-4",
            error ? "border-[#F3B8C2] focus:ring-rose-400/40" : "border-white/90 focus:ring-indigo-500/40"
          )}
        />
        {trailing}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-[12.5px] text-[#A32A42] mt-1.5 px-1">{error}</p>
      ) : (
        hint && <p id={`${id}-hint`} className="text-[12.5px] text-[#6A6F85] mt-1.5 px-1">{hint}</p>
      )}
    </div>
  );
};

// Native <select> so phones open their own picker. Styled to match Input, with a custom chevron.
const Select = ({ id, label, icon: Icon, options, placeholder, hint, wrapClass, value, ...props }) => (
  <div className={wrapClass}>
    <label htmlFor={id} className="block mb-1.5 px-1">
      <span className={labelCls}>{label}</span>
    </label>
    <div className="relative">
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#6A6F85] pointer-events-none" aria-hidden="true" />}
      <select
        id={id}
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
        className={cx(
          fieldBase,
          "appearance-none cursor-pointer border-white/90 focus:ring-indigo-500/40 truncate",
          Icon ? "pl-11" : "pl-4",
          "pr-11",
          value ? "text-[#161827]" : "text-[#6A6F85]/70"
        )}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} className="text-[#161827]">{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#6A6F85] pointer-events-none" aria-hidden="true" />
    </div>
    {hint && <p id={`${id}-hint`} className="text-[12.5px] text-[#6A6F85] mt-1.5 px-1">{hint}</p>}
  </div>
);

// Section is a short list, so one tap on a chip is faster than opening a dropdown.
const SectionPicker = ({ value, onChange, options, wrapClass }) => (
  <div className={wrapClass}>
    <span id="section-label" className={cx(labelCls, "block mb-1.5 px-1")}>Section</span>
    <div role="radiogroup" aria-labelledby="section-label" className="flex gap-2">
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            className={cx(
              "flex-1 h-12 rounded-2xl border text-[15px] font-semibold transition",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
              on
                ? "text-white border-transparent bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/30"
                : "bg-white/70 border-white/90 text-[#444A63] shadow-[inset_0_1px_0_#fff] hover:bg-white hover:text-[#161827]"
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  </div>
);

const SectionTitle = ({ children, note }) => (
  <div className="flex items-center gap-3 sm:col-span-2">
    <h2 className="text-[13px] font-semibold text-[#161827] whitespace-nowrap">{children}</h2>
    <span className="h-px flex-1 bg-[#161827]/10" aria-hidden="true" />
    {note && <span className="text-[12px] text-[#6A6F85] hidden sm:inline">{note}</span>}
  </div>
);

// Size of the password only, never a promise of security.
const strengthOf = (pw) => {
  if (!pw) return { level: 0, label: "" };
  if (pw.length < 8) return { level: 1, label: "Too short" };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 12 && kinds >= 3) return { level: 4, label: "Strong" };
  if (pw.length >= 10 || kinds >= 3) return { level: 3, label: "Good" };
  return { level: 2, label: "Okay" };
};
const STRENGTH_COLOR = ["", "bg-rose-500", "bg-amber-500", "bg-emerald-400", "bg-emerald-500"];

/* ------------------------------------------------------------------------------------------
   Fields. Match POST /users/register
------------------------------------------------------------------------------------------ */

const ABOUT = [
  { name: "fullName", label: "Full name", type: "text", placeholder: "Saurav Kumar", required: true, icon: User, autoComplete: "name" },
  { name: "username", label: "Username", type: "text", placeholder: "saurav_23", required: true, icon: AtSign, autoComplete: "username", hint: "You can log in with this or your mobile number." },
  { name: "mobile", label: "Mobile number", type: "tel", placeholder: "9876543210", required: true, icon: Phone, autoComplete: "tel-national", inputMode: "numeric", hint: "10 digits. A +91 prefix is fine." },
  { name: "email", label: "Email", type: "email", placeholder: "you@example.com", optional: true, icon: Mail, autoComplete: "email" },
];

const ROLL = { name: "rollNo", label: "Roll number", type: "text", placeholder: "2023UGCS001", optional: true, wide: true, icon: Hash, autoComplete: "off" };

const TEXT_FIELDS = [...ABOUT, ROLL];

const normMobile = (v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91)(?=\d{10}$)/, "");

/* ------------------------------------------------------------------------------------------
   Page
------------------------------------------------------------------------------------------ */

const Register = () => {
  const { user, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(TEXT_FIELDS.map((f) => [f.name, ""])),
    college: COLLEGES.length === 1 ? COLLEGES[0] : "",
    branch: "",
    section: "",
  }));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mobileTouched, setMobileTouched] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const alertRef = useRef(null);

  if (user) return <Navigate to="/dashboard" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setValue = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Show the message and bring it into view, since the submit button can be far below it on phones.
  const fail = (msg) => {
    setError(msg);
    requestAnimationFrame(() => alertRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return false;
  };

  const mobile = normMobile(form.mobile);
  const mobileBad = mobileTouched && form.mobile !== "" && !/^\d{10}$/.test(mobile);
  const strength = strengthOf(password);
  const mismatch = confirm !== "" && password !== confirm;
  const classPicked = form.college && form.branch && form.section;

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!/^\d{10}$/.test(mobile)) return fail("Enter a valid 10-digit mobile number.");
    if (!form.college) return fail("Select your college.");
    if (!form.branch) return fail("Select your branch.");
    if (!form.section) return fail("Select your section.");
    if (password.length < 8) return fail("Your password must be at least 8 characters.");
    if (password !== confirm) return fail("The two passwords don't match. Please re-enter them.");

    const payload = { password, mobile, college: form.college, branch: form.branch, section: form.section };
    TEXT_FIELDS.forEach(({ name }) => {
      const v = form[name].trim();
      if (name !== "mobile" && v) payload[name] = v;
    });

    setLoading(true);
    try {
      await register(payload);
      navigate("/login", { replace: true, state: { registered: true } });
    } catch (err) {
      fail(errMsg(err, "We couldn't create your account. Please check your details and try again."));
    } finally {
      setLoading(false);
    }
  };

  const renderField = (f) => {
    const textOnly = f.name === "username" || f.name === "email";
    return (
      <Input
        key={f.name}
        id={f.name}
        name={f.name}
        label={f.label}
        optional={f.optional}
        icon={f.icon}
        type={f.type}
        placeholder={f.placeholder}
        value={form[f.name]}
        onChange={set(f.name)}
        onBlur={f.name === "mobile" ? () => setMobileTouched(true) : undefined}
        required={f.required}
        autoComplete={f.autoComplete}
        inputMode={f.inputMode}
        autoCapitalize={textOnly ? "none" : undefined}
        autoCorrect={textOnly ? "off" : undefined}
        spellCheck={textOnly ? false : undefined}
        hint={f.hint}
        error={f.name === "mobile" && mobileBad ? "Enter a 10-digit mobile number, for example 9876543210." : undefined}
        wrapClass={f.wide ? "sm:col-span-2" : undefined}
      />
    );
  };

  const eye = (
    <button
      type="button"
      onClick={() => setShowPassword((s) => !s)}
      aria-label={showPassword ? "Hide passwords" : "Show passwords"}
      aria-pressed={showPassword}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-[#6A6F85] hover:text-[#161827] hover:bg-white/80 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
    >
      {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
    </button>
  );

  return (
    <>
      <style>{CSS}</style>
      {/* Fixed behind the whole page, navbar included, so the glass navbar floats over the same backdrop. */}
      <Backdrop />
      <div className="relative z-10 min-h-[calc(100dvh-5rem)] flex items-center">

      {/*
        < 1024px : one centred column.
        >= 1024px: sticky brand column on the left, the longer form on the right.
      */}
      <div
        className={cx(
          "w-full max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-8 lg:px-10",
          "py-8 sm:py-12 lg:py-12",
          "pb-[max(2rem,env(safe-area-inset-bottom))]",
          "grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-14 xl:gap-20 items-start"
        )}
      >
        {/* brand side: desktop only */}
        <section className="hidden lg:flex flex-col items-start max-w-[520px] lg:sticky lg:top-28 rg-up">
          <Eyebrow>Join OneCampus</Eyebrow>
          <h2 className="mt-6 xl:mt-8 text-[clamp(32px,min(4vw,6vh),52px)] leading-[1.07] font-semibold tracking-tight text-[#161827]">
            Join your class
            <br />
            <span className="bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0] bg-clip-text text-transparent">in about a minute.</span>
          </h2>
          <p className="mt-4 text-[15.5px] xl:text-[16px] leading-relaxed text-[#444A63] max-w-md">
            Make one account and your timetable, attendance and CR updates are ready to go.
          </p>

          <ol className="mt-7 space-y-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span
                    className={cx(
                      "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0",
                      i === 0 ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/30" : "bg-white/80 border border-white text-[#6A6F85]"
                    )}
                  >
                    {i + 1}
                  </span>
                  {i < STEPS.length - 1 && <span className="w-px flex-1 mt-1.5 bg-[#161827]/12 min-h-[14px]" aria-hidden="true" />}
                </div>
                <div className="pb-1">
                  <p className="text-[14.5px] font-semibold text-[#161827] leading-8">
                    {s.title}
                    {i === 0 && <span className="ml-2 align-middle text-[11px] font-medium text-indigo-700 bg-indigo-500/10 border border-indigo-200 rounded-full px-2 py-0.5">You are here</span>}
                  </p>
                  <p className="text-[13.5px] text-[#6A6F85] leading-snug -mt-0.5 max-w-[22rem]">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8">
            <Preview />
          </div>
        </section>

        {/* form side */}
        <section className="w-full max-w-[520px] sm:max-w-[600px] lg:max-w-[600px] mx-auto lg:mx-0 lg:justify-self-end">
          <div className="lg:hidden flex justify-center mb-5 sm:mb-6 rg-up">
            <Eyebrow>Join OneCampus</Eyebrow>
          </div>

          <Card className="p-5 min-[380px]:p-6 sm:p-9 bg-white/70 rg-up" style={{ animationDelay: "120ms" }}>
            <span className="hidden lg:flex w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 items-center justify-center">
              <CalendarCheck className="w-6 h-6" aria-hidden="true" />
            </span>
            <h1 className="text-[24px] min-[380px]:text-[26px] sm:text-[28px] font-semibold tracking-tight text-[#161827] leading-tight lg:mt-5">Create your account</h1>
            <p className="text-[14px] leading-relaxed text-[#6A6F85] mt-1">Pick your college, branch and section and we will find your class schedule.</p>

            <form onSubmit={submit} className="mt-6 space-y-6">
              <div ref={alertRef} className="scroll-mt-28">
                <Alert type="error">{error}</Alert>
              </div>

              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-4">
                <SectionTitle>About you</SectionTitle>
                {ABOUT.map(renderField)}
              </div>

              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-4">
                <SectionTitle note="Used to match your class schedule">Your class</SectionTitle>

                <Select
                  id="college"
                  name="college"
                  label="College"
                  icon={Building2}
                  options={COLLEGES}
                  placeholder="Select your college"
                  value={form.college}
                  onChange={set("college")}
                  required
                  autoComplete="organization"
                  wrapClass="sm:col-span-2"
                />

                <Select
                  id="branch"
                  name="branch"
                  label="Branch"
                  icon={BookOpen}
                  options={BRANCHES}
                  placeholder="Select your branch"
                  value={form.branch}
                  onChange={set("branch")}
                  required
                  autoComplete="off"
                />

                <SectionPicker value={form.section} onChange={setValue("section")} options={SECTIONS} />

                {classPicked && (
                  <p className="rg-pop sm:col-span-2 flex items-start gap-2 rounded-2xl bg-indigo-500/[0.07] border border-indigo-200/70 px-3.5 py-2.5 text-[13px] leading-snug text-[#444A63]" aria-live="polite">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-indigo-600" aria-hidden="true" />
                    <span>
                      We will look for the <strong className="font-semibold text-[#161827]">{form.branch} Section {form.section}</strong> schedule at {form.college}.
                    </span>
                  </p>
                )}

                {renderField(ROLL)}
              </div>

              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-4">
                <SectionTitle>Password</SectionTitle>
                <div>
                  <Input
                    id="password"
                    label="Password"
                    icon={Lock}
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    trailing={eye}
                  />
                  {password && (
                    <div className="mt-2 px-1" aria-live="polite">
                      <div className="flex gap-1.5" aria-hidden="true">
                        {[1, 2, 3, 4].map((n) => (
                          <span key={n} className={cx("h-1.5 flex-1 rounded-full transition-colors", n <= strength.level ? STRENGTH_COLOR[strength.level] : "bg-[#161827]/10")} />
                        ))}
                      </div>
                      <p className="text-[12px] text-[#6A6F85] mt-1">Password length: {strength.label}</p>
                    </div>
                  )}
                </div>

                <div>
                  <Input
                    id="confirm"
                    label="Confirm password"
                    icon={KeyRound}
                    type={showPassword ? "text" : "password"}
                    placeholder="Type it again"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    error={mismatch ? "These passwords don't match yet." : undefined}
                  />
                  {confirm && !mismatch && (
                    <p className="flex items-center gap-1.5 text-[12.5px] text-emerald-600 mt-1.5 px-1">
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      Passwords match
                    </p>
                  )}
                </div>
              </div>

              <Button type="submit" loading={loading} className="w-full !h-12 text-[15px] group">
                {loading ? "Creating your account..." : "Create account"}
                {!loading && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />}
              </Button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#161827]/10 text-center">
              <p className="text-[13.5px] text-[#6A6F85]">
                Already registered?{" "}
                <Link to="/login" className="font-semibold text-indigo-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded">
                  Log in
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

export default Register;
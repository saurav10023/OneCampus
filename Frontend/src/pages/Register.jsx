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
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, cx } from "../components/Ui";
import { errMsg } from "../api/endpoints";
import "../styles/tones";

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
   One soft entrance, and responsive sizing of the decorative preview (same approach as Login).
   The preview is drawn on a fixed 480 x 230 canvas and scaled with --s by width AND height.
------------------------------------------------------------------------------------------ */

const CSS = `
  @keyframes rg-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @keyframes rg-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .rg-up { animation: rg-up .6s cubic-bezier(0.32,0.72,0,1) both; }
  .rg-pop { animation: rg-pop .25s cubic-bezier(0.32,0.72,0,1) both; }

  .rg-prev { --s: .8; display: none; width: calc(480px * var(--s)); height: calc(230px * var(--s)); }
  .rg-prev > div { width: 480px; height: 230px; transform: scale(var(--s)); transform-origin: top left; }
  @media (min-width: 1024px) and (min-height: 720px) { .rg-prev { display: block; } }
  @media (min-width: 1280px) { .rg-prev { --s: .95; } }
  @media (min-width: 1536px) and (min-height: 1000px) { .rg-prev { --s: 1.1; } }

  @media (prefers-reduced-motion: reduce) { .rg-up, .rg-pop { animation: none; } }
`;

const FOCUS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)]";

// Soft indigo tag. The navbar already carries the brand, so the page does not repeat the logo.
const Eyebrow = ({ children }) => (
  <span className="tn tn-brand tn-soft inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-[13px] font-medium">
    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
    {children}
  </span>
);

const flat = "rounded-2xl bg-[color:var(--surface)] border border-[color:var(--line)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]";

// Decorative only: shows what students get once they join. Sample data, hidden from assistive tech.
const Preview = () => (
  <div aria-hidden="true" className="rg-prev select-none">
    <div className="relative">
      <div className="absolute left-0 top-2 w-[330px]">
        <div className={cx(flat, "p-4")}>
          <div className="flex items-start gap-3">
            <span className="tn tn-ok tn-soft w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-[color:var(--ink)]">Your class schedule is ready</p>
              <p className="text-[12px] text-[color:var(--muted)] mt-0.5">CSE - Section A - Semester 5</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            {["7 subjects", "34 classes a week", "Synced with CR"].map((t) => (
              <span key={t} className="h-6 px-2.5 rounded-full bg-[color:var(--inset)] border border-[color:var(--line)] text-[11px] font-medium text-[color:var(--body)] inline-flex items-center whitespace-nowrap">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute right-0 bottom-0 w-[210px]">
        <div className={cx(flat, "p-4")}>
          <p className="text-[12px] text-[color:var(--muted)]">Attendance target</p>
          <div className="flex items-end justify-between mt-1">
            <p className="text-[26px] font-semibold text-[color:var(--ink)] leading-none tabular-nums">75%</p>
            <span className="tn tn-ok tn-text text-[12px] font-medium">On track</span>
          </div>
          <div className="h-1.5 rounded-full bg-[color:var(--track)] mt-3 overflow-hidden">
            <div className="tn tn-ok tn-dot h-full w-[82%] rounded-full" />
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

const labelCls = "text-[13px] font-medium text-[color:var(--body)]";

// 44px high, 12px radius. 16px text on phones so iOS doesn't zoom the page when a field is focused.
const fieldBase =
  "block w-full h-11 rounded-xl bg-[color:var(--surface)] border text-[16px] sm:text-[14px] transition-colors hover:border-[color:var(--line-strong)] " +
  "focus:outline-none focus:ring-2";

const Input = ({ id, label, optional, icon: Icon, trailing, hint, error, wrapClass, ...props }) => {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={wrapClass}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className={labelCls}>{label}</span>
        {optional && <span className="text-[12px] text-[color:var(--muted)]">Optional</span>}
      </label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[color:var(--faint)] pointer-events-none" aria-hidden="true" />}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
          className={cx(
            fieldBase,
            "text-[color:var(--ink)] placeholder:text-[color:var(--faint)]",
            Icon ? "pl-10" : "pl-3.5",
            trailing ? "pr-12" : "pr-3.5",
            error ? "border-rose-400 focus:border-rose-400 focus:ring-rose-400/25" : "border-[color:var(--line)] focus:border-indigo-400 focus:ring-indigo-500/25"
          )}
        />
        {trailing}
      </div>
      {error ? (
        <p id={`${id}-error`} className="tn tn-bad tn-text text-[12.5px] mt-1.5">{error}</p>
      ) : (
        hint && <p id={`${id}-hint`} className="text-[12.5px] text-[color:var(--muted)] mt-1.5">{hint}</p>
      )}
    </div>
  );
};

// Native <select> so phones open their own picker. Styled to match Input, with a custom chevron.
const Select = ({ id, label, icon: Icon, options, placeholder, hint, wrapClass, value, ...props }) => (
  <div className={wrapClass}>
    <label htmlFor={id} className="block mb-1.5">
      <span className={labelCls}>{label}</span>
    </label>
    <div className="relative">
      {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[color:var(--faint)] pointer-events-none" aria-hidden="true" />}
      <select
        id={id}
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
        className={cx(
          fieldBase,
          "appearance-none cursor-pointer border-[color:var(--line)] focus:border-indigo-400 focus:ring-indigo-500/25 truncate",
          Icon ? "pl-10" : "pl-3.5",
          "pr-10",
          value ? "text-[color:var(--ink)]" : "text-[color:var(--faint)]"
        )}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[color:var(--faint)] pointer-events-none" aria-hidden="true" />
    </div>
    {hint && <p id={`${id}-hint`} className="text-[12.5px] text-[color:var(--muted)] mt-1.5">{hint}</p>}
  </div>
);

// Section is a short list, so one tap on a chip is faster than opening a dropdown.
const SectionPicker = ({ value, onChange, options, wrapClass }) => (
  <div className={wrapClass}>
    <span id="section-label" className={cx(labelCls, "block mb-1.5")}>Section</span>
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
              "flex-1 h-11 rounded-xl border text-[15px] font-semibold transition-colors active:scale-[0.98]",
              FOCUS,
              on
                ? "ac-btn border-transparent shadow-sm"
                : "bg-[color:var(--surface)] border-[color:var(--line)] text-[color:var(--body)] hover:bg-[color:var(--inset)] hover:border-[color:var(--line-strong)]"
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
    <h2 className="text-[14px] font-semibold text-[color:var(--ink)] whitespace-nowrap">{children}</h2>
    <span className="h-px flex-1 bg-[color:var(--line-soft)]" aria-hidden="true" />
    {note && <span className="text-[12px] text-[color:var(--muted)] hidden sm:inline">{note}</span>}
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
      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--ink)] hover:bg-[color:var(--inset)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
    </button>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="min-h-[calc(100dvh-5rem)] flex items-center">
        {/*
          < 1024px : one centred column.
          >= 1024px: sticky brand column on the left, the longer form on the right.
        */}
        <div
          className={cx(
            "w-full max-w-6xl 2xl:max-w-7xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 lg:px-10",
            "py-8 sm:py-12 lg:py-12",
            "pb-[max(2rem,env(safe-area-inset-bottom))]",
            "grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-14 xl:gap-20 items-start"
          )}
        >
          {/* brand side: desktop only */}
          <section className="hidden lg:flex flex-col items-start max-w-[520px] lg:sticky lg:top-28 rg-up">
            <Eyebrow>Join OneCampus</Eyebrow>
            <h2 className="mt-6 xl:mt-8 text-[clamp(32px,min(4vw,6vh),52px)] leading-[1.08] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">
              Join your class in about a minute.
            </h2>
            <p className="mt-4 text-[15px] xl:text-[15.5px] leading-relaxed text-[color:var(--body)] max-w-md">
              Make one account and your timetable, attendance and CR updates are ready to go.
            </p>

            <ol className="mt-7 space-y-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <span
                      className={cx(
                        "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0 tabular-nums",
                        i === 0 ? "ac-btn" : "bg-[color:var(--surface)] border border-[color:var(--line)] text-[color:var(--muted)]"
                      )}
                    >
                      {i + 1}
                    </span>
                    {i < STEPS.length - 1 && <span className="w-px flex-1 mt-1.5 bg-[color:var(--line)] min-h-[14px]" aria-hidden="true" />}
                  </div>
                  <div className="pb-1">
                    <p className="text-[14.5px] font-semibold text-[color:var(--ink)] leading-8">
                      {s.title}
                      {i === 0 && <span className="tn tn-brand tn-soft ml-2 align-middle text-[11px] font-medium rounded-full px-2 py-0.5">You are here</span>}
                    </p>
                    <p className="text-[13.5px] text-[color:var(--muted)] leading-snug -mt-0.5 max-w-[22rem]">{s.text}</p>
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

            <Card className="p-4 min-[380px]:p-5 sm:p-8 rg-up" style={{ animationDelay: "120ms" }}>
              <span className="tn tn-brand tn-soft hidden lg:flex w-12 h-12 rounded-xl items-center justify-center">
                <CalendarCheck className="w-6 h-6" aria-hidden="true" />
              </span>
              <h1 className="text-[24px] sm:text-[26px] font-semibold tracking-tight text-[color:var(--ink)] leading-tight lg:mt-5">Create your account</h1>
              <p className="text-[14px] leading-relaxed text-[color:var(--muted)] mt-1">Pick your college, branch and section and we will find your class schedule.</p>

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
                    <p className="rg-pop tn tn-brand tn-soft sm:col-span-2 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px] leading-snug text-[color:var(--body)]" aria-live="polite">
                      <CheckCircle2 className="ac-tx w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                      <span>
                        We will look for the <strong className="font-semibold text-[color:var(--ink)]">{form.branch} Section {form.section}</strong> schedule at {form.college}.
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
                      <div className="mt-2" aria-live="polite">
                        <div className="flex gap-1.5" aria-hidden="true">
                          {[1, 2, 3, 4].map((n) => (
                            <span key={n} className={cx("h-1.5 flex-1 rounded-full transition-colors", n <= strength.level ? STRENGTH_COLOR[strength.level] : "bg-[color:var(--track)]")} />
                          ))}
                        </div>
                        <p className="text-[12px] text-[color:var(--muted)] mt-1">Password length: {strength.label}</p>
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
                      <p className="tn tn-ok tn-text flex items-center gap-1.5 text-[12.5px] mt-1.5">
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        Passwords match
                      </p>
                    )}
                  </div>
                </div>

                <Button type="submit" loading={loading} className="w-full !h-11 text-[15px]">
                  {loading ? "Creating your account..." : "Create account"}
                  {!loading && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                </Button>
              </form>

              <div className="mt-6 pt-5 border-t border-[color:var(--line-soft)] text-center">
                <p className="text-[13.5px] text-[color:var(--muted)]">
                  Already registered?{" "}
                  <Link to="/login" className={cx("ac-tx font-semibold hover:underline rounded", FOCUS)}>
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
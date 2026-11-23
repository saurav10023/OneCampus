// Small shared UI kit in the OneCampus flat style.
// Solid indigo for the main action, light surfaces with hairline borders for everything else.
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export const cx = (...a) => a.filter(Boolean).join(" ");

export const card = "rounded-2xl bg-[color:var(--surface)] border border-[color:var(--line)] shadow-[0_1px_2px_rgba(27,31,51,0.04)]";

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1";

// text-[16px] on phones stops iOS Safari zooming in on focus; min-w-0 stops date/time inputs overflowing grids.
const inputCls =
  "w-full h-11 px-3.5 rounded-xl bg-[color:var(--surface)] border border-[color:var(--line)] " +
  "text-[16px] sm:text-[14px] min-w-0 text-[color:var(--ink)] placeholder:text-[#636A82]/70 transition-colors " +
  "hover:border-[color:var(--line-strong)] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/25 disabled:opacity-60 disabled:bg-[color:var(--inset)] " +
  "aria-[invalid=true]:border-rose-300 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-rose-400/20";

export const Card = ({ className, children, ...rest }) => (
  <div className={cx(card, className)} {...rest}>
    {children}
  </div>
);

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]";

const variants = {
  primary: "text-white bg-[#4F46E5] border border-[#4F46E5] hover:bg-[#4338CA] hover:border-[#4338CA]",
  glass: "text-[color:var(--ink)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] backdrop-blur-md border border-[color:var(--line)] hover:bg-[color:var(--surface)] hover:border-[color:var(--line-strong)]",
  danger: "text-white bg-rose-600 border border-rose-600 hover:bg-rose-700 hover:border-rose-700",
  ghost: "text-[color:var(--body)] hover:text-[color:var(--ink)] hover:bg-[color:var(--inset)]",
};

const sizes = { sm: "h-9 px-3.5 text-[13px]", md: "h-11 px-5 text-[14px]" };

// `disabled` is taken out of `rest` and applied LAST so a button can never stay clickable
// while `loading` is true (prevents double submit).
export const Button = ({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  type = "button",
  children,
  className,
  ...rest
}) => (
  <button
    type={type}
    className={cx(btnBase, variants[variant], sizes[size], className)}
    {...rest}
    disabled={Boolean(loading || disabled)}
    aria-busy={loading || undefined}
  >
    {loading && <Spinner className="w-4 h-4" />}
    {children}
  </button>
);

export const Spinner = ({ className = "w-6 h-6" }) => (
  <span
    aria-hidden="true"
    className={cx("inline-block rounded-full border-2 border-current/25 border-t-current animate-spin", className)}
  />
);

// `error` shows a message under the field and marks it invalid for screen readers.
export const Field = ({ label, hint, error, as: Tag = "input", className, children, ...props }) => (
  <label className="block min-w-0">
    {label && <span className="block text-[13px] font-medium text-[color:var(--body)] mb-1.5">{label}</span>}
    <Tag {...props} aria-invalid={error ? true : undefined} className={cx(inputCls, className)}>
      {children}
    </Tag>
    {error ? (
      <span className="block text-[12.5px] text-[#A32A42] mt-1">{error}</span>
    ) : (
      hint && <span className="block text-[12.5px] text-[color:var(--muted)] mt-1">{hint}</span>
    )}
  </label>
);

const alertStyles = {
  error: "bg-rose-50 border-rose-200 text-[#A32A42]",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  warning: "bg-amber-50 border-amber-200 text-amber-900",
  info: "bg-indigo-50 border-indigo-100 text-indigo-800",
};

// Errors interrupt screen readers; everything else is announced politely.
export const Alert = ({ type = "info", children, className }) =>
  children ? (
    <div
      className={cx("rounded-xl border px-4 py-3 text-[13.5px] leading-snug", alertStyles[type], className)}
      role={type === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  ) : null;

// Shows the "warnings" array that date-change / event endpoints may return
export const Warnings = ({ data }) => {
  const list = Array.isArray(data?.warnings) ? data.warnings : [];
  if (!list.length) return null;
  return (
    <Alert type="warning" className="space-y-1">
      {list.map((w, i) => (
        <p key={i}>{typeof w === "string" ? w : w.message || JSON.stringify(w)}</p>
      ))}
    </Alert>
  );
};

export const Badge = ({ tone = "neutral", children }) => {
  const tones = {
    neutral: "bg-[color:var(--inset)] text-[color:var(--body)] border-[color:var(--line)]",
    brand: "bg-indigo-50 text-indigo-700 border-indigo-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-800 border-amber-100",
    red: "bg-rose-50 text-rose-700 border-rose-100",
  };
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium", tones[tone])}>
      {children}
    </span>
  );
};

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
    <div>
      <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-tight text-[color:var(--ink)] leading-tight">{title}</h1>
      {subtitle && <p className="text-[14.5px] text-[color:var(--muted)] mt-1.5 max-w-xl">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const EmptyState = ({ icon: Icon, title, text, action }) => (
  <Card className="p-8 sm:p-10 text-center">
    {Icon && (
      <span className="mx-auto mb-4 w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </span>
    )}
    <h3 className="text-[17px] font-semibold text-[color:var(--ink)]">{title}</h3>
    {text && <p className="text-[14px] leading-relaxed text-[color:var(--muted)] mt-1.5 max-w-md mx-auto">{text}</p>}
    {action && <div className="mt-5">{action}</div>}
  </Card>
);

// Dialog: bottom sheet on phones, centred on larger screens.
// Header and footer stay visible; only the middle scrolls, so the submit button is always reachable.
// Focus moves into the dialog on open and returns to the opener, Escape closes it, page behind does not scroll.
// `onClose` is kept in a ref so a parent re-render with a new function does not re-run the
// effect (which would reset focus and scroll-lock while the user is typing).
// `footer` and `size` ("lg" | "xl") are optional, so older usages keep working.
export const Modal = ({ open, onClose, title, children, footer, size = "lg" }) => {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") closeRef.current?.();
    };
    document.addEventListener("keydown", onKey);

    // focus the dialog only if a field with autoFocus has not already taken focus inside it
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#1B1F33]/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          card,
          "relative w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] rounded-t-3xl rounded-b-none sm:rounded-3xl shadow-[0_24px_48px_-20px_rgba(27,31,51,0.35)] focus:outline-none",
          size === "xl" ? "sm:max-w-2xl" : "sm:max-w-lg"
        )}
      >
        <span aria-hidden="true" className="sm:hidden mx-auto mt-2.5 block h-1 w-10 rounded-full bg-[#1B1F33]/15" />
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-5 pb-3 shrink-0">
          <h2 id={titleId} className="text-[18px] font-semibold text-[color:var(--ink)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cx("w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-[color:var(--muted)] hover:bg-[color:var(--inset)] hover:text-[color:var(--ink)] transition-colors", FOCUS)}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-[color:var(--line-soft)] bg-[color:var(--surface)] px-5 sm:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-b-3xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const PageSpinner = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-indigo-600" role="status">
    <Spinner className="w-8 h-8" />
    <span className="sr-only">Loading...</span>
  </div>
);

// ASCII fallback "-" when there is no date
export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "-";

export const ProgressBar = ({ value = 0, target }) => {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const ok = target == null || v >= Number(target);
  return (
    <div
      className="relative h-2 rounded-full bg-[color:var(--track)]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
    >
      <div
        className={cx("h-full rounded-full transition-all duration-700 motion-reduce:transition-none", ok ? "bg-emerald-500" : "bg-amber-500")}
        style={{ width: `${v}%` }}
      />
      {target != null && (
        <span aria-hidden="true" className="absolute -top-[3px] -bottom-[3px] w-0.5 rounded bg-[#1B1F33]/40" style={{ left: `${Math.min(100, Number(target))}%` }} />
      )}
    </div>
  );
};

const isPrim = (v) => ["string", "number", "boolean"].includes(typeof v);
const prettyKey = (k) => k.replace(/([A-Z])/g, " $1").replace(/[_.]/g, " ").replace(/^./, (c) => c.toUpperCase());
const showVal = (v) => (typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));
const itemLabel = (it) => it?.name || it?.title || it?.label || it?.subjectName || it?.code;
const MAX_CHIPS = 12;

// Generic read-only view of an API object (used where reply shapes are loose).
export const Summary = ({ data }) => {
  if (!data || typeof data !== "object") return null;
  const rows = [];
  Object.entries(data).forEach(([k, v]) => {
    if (k.startsWith("_") || k === "__v" || k === "warnings") return;
    if (isPrim(v)) rows.push({ k: prettyKey(k), v: showVal(v) });
    else if (Array.isArray(v)) {
      const labels = v.map(itemLabel).filter(Boolean);
      rows.push({ k: prettyKey(k), v: `${v.length}`, chips: labels.slice(0, MAX_CHIPS), more: Math.max(0, labels.length - MAX_CHIPS) });
    } else if (v && typeof v === "object") {
      Object.entries(v).forEach(([ck, cv]) => {
        if (isPrim(cv) && !ck.startsWith("_")) rows.push({ k: `${prettyKey(k)} - ${prettyKey(ck)}`, v: showVal(cv) });
      });
    }
  });
  if (!rows.length) return null;
  return (
    <dl className="grid sm:grid-cols-2 gap-2">
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl bg-[color:var(--inset)] px-3.5 py-2.5">
          <dt className="text-[12px] text-[color:var(--muted)]">{r.k}</dt>
          <dd className="text-[14.5px] font-semibold text-[color:var(--ink)] mt-0.5 break-words">{r.v}</dd>
          {r.chips?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {r.chips.map((c, i2) => (
                <Badge key={i2}>{c}</Badge>
              ))}
              {r.more > 0 && <Badge tone="brand">+{r.more} more</Badge>}
            </div>
          )}
        </div>
      ))}
    </dl>
  );
};
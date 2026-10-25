// Small shared UI kit in the OneCampus liquid-glass style.
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export const cx = (...a) => a.filter(Boolean).join(" ");

export const card =
  "rounded-3xl bg-white/55 backdrop-blur-xl backdrop-saturate-150 border border-white/80 " +
  "shadow-[inset_0_1px_0_#fff,0_24px_48px_-28px_rgba(30,32,70,0.35)]";

// text-[16px] on phones stops iOS Safari zooming in on focus; min-w-0 stops date/time inputs overflowing grids.
const inputCls =
  "w-full h-11 px-4 rounded-2xl bg-white/65 border border-white/80 shadow-[inset_0_1px_0_#fff] " +
  "text-[16px] sm:text-[14px] min-w-0 text-[#161827] placeholder:text-[#6A6F85]/70 transition " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:bg-white/85 disabled:opacity-60 " +
  "aria-[invalid=true]:border-[#F3B8C2] aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-rose-400/30";

export const Card = ({ className, children, ...rest }) => (
  <div className={cx(card, className)} {...rest}>
    {children}
  </div>
);

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]";

const variants = {
  primary:
    "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] hover:brightness-110 " +
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_24px_-12px_rgba(79,70,229,0.8)]",
  glass:
    "text-[#161827] bg-white/60 border border-white/80 hover:bg-white/85 shadow-[inset_0_1px_0_#fff]",
  danger:
    "text-white bg-gradient-to-br from-[#E0526A] to-[#C93A55] hover:brightness-110 " +
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_12px_24px_-12px_rgba(201,58,85,0.7)]",
  ghost: "text-[#161827]/75 hover:text-[#161827] hover:bg-white/55",
};

const sizes = { sm: "h-9 px-4 text-[13px]", md: "h-11 px-5 text-[14px]" };

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
    {label && (
      <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-1.5 px-1">
        {label}
      </span>
    )}
    <Tag {...props} aria-invalid={error ? true : undefined} className={cx(inputCls, className)}>
      {children}
    </Tag>
    {error ? (
      <span className="block text-[12.5px] text-[#A32A42] mt-1 px-1">{error}</span>
    ) : (
      hint && <span className="block text-[12.5px] text-[#6A6F85] mt-1 px-1">{hint}</span>
    )}
  </label>
);

const alertStyles = {
  error: "bg-[#FDECEF]/80 border-[#F3B8C2] text-[#A32A42]",
  success: "bg-[#E8F7EE]/80 border-[#B5E3C6] text-[#1E7A45]",
  warning: "bg-[#FFF5E0]/80 border-[#F2D9A0] text-[#8A5A00]",
  info: "bg-[#EAF0FF]/80 border-[#C3D2FA] text-[#2F3FA3]",
};

// Errors interrupt screen readers; everything else is announced politely.
export const Alert = ({ type = "info", children, className }) =>
  children ? (
    <div
      className={cx("rounded-2xl border px-4 py-3 text-[13.5px] leading-snug", alertStyles[type], className)}
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
    neutral: "bg-white/70 text-[#444A63] border-white/80",
    brand: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
    green: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    amber: "bg-amber-500/15 text-amber-800 border-amber-200",
    red: "bg-rose-500/10 text-rose-700 border-rose-200",
  };
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium", tones[tone])}>
      {children}
    </span>
  );
};

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
    <div>
      <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight text-[#161827] leading-tight">{title}</h1>
      {subtitle && <p className="text-[14.5px] text-[#6A6F85] mt-1.5 max-w-xl">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const EmptyState = ({ icon: Icon, title, text, action }) => (
  <Card className="p-10 text-center">
    {Icon && (
      <span className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
        <Icon className="w-7 h-7" />
      </span>
    )}
    <h3 className="text-[17px] font-semibold text-[#161827]">{title}</h3>
    {text && <p className="text-[14px] leading-relaxed text-[#6A6F85] mt-1.5 max-w-md mx-auto">{text}</p>}
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
      <div className="absolute inset-0 bg-[#161827]/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          card,
          "relative w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] rounded-b-none sm:rounded-3xl bg-white/90 focus:outline-none",
          size === "xl" ? "sm:max-w-2xl" : "sm:max-w-lg"
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3 shrink-0">
          <h2 id={titleId} className="text-[18px] font-semibold text-[#161827]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-white/80 bg-white/80 px-5 sm:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-b-3xl">
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
      className="relative h-2.5 rounded-full bg-[#161827]/10"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
    >
      <div
        className={cx(
          "h-full rounded-full transition-all duration-700",
          ok ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-gradient-to-r from-amber-400 to-rose-500"
        )}
        style={{ width: `${v}%` }}
      />
      {target != null && (
        <span className="absolute -top-[3px] -bottom-[3px] w-0.5 rounded bg-[#161827]/60" style={{ left: `${Math.min(100, Number(target))}%` }} />
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
        <div key={i} className="rounded-2xl bg-white/60 border border-white/80 px-3.5 py-2.5">
          <dt className="text-[11.5px] uppercase tracking-[0.1em] text-[#6A6F85]">{r.k}</dt>
          <dd className="text-[14.5px] font-semibold text-[#161827] mt-0.5 break-words">{r.v}</dd>
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
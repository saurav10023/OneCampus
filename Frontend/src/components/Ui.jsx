// Small shared UI kit in the OneCampus liquid-glass style.
import { useEffect } from "react";
import { X } from "lucide-react";

export const cx = (...a) => a.filter(Boolean).join(" ");

export const card =
  "rounded-3xl bg-white/55 backdrop-blur-xl backdrop-saturate-150 border border-white/80 " +
  "shadow-[inset_0_1px_0_#fff,0_24px_48px_-28px_rgba(30,32,70,0.35)]";

const inputCls =
  "w-full h-11 px-4 rounded-2xl bg-white/65 border border-white/80 shadow-[inset_0_1px_0_#fff] " +
  "text-[14px] text-[#161827] placeholder:text-[#6A6F85]/70 transition " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:bg-white/85 disabled:opacity-60";

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

export const Button = ({ variant = "primary", size = "md", loading, children, className, ...rest }) => (
  <button className={cx(btnBase, variants[variant], sizes[size], className)} disabled={loading || rest.disabled} {...rest}>
    {loading && <Spinner className="w-4 h-4" />}
    {children}
  </button>
);

export const Spinner = ({ className = "w-6 h-6" }) => (
  <span className={cx("inline-block rounded-full border-2 border-current/25 border-t-current animate-spin", className)} />
);

export const Field = ({ label, hint, as: Tag = "input", className, children, ...props }) => (
  <label className="block">
    {label && (
      <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-1.5 px-1">
        {label}
      </span>
    )}
    <Tag {...props} className={cx(inputCls, className)}>
      {children}
    </Tag>
    {hint && <span className="block text-[12px] text-[#6A6F85] mt-1 px-1">{hint}</span>}
  </label>
);

const alertStyles = {
  error: "bg-[#FDECEF]/80 border-[#F3B8C2] text-[#A32A42]",
  success: "bg-[#E8F7EE]/80 border-[#B5E3C6] text-[#1E7A45]",
  warning: "bg-[#FFF5E0]/80 border-[#F2D9A0] text-[#8A5A00]",
  info: "bg-[#EAF0FF]/80 border-[#C3D2FA] text-[#2F3FA3]",
};

export const Alert = ({ type = "info", children, className }) =>
  children ? (
    <div className={cx("rounded-2xl border px-4 py-3 text-[13.5px] leading-snug", alertStyles[type], className)} role="alert">
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
    {text && <p className="text-[14px] text-[#6A6F85] mt-1.5 max-w-sm mx-auto">{text}</p>}
    {action && <div className="mt-5">{action}</div>}
  </Card>
);

export const Modal = ({ open, onClose, title, children }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#161827]/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cx(card, "relative w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 bg-white/80")}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[18px] font-semibold text-[#161827]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const PageSpinner = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-indigo-600">
    <Spinner className="w-8 h-8" />
  </div>
);

export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "—";
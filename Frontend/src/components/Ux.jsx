// Shared UX helpers: motion, skeletons, tabs, confirm dialog, flash messages, semester bar.
// Imports ./Ui to match your renamed Ui.jsx.

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, Modal, cx } from "./Ui";
import { semesterProgress } from "../lib/dateui";

// One-time styles (animations + skeleton shimmer). Honours reduced-motion.
if (typeof document !== "undefined" && !document.getElementById("oc-ux-styles")) {
  const el = document.createElement("style");
  el.id = "oc-ux-styles";
  el.textContent = `
    @keyframes oc-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    .oc-fade-up { animation: oc-fade-up .45s cubic-bezier(.22,1,.36,1) both; }
    @keyframes oc-shimmer { 100% { transform: translateX(100%); } }
    .oc-skel { position: relative; overflow: hidden; background: rgba(255,255,255,.55); }
    .oc-skel::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%);
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent); animation: oc-shimmer 1.4s infinite; }
    .oc-noscroll::-webkit-scrollbar { display: none; } .oc-noscroll { scrollbar-width: none; }
    @media (prefers-reduced-motion: reduce) { .oc-fade-up { animation: none; } .oc-skel::after { animation: none; } }
  `;
  document.head.appendChild(el);
}

export const FadeIn = ({ delay = 0, className, children }) => (
  <div className={cx("oc-fade-up", className)} style={{ animationDelay: `${delay}ms` }}>
    {children}
  </div>
);

/* ---------- skeletons ---------- */

export const Skeleton = ({ className }) => <div className={cx("oc-skel rounded-2xl", className)} aria-hidden="true" />;

export const SkeletonCards = ({ count = 4, cols = "md:grid-cols-2", height = "h-44" }) => (
  <div className={cx("grid gap-5", cols)} role="status" aria-busy="true" aria-label="Loading">
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} className={cx("rounded-3xl border border-white/70", height)} />
    ))}
  </div>
);

export const SkeletonList = ({ count = 4, height = "h-[84px]" }) => (
  <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading">
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} className={cx("rounded-3xl border border-white/70", height)} />
    ))}
  </div>
);

/* ---------- tabs / segmented control ---------- */

// items: [{ key, label, icon?, count? }]
export const Tabs = ({ items, value, onChange, size = "md", className, label = "Sections" }) => (
  <div
    role="tablist"
    aria-label={label}
    className={cx(
      "oc-noscroll flex gap-1 rounded-full bg-white/45 border border-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,.8)] overflow-x-auto max-w-full",
      size === "sm" ? "p-1" : "p-1.5",
      className
    )}
  >
    {items.map(({ key, label: itemLabel, icon: Icon, count }) => {
      const on = value === key;
      return (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={on}
          onClick={() => onChange(key)}
          className={cx(
            "flex items-center gap-2 rounded-full font-medium whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
            size === "sm" ? "h-8 px-3.5 text-[12.5px]" : "h-10 px-4 text-[13.5px]",
            on
              ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/25"
              : "text-[#161827]/70 hover:bg-white/75"
          )}
        >
          {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
          {itemLabel}
          {count != null && (
            <span className={cx("min-w-[20px] h-5 px-1.5 rounded-full text-[11px] leading-5 text-center", on ? "bg-white/25" : "bg-[#161827]/8 text-[#161827]/60")}>
              {count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

/* ---------- confirm dialog ---------- */

export const ConfirmDialog = ({ open, title, children, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "danger", busy, onConfirm, onClose }) => (
  <Modal open={open} onClose={() => !busy && onClose()} title={title}>
    <div className="space-y-5">
      <div className="text-[14px] leading-relaxed text-[#444A63]">{children}</div>
      <div className="flex flex-wrap gap-3">
        <Button variant={tone} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        <Button variant="glass" disabled={busy} onClick={onClose}>{cancelLabel}</Button>
      </div>
    </div>
  </Modal>
);

/* ---------- flash message (auto-dismiss) ---------- */

export const useFlash = (ms = 4000) => {
  const [msg, setMsg] = useState("");
  const timer = useRef(null);
  const flash = useCallback(
    (text) => {
      setMsg(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(""), ms);
    },
    [ms]
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return [msg, flash];
};

export const Flash = ({ message }) =>
  message ? (
    <div role="status" className="oc-fade-up flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/85 text-emerald-800 px-4 py-3 text-[13.5px]">
      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
      {message}
    </div>
  ) : null;

/* ---------- semester progress bar ---------- */

export const SemesterBar = ({ start, end, dark = false }) => {
  const p = semesterProgress(start, end);
  if (p.state === "unknown") return null;
  return (
    <div>
      <div
        className={cx("h-2 rounded-full overflow-hidden", dark ? "bg-white/25" : "bg-[#161827]/10")}
        role="progressbar"
        aria-label="Semester progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p.pct)}
      >
        <div
          className={cx("h-full rounded-full transition-all duration-700", dark ? "bg-white" : "bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0]")}
          style={{ width: `${p.pct}%` }}
        />
      </div>
      <p className={cx("text-[12.5px] mt-1.5", dark ? "text-white/80" : "text-[#6A6F85]")}>{p.label}</p>
    </div>
  );
};
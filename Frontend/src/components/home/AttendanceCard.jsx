import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import { cx } from "../Ui";
import { Glass, ROUTES, Title } from "./Shared";

const Ring = ({ pct, target }) => {
  const r = 46, c = 2 * Math.PI * r, p = pct ?? 0, ok = p >= target;
  return (
    <div className="relative shrink-0 w-[88px] h-[88px] sm:w-28 sm:h-28" role="img" aria-label={`Attendance ${Math.round(p)} percent, target ${target} percent`}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="8" style={{ stroke: "var(--track)" }} />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, p) / 100)}
          style={{ stroke: ok ? "var(--ok-solid)" : "var(--warn-solid)" }} className="transition-all duration-700 motion-reduce:transition-none" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] sm:text-[25px] font-semibold text-[color:var(--ink)] leading-none tabular-nums">{pct == null ? "–" : `${Math.round(p)}%`}</span>
        <span className="text-[10.5px] text-[color:var(--muted)] mt-1">target {target}%</span>
      </div>
    </div>
  );
};

/* Overall ring, status pill and a collapsible subject-wise list. */
export default function AttendanceCard({ att, target, demo }) {
  const [open, setOpen] = useState(false);
  if (!att) return <Glass className="p-4"><Title>Attendance</Title><p className="text-[13.5px] text-[color:var(--muted)]">Attendance could not be loaded. Try again in a moment.</p></Glass>;
  const ok = (att.pct ?? 0) >= target;
  const lowest = [...att.subjects].filter((s) => s.held > 0 && s.pct != null).sort((a, b) => a.pct - b.pct)[0];
  return (
    <Glass className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={!demo && <Link to={ROUTES.attendance} className="hm-btn !h-8 !px-3 !text-[12.5px] !rounded-lg">Details<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>}>Attendance</Title>
      <div className="flex items-center gap-4">
        <Ring pct={att.pct} target={target} />
        <div className="min-w-0">
          <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", att.held === 0 ? "bg-[color:var(--inset)] text-[color:var(--muted)]" : ok ? "bg-[color:var(--ok-bg)] text-[color:var(--ok-fg)]" : "bg-[color:var(--warn-bg)] text-[color:var(--warn-fg)]")}>
            <span aria-hidden="true" className={cx("w-1.5 h-1.5 rounded-full", att.held === 0 ? "bg-[color:var(--faint)]" : ok ? "bg-[color:var(--ok-solid)]" : "bg-[color:var(--warn-solid)]")} />
            {att.held === 0 ? "Nothing counted" : ok ? "On track" : "Below target"}
          </span>
          <p className="text-[12.5px] text-[color:var(--muted)] mt-2 tabular-nums">{att.att} of {att.held} classes attended</p>
        </div>
      </div>

      {/* Subject-wise: collapsed by default */}
      <button type="button" aria-expanded={open} aria-controls="att-subjects" onClick={() => setOpen((v) => !v)}
        className="mt-4 w-full min-h-12 flex items-center justify-between gap-3 rounded-xl bg-[color:var(--inset)] hover:bg-[color:var(--line-soft)] transition-colors px-3.5 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]">
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold text-[color:var(--ink)]">Subject-wise</span>
          <span className="block text-[11.5px] text-[color:var(--muted)] truncate">
            {att.subjects.length} subjects{lowest ? `, lowest ${lowest.code || lowest.name} ${Math.round(lowest.pct)}%` : ""}
          </span>
        </span>
        <ChevronDown className={cx("w-5 h-5 shrink-0 text-[color:var(--muted)] transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div id="att-subjects" className={cx("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className={cx("overflow-hidden", !open && "invisible")}>
          <ul className="divide-y divide-[color:var(--line-soft)] pt-1">
            {att.subjects.map((s) => {
              const good = (s.pct ?? 0) >= s.target;
              return (
                <li key={s.id || s.name} className="px-1 py-3">
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex items-center gap-2 min-w-0 font-medium text-[color:var(--ink)]"><span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} /><span className="truncate">{s.name}</span></span>
                    <span className="shrink-0 flex items-baseline gap-2">
                      <span className="text-[11.5px] text-[color:var(--muted)] tabular-nums">{s.att}/{s.held}</span>
                      <span className={cx("tabular-nums font-semibold text-[13.5px]", good ? "text-[color:var(--ok-fg)]" : "text-[color:var(--warn-fg)]")}>{s.pct == null ? "–" : `${Math.round(s.pct)}%`}</span>
                    </span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-[color:var(--track)] mt-2" role="img" aria-label={`${s.name}: ${s.att} of ${s.held} attended, target ${s.target} percent`}>
                    <span className={cx("absolute inset-y-0 left-0 rounded-full", good ? "bg-[color:var(--ok-solid)]" : "bg-[color:var(--warn-solid)]")} style={{ width: `${Math.min(100, s.pct ?? 0)}%` }} />
                    <span aria-hidden="true" className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded bg-[color:var(--tick)]" style={{ left: `${s.target}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Glass>
  );
}
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import { cx } from "../Ui";
import { Glass, ROUTES, Title, glassGhost } from "./Shared";

const Ring = ({ pct, target }) => {
  const r = 46, c = 2 * Math.PI * r, p = pct ?? 0, ok = p >= target;
  return (
    <div className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28" role="img" aria-label={`Attendance ${Math.round(p)} percent, target ${target} percent`}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="hm-ring-ok" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#34D399" /><stop offset="100%" stopColor="#10B981" /></linearGradient>
          <linearGradient id="hm-ring-low" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#FBBF24" /><stop offset="100%" stopColor="#F59E0B" /></linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" stroke="rgba(22,24,39,.08)" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, p) / 100)}
          stroke={`url(#${ok ? "hm-ring-ok" : "hm-ring-low"})`} className="transition-all duration-700 motion-reduce:transition-none" />
      </svg>
      <div className="absolute inset-[14%] rounded-full lq-in !rounded-full flex flex-col items-center justify-center">
        <span className="text-[21px] sm:text-[25px] font-semibold text-[#161827] leading-none tabular-nums">{pct == null ? "–" : `${Math.round(p)}%`}</span>
        <span className="text-[10.5px] text-[#6A6F85] mt-1">target {target}%</span>
      </div>
    </div>
  );
};

/* 3 / 6: Overall ring, status pill and a collapsible subject-wise list. */
export default function AttendanceCard({ att, target, demo }) {
  const [open, setOpen] = useState(false);
  if (!att) return <Glass className="p-4"><Title>Attendance</Title><p className="text-[13.5px] text-[#6A6F85]">Attendance could not be loaded. Try again in a moment.</p></Glass>;
  const ok = (att.pct ?? 0) >= target;
  const lowest = [...att.subjects].filter((s) => s.held > 0 && s.pct != null).sort((a, b) => a.pct - b.pct)[0];
  return (
    <Glass className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={!demo && <Link to={ROUTES.attendance} className={glassGhost}>Details<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>}>Attendance</Title>
      <div className="flex items-center gap-4">
        <Ring pct={att.pct} target={target} />
        <div className="min-w-0">
          <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold border", att.held === 0 ? "bg-white/60 border-white text-[#6A6F85]" : ok ? "bg-emerald-400/15 border-emerald-300/60 text-emerald-800" : "bg-amber-400/20 border-amber-300/70 text-amber-900")}>
            <span aria-hidden="true" className={cx("w-1.5 h-1.5 rounded-full", att.held === 0 ? "bg-[#6A6F85]" : ok ? "bg-emerald-500" : "bg-amber-500")} />
            {att.held === 0 ? "Nothing counted" : ok ? "On track" : "Below target"}
          </span>
          <p className="text-[12.5px] text-[#6A6F85] mt-2 tabular-nums">{att.att} of {att.held} classes attended</p>
        </div>
      </div>

      {/* Subject-wise: collapsed by default */}
      <button type="button" aria-expanded={open} aria-controls="att-subjects" onClick={() => setOpen((v) => !v)}
        className="lq-in mt-4 w-full min-h-12 flex items-center justify-between gap-3 px-3.5 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50">
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold text-[#161827]">Subject-wise</span>
          <span className="block text-[11.5px] text-[#6A6F85] truncate">
            {att.subjects.length} subjects{lowest ? `, lowest ${lowest.code || lowest.name} ${Math.round(lowest.pct)}%` : ""}
          </span>
        </span>
        <ChevronDown className={cx("w-5 h-5 shrink-0 text-[#6A6F85] transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div id="att-subjects" className={cx("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className={cx("overflow-hidden", !open && "invisible")}>
          <ul className="space-y-1.5 pt-2">
            {att.subjects.map((s) => {
              const good = (s.pct ?? 0) >= s.target;
              return (
                <li key={s.id || s.name} className="lq-in px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex items-center gap-2 min-w-0 font-medium text-[#161827]"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_0_3px_rgba(255,255,255,.8)]" style={{ background: s.color }} /><span className="truncate">{s.name}</span></span>
                    <span className="shrink-0 flex items-baseline gap-2">
                      <span className="text-[11.5px] text-[#6A6F85] tabular-nums">{s.att}/{s.held}</span>
                      <span className={cx("tabular-nums font-semibold text-[13.5px]", good ? "text-emerald-700" : "text-amber-700")}>{s.pct == null ? "–" : `${Math.round(s.pct)}%`}</span>
                    </span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-[#161827]/[.07] mt-2" role="img" aria-label={`${s.name}: ${s.att} of ${s.held} attended, target ${s.target} percent`}>
                    <span className={cx("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r", good ? "from-emerald-300 to-emerald-500" : "from-amber-300 to-amber-500")} style={{ width: `${Math.min(100, s.pct ?? 0)}%` }} />
                    <span aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 rounded bg-[#161827]/40" style={{ left: `${s.target}%` }} />
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
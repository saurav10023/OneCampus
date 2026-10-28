import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BellRing, CalendarDays, CalendarRange, CalendarClock, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Clock, MapPin, Megaphone, Minus, RefreshCw, Users, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Badge, cx } from "../components/Ui";
import { useRemainingClasses } from "../lib/useRemainingClasses";
import { homeApi, normOcc, normEvent, normAttendance, msg } from "../api/home";

/* Change these if your routes differ. */
const ROUTES = {
  dashboard: "/dashboard", attendance: "/attendance", calendar: "/calendar", official: "/official",
  setup: "/onboarding/setup", crStudio: "/cr-studio", crRequest: "/cr-studio", register: "/register", login: "/login",
};

const css = `
@keyframes hm-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes hm-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.hm-rise { animation: hm-rise .55s cubic-bezier(.22,1,.36,1) both; }
.hm-fade { animation: hm-fade .28s cubic-bezier(.22,1,.36,1) both; }
.hm button, .hm a { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.hm-scroll::-webkit-scrollbar { display: none; } .hm-scroll { scrollbar-width: none; }

/* Soft, mostly neutral wash. Glass needs something to refract, so a little sky and mint stay, with no purple. */
.hm-wash { position: absolute; inset: 0 0 auto 0; height: 560px; pointer-events: none; z-index: -1;
  background:
    radial-gradient(520px 280px at 8% 0%, rgba(125,211,252,.26), transparent 70%),
    radial-gradient(480px 280px at 92% 4%, rgba(186,230,253,.30), transparent 70%),
    radial-gradient(440px 260px at 50% 30%, rgba(167,243,208,.20), transparent 70%),
    radial-gradient(360px 220px at 80% 58%, rgba(226,232,240,.40), transparent 70%); }

/* Frosted white cards (lower sections). Neutral shadows only. */
.lg { background: rgba(255,255,255,.72); border: 1px solid rgba(255,255,255,.9); border-radius: 20px;
  -webkit-backdrop-filter: blur(20px) saturate(160%); backdrop-filter: blur(20px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.95), 0 0 0 1px rgba(22,24,39,.045), 0 14px 34px -24px rgba(22,24,39,.28); }
.lg-in, .lg-pill { background: rgba(255,255,255,.66); border: 1px solid rgba(22,24,39,.06) !important; }
.lg-in { border-radius: 14px; }
.lg-pill { transition: background .15s, transform .15s; } .lg-pill:hover { background: #fff; } .lg-pill:active { transform: scale(.98); }
.lg-hot { background: #fff !important; border-color: rgba(22,24,39,.30) !important; box-shadow: 0 0 0 3px rgba(22,24,39,.06), 0 14px 30px -22px rgba(22,24,39,.35) !important; }
.lg-on { background: #161827 !important; border-color: #161827 !important; color: #fff; }

/* ---- Clear white liquid glass (hero, schedule, attendance) ---- */
.lq { background:
    linear-gradient(180deg, rgba(255,255,255,.70) 0%, rgba(255,255,255,.34) 100%);
  border: 1px solid rgba(255,255,255,.9); border-radius: 26px;
  -webkit-backdrop-filter: blur(28px) saturate(180%); backdrop-filter: blur(28px) saturate(180%);
  box-shadow: inset 0 1.5px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(22,24,39,.04), 0 0 0 1px rgba(22,24,39,.045), 0 26px 50px -32px rgba(22,24,39,.32); }
.lq-in { background: linear-gradient(160deg, rgba(255,255,255,.78), rgba(255,255,255,.40));
  border: 1px solid rgba(255,255,255,.95); border-radius: 18px;
  -webkit-backdrop-filter: blur(14px) saturate(160%); backdrop-filter: blur(14px) saturate(160%);
  box-shadow: inset 0 1px 0 #fff, 0 0 0 1px rgba(22,24,39,.04), 0 10px 20px -16px rgba(22,24,39,.28); }
.lq-btn { background: linear-gradient(160deg, rgba(255,255,255,.88), rgba(255,255,255,.50));
  border: 1px solid rgba(255,255,255,.95);
  -webkit-backdrop-filter: blur(14px) saturate(160%); backdrop-filter: blur(14px) saturate(160%);
  box-shadow: inset 0 1px 0 #fff, 0 0 0 1px rgba(22,24,39,.045), 0 6px 14px -10px rgba(22,24,39,.30);
  transition: transform .18s cubic-bezier(.3,1.5,.5,1), background .15s, box-shadow .15s; }
.lq-btn:hover { background: linear-gradient(160deg, #fff, rgba(255,255,255,.75)); }
.lq-btn:active { transform: scale(.96); }
.lq-glow { border-color: rgba(255,255,255,1) !important;
  box-shadow: inset 0 1.5px 0 #fff, 0 0 0 1px rgba(22,24,39,.10), 0 22px 44px -24px rgba(22,24,39,.38) !important; }
.lq-on { background: linear-gradient(180deg, #2B2E45 0%, #161827 100%) !important; color: #fff !important;
  border-color: rgba(255,255,255,.18) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 10px 20px -10px rgba(22,24,39,.55) !important; }
.lq-thumb { background: linear-gradient(180deg, #fff, rgba(255,255,255,.88)); border: 1px solid #fff;
  box-shadow: inset 0 1px 0 #fff, 0 6px 14px -8px rgba(22,24,39,.35); }

/* Range inputs: soft thumb, calm track. */
.hm-range { -webkit-appearance: none; appearance: none; width: 100%; height: 40px; background: transparent; cursor: pointer; }
.hm-range::-webkit-slider-runnable-track { height: 8px; border-radius: 999px; background: rgba(22,24,39,.09); }
.hm-range::-moz-range-track { height: 8px; border-radius: 999px; background: rgba(22,24,39,.09); }
.hm-range::-webkit-slider-thumb { -webkit-appearance: none; width: 26px; height: 26px; margin-top: -9px; border-radius: 50%; background: #fff; border: 2px solid #161827; box-shadow: 0 4px 10px -2px rgba(22,24,39,.35); }
.hm-range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 2px solid #161827; box-shadow: 0 4px 10px -2px rgba(22,24,39,.35); }
.hm-range:focus-visible { outline: none; } .hm-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(22,24,39,.15); }
.hm-range:disabled { opacity: .4; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .hm-rise, .hm-fade, .animate-pulse { animation: none; } .lg-pill, .lq-btn { transition: none; } }

/* Responsive guardrails: prevent grid/flex children and long text from widening the page. */
.hm, .hm * { box-sizing: border-box; }
.hm { width: 100%; min-width: 0; }
.hm :where(section, header, footer, main, article, ul, li, div) { min-width: 0; }
.hm :where(h1, h2, h3, p, a, button, span) { overflow-wrap: anywhere; }
.hm svg, .hm img { max-width: 100%; }
.hm .lg, .hm .lg-in, .hm .lq, .hm .lq-in { min-width: 0; max-width: 100%; }
@media (max-width: 479px) { .hm .lg { border-radius: 18px; } .hm .lg-in { border-radius: 12px; } .hm .lq { border-radius: 22px; } .hm .lq-in { border-radius: 15px; } }
`;

const Card = ({ className, ...p }) => <div className={cx("lg", className)} {...p} />;
const Glass = ({ className, ...p }) => <div className={cx("lq", className)} {...p} />;

const linkBase =
  "inline-flex w-full min-[420px]:w-auto items-center justify-center gap-2 h-11 px-6 rounded-full text-[14.5px] font-medium transition " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50 active:scale-[0.98]";
const linkPrimary = "text-white bg-[#161827] hover:bg-black shadow-[0_10px_24px_-12px_rgba(22,24,39,.7)]";
const linkGlass = "lg-pill text-[#161827]";
const ghost = "lg-pill inline-flex items-center gap-1.5 h-10 sm:h-9 min-w-10 justify-center px-3.5 rounded-full text-[13px] font-medium text-[#161827] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50";
const glassGhost = "lq-btn inline-flex items-center gap-1.5 h-10 sm:h-9 min-w-10 justify-center px-3.5 rounded-full text-[13px] font-medium text-[#161827] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50";

/* ---------- date helpers (setup dates arrive as plain YYYY-MM-DD) ---------- */
const local = (s) => new Date(`${s}T00:00:00`);
const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtLong = (s) => local(s).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = (s) => local(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const tone = { holiday: "red", exam: "brand", quiz: "brand", event: "green" };
const pad = (n) => String(n).padStart(2, "0");

/* Merge lists of {date, classes} days by date; later lists win. */
const mergeDays = (...lists) => {
  const m = new Map();
  lists.forEach((l) => (l || []).forEach((d) => d && d.date && m.set(d.date, d)));
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
};
const normDays = (res) => (res?.days || []).map((d) => ({ date: d.date, isToday: d.isToday, classes: (d.classes || []).map(normOcc) }));

/* Load the schedule for any date on demand.
   We don't know which of these your backend supports, so each one is tried in turn and its answer is only
   accepted if it really contains the requested date:
     1. homeApi.day(setupId, date)   (optional endpoint, if you add one)
     2. homeApi.today(setupId, date)
     3. homeApi.week(setupId, date)  (the week that contains the date)  */
const fetchDay = async (setupId, date) => {
  const attempts = [
    homeApi.day && { fn: () => homeApi.day(setupId, date), trustMissingDate: true },
    { fn: () => homeApi.today(setupId, date) },
    { fn: () => homeApi.week(setupId, date) },
  ].filter(Boolean);
  for (const a of attempts) {
    try {
      const r = await a.fn();
      let days = [];
      if (Array.isArray(r?.days)) days = normDays(r);
      else if (r && Array.isArray(r.classes) && (r.date || a.trustMissingDate)) days = [{ date: r.date || date, classes: r.classes.map(normOcc) }];
      if (days.some((d) => d.date === date)) return days;
    } catch { /* try the next one */ }
  }
  throw new Error("Could not load this day");
};

/* ================= sample data (signed-out visitors) ================= */
const DEMO_SUBJECTS = [
  { id: "os", name: "Operating Systems", code: "OS", color: "#5B52EE", att: 9, held: 11 },
  { id: "dbms", name: "Database Systems", code: "DBMS", color: "#0EA5E9", att: 8, held: 10 },
  { id: "cn", name: "Computer Networks", code: "CN", color: "#10B981", att: 7, held: 9 },
  { id: "se", name: "Software Engineering", code: "SE", color: "#F59E0B", att: 7, held: 8 },
];
const DEMO_DAY = [
  ["d1", "os", "09:00", "10:00", "LH-201", "lecture"],
  ["d2", "dbms", "10:00", "11:00", "LH-201", "lecture", "cancelled", "official_cancellation"],
  ["d3", "cn", "11:30", "13:30", "Lab 3", "lab"],
  ["d4", "se", "14:30", "15:30", "LH-105", "tutorial"],
];
const DEMO_WEEK = [["os", "dbms", "cn"], ["se", "os"], ["dbms", "cn", "os"], ["cn", "se"], ["os", "dbms", "se"], [], []];
const DEMO_WEEKS_LEFT = 8;

const demoBase = () => {
  const now = new Date();
  const today = toIso(now);
  const subj = (id) => DEMO_SUBJECTS.find((s) => s.id === id);
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const mk = (sid, i, j, date) => ({
    id: `${i}-${j}`, subjectId: sid, name: subj(sid).name, code: subj(sid).code, color: subj(sid).color,
    start: `${pad(9 + j)}:00`, end: `${pad(10 + j)}:00`, room: j % 2 ? "Lab 3" : "LH-201", type: j % 2 ? "lab" : "lecture",
    status: date < today ? "present" : "pending",
  });
  const week = DEMO_WEEK.map((ids, i) => {
    const date = toIso(addDays(monday, i));
    return { date, isToday: date === today, classes: ids.map((sid, j) => mk(sid, i, j, date)) };
  });
  // Sample data covers the next ~2 months so every day you tap has something to show.
  const days = Array.from({ length: 61 }, (_, i) => {
    const d = addDays(now, i), date = toIso(d);
    const ids = DEMO_WEEK[(d.getDay() + 6) % 7];
    return { date, isToday: i === 0, classes: ids.map((sid, j) => mk(sid, 100 + i, j, date)) };
  });
  return {
    demo: true, target: 75, setup: { name: "Semester 5, CSE-A" },
    today: {
      date: today, events: [], nextDay: null,
      classes: DEMO_DAY.map(([id, sid, start, end, room, type, status, lock]) => ({
        id, subjectId: sid, name: subj(sid).name, code: subj(sid).code, color: subj(sid).color, start, end, room, type, status: status || "pending", lock: lock || null,
      })),
    },
    week, days,
    events: [
      { id: "e1", title: "Quiz 1, Database Systems", type: "quiz", startDate: toIso(addDays(now, 5)), endDate: toIso(addDays(now, 5)) },
      { id: "e2", title: "Diwali break", type: "holiday", startDate: toIso(addDays(now, 9)), endDate: toIso(addDays(now, 12)) },
      { id: "e3", title: "Mid-sem exams begin", type: "exam", startDate: toIso(addDays(now, 16)), endDate: toIso(addDays(now, 16)) },
    ],
    official: {
      joined: true, joinable: null, unread: 3,
      updates: [
        { id: "u1", summary: "Your CR cancelled today's DBMS lecture. Your timetable is already updated.", status: "applied" },
        { id: "u2", summary: "Quiz 1 for Database Systems was added to your calendar.", status: "applied" },
        { id: "u3", summary: "Computer Networks lab moved to 12:00. Review and accept.", status: "pending" },
      ],
    },
    cr: false,
  };
};

const demoRemaining = () => {
  const bySubject = {};
  DEMO_WEEK.flat().forEach((sid) => { bySubject[sid] = (bySubject[sid] || 0) + DEMO_WEEKS_LEFT; });
  return { status: "ready", bySubject };
};

const useDemo = () => {
  const base = useMemo(demoBase, []);
  const remaining = useMemo(demoRemaining, []);
  const [marks, setMarks] = useState({ d1: "present" });
  const [read, setRead] = useState(false);
  return useMemo(() => {
    const classes = base.today.classes.map((c) => (c.lock ? c : { ...c, status: marks[c.id] || "pending" }));
    const subjects = DEMO_SUBJECTS.map((s) => {
      let { att, held } = s;
      classes.filter((c) => c.subjectId === s.id).forEach((c) => {
        if (c.status === "present") { att++; held++; } else if (c.status === "absent") held++;
      });
      return { ...s, att, held, pct: (att / held) * 100, target: 75 };
    });
    const att = subjects.reduce((a, s) => a + s.att, 0);
    const held = subjects.reduce((a, s) => a + s.held, 0);
    return {
      vm: {
        ...base,
        today: { ...base.today, classes, nextClass: classes.find((c) => c.status === "pending") || null },
        att: { att, held, pct: (att / held) * 100, subjects },
        official: { ...base.official, unread: read ? 0 : 3, updates: base.official.updates.map((u) => (read ? { ...u, read: true } : u)) },
      },
      remaining,
      mark: async (c, s) => setMarks((m) => ({ ...m, [c.id]: m[c.id] === s ? undefined : s })),
      readAll: async () => setRead(true),
      loadDay: null,
      note: "", reload: () => {},
    };
  }, [base, marks, read, remaining]);
};

/* ================= live data (signed-in users) ================= */
const useLive = (enabled) => {
  const [st, setSt] = useState({ loading: enabled, vm: null, noSetup: false, error: "" });
  const [note, setNote] = useState("");
  const vmRef = useRef(null);
  vmRef.current = st.vm;

  const load = useCallback(async () => {
    setSt((p) => ({ ...p, loading: !p.vm, error: "" }));
    try {
      let setup;
      try { setup = await homeApi.activeSetup(); } catch (e) {
        if (e?.response?.status === 404) return setSt({ loading: false, vm: null, noSetup: true, error: "" });
        throw e;
      }
      const id = setup._id;
      const r = await Promise.allSettled([homeApi.today(id), homeApi.week(id), homeApi.attendance(id), homeApi.events(id), homeApi.official(id), homeApi.roles()]);
      const ok = (i) => (r[i].status === "fulfilled" ? r[i].value : null);
      if (r.slice(0, 3).every((x) => x.status === "rejected")) throw r[0].reason;

      const status = ok(4);
      const joined = Boolean(status?.joined ?? status?.isJoined ?? setup.officialScheduleId);
      const extra = await (joined ? homeApi.updates(id) : homeApi.joinable(id)).catch(() => []);
      const target = setup.targetPercentage ?? 75;
      const t = ok(0);
      const updates = joined ? extra : [];

      setSt({
        loading: false, noSetup: false, error: "",
        vm: {
          demo: false, target, setup,
          today: t && { ...t, classes: (t.classes || []).map(normOcc), nextClass: t.nextClass ? normOcc(t.nextClass) : null },
          week: normDays(ok(1)),
          days: normDays(ok(1)),
          att: ok(2) && normAttendance(ok(2), target),
          events: (ok(3) || []).map(normEvent),
          official: { joined, joinable: joined ? null : extra[0] || null, updates, unread: updates.filter((u) => !u.readAt).length },
          cr: (ok(5) || []).some((x) => x.status === "active"),
        },
      });
    } catch (e) {
      setSt((p) => ({ ...p, loading: false, error: msg(e, "Could not load your home page") }));
    }
  }, []);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  /* Fetch any day that isn't loaded yet and merge it in. The schedule card calls this when a day is tapped. */
  const loadDay = useCallback(async (date) => {
    const sid = vmRef.current?.setup?._id;
    if (!sid) throw new Error("No setup");
    const got = await fetchDay(sid, date);
    setSt((p) => (p.vm ? { ...p, vm: { ...p.vm, days: mergeDays(p.vm.days, got) } } : p));
    return got;
  }, []);

  const patch = (id, status) =>
    setSt((p) => ({ ...p, vm: { ...p.vm, today: { ...p.vm.today, classes: p.vm.today.classes.map((c) => (c.id === id ? { ...c, status } : c)) } } }));

  const mark = async (c, status, override = false) => {
    const sid = st.vm.setup._id;
    const clearing = c.status === status;
    setNote("");
    patch(c.id, clearing ? "pending" : status);
    try {
      await (clearing ? homeApi.clear(sid, c.id) : homeApi.mark(sid, c.id, status, override));
      // The server owns the numbers, so re-read them instead of calculating here.
      const [a, w] = await Promise.all([homeApi.attendance(sid), homeApi.week(sid).catch(() => null)]);
      setSt((p) => ({
        ...p,
        vm: { ...p.vm, att: normAttendance(a, p.vm.target), week: w ? normDays(w) : p.vm.week, days: w ? mergeDays(p.vm.days, normDays(w)) : p.vm.days },
      }));
    } catch (e) {
      patch(c.id, c.status);
      setNote(msg(e));
    }
  };

  const readAll = async () => {
    try {
      await homeApi.readAll(st.vm.setup._id);
      setSt((p) => ({ ...p, vm: { ...p.vm, official: { ...p.vm.official, unread: 0, updates: p.vm.official.updates.map((u) => ({ ...u, readAt: u.readAt || true })) } } }));
    } catch (e) { setNote(msg(e)); }
  };

  return { ...st, note, mark, readAll, loadDay, reload: load };
};

/* ================= pieces ================= */
const Title = ({ children, right }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
    <h2 className="text-[16px] sm:text-[18px] font-semibold tracking-tight text-[#161827]">{children}</h2>
    {right}
  </div>
);

const MarkBtn = ({ on, kind, label, onClick, disabled, children }) => (
  <button type="button" aria-pressed={on} aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className={cx("min-h-10 h-auto min-w-0 w-full sm:w-10 rounded-full flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 py-1.5 sm:p-0 text-[12px] sm:text-[13px] font-medium border transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50",
      on
        ? {
            p: "bg-gradient-to-b from-emerald-400 to-emerald-500 border-white/40 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_10px_20px_-8px_rgba(16,185,129,.8)]",
            a: "bg-gradient-to-b from-rose-400 to-rose-500 border-white/40 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_10px_20px_-8px_rgba(244,63,94,.8)]",
            e: "bg-gradient-to-b from-sky-400 to-sky-500 border-white/40 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_10px_20px_-8px_rgba(14,165,233,.8)]",
          }[kind]
        : "lq-btn text-[#161827]/70")}>
    {children}
  </button>
);

/* One class row. `readOnly` is used for other days, where marking isn't open yet. */
const ClassRow = ({ c, next, onPick, readOnly }) => {
  const cancelled = c.status === "cancelled";
  const locked = c.lock === "outside_range" || c.lock === "official_cancellation" || c.status === "not_counted";
  return (
    <li className={cx("relative grid grid-cols-[3.1rem_minmax(0,1fr)] sm:grid-cols-[3.1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 lq-in pl-5 pr-3 py-2.5 overflow-hidden", next && "lq-glow")}>
      <span aria-hidden="true" className="absolute left-2 inset-y-2.5 w-1 rounded-full" style={{ background: c.color }} />
      <div className="text-[11.5px] leading-tight tabular-nums text-[#6A6F85]">
        <span className="block text-[13.5px] font-semibold text-[#161827]">{c.start}</span>{c.end}
      </div>
      <div className="min-w-0">
        <p className={cx("text-[14px] font-semibold text-[#161827] truncate", cancelled && "line-through opacity-60")}>{c.name || c.code}</p>
        <p className="text-[12px] text-[#6A6F85] truncate capitalize">{[c.type, c.room].filter(Boolean).join(", ")}</p>
        {(next || (cancelled && !locked && !readOnly)) && <span className="mt-1 inline-block">{next ? <Badge tone="brand">Up next</Badge> : <Badge tone="red">Cancelled</Badge>}</span>}
      </div>
      <div className={cx("sm:justify-self-end", !readOnly && "col-span-2 sm:col-span-1")}>
        {readOnly ? (
          cancelled ? <Badge tone="red">Cancelled</Badge> : <Badge tone="brand">Upcoming</Badge>
        ) : locked ? (
          <Badge tone={cancelled ? "red" : "amber"}>{cancelled ? "Cancelled by CR" : "Not counted"}</Badge>
        ) : (
          <div className="grid grid-cols-3 sm:flex gap-1.5 min-w-0">
            <MarkBtn on={c.status === "present"} kind="p" label={`Mark ${c.name} present`} onClick={() => onPick(c, "present")}><Check className="w-4 h-4" aria-hidden="true" /><span className="sm:hidden">Present</span></MarkBtn>
            <MarkBtn on={c.status === "absent"} kind="a" label={`Mark ${c.name} absent`} onClick={() => onPick(c, "absent")}><X className="w-4 h-4" aria-hidden="true" /><span className="sm:hidden">Absent</span></MarkBtn>
            <MarkBtn on={c.status === "excused"} kind="e" label={`Mark ${c.name} excused`} onClick={() => onPick(c, "excused")}><Minus className="w-4 h-4" aria-hidden="true" /><span className="sm:hidden">Excused</span></MarkBtn>
          </div>
        )}
      </div>
    </li>
  );
};

const dayName = (d, f = "short") => local(d).toLocaleDateString("en-IN", { weekday: f });
const MAX_OFF = 60;
const LOOKAHEAD = 14;

/* ================= Schedule card: Today / Tomorrow / Next, arrows, day strip, swipe, load on tap ================= */
const ScheduleCard = ({ today, days, events, note, onMark, onLoadDay, demo }) => {
  const [off, setOff] = useState(0);
  const [ask, setAsk] = useState(null);
  const [pending, setPending] = useState({});
  const [failed, setFailed] = useState({});
  const inflight = useRef(new Set());
  const touch = useRef(null);

  const base = useMemo(() => local(today.date), [today.date]);
  const dateAt = (o) => addDays(base, o);
  const iso = toIso(dateAt(off));
  const isToday = off === 0;
  const byDate = useMemo(() => Object.fromEntries((days || []).map((d) => [d.date, d])), [days]);

  const stripStart = Math.floor(off / 7) * 7;
  const stripFirst = toIso(dateAt(stripStart));

  // Load the tapped day (and the first day of the visible strip) if we don't have it yet.
  useEffect(() => {
    if (demo || !onLoadDay) return;
    [iso, stripFirst].forEach((date) => {
      if (date === today.date || byDate[date] || inflight.current.has(date) || failed[date]) return;
      inflight.current.add(date);
      setPending((p) => ({ ...p, [date]: true }));
      onLoadDay(date)
        .then(() => setFailed((f) => (f[date] ? { ...f, [date]: false } : f)))
        .catch(() => setFailed((f) => ({ ...f, [date]: true })))
        .finally(() => { inflight.current.delete(date); setPending((p) => ({ ...p, [date]: false })); });
    });
  }, [iso, stripFirst, byDate, failed, demo, onLoadDay, today.date]);

  const classes = isToday ? today.classes : byDate[iso]?.classes;
  const known = classes != null;
  const nextId = isToday ? today.nextClass?.id : null;
  const dayEvents = isToday
    ? today.events || []
    : (events || []).filter((e) => e.confirmed !== false && e.startDate <= iso && e.endDate >= iso && (e.type === "holiday" || e.type === "exam" || e.type === "quiz"));

  const label = off === 0 ? "Today" : off === 1 ? "Tomorrow" : dayName(iso, "long");
  const segIdx = Math.min(off, 2);
  const countOf = (o) => (o === 0 ? today.classes.length : byDate[toIso(dateAt(o))]?.classes?.length);

  const go = (o) => { setAsk(null); setOff(Math.max(0, Math.min(MAX_OFF, o))); };
  const pick = (c, s) => (c.lock === "cancelled_by_cause" ? setAsk({ c, s }) : onMark(c, s));
  const retry = () => setFailed((f) => ({ ...f, [iso]: false }));

  const strip = Array.from({ length: 7 }, (_, k) => stripStart + k).filter((o) => o <= MAX_OFF);

  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(off + (dx < 0 ? 1 : -1));
  };

  const segs = [
    { k: 0, t: "Today" },
    { k: 1, t: "Tomorrow" },
    { k: 2, t: off >= 2 ? dayName(iso) : "Next" },
  ];

  return (
    <Glass className="p-3.5 min-[380px]:p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h2 className="text-[20px] sm:text-[24px] font-semibold tracking-tight leading-tight text-[#161827]">{label}</h2>
          <p className="text-[12.5px] text-[#6A6F85] mt-0.5">{fmtLong(iso)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {demo && isToday && <Badge tone="brand">Sample</Badge>}
          <Badge tone="brand">{known ? `${classes.length} ${classes.length === 1 ? "class" : "classes"}` : "…"}</Badge>
        </div>
      </div>

      {/* Day switcher */}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" aria-label="Previous day" disabled={off === 0} onClick={() => go(off - 1)}
          className="lq-btn shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[#161827] disabled:opacity-35 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div role="group" aria-label="Choose day" className="relative flex-1 min-w-0 grid grid-cols-3 p-1 lq-in !rounded-full">
          <span aria-hidden="true" className="lq-thumb absolute top-1 bottom-1 left-1 rounded-full transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)] motion-reduce:transition-none"
            style={{ width: "calc((100% - 8px) / 3)", transform: `translateX(${segIdx * 100}%)` }} />
          {segs.map((s) => (
            <button key={s.k} type="button" aria-pressed={segIdx === s.k}
              onClick={() => go(s.k === 2 ? Math.max(off + 1, 2) : s.k)}
              className={cx("relative z-[1] h-9 sm:h-10 min-w-0 truncate rounded-full px-1.5 text-[13px] sm:text-[14px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50",
                segIdx === s.k ? "text-[#161827]" : "text-[#6A6F85] hover:text-[#161827]")}>
              {s.t}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Next day" disabled={off === MAX_OFF} onClick={() => go(off + 1)}
          className="lq-btn shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[#161827] disabled:opacity-35 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50">
          <ChevronRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* Day strip: pages by week as you move forward */}
      <div className="mt-2.5 grid grid-cols-7 gap-1 sm:gap-1.5" role="tablist" aria-label="Pick a date">
        {strip.map((o) => {
          const d = dateAt(o), on = o === off, n = countOf(o);
          return (
            <button key={o} type="button" role="tab" aria-selected={on} onClick={() => go(o)}
              className={cx("flex flex-col items-center gap-0.5 rounded-2xl border py-1.5 min-h-[56px] text-[11px] sm:text-[12px] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50",
                on ? "lq-on" : "lq-btn text-[#161827]", o === 0 && !on && "!border-[#161827]/25")}>
              <span className={on ? "opacity-80" : "text-[#6A6F85]"}>{dayName(toIso(d))}</span>
              <span className="text-[15px] font-semibold leading-tight tabular-nums">{d.getDate()}</span>
              <span className={cx("h-1 w-1 rounded-full", n ? (on ? "bg-white" : "bg-[#161827]/40") : "bg-transparent")} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* Banners */}
      <div className="mt-3 space-y-2 empty:mt-0">
        {dayEvents.map((e) => (
          <div key={e.id} className="flex items-start gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-400/15 px-3 py-2 text-[12.5px] text-amber-900 backdrop-blur">
            <BellRing className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span><b className="font-semibold">{e.title}</b>{isToday ? (e.affectsClasses ? ". Affected classes are cancelled." : ".") : e.type ? ` (${e.type}).` : "."}</span>
          </div>
        ))}
        {isToday && note && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-500/10 px-3 py-2 text-[12.5px] text-[#A32A42]">{note}</p>}
        {isToday && ask && (
          <div role="alertdialog" aria-label="Mark a cancelled class" className="sticky top-2 z-10 rounded-2xl border border-[#161827]/15 bg-white/95 px-3.5 py-3 shadow-[0_12px_30px_-12px_rgba(22,24,39,0.4)]">
            <p className="text-[13.5px] text-[#161827]"><b>{ask.c.name}</b> was cancelled by a holiday or class cancel. Mark it {ask.s} anyway?</p>
            <div className="flex flex-wrap gap-2 mt-2.5">
              <button type="button" className={cx(glassGhost, "lq-on")} onClick={() => { onMark(ask.c, ask.s, true); setAsk(null); }}>Mark {ask.s}</button>
              <button type="button" className={glassGhost} onClick={() => setAsk(null)}>Keep cancelled</button>
            </div>
          </div>
        )}
      </div>

      {/* Classes */}
      <div key={iso} className="hm-fade mt-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: "pan-y" }} aria-live="polite">
        {!known ? (
          failed[iso] ? (
            <div className="lq-in px-4 py-6 text-center">
              <p className="text-[14.5px] font-semibold text-[#161827]">Couldn't load {fmtShort(iso)}</p>
              <p className="text-[13px] text-[#6A6F85] mt-1">Check your connection and try again.</p>
              <button type="button" onClick={retry} className={cx(glassGhost, "mt-3")}><RefreshCw className="w-4 h-4" aria-hidden="true" />Try again</button>
            </div>
          ) : (
            <ul className="space-y-2" aria-busy="true" aria-label={`Loading ${fmtShort(iso)}`}>
              {[0, 1, 2].map((i) => <li key={i} className="lq-in h-[64px] animate-pulse" style={{ opacity: 1 - i * 0.2 }} />)}
            </ul>
          )
        ) : classes.length ? (
          <ul className="space-y-2">
            {classes.map((c) => <ClassRow key={c.id} c={c} next={c.id === nextId} onPick={pick} readOnly={!isToday} />)}
          </ul>
        ) : (
          <div className="lq-in px-4 py-6 text-center">
            <p className="text-[14.5px] font-semibold text-[#161827]">{isToday ? "No classes today" : `No classes ${off === 1 ? "tomorrow" : "on " + dayName(iso, "long")}`}</p>
            <p className="text-[13px] text-[#6A6F85] mt-1">
              {isToday && today.nextDay ? `Next classes: ${fmtLong(today.nextDay.date)}, ${today.nextDay.classCount} scheduled.` : "Enjoy the free day."}
            </p>
          </div>
        )}
      </div>

      <p className="text-[11.5px] text-[#6A6F85] mt-2.5 px-1">
        {isToday
          ? (demo ? "Tap a button and watch your attendance move." : "Tap the same button again to clear a mark.")
          : "Marking opens on the day itself. Swipe to change day."}
      </p>
    </Glass>
  );
};

/* ================= Attendance (liquid glass, subject list collapses) ================= */
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

const AttendanceCard = ({ att, target, demo }) => {
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
        className="lq-in mt-4 w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50">
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
};

const Mark = ({ st }) => st === "present" ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Present" /> : st === "absent" ? <X className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-label="Absent" /> : null;

const WeekCard = ({ week, demo }) => {
  const [sel, setSel] = useState(() => (week.find((d) => d.isToday) || week[0]).date);
  const day = week.find((d) => d.date === sel) || week[0];
  return (
    <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={!demo && <Link to={ROUTES.attendance} className="text-[13px] font-medium text-[#161827] underline-offset-2 hover:underline">Timetable</Link>}>This week</Title>

      <div className="lg:hidden">
        <div role="tablist" aria-label="Pick a day" className="grid grid-cols-7 gap-1">
          {week.map((d) => (
            <button key={d.date} type="button" role="tab" aria-selected={d.date === sel} onClick={() => setSel(d.date)}
              className={cx("flex flex-col items-center gap-0.5 rounded-2xl border py-1.5 min-h-[56px] text-[11.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50", d.date === sel ? "lg-on" : "lg-pill text-[#161827]", d.isToday && d.date !== sel && "!border-[#161827]/25")}>
              <span className="opacity-80">{dayName(d.date)}</span>
              <span className="text-[15px] font-semibold leading-tight">{local(d.date).getDate()}</span>
              <span className="flex gap-0.5 h-1.5 items-center">{d.classes.slice(0, 4).map((c) => <i key={c.id} className="w-1.5 h-1.5 rounded-full" style={{ background: d.date === sel ? "#fff" : c.color }} />)}</span>
            </button>
          ))}
        </div>
        <p className="text-[13px] font-medium text-[#161827] mt-3 mb-2">{fmtLong(day.date)}{day.isToday ? " (today)" : ""}</p>
        {day.classes.length ? (
          <ul className="space-y-1.5">
            {day.classes.map((c) => (
              <li key={c.id} className="relative lg-in flex items-center gap-3 pl-5 pr-3 py-2 overflow-hidden">
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: c.color }} />
                <span className="w-11 text-[13px] font-semibold tabular-nums text-[#161827]">{c.start}</span>
                <span className={cx("min-w-0 flex-1 truncate text-[13.5px] font-medium text-[#161827]", c.status === "cancelled" && "line-through opacity-60")}>{c.name || c.code}</span>
                {c.status === "cancelled" ? <Badge tone="red">Cancelled</Badge> : <Mark st={c.status} />}
              </li>
            ))}
          </ul>
        ) : <p className="lg-in px-4 py-5 text-center text-[13.5px] text-[#6A6F85]">No classes this day.</p>}
      </div>

      <div className="hidden lg:grid grid-cols-7 gap-2">
        {week.map((d) => (
          <div key={d.date} className={cx("lg-in p-2 min-h-[108px]", d.isToday && "lg-hot")}>
            <p className={cx("px-1 pb-1.5 text-[12px] font-semibold", d.isToday ? "text-[#161827]" : "text-[#161827]")}>{dayName(d.date)} <span className="font-normal text-[#6A6F85]">{local(d.date).getDate()}</span></p>
            <div className="space-y-1">
              {d.classes.length === 0 && <p className="px-1 text-[12px] text-[#6A6F85]">Free</p>}
              {d.classes.map((c) => (
                <div key={c.id} className={cx("flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12px] font-medium bg-white border border-[#161827]/5", c.status === "cancelled" && "opacity-55 line-through")}>
                  <span aria-hidden="true" className="w-1.5 h-4 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="truncate text-[#161827]">{c.code}</span>
                  <span className="ml-auto"><Mark st={c.status} /></span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

/* ================= Skip planner (replaces "Can I skip?") =================
   Uses the classes still to come (holidays and cancellations already excluded by the server)
   to predict where the semester will end. Move the slider to try different plans. */
const planOf = (a, h, left, goal) => {
  const total = h + left;
  const need = Math.max(0, Math.ceil((goal / 100) * total - a - 1e-9));
  const canReach = need <= left;
  return { total, need, canReach, canSkip: canReach ? left - need : 0, best: total ? ((a + left) / total) * 100 : 0, worst: total ? (a / total) * 100 : 0 };
};

const Tile = ({ label, value, hint }) => (
  <div className="lg-in px-2 py-2.5 text-center">
    <p className="text-[20px] sm:text-[22px] font-semibold leading-none tabular-nums text-[#161827]">{value}</p>
    <p className="text-[11.5px] text-[#444A63] mt-1.5 leading-tight">{label}</p>
    {hint && <p className="text-[11px] text-[#6A6F85] mt-0.5 leading-tight">{hint}</p>}
  </div>
);

const SkipPlanner = ({ att, target, remaining }) => {
  const [sel, setSel] = useState("all");
  const [custom, setCustom] = useState(null);
  const [skip, setSkip] = useState(0);

  const ready = remaining?.status === "ready";
  const subjects = att?.subjects || [];
  const cur = sel === "all" ? { name: "All subjects", att: att?.att ?? 0, held: att?.held ?? 0, target }
    : subjects.find((s) => s.id === sel) || { name: "Subject", att: 0, held: 0, target };
  const left = !ready ? 0 : sel === "all"
    ? subjects.reduce((n, s) => n + (remaining.bySubject[String(s.id)] || 0), 0)
    : remaining.bySubject[String(sel)] || 0;

  const goal = custom ?? cur.target ?? target;
  const { att: a, held: h } = cur;
  const p = planOf(a, h, left, goal);
  const n = Math.min(skip, left);
  const predicted = p.total ? ((a + left - n) / p.total) * 100 : 0;
  const nowPct = h ? (a / h) * 100 : 0;
  const hit = predicted >= goal - 1e-9;
  const gap = Math.max(0, Math.ceil((goal / 100) * p.total - (a + left - n) - 1e-9));

  const pick = (id) => { setSel(id); setCustom(null); setSkip(0); };
  const pos = (v) => `${Math.max(0, Math.min(100, v))}%`;
  const tint = hit ? "text-emerald-700" : "text-amber-700";

  let verdict;
  if (!h) verdict = "Mark a few classes and your prediction will appear here.";
  else if (!ready) verdict = remaining?.status === "error" ? "Couldn't load your upcoming classes, so the prediction is hidden." : "Loading your upcoming classes…";
  else if (left === 0) verdict = "No classes left this semester. Your attendance is final.";
  else if (!p.canReach) verdict = `Even if you attend every class left, you'd finish at ${p.best.toFixed(1)}%, under ${goal}%.`;
  else if (hit) verdict = n === 0 ? `Attend everything and you'll finish at ${predicted.toFixed(1)}%. You still have ${p.canSkip} to spare.` : `Skipping ${n} of ${left}, you'd finish at ${predicted.toFixed(1)}%, safely above ${goal}%.`;
  else verdict = `Skipping ${n} would leave you ${gap} class${gap === 1 ? "" : "es"} short of ${goal}%. ${p.canSkip ? `Keep it to ${p.canSkip} or fewer.` : "Attend all of them."}`;

  return (
    <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={ready && left > 0 && <Badge tone="brand"><CalendarClock className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />{left} ahead</Badge>}>Skip planner</Title>

      <div className="flex gap-1.5 overflow-x-auto hm-scroll -mx-1 px-1 pb-1" role="group" aria-label="Choose a subject">
        {[{ id: "all", name: "All", color: null }, ...subjects].map((s) => (
          <button key={s.id} type="button" aria-pressed={sel === s.id} onClick={() => pick(s.id)}
            className={cx("h-9 shrink-0 inline-flex items-center gap-1.5 px-3.5 rounded-full text-[13px] font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50",
              sel === s.id ? "lg-pill lg-on text-white" : "lg-pill text-[#161827]/75")}>
            {s.color && <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: sel === s.id ? "#fff" : s.color }} />}{s.code || s.name}
          </button>
        ))}
      </div>

      <div className="mt-3 grid md:grid-cols-2 gap-3 md:gap-4 items-stretch">
        {/* prediction */}
        <div aria-live="polite" className={cx("rounded-2xl border p-3.5 sm:p-4", !h || !ready ? "lg-in" : hit ? "bg-emerald-500/[.07] border-emerald-200" : "bg-amber-500/[.09] border-amber-200")}>
          <p className="text-[12px] text-[#6A6F85]">{cur.name}: {nowPct.toFixed(1)}% now ({a}/{h})</p>
          <div className="flex items-end gap-2 mt-1">
            <p className={cx("text-[40px] sm:text-[48px] font-semibold leading-none tabular-nums", h && ready ? tint : "text-[#161827]/40")}>{h && ready ? predicted.toFixed(1) : "–"}<span className="text-[22px]">%</span></p>
            <p className="text-[12px] text-[#6A6F85] pb-1 leading-tight">predicted<br />at semester end</p>
          </div>

          {/* range: worst case to best case, with target and your plan */}
          {h > 0 && ready && left > 0 && (
            <div className="mt-4" role="img" aria-label={`Final attendance can range from ${p.worst.toFixed(0)} to ${p.best.toFixed(0)} percent. Target ${goal}. Your plan ${predicted.toFixed(1)}.`}>
              <div className="relative h-2.5 rounded-full bg-[#161827]/8">
                <span className="absolute inset-y-0 rounded-full bg-gradient-to-r from-amber-300 via-sky-300 to-emerald-300" style={{ left: pos(p.worst), width: `calc(${pos(p.best)} - ${pos(p.worst)})` }} />
                <span aria-hidden="true" className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded bg-[#161827]/55" style={{ left: pos(goal) }} />
                <span aria-hidden="true" className={cx("absolute top-1/2 w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-white shadow transition-[left] duration-300 motion-reduce:transition-none", hit ? "border-emerald-500" : "border-amber-500")} style={{ left: pos(predicted) }} />
              </div>
              <div className="flex justify-between text-[11px] text-[#6A6F85] mt-2 tabular-nums">
                <span>Skip all {p.worst.toFixed(0)}%</span><span>Target {goal}%</span><span>Attend all {p.best.toFixed(0)}%</span>
              </div>
            </div>
          )}
          <p className={cx("text-[13px] leading-snug mt-3", h && ready ? (hit ? "text-emerald-900" : "text-amber-900") : "text-[#6A6F85]")}>{verdict}</p>
        </div>

        {/* controls */}
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Left" value={ready ? left : "–"} hint="holidays excluded" />
            <Tile label="Can skip" value={ready && h ? (p.canReach ? p.canSkip : "–") : "–"} hint={ready && h && !p.canReach ? "out of reach" : "and hit goal"} />
            <Tile label="Must attend" value={ready && h ? (p.canReach ? p.need : "–") : "–"} hint="to hit goal" />
          </div>

          <div className="lg-in px-3.5 py-2">
            <label htmlFor="skip-n" className="flex items-center justify-between text-[13px] font-medium text-[#444A63]">
              If I skip <span className="text-[#161827] text-[15px] tabular-nums">{n} of {left}</span>
            </label>
            <input id="skip-n" type="range" className="hm-range" min="0" max={Math.max(left, 0)} step="1" value={n} disabled={!ready || left === 0}
              onChange={(e) => setSkip(Number(e.target.value))} />
            <div className="flex flex-wrap gap-1.5 pb-1">
              <button type="button" disabled={!ready || !left} onClick={() => setSkip(0)} className={cx(ghost, "!h-9 disabled:opacity-40")}>Attend all</button>
              <button type="button" disabled={!ready || !p.canReach || !p.canSkip} onClick={() => setSkip(p.canSkip)} className={cx(ghost, "!h-9 disabled:opacity-40")}>Safe max ({p.canReach ? p.canSkip : 0})</button>
            </div>
          </div>

          <div className="lg-in px-3.5 py-2">
            <label htmlFor="skip-goal" className="flex items-center justify-between text-[13px] font-medium text-[#444A63]">Target <span className="text-[#161827] text-[15px] tabular-nums">{goal}%</span></label>
            <input id="skip-goal" type="range" className="hm-range" min="50" max="95" step="5" value={goal} onChange={(e) => setCustom(Number(e.target.value))} />
          </div>
        </div>
      </div>
      <p className="text-[11.5px] text-[#6A6F85] mt-2.5 px-1">A prediction, not a promise. A new holiday or cancellation will change it.</p>
    </Card>
  );
};

const EventsCard = ({ events, today, demo }) => {
  const upcoming = events.filter((e) => e.endDate >= today && e.confirmed !== false).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 5);
  return (
    <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={!demo && <Link to={ROUTES.calendar} className="text-[13px] font-medium text-[#161827] underline-offset-2 hover:underline">Calendar</Link>}>Coming up</Title>
      {upcoming.length ? (
        <ul className="space-y-1.5">
          {upcoming.map((e) => (
            <li key={e.id} className="flex items-center gap-3 lg-in px-2.5 py-2">
              <span aria-hidden="true" className="w-11 shrink-0 rounded-xl py-1.5 text-center leading-none bg-white border border-[#161827]/10 text-[#161827]">
                <span className="block text-[15px] font-semibold">{local(e.startDate).getDate()}</span>
                <span className="block text-[10.5px] mt-1 text-[#6A6F85]">{local(e.startDate).toLocaleDateString("en-IN", { month: "short" })}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-[#161827] truncate">{e.title}</p>
                <p className="text-[12px] text-[#6A6F85]">{e.endDate !== e.startDate ? `${fmtShort(e.startDate)} to ${fmtShort(e.endDate)}` : fmtShort(e.startDate)}</p>
              </div>
              <Badge tone={tone[e.type] || "amber"}>{e.type}</Badge>
            </li>
          ))}
        </ul>
      ) : <p className="text-[13.5px] text-[#6A6F85]">Nothing scheduled. Holidays, exams and quizzes will show up here.</p>}
    </Card>
  );
};

const OfficialCard = ({ official, onReadAll, demo }) => (
  <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
    <Title right={official.joined && official.unread > 0 && <button type="button" onClick={onReadAll} className={ghost}><CheckCheck className="w-4 h-4" aria-hidden="true" />Mark all read</button>}>
      Official updates {official.unread > 0 && <span className="ml-1 align-middle"><Badge tone="brand">{official.unread} new</Badge></span>}
    </Title>
    {official.joined ? (
      official.updates.length ? (
        <ul className="space-y-1.5">
          {official.updates.slice(0, 4).map((u) => (
            <li key={u.id || u._id} className="flex flex-wrap items-start gap-2.5 lg-in px-3 py-2">
              <span aria-hidden="true" className={cx("mt-1.5 w-2 h-2 rounded-full shrink-0", u.readAt || u.read ? "bg-transparent" : "bg-sky-500")} />
              <p className="text-[13px] leading-snug text-[#161827] min-w-0 flex-1">{typeof u.summary === "string" ? u.summary : u.summary?.text || `A ${u.targetKind || "schedule"} was ${u.change || "updated"}.`}</p>
              {u.status === "pending" && <Badge tone="amber">Needs you</Badge>}
            </li>
          ))}
        </ul>
      ) : <p className="text-[13.5px] text-[#6A6F85]">You're in sync with your CR. Changes will appear here.</p>
    ) : official.joinable ? (
      <div className="rounded-2xl border border-[#161827]/10 bg-white/70 p-3.5">
        <p className="text-[14px] font-semibold text-[#161827]">Your CR has published a timetable</p>
        <p className="text-[13px] text-[#6A6F85] mt-1">Join it to get classes, exams and cancellations without retyping anything.</p>
        <Link to={ROUTES.official} className={cx(ghost, "mt-3")}>Preview and join</Link>
      </div>
    ) : <p className="text-[13.5px] text-[#6A6F85]">No official timetable for your class yet. Once your CR publishes one, you can join it here.</p>}
    {!demo && official.joined && <Link to={ROUTES.official} className="inline-block mt-3 text-[13px] font-medium text-[#161827] underline-offset-2 hover:underline">Review all updates</Link>}
  </Card>
);

/* ================= Hero: what's next + quick stats (clear white liquid glass) ================= */
const mins = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };

const NextUp = ({ vm }) => {
  const { today, att, official, target, days } = vm;
  const list = today?.classes || [];
  const next = today?.nextClass || list.find((c) => c.status === "pending");
  const counted = list.filter((c) => c.status !== "cancelled" && c.status !== "not_counted");
  const done = counted.filter((c) => c.status !== "pending").length;
  const toGo = counted.length - done;
  const left = next && today?.now ? mins(next.start) - mins(today.now) : null;
  const when = left == null || left <= 0 ? "Up next today" : `Starts in ${left >= 60 ? `${Math.floor(left / 60)}h ${left % 60}m` : `${left} min`}`;

  // Nothing left today: look ahead for the first class on a later (loaded) day.
  let ahead = null;
  if (!next && today?.date && days?.length) {
    const base = local(today.date);
    for (let o = 1; o <= LOOKAHEAD && !ahead; o++) {
      const d = days.find((x) => x.date === toIso(addDays(base, o)));
      const c = d?.classes?.find((x) => x.status !== "cancelled" && x.status !== "not_counted");
      if (c) ahead = { c, o, date: d.date };
    }
  }
  const aheadLabel = ahead ? (ahead.o === 1 ? "Tomorrow" : dayName(ahead.date, "long")) : "";
  const hero = next || ahead?.c;
  const accent = hero?.color || "#94A3B8";

  const stats = [
    { k: "Attendance", v: att?.pct == null ? "–" : `${Math.round(att.pct)}%`, s: `target ${target}%`, good: (att?.pct ?? 0) >= target },
    { k: "Marked", v: `${done}/${counted.length}`, s: toGo ? `${toGo} to go` : counted.length ? "all done" : "no classes" },
    { k: "Updates", v: official.unread, s: official.joined ? "unread" : "not joined" },
  ];
  return (
    <Glass className="relative lq-glow overflow-hidden p-3.5 min-[380px]:p-4 sm:p-6 grid min-w-0 md:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] gap-4 sm:gap-5 md:gap-8 items-center" aria-label="Next class" role="region">
      <div className="relative min-w-0">
        <p className="inline-flex items-center gap-2 rounded-full lq-btn px-3 py-1.5 text-[12px] font-semibold text-[#161827]">
          <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: accent, boxShadow: `0 0 0 4px ${accent}26` }} />
          {next ? when : ahead ? `Next class, ${aheadLabel}` : "You're done"}
        </p>
        <p className="text-[22px] sm:text-[32px] font-semibold tracking-tight leading-[1.1] text-[#161827] mt-2.5 truncate">
          {hero ? hero.name : "No more classes today"}
        </p>
        {hero ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] font-medium text-[#161827] tabular-nums"><Clock className="w-3.5 h-3.5 text-[#6A6F85]" aria-hidden="true" />{hero.start} to {hero.end}</span>
            {hero.room && <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] font-medium text-[#161827]"><MapPin className="w-3.5 h-3.5 text-[#6A6F85]" aria-hidden="true" />{hero.room}</span>}
            {!next && ahead && <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] font-medium text-[#161827]"><CalendarDays className="w-3.5 h-3.5 text-[#6A6F85]" aria-hidden="true" />{fmtShort(ahead.date)}</span>}
          </div>
        ) : <p className="text-[13.5px] text-[#6A6F85] mt-2">Nothing scheduled in the next two weeks.</p>}
        {counted.length > 0 && (
          <div className="mt-3.5 max-w-sm" role="img" aria-label={`${done} of ${counted.length} classes marked today`}>
            <div className="h-1.5 rounded-full bg-[#161827]/[.07] overflow-hidden">
              <span className="block h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(done / counted.length) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="relative grid grid-cols-3 gap-2 min-w-0">
        {stats.map((x) => (
          <div key={x.k} className="lq-in p-2 min-h-[72px] sm:min-h-[88px] flex flex-col items-center justify-center text-center">
            <p className={cx("text-[19px] min-[380px]:text-[21px] sm:text-[26px] font-semibold leading-none tabular-nums", x.good === false ? "text-amber-700" : x.good ? "text-emerald-700" : "text-[#161827]")}>{x.v}</p>
            <p className="text-[11.5px] sm:text-[12px] font-medium text-[#444A63] mt-1.5 leading-tight">{x.k}</p>
            <p className="text-[10.5px] sm:text-[11.5px] text-[#6A6F85] mt-0.5 leading-tight">{x.s}</p>
          </div>
        ))}
      </div>
    </Glass>
  );
};

/* One view for both audiences: live data for users, sample data for visitors. */
const DashboardView = ({ vm, remaining, note, onMark, onReadAll, onLoadDay }) => (
  <div className="space-y-3 sm:space-y-4">
    <NextUp vm={vm} />
    <div className="grid lg:grid-cols-12 gap-3 sm:gap-4">
      <div className="lg:col-span-7 [&>*]:h-full">
        {vm.today
          ? <ScheduleCard today={vm.today} days={vm.days || []} events={vm.events || []} note={note} onMark={onMark} onLoadDay={onLoadDay} demo={vm.demo} />
          : <Card className="p-5 text-[13.5px] text-[#6A6F85]">Today's classes could not be loaded.</Card>}
      </div>
      <div className="lg:col-span-5"><AttendanceCard att={vm.att} target={vm.target} demo={vm.demo} /></div>
    </div>
    <SkipPlanner att={vm.att} target={vm.target} remaining={remaining} />
    {vm.week?.length > 0 && <WeekCard week={vm.week} demo={vm.demo} />}
    <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
      <EventsCard events={vm.events || []} today={vm.today?.date || toIso(new Date())} demo={vm.demo} />
      <OfficialCard official={vm.official} onReadAll={onReadAll} demo={vm.demo} />
    </div>
  </div>
);

/* Signed-in dashboard: fetches the classes still to come, then renders the shared view. */
const LiveDashboard = ({ vm, note, onMark, onReadAll, onLoadDay }) => {
  const remaining = useRemainingClasses(vm.setup);
  return <DashboardView vm={vm} remaining={remaining} note={note} onMark={onMark} onReadAll={onReadAll} onLoadDay={onLoadDay} />;
};

const Skeleton = () => (
  <div className="space-y-3 animate-pulse" aria-busy="true" aria-label="Loading your home page">
    <div className="h-10 w-64 lg-in" />
    <div className="h-32 lg" />
    <div className="grid lg:grid-cols-[1.25fr_1fr] gap-3"><div className="h-72 lg" /><div className="h-48 lg" /></div>
    <div className="h-40 lg" />
  </div>
);

/* ================= signed in ================= */
const LiveHome = ({ user }) => {
  const live = useLive(true);
  const first = (user.fullName || user.username || "there").split(" ")[0];
  const vm = live.vm;
  return (
    <>
      <header className="hm-rise flex flex-wrap items-end justify-between gap-3 mb-4 sm:mb-5">
        <div className="min-w-0">
          <p className="text-[12.5px] text-[#6A6F85]">{fmtLong(vm?.today?.date || toIso(new Date()))}</p>
          <h1 className="text-[24px] min-[380px]:text-[26px] sm:text-[32px] font-semibold tracking-tight leading-[1.1] text-[#161827] mt-0.5 break-words">{greeting()}, {first}</h1>
          {vm && <p className="text-[13px] text-[#6A6F85] mt-1">{vm.setup.name}, target {vm.target}%</p>}
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button type="button" aria-label="Refresh" onClick={live.reload} className={ghost}><RefreshCw className={cx("w-4 h-4", live.loading && "animate-spin")} aria-hidden="true" /><span className="hidden sm:inline">Refresh</span></button>
          {vm && <Link to={vm.cr ? ROUTES.crStudio : ROUTES.crRequest} className={ghost}><Megaphone className="w-4 h-4" aria-hidden="true" />{vm.cr ? "CR Studio" : "Become a CR"}</Link>}
          <Link to={ROUTES.dashboard} className={ghost}>Dashboard</Link>
        </div>
      </header>

      {live.loading && !vm && <Skeleton />}
      {live.error && (
        <Card className="p-4 mb-3 border-rose-200" role="alert">
          <p className="text-[14.5px] font-semibold text-[#161827]">We couldn't load your home page</p>
          <p className="text-[13px] text-[#6A6F85] mt-1">{live.error}. If the server was asleep, it can take up to a minute to wake up.</p>
          <button type="button" onClick={live.reload} className={cx(ghost, "mt-3")}><RefreshCw className="w-4 h-4" aria-hidden="true" />Try again</button>
        </Card>
      )}
      {live.noSetup && (
        <Card className="p-6 sm:p-10 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-white border border-[#161827]/10 text-[#161827] flex items-center justify-center"><CalendarDays className="w-6 h-6" aria-hidden="true" /></span>
          <h2 className="text-[21px] font-semibold text-[#161827] mt-4">Set up your semester</h2>
          <p className="text-[14px] text-[#6A6F85] mt-2 max-w-md mx-auto">Add your semester dates, then your subjects and weekly classes. You can also join your CR's official timetable once it's published.</p>
          <Link to={ROUTES.setup} className={cx(linkBase, linkPrimary, "mt-6")}>Create your first setup<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
        </Card>
      )}
      {vm && <LiveDashboard vm={vm} note={live.note} onMark={live.mark} onReadAll={live.readAll} onLoadDay={live.loadDay} />}
    </>
  );
};

/* ================= signed out ================= */
const features = [
  { icon: CalendarDays, title: "Weekly timetable", text: "Build your setup once. Every class for the semester is generated for you." },
  { icon: CheckCircle2, title: "Honest attendance", text: "Mark present, absent or excused in one tap. Holidays and cancellations never count against you." },
  { icon: CalendarClock, title: "Semester forecast", text: "See how many of the remaining classes you can skip and still finish above your target." },
  { icon: CalendarRange, title: "Academic calendar", text: "Exams, quizzes and holidays sit on the same calendar as your classes." },
  { icon: Users, title: "Share with classmates", text: "Publish your setup so others can take their own copy and edit it." },
  { icon: Megaphone, title: "Official schedule", text: "Your CR publishes the timetable. Join it and every change reaches you without retyping." },
];
const faqs = [
  { q: "Do I need my CR to use it?", a: "No. You can build your own timetable and track attendance alone. If your CR publishes an official schedule, you can join it to stay in sync." },
  { q: "How does the skip planner predict my attendance?", a: "It counts the classes still on your calendar, with holidays and cancellations removed, and shows where you'd finish for any number you choose to skip." },
  { q: "What happens on holidays and cancelled classes?", a: "They sit on the calendar and the affected classes are handled for you, so they don't count against your attendance." },
  { q: "Can I share my timetable with friends?", a: "Yes. Publish your setup and classmates in your college can take their own copy, which they can then edit." },
  { q: "How does someone become a CR?", a: "They request the role with their college, branch and section. A college admin reviews and approves it before they can publish schedules." },
];

const Faq = () => {
  const [open, setOpen] = useState(0);
  return (
    <div className="max-w-3xl mx-auto lg divide-y divide-[#161827]/8 overflow-hidden">
      {faqs.map((f, i) => {
        const on = open === i;
        return (
          <div key={f.q}>
            <button type="button" aria-expanded={on} aria-controls={`faq-${i}`} onClick={() => setOpen(on ? -1 : i)} className="w-full flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5 text-left hover:bg-white/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400">
              <span className="text-[14.5px] font-semibold text-[#161827]">{f.q}</span>
              <ChevronDown className={cx("w-5 h-5 shrink-0 text-[#6A6F85] transition-transform duration-200 motion-reduce:transition-none", on && "rotate-180")} aria-hidden="true" />
            </button>
            <div id={`faq-${i}`} className={cx("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className={cx("overflow-hidden", !on && "invisible")}><p className="px-4 sm:px-5 pb-4 text-[14px] leading-relaxed text-[#6A6F85]">{f.a}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const H2 = "text-[22px] sm:text-[30px] font-semibold tracking-tight leading-[1.15] text-[#161827]";

const Landing = () => {
  const demo = useDemo();
  return (
    <>
      <section className="w-full min-w-0 max-w-3xl mx-auto text-center pt-2 sm:pt-8">
        <h1 className="hm-rise text-[32px] min-[380px]:text-[36px] sm:text-[52px] font-semibold tracking-[-0.025em] leading-[1.07] text-[#161827]">Know what's next, and whether you can skip it.</h1>
        <p className="hm-rise text-[15px] sm:text-[17px] leading-relaxed text-[#444A63] mt-4 max-w-xl mx-auto" style={{ animationDelay: "80ms" }}>
          Your timetable, attendance and academic calendar in one calm place, kept in sync with your class representative.
        </p>
        <div className="hm-rise flex flex-col min-[420px]:flex-row justify-center gap-2.5 mt-6" style={{ animationDelay: "160ms" }}>
          <Link to={ROUTES.register} className={cx(linkBase, linkPrimary)}>Get started<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          <Link to={ROUTES.login} className={cx(linkBase, linkGlass)}>Log in</Link>
        </div>
        <ul className="hm-rise flex flex-wrap justify-center gap-x-5 gap-y-1.5 mt-5 text-[12.5px] text-[#6A6F85]" style={{ animationDelay: "240ms" }}>
          {["Works on phone and laptop", "Holidays handled for you", "Syncs with your CR"].map((t) => (
            <li key={t} className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />{t}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10 sm:mt-14" aria-label="Sample dashboard">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3 px-1">
          <h2 className="text-[16px] font-semibold text-[#161827]">Your home screen</h2>
          <p className="text-[12.5px] text-[#6A6F85]">Sample data. Mark a class, flip to tomorrow, then drag the skip slider.</p>
        </div>
        <DashboardView vm={demo.vm} remaining={demo.remaining} note="" onMark={demo.mark} onReadAll={demo.readAll} onLoadDay={demo.loadDay} />
      </section>

      <section className="mt-14 sm:mt-20">
        <h2 className={cx(H2, "max-w-xl")}>Built around how college actually works</h2>
        <p className="text-[14.5px] sm:text-[16px] leading-relaxed text-[#6A6F85] mt-2.5 max-w-xl">Changing timetables, holidays, quizzes and attendance rules are handled for you.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-6">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="lg p-4 sm:p-5">
              <span className="w-9 h-9 rounded-xl bg-white border border-[#161827]/10 text-[#161827] flex items-center justify-center"><Icon className="w-[18px] h-[18px]" aria-hidden="true" /></span>
              <h3 className="text-[15px] font-semibold text-[#161827] mt-3">{title}</h3>
              <p className="text-[13.5px] leading-relaxed text-[#6A6F85] mt-1">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 sm:mt-20">
        <div className="lg p-5 sm:p-9 grid md:grid-cols-[1.2fr_1fr] gap-6 md:gap-12 items-center">
          <div>
            <h2 className={H2}>Publish the timetable once. Your whole class stays in sync.</h2>
            <p className="text-[14.5px] leading-relaxed text-[#6A6F85] mt-3 max-w-lg">CR Studio manages the official schedule: subjects, weekly classes, exams and cancellations, with undo for every change.</p>
            <Link to={ROUTES.register} className={cx(linkBase, linkPrimary, "mt-5")}>Create an account<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          </div>
          <ul className="space-y-3">
            {["Publish the class timetable once", "Changes reach joined students automatically", "Undo or redo any change from the history"].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[14px] text-[#161827]"><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-px" aria-hidden="true" />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-14 sm:mt-20">
        <h2 className={cx(H2, "text-center mb-6")}>Questions, answered</h2>
        <Faq />
      </section>

      <section className="mt-14 sm:mt-20 pt-10 sm:pt-14 border-t border-[#161827]/8 text-center">
        <h2 className={H2}>Start the semester organised</h2>
        <p className="text-[14.5px] sm:text-[16px] text-[#6A6F85] mt-2.5">Set up your week in a few minutes.</p>
        <div className="flex flex-col min-[420px]:flex-row justify-center gap-2.5 mt-6">
          <Link to={ROUTES.register} className={cx(linkBase, linkPrimary)}>Get started<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          <Link to={ROUTES.login} className={cx(linkBase, linkGlass)}>Log in</Link>
        </div>
      </section>

      <div aria-hidden="true" className="h-20 md:hidden" />
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-[#161827]/8 bg-white/80 backdrop-blur-xl px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.65rem)]">
        <div className="flex gap-2">
          <Link to={ROUTES.login} className={cx(linkBase, linkGlass, "!w-auto flex-1")}>Log in</Link>
          <Link to={ROUTES.register} className={cx(linkBase, linkPrimary, "!w-auto flex-[1.6]")}>Get started</Link>
        </div>
      </div>
    </>
  );
};

/* ================= page ================= */
const Home = () => {
  const { user, loading } = useAuth();
  return (
    <div className="hm relative z-[1] w-full min-w-0 max-w-6xl xl:max-w-7xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 pt-4 sm:pt-10 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-20 overflow-x-clip">
      <style>{css}</style>
      <div aria-hidden="true" className="hm-wash" />
      {user ? <LiveHome key={user._id} user={user} /> : loading ? <Skeleton /> : <Landing />}
    </div>
  );
};

export default Home;
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BellRing, CalendarDays, CalendarRange, Check, CheckCheck, CheckCircle2, ChevronDown, Megaphone,
  Minus, MonitorSmartphone, RefreshCw, Users, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Badge, cx } from "../components/Ui";
import { homeApi, normOcc, normEvent, normAttendance, msg } from "../api/home";

/* Change these if your routes differ. */
const ROUTES = {
  dashboard: "/dashboard", attendance: "/attendance", calendar: "/calendar", official: "/official",
  setup: "/setup", crStudio: "/cr-studio", crRequest: "/cr-studio", register: "/register", login: "/login",
};

const css = `
@keyframes hm-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.hm-rise { animation: hm-rise .6s cubic-bezier(.22,1,.36,1) both; }
.hm button, .hm a { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.hm-scroll::-webkit-scrollbar { display: none; } .hm-scroll { scrollbar-width: none; }

/* Surfaces: translucent white, a hairline border and a very light shadow. */
.lg { background: rgba(255,255,255,.74); border: 1px solid rgba(22,24,39,.08); border-radius: 16px;
  -webkit-backdrop-filter: blur(16px) saturate(140%); backdrop-filter: blur(16px) saturate(140%);
  box-shadow: 0 1px 2px rgba(22,24,39,.04), 0 12px 28px -20px rgba(22,24,39,.18); }
.lg-in, .lg-pill { background: rgba(255,255,255,.7); border: 1px solid rgba(22,24,39,.08) !important; }
.lg-in { border-radius: 12px; }
.lg-pill { transition: background .15s, transform .15s; } .lg-pill:hover { background: #fff; } .lg-pill:active { transform: scale(.98); }
.lg-hot { background: #fff !important; border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,.12) !important; }
.lg-on { background: #4F46E5 !important; border-color: #4F46E5 !important; color: #fff; }
@media (prefers-reduced-motion: reduce) { .hm-rise, .animate-pulse { animation: none; } .lg-pill { transition: none; } }
`;

const Card = ({ className, ...p }) => <div className={cx("lg", className)} {...p} />;

const linkBase =
  "inline-flex w-full min-[420px]:w-auto items-center justify-center gap-2 h-12 px-6 rounded-full text-[15px] font-medium transition " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 active:scale-[0.98]";
const linkPrimary = "text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm";
const linkGlass = "lg-pill text-[#161827]";
const linkOnDark = "text-[#161827] bg-white hover:bg-white/90";
const ghost = "lg-pill inline-flex items-center gap-1.5 h-10 sm:h-9 min-w-10 justify-center px-3.5 rounded-full text-[13px] font-medium text-[#161827] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50";

/* ---------- date helpers (setup dates arrive as plain YYYY-MM-DD) ---------- */
const local = (s) => new Date(`${s}T00:00:00`);
const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtLong = (s) => local(s).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = (s) => local(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const tone = { holiday: "red", exam: "brand", quiz: "brand", event: "green" };

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

const demoBase = () => {
  const now = new Date();
  const today = toIso(now);
  const subj = (id) => DEMO_SUBJECTS.find((s) => s.id === id);
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  return {
    demo: true, target: 75, setup: { name: "Semester 5, CSE-A" },
    today: {
      date: today, events: [], nextDay: null,
      classes: DEMO_DAY.map(([id, sid, start, end, room, type, status, lock]) => ({
        id, subjectId: sid, name: subj(sid).name, code: subj(sid).code, color: subj(sid).color, start, end, room, type, status: status || "pending", lock: lock || null,
      })),
    },
    week: DEMO_WEEK.map((ids, i) => {
      const date = toIso(addDays(monday, i));
      return { date, isToday: date === today, classes: ids.map((sid, j) => ({ id: `${i}${j}`, code: subj(sid).code, color: subj(sid).color, start: `${9 + j}:00`, status: date < today ? "present" : "pending" })) };
    }),
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

const useDemo = () => {
  const base = useMemo(demoBase, []);
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
      mark: async (c, s) => setMarks((m) => ({ ...m, [c.id]: m[c.id] === s ? undefined : s })),
      readAll: async () => setRead(true),
      note: "", reload: () => {},
    };
  }, [base, marks, read]);
};

/* ================= live data (signed-in users) ================= */
const useLive = (enabled) => {
  const [st, setSt] = useState({ loading: enabled, vm: null, noSetup: false, error: "" });
  const [note, setNote] = useState("");

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
          week: (ok(1)?.days || []).map((d) => ({ date: d.date, isToday: d.isToday, classes: (d.classes || []).map(normOcc) })),
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
        vm: { ...p.vm, att: normAttendance(a, p.vm.target), week: w ? w.days.map((d) => ({ date: d.date, isToday: d.isToday, classes: (d.classes || []).map(normOcc) })) : p.vm.week },
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

  return { ...st, note, mark, readAll, reload: load };
};

/* ================= pieces ================= */
const Ring = ({ pct, target, size = 112 }) => {
  const r = 46, c = 2 * Math.PI * r, p = pct ?? 0, ok = p >= target;
  return (
    <div className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28" role="img" aria-label={`Attendance ${Math.round(p)} percent, target ${target} percent`}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-[#161827]/10" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, p) / 100)}
          className={cx("transition-all duration-700 motion-reduce:transition-none", ok ? "stroke-emerald-500" : "stroke-amber-500")} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] font-semibold text-[#161827] leading-none tabular-nums">{pct == null ? "–" : `${Math.round(p)}%`}</span>
        <span className="text-[11px] text-[#6A6F85] mt-1">target {target}%</span>
      </div>
    </div>
  );
};

const Title = ({ children, right }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
    <h2 className="text-[17px] sm:text-[19px] font-semibold tracking-tight text-[#161827]">{children}</h2>
    {right}
  </div>
);

const MarkBtn = ({ on, kind, label, onClick, disabled, children }) => (
  <button type="button" aria-pressed={on} aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className={cx("h-11 sm:h-10 w-full sm:w-10 rounded-full flex items-center justify-center gap-1.5 text-[13px] font-medium border transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
      on ? { p: "bg-emerald-500 border-emerald-500 text-white", a: "bg-rose-500 border-rose-500 text-white", e: "bg-indigo-500 border-indigo-500 text-white" }[kind] : "lg-pill text-[#161827]/70")}>
    {children}
  </button>
);

const ClassRow = ({ c, next, onPick }) => {
  const cancelled = c.status === "cancelled";
  const locked = c.lock === "outside_range" || c.lock === "official_cancellation" || c.status === "not_counted";
  return (
    <li className={cx("relative grid grid-cols-[3.25rem_minmax(0,1fr)] sm:grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 lg-in pl-5 pr-3 py-3 overflow-hidden", next && "lg-hot")}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: c.color }} />
      <div className="text-[12px] leading-tight tabular-nums text-[#6A6F85]">
        <span className="block text-[13.5px] font-semibold text-[#161827]">{c.start}</span>{c.end}
      </div>
      <div className="min-w-0">
        <p className={cx("text-[14.5px] font-semibold text-[#161827] truncate", cancelled && "line-through opacity-60")}>{c.name}</p>
        <p className="text-[12px] text-[#6A6F85] truncate">{[c.type, c.room].filter(Boolean).join(", ")}</p>
        {(next || (cancelled && !locked)) && <span className="mt-1 inline-block">{next ? <Badge tone="brand">Up next</Badge> : <Badge tone="red">Cancelled</Badge>}</span>}
      </div>
      <div className="col-span-2 sm:col-span-1 sm:justify-self-end">
        {locked ? (
          <Badge tone={cancelled ? "red" : "amber"}>{cancelled ? "Cancelled by CR" : "Not counted"}</Badge>
        ) : (
          <div className="grid grid-cols-3 sm:flex gap-1.5">
            <MarkBtn on={c.status === "present"} kind="p" label={`Mark ${c.name} present`} onClick={() => onPick(c, "present")}><Check className="w-4 h-4" aria-hidden="true" /><span className="sm:hidden">Present</span></MarkBtn>
            <MarkBtn on={c.status === "absent"} kind="a" label={`Mark ${c.name} absent`} onClick={() => onPick(c, "absent")}><X className="w-4 h-4" aria-hidden="true" /><span className="sm:hidden">Absent</span></MarkBtn>
            <MarkBtn on={c.status === "excused"} kind="e" label={`Mark ${c.name} excused`} onClick={() => onPick(c, "excused")}><Minus className="w-4 h-4" aria-hidden="true" /><span className="sm:hidden">Excused</span></MarkBtn>
          </div>
        )}
      </div>
    </li>
  );
};

const TodayCard = ({ today, note, onMark, demo }) => {
  const [ask, setAsk] = useState(null);
  const pick = (c, s) => (c.lock === "cancelled_by_cause" ? setAsk({ c, s }) : onMark(c, s));
  const nextId = today.nextClass?.id;
  return (
    <Card className="p-5 sm:p-6">
      <Title right={demo ? <Badge tone="brand">Sample day</Badge> : <Badge tone="brand">{today.classes.length} {today.classes.length === 1 ? "class" : "classes"}</Badge>}>Today</Title>

      {today.events?.map((e) => (
        <div key={e.id} className="mb-3 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-900">
          <BellRing className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span><b className="font-semibold">{e.title}</b>{e.affectsClasses ? ". Affected classes are cancelled." : "."}</span>
        </div>
      ))}

      {note && <p role="alert" className="mb-3 rounded-2xl border border-rose-200 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-[#A32A42]">{note}</p>}
      {ask && (
        <div role="alertdialog" aria-label="Mark a cancelled class" className="sticky top-2 z-10 mb-3 rounded-2xl border border-indigo-200 bg-white px-3.5 py-3 shadow-[0_12px_30px_-12px_rgba(79,70,229,0.5)]">
          <p className="text-[13.5px] text-[#161827]"><b>{ask.c.name}</b> was cancelled by a holiday or class cancel. Mark it {ask.s} anyway?</p>
          <div className="flex gap-2 mt-2.5">
            <button type="button" className={cx(ghost, "lg-on !text-white")} onClick={() => { onMark(ask.c, ask.s, true); setAsk(null); }}>Mark {ask.s}</button>
            <button type="button" className={ghost} onClick={() => setAsk(null)}>Keep cancelled</button>
          </div>
        </div>
      )}

      {today.classes.length ? (
        <ul className="space-y-2">{today.classes.map((c) => <ClassRow key={c.id} c={c} next={c.id === nextId} onPick={pick} />)}</ul>
      ) : (
        <div className="lg-in px-4 py-8 text-center">
          <p className="text-[15px] font-semibold text-[#161827]">No classes today</p>
          <p className="text-[13px] text-[#6A6F85] mt-1">{today.nextDay ? `Next classes: ${fmtLong(today.nextDay.date)}, ${today.nextDay.classCount} scheduled.` : "Enjoy the free day."}</p>
        </div>
      )}
      
      <p className="text-[12px] text-[#6A6F85] mt-3 px-1">
        {demo ? "Try it. Tap a button and watch your attendance move." : "Tap the same button again to clear a mark."}
      </p>
    </Card>
  );
};

const AttendanceCard = ({ att, target, demo }) => {
  if (!att) return <Card className="p-5"><Title>Attendance</Title><p className="text-[13.5px] text-[#6A6F85]">Attendance could not be loaded. Pull to refresh or try again in a moment.</p></Card>;
  const ok = (att.pct ?? 0) >= target;
  return (
    <Card className="p-5 sm:p-6">
      <Title right={!demo && <Link to={ROUTES.attendance} className="text-[13px] font-medium text-indigo-700 hover:underline">Details</Link>}>Attendance</Title>
      <div className="flex items-center gap-4">
        <Ring pct={att.pct} target={target} />
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-[#161827]">{att.held === 0 ? "No classes counted yet" : ok ? "You're on track" : "Below your target"}</p>
          <p className="text-[12.5px] text-[#6A6F85] mt-0.5 tabular-nums">{att.att} of {att.held} classes attended</p>
        </div>
      </div>
      <ul className="mt-5 space-y-3">
        {att.subjects.map((s) => {
          const good = (s.pct ?? 0) >= s.target;
          return (
            <li key={s.id || s.name}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2 min-w-0 font-medium text-[#161827]"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} /><span className="truncate">{s.name}</span></span>
                <span className={cx("tabular-nums font-semibold", good ? "text-emerald-700" : "text-amber-700")}>{s.pct == null ? "–" : `${Math.round(s.pct)}%`}</span>
              </div>
              <div className="relative h-2 rounded-full bg-[#161827]/8 mt-1.5" role="img" aria-label={`${s.name}: ${s.att} of ${s.held} attended, target ${s.target} percent`}>
                <span className={cx("absolute inset-y-0 left-0 rounded-full", good ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${Math.min(100, s.pct ?? 0)}%` }} />
                <span aria-hidden="true" className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-[#161827]/50" style={{ left: `${s.target}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

const dayName = (d, f = "short") => local(d).toLocaleDateString("en-IN", { weekday: f });
const Mark = ({ st }) => st === "present" ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Present" /> : st === "absent" ? <X className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-label="Absent" /> : null;

const WeekCard = ({ week, demo }) => {
  const [sel, setSel] = useState(() => (week.find((d) => d.isToday) || week[0]).date);
  const day = week.find((d) => d.date === sel) || week[0];
  return (
    <Card className="p-5 sm:p-6">
      <Title right={!demo && <Link to={ROUTES.attendance} className="text-[13px] font-medium text-indigo-700 hover:underline">Timetable</Link>}>This week</Title>

      <div className="lg:hidden">
        <div role="tablist" aria-label="Pick a day" className="grid grid-cols-7 gap-1.5">
          {week.map((d) => (
            <button key={d.date} type="button" role="tab" aria-selected={d.date === sel} onClick={() => setSel(d.date)}
              className={cx("flex flex-col items-center gap-0.5 rounded-2xl border py-2 min-h-[64px] text-[12px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50", d.date === sel ? "lg-on" : "lg-pill text-[#161827]", d.isToday && d.date !== sel && "!border-indigo-300")}>
              <span className="opacity-80">{dayName(d.date)}</span>
              <span className="text-[15px] font-semibold leading-tight">{local(d.date).getDate()}</span>
              <span className="flex gap-0.5 h-1.5 items-center">{d.classes.slice(0, 4).map((c) => <i key={c.id} className="w-1.5 h-1.5 rounded-full" style={{ background: d.date === sel ? "#fff" : c.color }} />)}</span>
            </button>
          ))}
        </div>
        <p className="text-[13px] font-medium text-[#161827] mt-4 mb-2">{fmtLong(day.date)}{day.isToday ? " (today)" : ""}</p>
        {day.classes.length ? (
          <ul className="space-y-2">
            {day.classes.map((c) => (
              <li key={c.id} className="relative lg-in flex items-center gap-3 pl-5 pr-3 py-2.5 overflow-hidden">
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: c.color }} />
                <span className="w-12 text-[13px] font-semibold tabular-nums text-[#161827]">{c.start}</span>
                <span className={cx("min-w-0 flex-1 truncate text-[14px] font-medium text-[#161827]", c.status === "cancelled" && "line-through opacity-60")}>{c.name || c.code}</span>
                {c.status === "cancelled" ? <Badge tone="red">Cancelled</Badge> : <Mark st={c.status} />}
              </li>
            ))}
          </ul>
        ) : <p className="lg-in px-4 py-6 text-center text-[13.5px] text-[#6A6F85]">No classes this day.</p>}
      </div>

      <div className="hidden lg:grid grid-cols-7 gap-2">
        {week.map((d) => (
          <div key={d.date} className={cx("lg-in p-2 min-h-[116px]", d.isToday && "lg-hot")}>
            <p className={cx("px-1 pb-1.5 text-[12px] font-semibold", d.isToday ? "text-indigo-700" : "text-[#161827]")}>{dayName(d.date)} <span className="font-normal text-[#6A6F85]">{local(d.date).getDate()}</span></p>
            <div className="space-y-1">
              {d.classes.length === 0 && <p className="px-1 text-[12px] text-[#6A6F85]">Free</p>}
              {d.classes.map((c) => (
                <div key={c.id} className={cx("flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12px] font-medium bg-white/70 border border-white/80", c.status === "cancelled" && "opacity-55 line-through")}>
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

const SkipCard = ({ att, target }) => {
  const [sel, setSel] = useState("all");
  const [custom, setCustom] = useState(null);
  const cur = sel === "all" ? { name: "All subjects", att: att?.att ?? 0, held: att?.held ?? 0, target } : att?.subjects.find((s) => s.id === sel) || { att: 0, held: 0, target };
  const goal = custom ?? cur.target ?? target;
  const t = goal / 100, a = cur.att, h = cur.held;
  const pct = h ? (a / h) * 100 : 0;
  const canMiss = Math.max(0, Math.floor(a / t - h + 1e-9));
  const need = pct < goal ? Math.ceil((t * h - a) / (1 - t) - 1e-9) : 0;
  const good = pct >= goal;
  return (
    <Card className="p-5 sm:p-6">
      <Title>Can I skip?</Title>
      <div className="flex gap-1.5 overflow-x-auto hm-scroll -mx-1 px-1 pb-1" role="group" aria-label="Choose a subject">
        {[{ id: "all", name: "All" }, ...(att?.subjects || [])].map((s) => (
          <button key={s.id} type="button" aria-pressed={sel === s.id} onClick={() => { setSel(s.id); setCustom(null); }}
            className={cx("h-10 shrink-0 px-3.5 rounded-full text-[13px] font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
              sel === s.id ? "lg-pill lg-on text-white" : "lg-pill text-[#161827]/75")}>{s.code || s.name}</button>
        ))}
      </div>
      <div aria-live="polite" className={cx("mt-3 rounded-2xl border p-5 text-center", !h ? "lg-in" : good ? "bg-emerald-500/10 border-emerald-200" : "bg-amber-500/12 border-amber-200")}>
        {!h ? <p className="text-[14px] text-[#6A6F85]">Mark a few classes and this will tell you how many you can miss.</p> : (
          <>
            <p className={cx("text-[13px] font-medium", good ? "text-emerald-800" : "text-amber-800")}>{cur.name}: {pct.toFixed(1)}% ({a}/{h}). {good ? "You can miss" : "Attend the next"}</p>
            <p className={cx("text-[64px] font-semibold leading-none mt-2 tabular-nums", good ? "text-emerald-700" : "text-amber-700")}>{good ? canMiss : need}</p>
            <p className={cx("text-[14px] mt-2", good ? "text-emerald-800" : "text-amber-800")}>
              {good ? `more class${canMiss === 1 ? "" : "es"} and still stay at ${goal}%.` : `class${need === 1 ? "" : "es"} in a row to reach ${goal}%.`}
            </p>
          </>
        )}
      </div>
      <label className="flex items-center justify-between text-[13px] font-medium text-[#6A6F85] mt-4 px-1">Target <span className="text-[#161827] text-[14px]">{goal}%</span></label>
      <input type="range" min="50" max="95" step="5" value={goal} onChange={(e) => setCustom(Number(e.target.value))} aria-label="Attendance target" className="w-full h-11 accent-indigo-600" />
    </Card>
  );
};

const EventsCard = ({ events, today, demo }) => {
  const upcoming = events.filter((e) => e.endDate >= today && e.confirmed !== false).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 5);
  return (
    <Card className="p-5 sm:p-6">
      <Title right={!demo && <Link to={ROUTES.calendar} className="text-[13px] font-medium text-indigo-700 hover:underline">Calendar</Link>}>Coming up</Title>
      {upcoming.length ? (
        <ul className="space-y-2">
          {upcoming.map((e) => (
            <li key={e.id} className="flex items-center gap-3 lg-in px-3 py-2.5">
              <span aria-hidden="true" className="w-12 shrink-0 rounded-xl py-1.5 text-center leading-none bg-indigo-500/10 border border-indigo-200 text-indigo-700">
                <span className="block text-[16px] font-semibold">{local(e.startDate).getDate()}</span>
                <span className="block text-[11px] mt-1">{local(e.startDate).toLocaleDateString("en-IN", { month: "short" })}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[#161827] truncate">{e.title}</p>
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
  <Card className="p-5 sm:p-6">
    <Title right={official.joined && official.unread > 0 && <button type="button" onClick={onReadAll} className={ghost}><CheckCheck className="w-4 h-4" aria-hidden="true" />Mark all read</button>}>
      Official updates {official.unread > 0 && <span className="ml-1 align-middle"><Badge tone="brand">{official.unread} new</Badge></span>}
    </Title>
    {official.joined ? (
      official.updates.length ? (
        <ul className="space-y-2">
          {official.updates.slice(0, 4).map((u) => (
            <li key={u.id || u._id} className="flex items-start gap-2.5 lg-in px-3 py-2.5">
              <span aria-hidden="true" className={cx("mt-1.5 w-2 h-2 rounded-full shrink-0", u.readAt || u.read ? "bg-transparent" : "bg-indigo-500")} />
              <p className="text-[13.5px] leading-snug text-[#161827] min-w-0 flex-1">{typeof u.summary === "string" ? u.summary : u.summary?.text || `A ${u.targetKind || "schedule"} was ${u.change || "updated"}.`}</p>
              {u.status === "pending" && <Badge tone="amber">Needs you</Badge>}
            </li>
          ))}
        </ul>
      ) : <p className="text-[13.5px] text-[#6A6F85]">You're in sync with your CR. Changes will appear here.</p>
    ) : official.joinable ? (
      <div className="rounded-2xl border border-indigo-200 bg-indigo-500/10 p-4">
        <p className="text-[14px] font-semibold text-[#161827]">Your CR has published a timetable</p>
        <p className="text-[13px] text-[#6A6F85] mt-1">Join it to get classes, exams and cancellations without retyping anything.</p>
        <Link to={ROUTES.official} className={cx(ghost, "mt-3")}>Preview and join</Link>
      </div>
    ) : <p className="text-[13.5px] text-[#6A6F85]">No official timetable for your class yet. Once your CR publishes one, you can join it here.</p>}
    {!demo && official.joined && <Link to={ROUTES.official} className="inline-block mt-3 text-[13px] font-medium text-indigo-700 hover:underline">Review all updates</Link>}
  </Card>
);

const mins = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
const NextUp = ({ vm }) => {
  const { today, att, official, target } = vm;
  const list = today?.classes || [];
  const next = today?.nextClass || list.find((c) => c.status === "pending");
  const counted = list.filter((c) => c.status !== "cancelled" && c.status !== "not_counted");
  const done = counted.filter((c) => c.status !== "pending").length;
  const left = next && today?.now ? mins(next.start) - mins(today.now) : null;
  const when = left == null || left <= 0 ? "Up next" : `Starts in ${left >= 60 ? `${Math.floor(left / 60)}h ${left % 60}m` : `${left} min`}`;
  const stats = [
    { k: "Attendance", v: att?.pct == null ? "–" : `${Math.round(att.pct)}%`, s: `target ${target}%`, good: (att?.pct ?? 0) >= target },
    { k: "Marked today", v: `${done}/${counted.length}`, s: counted.length - done ? `${counted.length - done} to go` : "all done" },
    { k: "Updates", v: official.unread, s: official.joined ? "unread" : "not joined" },
  ];
  return (
    <section className="lg lg-hot overflow-hidden p-5 sm:p-6 grid md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] gap-5 md:gap-8 items-center" aria-label="Next class">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: next?.color || "#4F46E5" }} />
      <div className="relative min-w-0">
        <p className="text-[13.5px] font-medium text-[#6A6F85]">{next ? when : "You're done"}</p>
        <p className="text-[24px] sm:text-[32px] font-semibold tracking-tight leading-[1.1] text-[#161827] mt-1 truncate">{next ? next.name : "No more classes today"}</p>
        {next && <p className="text-[14.5px] text-[#444A63] mt-1.5 tabular-nums">{next.start} to {next.end}{next.room ? `, ${next.room}` : ""}</p>}
      </div>
      <div className="relative grid grid-cols-3 gap-2.5">
        {stats.map((x) => (
          <div key={x.k} className="lg-in p-3 min-h-[84px] sm:min-h-[92px] flex flex-col items-center justify-center text-center">
            <p className={cx("text-[22px] sm:text-[26px] font-semibold leading-none tabular-nums", x.good === false ? "text-amber-700" : x.good ? "text-emerald-700" : "text-[#161827]")}>{x.v}</p>
            <p className="text-[12px] sm:text-[12px] text-[#6A6F85] mt-1.5 leading-tight">{x.k}</p>
            <p className="text-[12px] text-[#6A6F85]/80 mt-0.5">{x.s}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

/* One view for both audiences: live data for users, sample data for visitors. */
const DashboardView = ({ vm, note, onMark, onReadAll }) => (
  <div className="space-y-4 sm:space-y-5">
    <NextUp vm={vm} />
    <div className="grid lg:grid-cols-12 gap-4 sm:gap-5">
      <div className="lg:col-span-7 [&>*]:h-full">
        {vm.today ? <TodayCard today={vm.today} note={note} onMark={onMark} demo={vm.demo} /> : <Card className="p-5 text-[13.5px] text-[#6A6F85]">Today's classes could not be loaded.</Card>}
      </div>
      <div className="lg:col-span-5 [&>*]:h-full"><AttendanceCard att={vm.att} target={vm.target} demo={vm.demo} /></div>
    </div>
    {vm.week?.length > 0 && <WeekCard week={vm.week} demo={vm.demo} />}
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
      <SkipCard att={vm.att} target={vm.target} />
      <EventsCard events={vm.events || []} today={vm.today?.date || toIso(new Date())} demo={vm.demo} />
      <div className="md:col-span-2 xl:col-span-1 [&>*]:h-full"><OfficialCard official={vm.official} onReadAll={onReadAll} demo={vm.demo} /></div>
    </div>
  </div>
);

const Skeleton = () => (
  <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading your home page">
    <div className="h-10 w-72 lg-in" />
    <div className="grid lg:grid-cols-[1.25fr_1fr] gap-4"><div className="h-80 lg" /><div className="h-80 lg" /></div>
    <div className="h-44 lg" />
  </div>
);

/* ================= signed in ================= */
const LiveHome = ({ user }) => {
  const live = useLive(true);
  const first = (user.fullName || user.username || "there").split(" ")[0];
  const vm = live.vm;
  return (
    <>
      <header className="hm-rise flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-[13.5px] text-[#6A6F85]">{fmtLong(vm?.today?.date || toIso(new Date()))}</p>
          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight leading-[1.1] text-[#161827] mt-1">{greeting()}, {first}</h1>
          {vm && <p className="text-[14px] text-[#6A6F85] mt-1.5">{vm.setup.name}, target {vm.target}%</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Refresh" onClick={live.reload} className={ghost}><RefreshCw className={cx("w-4 h-4", live.loading && "animate-spin")} aria-hidden="true" /><span className="hidden sm:inline">Refresh</span></button>
          {vm && <Link to={vm.cr ? ROUTES.crStudio : ROUTES.crRequest} className={ghost}><Megaphone className="w-4 h-4" aria-hidden="true" />{vm.cr ? "CR Studio" : "Become a CR"}</Link>}
          <Link to={ROUTES.dashboard} className={ghost}>Dashboard</Link>
        </div>
      </header>

      {live.loading && !vm && <Skeleton />}
      {live.error && (
        <Card className="p-5 mb-4 border-rose-200" role="alert">
          <p className="text-[14.5px] font-semibold text-[#161827]">We couldn't load your home page</p>
          <p className="text-[13px] text-[#6A6F85] mt-1">{live.error}. If the server was asleep, it can take up to a minute to wake up.</p>
          <button type="button" onClick={live.reload} className={cx(ghost, "mt-3")}><RefreshCw className="w-4 h-4" aria-hidden="true" />Try again</button>
        </Card>
      )}
      {live.noSetup && (
        <Card className="p-6 sm:p-10 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center"><CalendarDays className="w-6 h-6" aria-hidden="true" /></span>
          <h2 className="text-[22px] font-semibold text-[#161827] mt-4">Set up your semester</h2>
          <p className="text-[14.5px] text-[#6A6F85] mt-2 max-w-md mx-auto">Add your semester dates, then your subjects and weekly classes. You can also join your CR's official timetable once it's published.</p>
          <Link to={ROUTES.setup} className={cx(linkBase, linkPrimary, "mt-6")}>Create your first setup<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
        </Card>
      )}
      {vm && <DashboardView vm={vm} note={live.note} onMark={live.mark} onReadAll={live.readAll} />}
    </>
  );
};

/* ================= signed out ================= */
const features = [
  { icon: CalendarDays, title: "Weekly timetable", text: "Build your setup once. Every class for the semester is generated for you." },
  { icon: CheckCircle2, title: "Honest attendance", text: "Mark present, absent or excused in one tap. Holidays and cancellations never count against you." },
  { icon: CalendarRange, title: "Academic calendar", text: "Exams, quizzes and holidays sit on the same calendar as your classes." },
  { icon: Users, title: "Share with classmates", text: "Publish your setup so others can take their own copy and edit it." },
  { icon: Megaphone, title: "Official schedule", text: "Your CR publishes the timetable. Join it and every change reaches you without retyping." },
  { icon: MonitorSmartphone, title: "Made for every screen", text: "Quick on your phone between lectures, roomy on a laptop when you plan the week." },
];
const faqs = [
  { q: "Do I need my CR to use it?", a: "No. You can build your own timetable and track attendance alone. If your CR publishes an official schedule, you can join it to stay in sync." },
  { q: "What happens on holidays and cancelled classes?", a: "They sit on the calendar and the affected classes are handled for you, so they don't count against your attendance." },
  { q: "Can I share my timetable with friends?", a: "Yes. Publish your setup and classmates in your college can take their own copy, which they can then edit." },
  { q: "How does someone become a CR?", a: "They request the role with their college, branch and section. A college admin reviews and approves it before they can publish schedules." },
];

const Faq = () => {
  const [open, setOpen] = useState(0);
  return (
    <div className="max-w-3xl mx-auto lg divide-y divide-[#161827]/10 overflow-hidden">
      {faqs.map((f, i) => {
        const on = open === i;
        return (
          <div key={f.q}>
            <button type="button" aria-expanded={on} aria-controls={`faq-${i}`} onClick={() => setOpen(on ? -1 : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400">
              <span className="text-[15px] font-semibold text-[#161827]">{f.q}</span>
              <ChevronDown className={cx("w-5 h-5 shrink-0 text-[#6A6F85] transition-transform duration-200 motion-reduce:transition-none", on && "rotate-180")} aria-hidden="true" />
            </button>
            <div id={`faq-${i}`} className={cx("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className={cx("overflow-hidden", !on && "invisible")}><p className="px-5 pb-4 text-[14px] leading-relaxed text-[#6A6F85]">{f.a}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const H2 = "text-[24px] sm:text-[32px] font-semibold tracking-tight leading-[1.15] text-[#161827]";

const Landing = () => {
  const demo = useDemo();
  return (
    <>
      <section className="max-w-3xl mx-auto text-center pt-4 sm:pt-10">
        <h1 className="hm-rise text-[36px] min-[380px]:text-[40px] sm:text-[56px] font-semibold tracking-[-0.025em] leading-[1.06] text-[#161827]">Know what's next, and whether you can skip it.</h1>
        <p className="hm-rise text-[16px] sm:text-[18px] leading-relaxed text-[#444A63] mt-5 max-w-xl mx-auto" style={{ animationDelay: "80ms" }}>
          Your timetable, attendance and academic calendar in one place, kept in sync with your class representative.
        </p>
        <div className="hm-rise flex flex-col min-[420px]:flex-row justify-center gap-3 mt-8" style={{ animationDelay: "160ms" }}>
          <Link to={ROUTES.register} className={cx(linkBase, linkPrimary)}>Get started<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          <Link to={ROUTES.login} className={cx(linkBase, linkGlass)}>Log in</Link>
        </div>
        <ul className="hm-rise flex flex-wrap justify-center gap-x-6 gap-y-2 mt-6 text-[13px] text-[#6A6F85]" style={{ animationDelay: "240ms" }}>
          {["Works on phone and laptop", "Holidays handled for you", "Syncs with your CR"].map((t) => (
            <li key={t} className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />{t}</li>
          ))}
        </ul>
      </section>

      <section className="mt-12 sm:mt-16" aria-label="Sample dashboard">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4 px-1">
          <h2 className="text-[17px] font-semibold text-[#161827]">Your home screen</h2>
          <p className="text-[13px] text-[#6A6F85]">Sample data. Mark a class to try it.</p>
        </div>
        <DashboardView vm={demo.vm} note="" onMark={demo.mark} onReadAll={demo.readAll} />
      </section>

      <section className="mt-16 sm:mt-24">
        <h2 className={cx(H2, "max-w-xl")}>Built around how college actually works</h2>
        <p className="text-[15px] sm:text-[16px] leading-relaxed text-[#6A6F85] mt-3 max-w-xl">Changing timetables, holidays, quizzes and attendance rules are handled for you.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-8 mt-10 pt-10 border-t border-[#161827]/10">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon className="w-5 h-5 text-indigo-600" aria-hidden="true" />
              <h3 className="text-[15px] font-semibold text-[#161827] mt-3">{title}</h3>
              <p className="text-[14px] leading-relaxed text-[#6A6F85] mt-1">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 sm:mt-24">
        <div className="lg p-6 sm:p-10 grid md:grid-cols-[1.2fr_1fr] gap-8 md:gap-12 items-center">
          <div>
            <h2 className={H2}>Publish the timetable once. Your whole class stays in sync.</h2>
            <p className="text-[15px] leading-relaxed text-[#6A6F85] mt-3 max-w-lg">CR Studio manages the official schedule: subjects, weekly classes, exams and cancellations, with undo for every change.</p>
            <Link to={ROUTES.register} className={cx(linkBase, linkPrimary, "mt-6")}>Create an account<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          </div>
          <ul className="space-y-3.5">
            {["Publish the class timetable once", "Changes reach joined students automatically", "Undo or redo any change from the history"].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[14.5px] text-[#161827]"><CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-px" aria-hidden="true" />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-16 sm:mt-24">
        <h2 className={cx(H2, "text-center mb-8")}>Questions, answered</h2>
        <Faq />
      </section>

      <section className="mt-16 sm:mt-24 pt-12 sm:pt-16 border-t border-[#161827]/10 text-center">
        <h2 className={H2}>Start the semester organised</h2>
        <p className="text-[15px] sm:text-[16px] text-[#6A6F85] mt-3">Set up your week in a few minutes.</p>
        <div className="flex flex-col min-[420px]:flex-row justify-center gap-3 mt-7">
          <Link to={ROUTES.register} className={cx(linkBase, linkPrimary)}>Get started<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          <Link to={ROUTES.login} className={cx(linkBase, linkGlass)}>Log in</Link>
        </div>
      </section>

      <div aria-hidden="true" className="h-20 md:hidden" />
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-[#161827]/10 bg-white/85 backdrop-blur-xl px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
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
    <div className="hm relative z-[1] max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-24 overflow-x-clip">
      <style>{css}</style>
      {user ? <LiveHome key={user._id} user={user} /> : loading ? <Skeleton /> : <Landing />}
    </div>
  );
};

export default Home;
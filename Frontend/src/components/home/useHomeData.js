import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { homeApi, normOcc, normEvent, normAttendance, msg } from "../../api/home";
import { occurrencesApi } from "../../api/endpoints";
import { toIso, addDays, pad } from "./Shared";

/* Merge lists of {date, classes} days by date; later lists win. */
const mergeDays = (...lists) => {
  const m = new Map();
  lists.forEach((l) => (l || []).forEach((d) => d && d.date && m.set(d.date, d)));
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
};
const normDays = (res) => (res?.days || []).map((d) => ({ date: d.date, isToday: d.isToday, classes: (d.classes || []).map(normOcc) }));

/* Load the schedule for any date on demand, from the same occurrences endpoint the
   Attendance page uses for "classes left". Holidays and cancelled classes already come
   back from the server with status "cancelled". We fetch a 14-day window per tap (the
   endpoint allows 93 days max) and fill days with no classes as empty, so the card can
   tell "no classes" apart from "not loaded". */
const DAY_MS = 86400000;
const WINDOW_DAYS = 14;
const isoUtc = (d) => d.toISOString().slice(0, 10);

const occList = (res) => {
  if (Array.isArray(res)) return res;
  for (const x of [res, res?.data, res?.data?.data]) {
    if (Array.isArray(x?.occurrences)) return x.occurrences;
  }
  return [];
};
const occDate = (o) => String(o?.date ?? o?.occurrenceDate ?? o?.day ?? "").slice(0, 10);

const fetchDay = async (setupId, date) => {
  const from = new Date(`${date}T00:00:00Z`);
  const to = new Date(from.getTime() + (WINDOW_DAYS - 1) * DAY_MS);
  const res = await occurrencesApi.range(setupId, { from: isoUtc(from), to: isoUtc(to) });
  const list = occList(res);

  const byDate = new Map();
  for (let i = 0; i < WINDOW_DAYS; i++) byDate.set(isoUtc(new Date(from.getTime() + i * DAY_MS)), []);
  let dated = 0;
  for (const o of list) {
    const d = occDate(o);
    if (!d) continue;
    dated++;
    if (byDate.has(d)) byDate.get(d).push(o);
  }
  if (list.length && !dated) throw new Error("Occurrences came back without a date field");

  return [...byDate.entries()].map(([d, items]) => ({
    date: d,
    classes: items
      .map(normOcc)
      .sort((a, b) => String(a.start).localeCompare(String(b.start))),
  }));
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

export const useDemo = () => {
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
export const useLive = (enabled) => {
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
    // Days already loaded win, so marks and server numbers for this week are never overwritten.
    setSt((p) => (p.vm ? { ...p, vm: { ...p.vm, days: mergeDays(got, p.vm.days) } } : p));
    return got.find((d) => d.date === date);
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
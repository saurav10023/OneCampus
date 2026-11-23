import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCheck, ChevronDown, Megaphone, RefreshCw, RotateCcw } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Badge, cx } from "../components/Ui";
import OfficialJoin from "../components/OfficialJoin";
import { homeApi, msg } from "../api/home";
import { officialApi } from "../api/official";

const ROUTES = { home: "/", setup: "/onboarding/setup", login: "/login" };

/* Flat OneCampus theme: white card, hairline border, grey inset blocks. Secondary buttons are the only frosted surface. */
const css = `
.of button, .of a { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.lg { background: #fff; border: 1px solid #E4E7EF; border-radius: 16px; box-shadow: 0 1px 2px rgba(27,31,51,.04); }
.lg-in { background: #F5F6FA; border-radius: 12px; }
.lg-pill { background: rgba(255,255,255,.7); border: 1px solid #E4E7EF !important;
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); transition: background .15s, border-color .15s, transform .15s; }
.lg-pill:hover { background: #fff; border-color: #CBD0DE !important; } .lg-pill:active { transform: scale(.98); }
.lg-on { background: #4F46E5 !important; border-color: #4F46E5 !important; color: #fff; }
@media (prefers-reduced-motion: reduce) { .animate-pulse, .animate-spin { animation: none; } .lg-pill { transition: none; } }
`;
const Card = ({ className, ...p }) => <div className={cx("lg", className)} {...p} />;
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1";
const btn = `lg-pill inline-flex items-center justify-center gap-1.5 h-11 sm:h-10 px-4 rounded-xl text-[13.5px] font-medium text-[color:var(--ink)] disabled:opacity-60 disabled:pointer-events-none ${FOCUS}`;
const btnPrimary = `inline-flex items-center justify-center gap-1.5 h-11 sm:h-10 px-4 rounded-xl text-[13.5px] font-medium text-white bg-[#4F46E5] hover:bg-[#4338CA] transition-colors active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none ${FOCUS}`;

/* ---------- small helpers ---------- */
const humanize = (k) => { const t = String(k).replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const itemLabel = (x) => (typeof x === "string" ? x : x?.name ?? x?.title ?? x?.label ?? x?.summary ?? x?.subjectName ?? "");
const when = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""; };
const titleOf = (s) => (s ? [s.semesterLabel, [s.branch, s.section].filter(Boolean).join("-")].filter(Boolean).join(" ") + (s.academicYear ? `, ${s.academicYear}` : "") : "Official schedule");
const updateText = (u) => (typeof u.summary === "string" && u.summary ? u.summary : u.summary?.text || `A ${u.targetKind || "schedule item"} was ${u.change || "updated"}.`);
const changeTone = { added: "green", updated: "brand", withdrawn: "red", conflict: "amber" };
const idOf = (x) => x?._id ?? x?.id;

/* ---------- updates inbox ---------- */
const UpdateRow = ({ u, run, busy, setupId, confirm, setConfirm }) => {
  const pending = u.status === "pending";
  const unread = !u.readAt;
  const key = idOf(u);
  const accept = async (flags = {}) => {
    try { await officialApi.accept(setupId, key, flags); }
    catch (e) {
      if (e?.response?.status === 409) { setConfirm({ id: key, errors: e.response.data?.errors?.length ? e.response.data.errors : [e.response.data?.message || "This change needs your confirmation."] }); return; }
      throw e;
    }
    setConfirm(null);
  };
  return (
    <li className="lg-in p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={cx("mt-2 w-2 h-2 rounded-full shrink-0", unread ? "bg-[#4F46E5]" : "bg-transparent")} />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] leading-snug text-[color:var(--ink)]">{updateText(u)}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {u.change && <Badge tone={changeTone[u.change] || "brand"}>{humanize(u.change)}</Badge>}
            {pending && <Badge tone="amber">Needs you</Badge>}
            {(u.status === "dismissed" || u.status === "superseded") && <Badge tone="amber">{humanize(u.status)}</Badge>}
            {when(u.createdAt) && <span className="text-[12px] text-[color:var(--muted)] tabular-nums">{when(u.createdAt)}</span>}
          </div>
        </div>
      </div>

      {confirm?.id === key && (
        <div role="alertdialog" aria-label="Confirm change" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
          <ul className="space-y-1">{confirm.errors.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="flex gap-2 mt-2.5">
            <button type="button" className={btnPrimary} onClick={() => run(`a${key}`, () => accept({ confirm: true, confirmOverlap: true }), { ok: "Change accepted." })}>Accept anyway</button>
            <button type="button" className={btn} onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {(pending || unread) && confirm?.id !== key && (
        <div className="flex flex-wrap gap-2 mt-3 pl-5">
          {pending ? (
            <>
              <button type="button" className={btnPrimary} disabled={busy === `a${key}`} onClick={() => run(`a${key}`, () => accept(), { ok: "Change accepted." })}>Accept</button>
              <button type="button" className={btn} disabled={busy === `d${key}`} onClick={() => run(`d${key}`, () => officialApi.dismiss(setupId, key), { ok: "Change dismissed." })}>Dismiss</button>
            </>
          ) : (
            <button type="button" className={btn} onClick={() => run(`r${key}`, () => officialApi.read(setupId, key), { quiet: true })}>Mark as read</button>
          )}
        </div>
      )}
    </li>
  );
};

const TABS = [["all", "All"], ["pending", "Needs you"], ["archived", "Dismissed"]];

const Inbox = ({ updates, setupId, run, busy }) => {
  const [tab, setTab] = useState("all");
  const [confirm, setConfirm] = useState(null);
  const counts = useMemo(() => ({
    all: updates.filter((u) => u.status !== "dismissed" && u.status !== "superseded").length,
    pending: updates.filter((u) => u.status === "pending").length,
    archived: updates.filter((u) => u.status === "dismissed" || u.status === "superseded").length,
  }), [updates]);
  const unread = updates.filter((u) => !u.readAt && u.status !== "superseded").length;
  const list = updates
    .filter((u) => (tab === "pending" ? u.status === "pending" : tab === "archived" ? u.status === "dismissed" || u.status === "superseded" : u.status !== "dismissed" && u.status !== "superseded"))
    .sort((a, b) => (b.status === "pending") - (a.status === "pending") || String(b.createdAt).localeCompare(String(a.createdAt)));

  return (
    <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] sm:text-[19px] font-semibold tracking-tight text-[color:var(--ink)]">Updates</h2>
        {unread > 0 && <button type="button" className={btn} onClick={() => run("readall", () => officialApi.readAll(setupId), { ok: "All updates marked as read." })}><CheckCheck className="w-4 h-4" aria-hidden="true" />Mark all read</button>}
      </div>
      {/* tabs: grey track, active tab solid indigo */}
      <div role="tablist" aria-label="Filter updates" className="grid grid-cols-3 gap-1 p-1 mt-4 rounded-xl bg-[color:var(--inset)] border border-[color:var(--line)]">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cx("h-10 rounded-lg text-[13px] font-medium transition-colors", FOCUS, tab === k ? "bg-[#4F46E5] text-white" : "text-[color:var(--body)] hover:bg-[color:var(--surface)]")}>
            {label} <span className={cx("tabular-nums", tab === k ? "text-white/75" : "text-[color:var(--muted)]")}>{counts[k]}</span>
          </button>
        ))}
      </div>
      {list.length ? (
        <ul className="space-y-2.5 mt-4">{list.map((u) => <UpdateRow key={idOf(u)} u={u} run={run} busy={busy} setupId={setupId} confirm={confirm} setConfirm={setConfirm} />)}</ul>
      ) : (
        <p className="lg-in px-4 py-8 text-center text-[13.5px] text-[color:var(--muted)] mt-4">{tab === "pending" ? "Nothing is waiting for you." : tab === "archived" ? "No dismissed updates." : "No updates yet. Changes from your CR will appear here."}</p>
      )}
    </Card>
  );
};

/* ---------- page ---------- */
const Skeleton = () => (
  <div className="space-y-2.5 sm:space-y-4 animate-pulse" aria-busy="true" aria-label="Loading official schedule">
    <div className="h-28 rounded-2xl bg-[color:var(--line-soft)]" /><div className="h-72 rounded-2xl bg-[color:var(--line-soft)]" />
  </div>
);

const Official = () => {
  const { user, loading: authLoading } = useAuth();
  const [st, setSt] = useState({ loading: true, error: "", noSetup: false, setup: null, status: null, joined: false, updates: [], optOuts: [] });
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);

  const load = useCallback(async () => {
    setSt((p) => ({ ...p, loading: !p.setup, error: "" }));
    try {
      let setup;
      try { setup = await homeApi.activeSetup(); } catch (e) {
        if (e?.response?.status === 404) return setSt((p) => ({ ...p, loading: false, noSetup: true }));
        throw e;
      }
      const id = setup._id;
      const status = await officialApi.status(id);
      const joined = Boolean(status?.officialStatus === "joined" || status?.joined || status?.isJoined || setup.officialScheduleId);
      // Errors surface in the "We couldn't load this page" card instead of looking like "no schedule".
      const [updates, optOuts] = await Promise.all([
        joined ? officialApi.updates(id) : [],
        officialApi.optOuts(id).catch(() => []), // the hidden-items list is optional
      ]);
      setSt({ loading: false, error: "", noSetup: false, setup, status, joined, updates, optOuts });
    } catch (e) {
      setSt((p) => ({ ...p, loading: false, error: msg(e, "Could not load the official schedule") }));
    }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  // One wrapper for every write: busy state, success or error message, then re-read from the server.
  const run = async (key, fn, { ok, reload = true, quiet = false } = {}) => {
    setBusy(key); setFlash(null);
    try {
      await fn();
      if (ok) setFlash({ tone: "ok", text: ok });
      if (reload) await load();
    } catch (e) {
      if (!quiet) setFlash({ tone: "err", text: msg(e) });
    } finally { setBusy(""); }
  };

  if (authLoading) return <div className="of max-w-5xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 pt-6 sm:pt-10"><style>{css}</style><Skeleton /></div>;

  const { setup, status, joined, updates, optOuts, loading, error, noSetup } = st;
  const sid = setup?._id;
  const schedule = status?.schedule ?? status?.officialSchedule;
  const syncText = status?.sync?.status;

  return (
    <div className="of max-w-5xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 pt-6 sm:pt-10 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-24">
      <style>{css}</style>

      <header className="flex flex-wrap items-end justify-between gap-4 mb-5 sm:mb-6">
        <div>
          <Link to={ROUTES.home} className={cx("text-[13px] font-medium text-[#4F46E5] hover:underline rounded", FOCUS)}>Back to home</Link>
          <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-tight leading-tight text-[color:var(--ink)] mt-2">Official schedule</h1>
          <p className="text-[14px] text-[color:var(--muted)] mt-1.5 max-w-xl leading-relaxed">The timetable your class representative publishes. Join it and every change reaches you without retyping.</p>
        </div>
        {user && <button type="button" aria-label="Refresh" className={btn} onClick={load}><RefreshCw className={cx("w-4 h-4", loading && "animate-spin")} aria-hidden="true" /><span className="hidden sm:inline">Refresh</span></button>}
      </header>

      {!user ? (
        <Card className="p-8 text-center">
          <p className="text-[16px] font-semibold text-[color:var(--ink)]">Log in to see your official schedule</p>
          <p className="text-[14px] text-[color:var(--muted)] mt-1.5">Official schedules are matched to your college, branch and section.</p>
          <Link to={ROUTES.login} className={cx(btnPrimary, "mt-5 px-6")}>Log in</Link>
        </Card>
      ) : (
        <div className="space-y-2.5 sm:space-y-4">
          {flash && <p role={flash.tone === "err" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-[13.5px]", flash.tone === "err" ? "border-rose-200 bg-rose-50 text-[#A32A42]" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{flash.text}</p>}

          {loading && !setup && <Skeleton />}
          {error && (
            <Card className="p-5" role="alert">
              <p className="text-[15px] font-semibold text-[color:var(--ink)]">We couldn't load this page</p>
              <p className="text-[13.5px] text-[color:var(--muted)] mt-1">{error}. If the server was asleep, it can take up to a minute to wake up.</p>
              <button type="button" className={cx(btn, "mt-3")} onClick={load}>Try again</button>
            </Card>
          )}
          {noSetup && (
            <Card className="p-8 text-center">
              <p className="text-[16px] font-semibold text-[color:var(--ink)]">Set up your semester first</p>
              <p className="text-[14px] text-[color:var(--muted)] mt-1.5 max-w-md mx-auto">Official schedules are matched to your semester, branch and section.</p>
              <Link to={ROUTES.setup} className={cx(btnPrimary, "mt-5 px-6")}>Create a setup</Link>
            </Card>
          )}

          {setup && joined && (
            <>
              <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center shrink-0"><Megaphone className="w-5 h-5" aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <p className="text-[17px] font-semibold text-[color:var(--ink)]">{schedule ? titleOf(schedule) : setup.name}</p>
                      <p className="text-[13.5px] text-[color:var(--muted)] mt-0.5">You're in sync{when(setup.joinedOfficialAt) ? `, joined ${when(setup.joinedOfficialAt)}` : ""}.{syncText ? ` Last sync: ${humanize(syncText).toLowerCase()}.` : ""}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button type="button" className={cx(btn, "flex-1 sm:flex-none")} disabled={busy === "sync"} onClick={() => run("sync", async () => { const r = await officialApi.sync(sid); setSt((p) => ({ ...p, status: { ...p.status, sync: r?.sync ?? r } })); }, { ok: "Synced with your CR's schedule." })}>
                      <RefreshCw className={cx("w-4 h-4", busy === "sync" && "animate-spin")} aria-hidden="true" />Sync now
                    </button>
                    <button type="button" className={cx(btn, "flex-1 sm:flex-none")} onClick={() => setLeaving(true)}>Leave</button>
                  </div>
                </div>
                {leaving && (
                  <div role="alertdialog" aria-label="Leave official schedule" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[13.5px] text-amber-900">
                    <p>Leave this schedule? Your setup, classes and attendance stay, but you'll stop receiving changes from your CR.</p>
                    <div className="flex gap-2 mt-3">
                      <button type="button" className={btnPrimary} disabled={busy === "leave"} onClick={() => run("leave", async () => { await officialApi.leave(sid, { confirm: true }); setLeaving(false); }, { ok: "You left the official schedule." })}>Leave schedule</button>
                      <button type="button" className={btn} onClick={() => setLeaving(false)}>Stay</button>
                    </div>
                  </div>
                )}
              </Card>

              <div className="grid lg:grid-cols-12 gap-2.5 sm:gap-4 items-start">
                <div className="lg:col-span-8"><Inbox updates={updates} setupId={sid} run={run} busy={busy} /></div>
                <div className="lg:col-span-4">
                  <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
                    <button type="button" aria-expanded={hiddenOpen} onClick={() => setHiddenOpen((v) => !v)} className={cx("w-full flex items-center justify-between gap-3 text-left rounded-lg", FOCUS)}>
                      <span className="text-[16px] font-semibold text-[color:var(--ink)]">Hidden by you <span className="text-[color:var(--muted)] font-normal tabular-nums">{optOuts.length}</span></span>
                      <ChevronDown className={cx("w-5 h-5 text-[color:var(--faint)] transition-transform", hiddenOpen && "rotate-180")} aria-hidden="true" />
                    </button>
                    {hiddenOpen && (optOuts.length ? (
                      <ul className="space-y-2 mt-3">
                        {optOuts.map((o) => {
                          const kind = o.kind ?? o.targetKind; const oid = o.targetId ?? o.id ?? o._id;
                          return (
                            <li key={`${kind}${oid}`} className="lg-in flex items-center gap-2 p-3">
                              <div className="min-w-0 flex-1"><p className="text-[13.5px] font-medium text-[color:var(--ink)] truncate">{itemLabel(o) || humanize(kind || "item")}</p><p className="text-[12px] text-[color:var(--muted)]">{humanize(kind || "item")}</p></div>
                              <button type="button" className={btn} onClick={() => run(`o${oid}`, () => officialApi.restore(sid, kind, oid), { ok: "Item restored." })}><RotateCcw className="w-4 h-4" aria-hidden="true" />Restore</button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : <p className="text-[13.5px] text-[color:var(--muted)] mt-3">Nothing hidden. Official items you delete show up here so you can bring them back.</p>)}
                  </Card>
                </div>
              </div>
            </>
          )}

          {/* Not joined: the same join flow used in Onboarding and Setup details. */}
          {setup && !joined && !loading && <OfficialJoin setupId={sid} onJoined={load} />}
        </div>
      )}
    </div>
  );
};

export default Official;
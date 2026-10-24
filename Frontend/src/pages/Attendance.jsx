import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Calculator, RefreshCw, Undo2 } from "lucide-react";
import { attendanceApi, extraApi, errMsg } from "../api/endpoints";
import { overallOf, readRow, rowsOf } from "../lib/attendance";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, PageSpinner, ProgressBar, Summary } from "../components/Ui";

const Attendance = () => {
  const { setup } = useOutletContext();
  const setupId = setup._id;

  const [data, setData] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ERP match
  const [erp, setErp] = useState(null); // row being matched
  const [erpForm, setErpForm] = useState({ attended: "", held: "", note: "" });
  const [erpBusy, setErpBusy] = useState(false);
  const [erpError, setErpError] = useState("");
  const [erpResult, setErpResult] = useState(null); // { subject, res }

  // Bunk calculator
  const [bunkSubject, setBunkSubject] = useState("");
  const [bunkCount, setBunkCount] = useState(2);
  const [bunkBusy, setBunkBusy] = useState(false);
  const [bunk, setBunk] = useState(null);
  const [bunkError, setBunkError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await attendanceApi.overview(setupId, showArchived));
    } catch (e) {
      setError(errMsg(e, "Could not load attendance"));
    } finally {
      setLoading(false);
    }
  }, [setupId, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = rowsOf(data).map(readRow);
  const overall = data ? overallOf(data) : null;

  const openErp = (r) => {
    setErp(r);
    setErpForm({ attended: "", held: "", note: "" });
    setErpError("");
  };

  const matchErp = async (e) => {
    e.preventDefault();
    const attended = Number(erpForm.attended);
    const held = Number(erpForm.held);
    if (!(held > 0) || attended < 0 || attended > held) return setErpError("Attended must be between 0 and the total held.");
    setErpBusy(true);
    setErpError("");
    try {
      const res = await extraApi.matchCollege(setupId, erp.id, { collegeAttended: attended, collegeHeld: held, note: erpForm.note.trim() || undefined });
      setErpResult({ subject: erp, res });
      setErp(null);
      await load();
    } catch (err) {
      setErpError(errMsg(err, "Could not match the college record"));
    } finally {
      setErpBusy(false);
    }
  };

  const undoErp = async () => {
    try {
      await extraApi.set(setupId, erpResult.subject.id, erpResult.res.previous);
      setErpResult(null);
      await load();
    } catch (err) {
      setError(errMsg(err, "Could not undo"));
    }
  };

  const runBunk = async () => {
    setBunkBusy(true);
    setBunkError("");
    try {
      setBunk(await attendanceApi.bunk(setupId, { count: bunkCount, ...(bunkSubject ? { subjectId: bunkSubject } : {}) }));
    } catch (e) {
      setBunkError(errMsg(e, "Could not run the calculator"));
    } finally {
      setBunkBusy(false);
    }
  };

  if (loading && !data) return <PageSpinner />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader
        title="Attendance"
        subtitle={`Target ${setup.targetPercentage ?? 75}% · ${setup.name}`}
        action={
          <label className="flex items-center gap-2 text-[13px] text-[#161827]">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
            Include archived subjects
          </label>
        }
      />

      <Alert type="error" className="mb-5">{error}</Alert>

      {erpResult && (
        <Alert type="success" className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span>
            {erpResult.res.changed === false ? "Already in sync with the college record." : `Matched ${erpResult.subject.name} to your college record.`}
          </span>
          {erpResult.res.previous && (
            <Button size="sm" variant="glass" onClick={undoErp}><Undo2 className="w-4 h-4" />Undo</Button>
          )}
        </Alert>
      )}

      {overall?.pct != null && (
        <Card className="p-6 mb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6A6F85]">Overall</p>
              <p className="text-[44px] font-semibold text-[#161827] leading-none mt-2">{overall.pct}%</p>
            </div>
            <p className="text-[13.5px] text-[#6A6F85]">{overall.attended} of {overall.held} classes attended</p>
          </div>
          <div className="mt-4"><ProgressBar value={overall.pct} target={setup.targetPercentage} /></div>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={Calculator} title="Nothing to show yet" text="Add subjects and weekly classes, then mark attendance from your dashboard." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((r) => {
            const target = r.target ?? setup.targetPercentage;
            const ok = r.pct != null && target != null && r.pct >= target;
            return (
              <Card key={r.id || r.name} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15.5px] font-semibold text-[#161827] truncate flex items-center gap-2">
                      {r.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />}
                      {r.name}
                    </p>
                    {r.code && <p className="text-[12.5px] text-[#6A6F85]">{r.code}</p>}
                  </div>
                  <p className={`text-[22px] font-semibold ${r.pct == null ? "text-[#6A6F85]" : ok ? "text-emerald-600" : "text-rose-600"}`}>
                    {r.pct == null ? "—" : `${r.pct}%`}
                  </p>
                </div>
                <div className="mt-3"><ProgressBar value={r.pct || 0} target={target} /></div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <Badge>{r.attended}/{r.held} classes</Badge>
                  {r.safe != null && Number(r.safe) > 0 && <Badge tone="green">Can skip {r.safe}</Badge>}
                  {r.needed != null && Number(r.needed) > 0 && <Badge tone="red">Attend next {r.needed}</Badge>}
                </div>
                {r.id && (
                  <Button size="sm" variant="ghost" className="mt-3 -ml-2" onClick={() => openErp(r)}>
                    <RefreshCw className="w-4 h-4" />Match college ERP
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* bunk calculator */}
      <Card className="p-6 mt-8">
        <h2 className="text-[17px] font-semibold text-[#161827]">Bunk calculator</h2>
        <p className="text-[13.5px] text-[#6A6F85] mt-1 mb-5">See what skipping your next few classes does to your percentage.</p>

        <div className="grid sm:grid-cols-2 gap-5 max-w-2xl">
          <Field as="select" label="Subject" value={bunkSubject} onChange={(e) => setBunkSubject(e.target.value)}>
            <option value="">All subjects</option>
            {rows.filter((r) => r.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Field>
          <div>
            <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-1.5 px-1">Classes to skip: {bunkCount}</span>
            <input type="range" min="1" max="10" value={bunkCount} onChange={(e) => setBunkCount(Number(e.target.value))} className="w-full accent-indigo-600 mt-3" />
          </div>
        </div>

        <Alert type="error" className="mt-4">{bunkError}</Alert>
        <Button className="mt-4" loading={bunkBusy} onClick={runBunk}><Calculator className="w-4 h-4" />Calculate</Button>

        {bunk && (
          <div className="mt-5 space-y-3">
            <Summary data={bunk} />
            {rowsOf(bunk).length > 0 && (
              <div className="grid sm:grid-cols-2 gap-2">
                {rowsOf(bunk).map((b, i) => {
                  const r = readRow(b);
                  return (
                    <div key={i} className="rounded-2xl bg-white/60 border border-white/80 px-3.5 py-2.5 text-[13.5px] text-[#161827]">
                      <span className="font-semibold">{r.name}</span>
                      {r.pct != null && <span className="text-[#6A6F85]"> → {r.pct}%</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      <details className="mt-6 text-[12.5px] text-[#6A6F85]">
        <summary className="cursor-pointer">Raw attendance data (for debugging)</summary>
        <pre className="mt-2 p-3 rounded-2xl bg-white/60 border border-white/80 overflow-x-auto text-[11.5px]">{JSON.stringify(data, null, 2)}</pre>
      </details>

      <Modal open={Boolean(erp)} onClose={() => setErp(null)} title={`Match college ERP: ${erp?.name || ""}`}>
        <form onSubmit={matchErp} className="space-y-4">
          <p className="text-[13.5px] text-[#6A6F85]">Enter the numbers your college portal shows. We add the difference as extra classes so both match.</p>
          <Alert type="error">{erpError}</Alert>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Attended (college)" type="number" min="0" value={erpForm.attended} onChange={(e) => setErpForm({ ...erpForm, attended: e.target.value })} required />
            <Field label="Held (college)" type="number" min="1" value={erpForm.held} onChange={(e) => setErpForm({ ...erpForm, held: e.target.value })} required />
          </div>
          <Field label="Note (optional)" value={erpForm.note} onChange={(e) => setErpForm({ ...erpForm, note: e.target.value })} placeholder="Synced with ERP on 24 Oct" />
          <Button type="submit" loading={erpBusy}>Match records</Button>
        </form>
      </Modal>
    </div>
  );
};

export default Attendance;
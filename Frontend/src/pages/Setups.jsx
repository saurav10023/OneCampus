import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive, CalendarDays, CheckCircle2, ChevronRight, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { setupsApi, errMsg, pick } from "../api/endpoints";
import { Alert, Badge, Button, Card, EmptyState, Modal, PageHeader, PageSpinner, cx, fmtDate } from "../components/Ui";
import SetupForm from "../components/SetupForm";

const FILTERS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
];

const Setups = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [filter, setFilter] = useState("");
  const [setups, setSetups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSetups(await setupsApi.list(filter));
    } catch (e) {
      setError(errMsg(e, "Could not load setups"));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (body) => {
    setCreating(true);
    setCreateError("");
    try {
      const data = await setupsApi.create(body);
      const created = pick(data, "setup");
      setCreateOpen(false);
      if (created?._id) navigate(`/setups/${created._id}`);
      else load();
    } catch (e) {
      setCreateError(errMsg(e, "Could not create the setup"));
    } finally {
      setCreating(false);
    }
  };

  const act = async (id, fn, failText) => {
    setBusyId(id);
    setError("");
    try {
      await fn(id);
      await Promise.all([load(), refreshUser()]);
    } catch (e) {
      setError(errMsg(e, failText));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <PageHeader
        title="Your setups"
        subtitle="A setup is one semester's timetable. Create one, add subjects and classes, then track attendance."
        action={
          <Button onClick={() => { setCreateError(""); setCreateOpen(true); }}>
            <Plus className="w-4 h-4" />New setup
          </Button>
        }
      />

      <div className="flex gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              "h-9 px-4 rounded-full text-[13px] font-medium border transition",
              filter === f.key
                ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] border-transparent shadow-md shadow-indigo-500/25"
                : "bg-white/55 border-white/80 text-[#161827]/75 hover:bg-white/85"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Alert type="error" className="mb-5">{error}</Alert>

      {loading ? (
        <PageSpinner />
      ) : setups.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No setups here yet"
          text="Create your first setup to start building your timetable."
          action={<Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" />Create a setup</Button>}
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {setups.map((s) => {
            const isActive = s._id === user?.activeSetupId;
            const archived = s.status === "archived";
            const busy = busyId === s._id;
            return (
              <Card key={s._id} className="p-6 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[18px] font-semibold text-[#161827] truncate">{s.name}</h3>
                    <p className="text-[13.5px] text-[#6A6F85] mt-0.5">
                      {[s.branch, s.section && `Section ${s.section}`, s.semesterLabel, s.academicYear].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {isActive && <Badge tone="green">Current</Badge>}
                    {archived && <Badge tone="amber">Archived</Badge>}
                  </div>
                </div>

                <p className="text-[13px] text-[#6A6F85] mt-3">{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</p>

                <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-[#161827]/10">
                  <Link to={`/setups/${s._id}`}>
                    <Button size="sm">Open<ChevronRight className="w-4 h-4" /></Button>
                  </Link>
                  {!archived && !isActive && (
                    <Button size="sm" variant="glass" loading={busy} onClick={() => act(s._id, setupsApi.activate, "Could not activate")}>
                      <CheckCircle2 className="w-4 h-4" />Make current
                    </Button>
                  )}
                  {!archived && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(s._id, setupsApi.archive, "Could not archive")}>
                      <Archive className="w-4 h-4" />Archive
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New setup">
        {createError && <Alert type="error" className="mb-4">{createError}</Alert>}
        <SetupForm submitLabel="Create setup" loading={creating} allowArchivePrevious onSubmit={create} />
      </Modal>
    </div>
  );
};

export default Setups;
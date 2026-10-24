import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Layers, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { setupsApi, errMsg } from "../api/endpoints";
import { Alert, Badge, Button, Card, PageHeader, PageSpinner, fmtDate } from "../components/ui";

const Dashboard = () => {
  const { user } = useAuth();
  const [setups, setSetups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setupsApi
      .list()
      .then((list) => alive && setSetups(list))
      .catch((e) => alive && setError(errMsg(e, "Could not load your setups")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const name = user?.displayName || user?.fullName || user?.username || "there";
  const active = setups.find((s) => s._id === user?.activeSetupId) || setups.find((s) => s.status === "active");
  const archivedCount = setups.filter((s) => s.status === "archived").length;

  if (loading) return <PageSpinner />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <PageHeader
        title={`Hi, ${String(name).split(" ")[0]}`}
        subtitle="Here is your semester at a glance."
        action={
          <Link to="/setups">
            <Button><Plus className="w-4 h-4" />New setup</Button>
          </Link>
        }
      />

      <Alert type="error" className="mb-6">{error}</Alert>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 p-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6A6F85]">Active setup</p>
          {active ? (
            <>
              <h2 className="text-[22px] font-semibold text-[#161827] mt-2">{active.name}</h2>
              <p className="text-[14px] text-[#6A6F85] mt-1">
                {[active.branch, active.section && `Section ${active.section}`, active.semesterLabel].filter(Boolean).join(" · ")}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Badge tone="green">Active</Badge>
                <Badge>{fmtDate(active.startDate)} → {fmtDate(active.endDate)}</Badge>
              </div>
              <Link to={`/setups/${active._id}`} className="inline-block mt-5">
                <Button variant="glass" size="sm">Open setup <ChevronRight className="w-4 h-4" /></Button>
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-[20px] font-semibold text-[#161827] mt-2">No active setup yet</h2>
              <p className="text-[14px] text-[#6A6F85] mt-1">Create a setup for this semester to get started.</p>
              <Link to="/setups" className="inline-block mt-5"><Button size="sm">Create a setup</Button></Link>
            </>
          )}
        </Card>

        <div className="grid gap-5">
          <Card className="p-5 flex items-center gap-4">
            <span className="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center"><Layers className="w-5 h-5" /></span>
            <div>
              <p className="text-[26px] font-semibold text-[#161827] leading-none">{setups.length}</p>
              <p className="text-[13px] text-[#6A6F85] mt-1">Total setups{archivedCount ? ` (${archivedCount} archived)` : ""}</p>
            </div>
          </Card>
          <Link to="/setups">
            <Card className="p-5 flex items-center gap-4 hover:bg-white/75 transition">
              <span className="w-11 h-11 rounded-2xl bg-sky-500/10 text-sky-600 flex items-center justify-center"><CalendarDays className="w-5 h-5" /></span>
              <p className="text-[14.5px] font-medium text-[#161827] flex-1">Manage timetables</p>
              <ChevronRight className="w-4 h-4 text-[#6A6F85]" />
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
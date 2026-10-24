import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, CalendarRange, Settings } from "lucide-react";
import { setupsApi, errMsg } from "../api/endpoints";
import { Alert, Badge, Card, PageSpinner, cx, fmtDate } from "../components/Ui";
import SubjectsTab from "./setup/SubjectsTab";
import CalendarTab from "./setup/CalendarTab";
import SettingsTab from "./setup/SettingsTab";

const TABS = [
  { key: "subjects", label: "Subjects", icon: BookOpen },
  { key: "calendar", label: "Calendar", icon: CalendarRange },
  { key: "settings", label: "Settings", icon: Settings },
];

const SetupDetail = () => {
  const { setupId } = useParams();
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("subjects");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setupsApi
      .get(setupId)
      .then((s) => alive && setSetup(s))
      .catch((e) => alive && setError(errMsg(e, "Could not load this setup")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [setupId]);

  if (loading) return <PageSpinner />;

  if (error || !setup) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14 space-y-4">
        <Alert type="error">{error || "Setup not found."}</Alert>
        <Link to="/setups" className="text-indigo-600 text-[14px] font-medium hover:underline">← Back to setups</Link>
      </div>
    );
  }

  const readOnly = setup.status === "archived";

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <Link to="/setups" className="inline-flex items-center gap-1.5 text-[13.5px] text-[#6A6F85] hover:text-[#161827] mb-4">
        <ArrowLeft className="w-4 h-4" />All setups
      </Link>

      <Card className="p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-[#161827]">{setup.name}</h1>
            <p className="text-[14px] text-[#6A6F85] mt-1">
              {[setup.branch, setup.section && `Section ${setup.section}`, setup.semesterLabel, setup.academicYear].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={readOnly ? "amber" : "green"}>{readOnly ? "Archived" : "Active"}</Badge>
            <Badge>{fmtDate(setup.startDate)} → {fmtDate(setup.endDate)}</Badge>
          </div>
        </div>
        {readOnly && (
          <Alert type="warning" className="mt-4">This setup is archived and read-only.</Alert>
        )}
      </Card>

      <div className="flex gap-1.5 p-1.5 rounded-full bg-white/45 border border-white/70 w-fit mb-6 max-w-full overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx(
              "flex items-center gap-2 h-9 px-4 rounded-full text-[13.5px] font-medium transition whitespace-nowrap",
              tab === key
                ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/25"
                : "text-[#161827]/70 hover:bg-white/70"
            )}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === "subjects" && <SubjectsTab setupId={setupId} readOnly={readOnly} />}
      {tab === "calendar" && <CalendarTab setupId={setupId} readOnly={readOnly} />}
      {tab === "settings" && <SettingsTab setup={setup} onUpdated={setSetup} readOnly={readOnly} />}
    </div>
  );
};

export default SetupDetail;
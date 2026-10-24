import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { setupsApi, errMsg } from "../api/endpoints";
import { Alert, Button, PageSpinner } from "./Ui";

// Loads the student's active setup once for everything inside it.
// Pages read it with:  const { setup, reload } = useOutletContext();
// A 404 means "no setup yet" -> send the student to onboarding.
const ActiveSetupRoute = () => {
  const [state, setState] = useState({ loading: true, setup: null, missing: false, error: "" });

  const load = useCallback(async () => {
    try {
      const setup = await setupsApi.active();
      setState({ loading: false, setup, missing: false, error: "" });
    } catch (e) {
      if (e?.response?.status === 404) setState({ loading: false, setup: null, missing: true, error: "" });
      else setState({ loading: false, setup: null, missing: false, error: errMsg(e, "Could not load your setup") });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <PageSpinner />;
  if (state.missing) return <Navigate to="/onboarding/setup" replace />;

  if (state.error || !state.setup) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14 space-y-4">
        <Alert type="error">{state.error || "No active setup."}</Alert>
        <Button onClick={() => { setState((s) => ({ ...s, loading: true })); load(); }}>Try again</Button>
      </div>
    );
  }

  return <Outlet context={{ setup: state.setup, reload: load }} />;
};

export default ActiveSetupRoute;
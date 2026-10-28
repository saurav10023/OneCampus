import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { setupsApi, errMsg } from "../api/endpoints";
import { Alert, Button, PageSpinner } from "./Ui";

const ActiveSetupRoute = () => {
  const [state, setState] = useState({ loading: true, setup: null, redirect: "", error: "" });

  const load = useCallback(async () => {
    try {
      const setup = await setupsApi.active();
      setState({ loading: false, setup, redirect: "", error: "" });
    } catch (e) {
      if (e?.response?.status !== 404) {
        return setState({ loading: false, setup: null, redirect: "", error: errMsg(e, "Could not load your setup") });
      }
      // No ACTIVE setup. Only a user with no setups at all needs onboarding.
      try {
        const any = await setupsApi.list();
        setState({ loading: false, setup: null, redirect: any.length ? "/setups" : "/onboarding/setup", error: "" });
      } catch (e2) {
        setState({ loading: false, setup: null, redirect: "", error: errMsg(e2, "Could not load your setups") });
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <PageSpinner />;
  if (state.redirect) return <Navigate to={state.redirect} replace />;

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
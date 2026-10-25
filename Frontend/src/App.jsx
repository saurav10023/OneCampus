import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import ScrollToTop from "./ScrollToTop";
import ProtectedRoute from "./components/ProtectedRoute";
import ActiveSetupRoute from "./components/ActiveSetupRoute";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Timetable from "./pages/Timetable";
import Attendance from "./pages/Attendance";
import Setups from "./pages/Setups";
import SetupDetail from "./pages/SetupDetail";
import Profile from "./pages/Profile";
import CRStudio from "./pages/CRStudio";
import CRSchedule from "./pages/CRSchedule";
import NotFound from "./pages/NotFound";
import Official from "./pages/Official";

const App = () => (
  <>
    <ScrollToTop />
    <Routes>
      <Route element={<Layout />}>
        {/* public */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* logged in */}
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding/setup" element={<Onboarding />} />
          <Route path="/setups" element={<Setups />} />
          <Route path="/setups/:setupId" element={<SetupDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/cr-studio" element={<CRStudio />} />
          <Route path="/cr-studio/:scheduleId" element={<CRSchedule />} />

          {/* logged in AND has an active setup (otherwise -> onboarding) */}
          <Route element={<ActiveSetupRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/official" element={<Official/>}/>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  </>
);

export default App;
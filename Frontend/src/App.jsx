import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import ScrollToTop from "./ScrollToTop";
import ProtectedRoute from "./components/protectedRoute";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Setups from "./pages/Setups";
import SetupDetail from "./pages/SetupDetail";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const App = () => (
  <>
    <ScrollToTop />
    <Routes>
      <Route element={<Layout />}>
        {/* public */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* private */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setups" element={<Setups />} />
          <Route path="/setups/:setupId" element={<SetupDetail />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  </>
);

export default App;
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, Field } from "../components/ui";
import { errMsg } from "../api/endpoints";

const Login = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || "/dashboard";
  const notice = location.state?.registered ? "Account created. Log in to continue." : "";

  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // The backend detects a 10-digit mobile vs a username from `identifier`.
      await login({ identifier: identifier.trim(), password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(errMsg(err, "Could not log in"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <Card className="p-7 sm:p-8">
        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] text-white flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <LogIn className="w-6 h-6" />
        </span>
        <h1 className="text-[26px] font-semibold tracking-tight text-[#161827] mt-5">Welcome back</h1>
        <p className="text-[14px] text-[#6A6F85] mt-1">Log in to see your timetable and attendance.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Alert type="success">{notice}</Alert>
          <Alert type="error">{error}</Alert>

          <Field
            label="Username or mobile number"
            type="text"
            placeholder="yourname or 9876543210"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Button type="submit" loading={loading} className="w-full">
            Log in
          </Button>
        </form>

        <p className="text-[13.5px] text-[#6A6F85] text-center mt-6">
          New here?{" "}
          <Link to="/register" className="font-medium text-indigo-600 hover:underline">
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default Login;
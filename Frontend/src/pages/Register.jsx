import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, Field } from "../components/ui";
import { errMsg } from "../api/endpoints";

// Edit this list to match what your registerUser controller accepts.
// Each `name` is sent to the backend as-is.
const FIELDS = [
  { name: "displayName", label: "Full name", type: "text", placeholder: "Your name" },
  { name: "username", label: "Username", type: "text", placeholder: "yourname" },
  { name: "email", label: "Email", type: "email", placeholder: "you@college.edu" },
  { name: "password", label: "Password", type: "password", placeholder: "At least 8 characters" },
];

const Register = () => {
  const { user, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.name, ""])));
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, k === "password" ? v : v.trim()])
      );
      await register(payload);
      navigate("/login", { replace: true, state: { registered: true } });
    } catch (err) {
      setError(errMsg(err, "Could not create the account"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <Card className="p-7 sm:p-8">
        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] text-white flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <UserPlus className="w-6 h-6" />
        </span>
        <h1 className="text-[26px] font-semibold tracking-tight text-[#161827] mt-5">Create your account</h1>
        <p className="text-[14px] text-[#6A6F85] mt-1">Track attendance and share timetables with classmates.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Alert type="error">{error}</Alert>

          {FIELDS.map((f) => (
            <Field
              key={f.name}
              label={f.label}
              type={f.type}
              placeholder={f.placeholder}
              value={form[f.name]}
              onChange={set(f.name)}
              autoComplete={f.type === "password" ? "new-password" : undefined}
              required
            />
          ))}

          <Field
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />

          <Button type="submit" loading={loading} className="w-full">
            Create account
          </Button>
        </form>

        <p className="text-[13.5px] text-[#6A6F85] text-center mt-6">
          Already registered?{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default Register;
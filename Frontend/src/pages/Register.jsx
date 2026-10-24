import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, Field } from "../components/Ui";
import { errMsg } from "../api/endpoints";

// Matches POST /users/register
const FIELDS = [
  { name: "fullName", label: "Full name", type: "text", placeholder: "Saurav Kumar", required: true },
  { name: "username", label: "Username", type: "text", placeholder: "saurav_23", required: true },
  { name: "mobile", label: "Mobile number", type: "tel", placeholder: "9876543210", required: true },
  { name: "email", label: "Email (optional)", type: "email", placeholder: "you@example.com" },
  { name: "college", label: "College", type: "text", placeholder: "NIT Jamshedpur", required: true, wide: true },
  { name: "branch", label: "Branch", type: "text", placeholder: "CSE", required: true },
  { name: "section", label: "Section", type: "text", placeholder: "A", required: true },
  { name: "rollNo", label: "Roll number", type: "text", placeholder: "2023UGCS001" },
];

const Register = () => {
  const { user, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.name, ""])));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    const mobile = form.mobile.replace(/[\s-]/g, "").replace(/^(\+91|91)(?=\d{10}$)/, "");
    if (!/^\d{10}$/.test(mobile)) return setError("Enter a valid 10-digit mobile number.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    const payload = { password, mobile };
    FIELDS.forEach(({ name }) => {
      const v = form[name].trim();
      if (name !== "mobile" && v) payload[name] = v;
    });

    setLoading(true);
    try {
      await register(payload);
      navigate("/login", { replace: true, state: { registered: true } });
    } catch (err) {
      setError(errMsg(err, "Could not create the account"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <Card className="p-7 sm:p-8">
        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] text-white flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <UserPlus className="w-6 h-6" />
        </span>
        <h1 className="text-[26px] font-semibold tracking-tight text-[#161827] mt-5">Create your account</h1>
        <p className="text-[14px] text-[#6A6F85] mt-1">Your college, branch and section help us find your class schedule.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Alert type="error">{error}</Alert>

          <div className="grid sm:grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <Field
                key={f.name}
                label={f.label}
                type={f.type}
                placeholder={f.placeholder}
                value={form[f.name]}
                onChange={set(f.name)}
                required={f.required}
                className={f.wide ? "sm:col-span-2" : ""}
                autoComplete="off"
              />
            ))}
            <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" required />
            <Field label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </div>

          <Button type="submit" loading={loading} className="w-full">
            Create account
          </Button>
        </form>

        <p className="text-[13.5px] text-[#6A6F85] text-center mt-6">
          Already registered?{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:underline">Log in</Link>
        </p>
      </Card>
    </div>
  );
};

export default Register;
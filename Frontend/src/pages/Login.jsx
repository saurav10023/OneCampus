import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Phone, Armchair, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext'; // adjust path if AuthContext lives elsewhere

// ---- liquid-glass surfaces ----------------------------------------------------
const GLASS =
  'bg-gradient-to-br from-white/75 to-white/30 backdrop-blur-xl backdrop-saturate-150 border border-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(90,70,40,0.07),0_16px_40px_-18px_rgba(80,60,30,0.4)]';
const GLASS_DARK =
  'bg-gradient-to-br from-[#5A6450]/95 to-[#343C2E]/95 backdrop-blur-xl text-white border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_14px_30px_-12px_rgba(52,60,46,0.65)]';
const GLASS_ON_PHOTO =
  'bg-gradient-to-br from-white/25 to-white/8 backdrop-blur-xl backdrop-saturate-150 text-white border border-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_16px_40px_-18px_rgba(0,0,0,0.6)]';

const inputBase =
  'w-full py-3.5 rounded-xl bg-white/60 border text-base sm:text-sm text-ink placeholder:text-stone/60 focus:outline-none focus:ring-2 focus:bg-white/80 transition-all duration-200';
const inputOk = 'border-white/80 focus:ring-moss/30 focus:border-moss/50';
const inputBad = 'border-[#B5533A]/50 focus:ring-[#B5533A]/25 focus:border-[#B5533A]/60';

export default function AdminLogin({ onSuccess }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ mobileNumber: '', password: '' });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  // Client-side validation matching backend constraints
  const validateForm = () => {
    const newErrors = {};
    const phoneRegex = /^[0-9]{10}$/;

    if (!formData.mobileNumber) {
      newErrors.mobileNumber = 'Mobile number is required';
    } else if (!phoneRegex.test(formData.mobileNumber)) {
      newErrors.mobileNumber = 'Must be a valid 10-digit number';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'mobileNumber' && value !== '' && !/^[0-9\b]+$/.test(value)) return;
    if (name === 'mobileNumber' && value.length > 10) return;

    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (serverError) setServerError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setServerError('');

    try {
      // Goes through AuthContext.login(), which calls the configured axios
      // instance AND updates the shared `user` state — calling loginAdmin()
      // directly here would store the token but leave Navbar/AuthContext
      // unaware a login happened until a full page reload.
      const admin = await login(formData);
      console.log("Login success — admin returned:", admin);
      onSuccess?.(admin);
      navigate('/');
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Authentication failed';
      setServerError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100svh] w-full font-sans selection:bg-moss/25 selection:text-ink bg-paper overflow-x-clip">
      {/* soft light fields so the glass has something to bend */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-28 right-[-10%] w-[34rem] h-[34rem] rounded-full bg-[#E3D3B8]/80 blur-[110px]" />
        <div className="absolute top-1/2 left-[-12%] w-[26rem] h-[26rem] rounded-full bg-[#D3D9C5]/80 blur-[100px]" />
        <div className="absolute bottom-[-15%] right-[25%] w-[24rem] h-[24rem] rounded-full bg-[#EBDDC6]/80 blur-[100px]" />
      </div>

      <div className="relative min-h-[100svh] w-full lg:grid lg:grid-cols-[1.1fr_1fr]">
        {/* Left / Brand Panel — hidden on mobile, photo panel on desktop */}
        <div className="relative hidden lg:flex flex-col justify-between overflow-hidden m-4 rounded-[32px] px-12 xl:px-14 py-10 min-h-[calc(100svh-2rem)]">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center">
            <div className="absolute inset-0 bg-gradient-to-t from-[#1d1b17]/90 via-[#1d1b17]/45 to-[#1d1b17]/20" />
          </div>

          <div className={`relative z-10 inline-flex w-fit items-center gap-3 rounded-full pl-2 pr-5 py-2 ${GLASS_ON_PHOTO}`}>
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/20">
              <Armchair className="w-[18px] h-[18px] stroke-[1.5]" />
            </span>
            <span className="text-[14px] font-medium tracking-wide">Lifestyle Store</span>
          </div>

          <div className={`relative z-10 max-w-md rounded-3xl p-7 ${GLASS_ON_PHOTO}`}>
            <p className="text-[12px] font-medium tracking-[0.18em] text-white/75 uppercase mb-3">
              Management Suite
            </p>
            <h1 className="font-serif font-medium text-[2.2rem] xl:text-[2.6rem] leading-[1.08] mb-3 text-balance">
              Every room starts with what's behind the counter.
            </h1>
            <p className="text-[14px] leading-relaxed text-white/80">
              Sign in to manage inventory, orders, and storefront categories
              across the collection.
            </p>
          </div>
        </div>

        {/* Right / Form Panel */}
        <div className="relative flex items-center justify-center px-4 sm:px-8 py-8 sm:py-10 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <div className="relative z-10 w-full max-w-[420px]">
            {/* Mobile-only header (desktop gets the left panel instead) */}
            <div className="flex lg:hidden flex-col items-center text-center mb-6">
              <span className={`flex items-center justify-center w-14 h-14 rounded-full mb-3 ${GLASS}`}>
                <Armchair className="w-6 h-6 text-moss stroke-[1.4]" />
              </span>
              <h1 className="font-serif font-medium text-[1.5rem] text-ink">Lifestyle Store</h1>
              <p className="text-[12.5px] text-stone mt-0.5">Management Suite Access</p>
            </div>

            <div className={`rounded-[28px] p-5 sm:p-8 ${GLASS}`}>
              <div className="hidden lg:block mb-6">
                <h2 className="font-serif font-medium text-[1.9rem] text-ink mb-1">Welcome back</h2>
                <p className="text-sm text-stone">Enter your credentials to access the dashboard.</p>
              </div>
              <div className="lg:hidden mb-5 text-center">
                <h2 className="font-serif font-medium text-[1.4rem] text-ink">Welcome back</h2>
                <p className="text-[13px] text-stone mt-0.5">Sign in to open the dashboard.</p>
              </div>

              {serverError && (
                <div
                  role="alert"
                  className="mb-5 px-4 py-3 rounded-xl bg-[#B5533A]/10 border border-[#B5533A]/30 flex items-center justify-center"
                >
                  <p className="text-[13px] text-[#9A3F28] font-medium text-center">{serverError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4 sm:space-y-5">
                {/* Mobile Number */}
                <div className="space-y-1.5">
                  <label htmlFor="mobileNumber" className="text-[13px] font-medium text-ink/80">
                    Registered phone number
                  </label>
                  <div className="relative group">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-stone group-focus-within:text-moss transition-colors duration-200">
                      <Phone className="w-[18px] h-[18px] stroke-[1.5]" />
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      name="mobileNumber"
                      id="mobileNumber"
                      autoComplete="tel"
                      value={formData.mobileNumber}
                      onChange={handleChange}
                      placeholder="Enter 10 digit number"
                      aria-invalid={!!errors.mobileNumber}
                      className={`${inputBase} pl-11 pr-4 ${errors.mobileNumber ? inputBad : inputOk}`}
                    />
                  </div>
                  {errors.mobileNumber && (
                    <p className="text-[12px] text-[#9A3F28] font-medium mt-1 pl-1">{errors.mobileNumber}</p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-[13px] font-medium text-ink/80">
                      Password
                    </label>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="text-[12.5px] font-medium text-moss hover:text-moss-dark transition-colors"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative group">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-stone group-focus-within:text-moss transition-colors duration-200">
                      <Lock className="w-[18px] h-[18px] stroke-[1.5]" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      id="password"
                      autoComplete="current-password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="••••••••"
                      aria-invalid={!!errors.password}
                      className={`${inputBase} pl-11 pr-12 ${errors.password ? inputBad : inputOk}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-stone hover:text-ink transition-colors duration-200 rounded-r-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-moss"
                    >
                      {showPassword ? (
                        <EyeOff className="w-[18px] h-[18px]" />
                      ) : (
                        <Eye className="w-[18px] h-[18px]" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-[12px] text-[#9A3F28] font-medium mt-1 pl-1">{errors.password}</p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`group relative w-full mt-1 overflow-hidden rounded-full inline-flex items-center justify-center gap-2 px-4 py-3.5 text-[15px] font-medium transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-70 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${GLASS_DARK}`}
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  {isLoading ? (
                    <>
                      <Loader2 className="relative w-[18px] h-[18px] animate-spin" />
                      <span className="relative">Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span className="relative">Sign in</span>
                      <ArrowRight className="relative w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>
            </div>

            <p className="lg:hidden mt-5 text-center text-[11px] text-stone/80">
              Secure Retail Data // AES-256 Encryption
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
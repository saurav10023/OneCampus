// OneCampus liquid-glass navbar (v3: floating + fixed).
//
// What changed from v2:
//  - Header is now position: fixed (always floating at the top). A spacer in
//    normal flow keeps your pages from sliding under it, so no page edits needed.
//  - The header strip ignores pointer events; only the glass pill is clickable.
//  - Liquid glass upgrade: drifting colour "liquid" under the glass, a gradient
//    rim light, grain, a specular highlight that follows the pointer, and a
//    slow sheen that sweeps across the bar.
//  - Motion: spring drop-in on load, active pill squashes as it glides to a new
//    link, logo shine on hover. All of it respects prefers-reduced-motion.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  GraduationCap,
  Home,
  Layers,
  LayoutDashboard,
  LogIn,
  LogOut,
  Megaphone,
  Sparkles,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

/* ---------- config: edit routes here ---------- */

// auth: true      -> shown only when logged in
// menuOnly: true  -> hidden from the desktop inline links (still in the menu)
const NAV = [
  { to: "/", label: "Home", hint: "Back to the start", icon: Home, end: true },
  { to: "/dashboard", label: "Today", hint: "Mark today's classes", icon: LayoutDashboard, auth: true },
  { to: "/attendance", label: "Attendance", hint: "Percentages and bunk calculator", icon: BarChart3, auth: true },
  { to: "/calendar", label: "Calendar", hint: "Holidays, exams and events", icon: CalendarRange, auth: true },
  { to: "/timetable", label: "Timetable", hint: "Weekly classes", icon: CalendarDays, auth: true },
  { to: "/setups", label: "Setups", hint: "Subjects, calendar, official sync", icon: Layers, auth: true },
  { to: "/cr-studio", label: "CR Studio", hint: "Publish your class timetable", icon: Megaphone, auth: true, menuOnly: true },
];

const SCROLL_ON = 24; // px scrolled before the bar compacts
const SCROLL_OFF = 6; // px to scroll back above before it expands again

/* ---------- small pieces ---------- */

const BrandMark = ({ onClick, compact = false }) => (
  <Link
    to="/"
    onClick={onClick}
    aria-label="OneCampus home"
    className="oc-focus flex items-center gap-2.5 lg:gap-3 shrink-0 group min-w-0 rounded-full"
  >
    <span
      className={`oc-logo relative overflow-hidden rounded-full flex items-center justify-center shrink-0 aspect-square transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 group-hover:-rotate-6 ${
        compact ? "w-10" : "oc-brand-logo"
      }`}
    >
      <GraduationCap className="relative z-10 w-[52%] h-[52%] text-white drop-shadow" strokeWidth={2.2} />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/55 via-transparent to-transparent" />
      <span className="oc-logo-shine pointer-events-none absolute inset-0" />
    </span>
    <span
      className={`font-semibold tracking-tight leading-none whitespace-nowrap text-[color:var(--oc-ink)] ${
        compact ? "text-[19px]" : "oc-brand-text"
      }`}
    >
      One<span className="oc-gradient-text">Campus</span>
    </span>
  </Link>
);

const Avatar = ({ name, size = "w-9 h-9", text = "text-[13px]" }) => (
  <span
    className={`${size} ${text} oc-logo rounded-full text-white font-semibold flex items-center justify-center uppercase shrink-0`}
  >
    {name?.charAt(0) || "U"}
  </span>
);

// Animated hamburger -> X
const MenuIcon = ({ open }) => (
  <span className="relative block w-[18px] h-[14px]" aria-hidden>
    <span
      className={`absolute left-0 h-[2px] w-full rounded bg-current transition-all duration-300 ease-out ${
        open ? "top-[6px] rotate-45" : "top-0"
      }`}
    />
    <span
      className={`absolute left-0 top-[6px] h-[2px] w-full rounded bg-current transition-all duration-200 ${
        open ? "opacity-0 scale-x-0" : "opacity-100"
      }`}
    />
    <span
      className={`absolute left-0 h-[2px] w-full rounded bg-current transition-all duration-300 ease-out ${
        open ? "top-[6px] -rotate-45" : "top-[12px]"
      }`}
    />
  </span>
);

/* ---------- navbar ---------- */

const Navbar = () => {
  const { user, logout, loading: authLoading } = useAuth();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // sliding pills inside the desktop inline nav
  const [activePill, setActivePill] = useState(null);
  const [hoverPill, setHoverPill] = useState(null);

  const headerRef = useRef(null);
  const navRef = useRef(null);
  const menuBtnRef = useRef(null);
  const popoverRef = useRef(null);
  const activePillRef = useRef(null);
  const lastLeft = useRef(null);

  const links = NAV.filter((l) => !l.auth || user);
  const displayName = user?.displayName || user?.fullName || user?.username || user?.email || "Student";
  const isStaff = user?.role === "admin" || user?.role === "moderator";

  const isActive = (l) => (l.end ? location.pathname === "/" : location.pathname.startsWith(l.to));

  /* ---- compact state: flips once (with hysteresis) and CSS transitions do the morph ---- */
  useEffect(() => {
    let raf = 0;
    let state = window.scrollY > SCROLL_ON;
    setScrolled(state);
    const check = () => {
      raf = 0;
      const y = window.scrollY;
      const next = state ? y > SCROLL_OFF : y > SCROLL_ON;
      if (next !== state) {
        state = next;
        setScrolled(next);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* ---- pointer-following specular highlight on the glass pill ---- */
  const glassRef = useRef(null);
  const spec = useRef({ tx: 0, ty: 0, cx: 0, cy: 0, raf: 0, init: false });
  const stepSpec = () => {
    const s = spec.current;
    const el = glassRef.current;
    if (!el) {
      s.raf = 0;
      return;
    }
    s.cx += (s.tx - s.cx) * 0.14;
    s.cy += (s.ty - s.cy) * 0.14;
    el.style.setProperty("--mx", `${s.cx.toFixed(1)}px`);
    el.style.setProperty("--my", `${s.cy.toFixed(1)}px`);
    s.raf = Math.abs(s.tx - s.cx) < 0.3 && Math.abs(s.ty - s.cy) < 0.3 ? 0 : requestAnimationFrame(stepSpec);
  };
  const onGlassMove = (e) => {
    const s = spec.current;
    const r = e.currentTarget.getBoundingClientRect();
    s.tx = e.clientX - r.left;
    s.ty = e.clientY - r.top;
    if (!s.init) {
      s.cx = s.tx;
      s.cy = s.ty;
      s.init = true;
    }
    e.currentTarget.style.setProperty("--hl", "1");
    if (!s.raf) s.raf = requestAnimationFrame(stepSpec);
  };
  const onGlassLeave = (e) => e.currentTarget.style.setProperty("--hl", "0");
  useEffect(() => () => cancelAnimationFrame(spec.current.raf), []);

  /* ---- measure the active inline link so the pill can glide to it ---- */
  const measureActive = useCallback(() => {
    const el = navRef.current?.querySelector('[data-active="true"]');
    if (el && el.offsetWidth > 0) {
      const left = el.offsetLeft;
      setActivePill({ left, width: el.offsetWidth });
      // squash-and-stretch whenever the pill travels to a different link
      if (lastLeft.current !== null && lastLeft.current !== left && activePillRef.current) {
        const pill = activePillRef.current;
        pill.classList.remove("oc-squash");
        void pill.offsetWidth; // restart the animation
        pill.classList.add("oc-squash");
      }
      lastLeft.current = left;
    } else {
      setActivePill(null);
      lastLeft.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    measureActive();
  }, [measureActive, location.pathname, user, authLoading]);

  useEffect(() => {
    window.addEventListener("resize", measureActive);
    return () => window.removeEventListener("resize", measureActive);
  }, [measureActive]);

  const hoverIn = (e) =>
    setHoverPill({ left: e.currentTarget.offsetLeft, width: e.currentTarget.offsetWidth });

  /* ---- menu behaviour ---- */
  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    const onDown = (e) => {
      if (!menuOpen || window.innerWidth < 768) return; // mobile drawer has its own backdrop
      if (menuBtnRef.current?.contains(e.target) || popoverRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    const lock = menuOpen && window.innerWidth < 768;
    document.body.style.overflow = lock ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
  };

  /* ---- menu body, shared by desktop popover and mobile drawer ---- */
  const reveal = `transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
    menuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
  }`;

  const renderMenu = () => {
    let n = 0;
    const delay = () => ({ transitionDelay: menuOpen ? `${70 + n++ * 35}ms` : "0ms" });

    return (
      <div className="flex flex-col gap-4">
        <div>
          <p
            className={`${reveal} text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--oc-muted)] mb-2 px-2`}
            style={delay()}
          >
            Navigate
          </p>
          <nav className="flex flex-col gap-1" aria-label="Site pages">
            {links.map((l) => {
              const active = isActive(l);
              const Icon = l.icon;
              return (
                <div key={l.to} className={reveal} style={delay()}>
                  <Link
                    to={l.to}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`oc-focus group/row flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-300 ${
                      active
                        ? "oc-row-active"
                        : "text-[color:var(--oc-ink)] hover:bg-white/70 hover:translate-x-0.5 active:bg-white/80"
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover/row:scale-105 ${
                        active ? "bg-white/20" : "bg-white/70 border border-white/80"
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium leading-tight">{l.label}</span>
                      <span className={`block text-[12px] leading-tight mt-0.5 ${active ? "text-white/75" : "text-[color:var(--oc-muted)]"}`}>
                        {l.hint}
                      </span>
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 transition-transform duration-300 group-hover/row:translate-x-0.5 ${
                        active ? "text-white/70" : "opacity-40"
                      }`}
                    />
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>

        {/* account / auth */}
        <div className={`${reveal} pt-3 border-t border-[color:var(--oc-ink)]/10`} style={delay()}>
          {authLoading ? null : user ? (
            <div className="rounded-3xl bg-white/55 border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,1)] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar name={displayName} size="w-10 h-10" text="text-[14px]" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[color:var(--oc-ink)] truncate">{displayName}</p>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--oc-muted)]">
                    {isStaff ? user.role : "Student"}
                  </p>
                </div>
              </div>
              <div className="h-px bg-gradient-to-r from-transparent via-[color:var(--oc-ink)]/15 to-transparent" />
              <div className="p-1.5">
                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="oc-focus flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] text-[color:var(--oc-ink)] hover:bg-white/70 transition-colors"
                >
                  <User className="w-4 h-4" />
                  Your account
                </Link>
                <button
                  onClick={handleLogout}
                  className="oc-focus w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-[14px] text-[#D1435B] hover:bg-white/70 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Link
                to="/register"
                onClick={() => setMenuOpen(false)}
                className="oc-focus oc-btn-primary flex items-center justify-center gap-2 px-4 py-3 rounded-full text-[14px] font-medium"
              >
                <UserPlus className="w-4 h-4" />
                Create account
              </Link>
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="oc-focus flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-white/55 border border-white/80 text-[14px] font-medium text-[color:var(--oc-ink)] hover:bg-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,1)] transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Log in
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        .oc-nav-scope {
          --oc-ink: #161827;
          --oc-muted: #6A6F85;
          --oc-a: #4F46E5;
          --oc-b: #0EA5E9;
        }
        .oc-gradient-text {
          background: linear-gradient(90deg, var(--oc-a), var(--oc-b));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .oc-logo {
          background: linear-gradient(140deg, var(--oc-a), var(--oc-b));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.45), 0 8px 18px -8px rgba(79,70,229,0.7);
        }
        .oc-logo-shine {
          background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.6) 50%, transparent 62%);
          transform: translateX(-130%);
          transition: transform .8s ease;
        }
        .group:hover .oc-logo-shine { transform: translateX(130%); }
        .oc-focus:focus { outline: none; }
        .oc-focus:focus-visible { box-shadow: 0 0 0 2px #fff, 0 0 0 4px rgba(79,70,229,0.55); }
        .oc-row-active {
          color: #fff;
          background: linear-gradient(135deg, #5B52EE, #2B8DE0);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 10px 22px -12px rgba(79,70,229,0.8);
        }
        .oc-btn-primary {
          color: #fff;
          background: linear-gradient(135deg, #5B52EE, #2B8DE0);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 12px 24px -12px rgba(79,70,229,0.8);
          transition: filter .2s ease, transform .2s ease;
        }
        .oc-btn-primary:hover { filter: brightness(1.08); }
        .oc-btn-primary:active { transform: scale(0.98); }
        .oc-menu-btn {
          position: relative; overflow: hidden; color: #fff;
          background: linear-gradient(180deg, #2A2D45, #161827);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 12px 24px -12px rgba(22,24,39,0.8);
        }
        .oc-menu-btn::after {
          content: ""; position: absolute; inset: 0; transform: translateX(-120%);
          background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.28) 50%, transparent 65%);
          transition: transform .7s ease;
        }
        .oc-menu-btn:hover::after { transform: translateX(120%); }

        /* ---- compact morph: transitions run once on a state flip, not on every scroll frame ---- */
        .oc-head { padding-top: calc(12px + env(safe-area-inset-top, 0px)); transition: padding-top .5s cubic-bezier(0.22,1,0.36,1); }
        .oc-head.oc-s { padding-top: calc(7px + env(safe-area-inset-top, 0px)); }
        .oc-wrap { width: min(100%, 80rem); transition: width .5s cubic-bezier(0.22,1,0.36,1); }
        .oc-s .oc-wrap { width: min(100%, 71rem); }
        .oc-bar {
          height: var(--h0);
          background: linear-gradient(180deg, rgba(255,255,255,0.68), rgba(243,246,255,0.54));
          backdrop-filter: blur(22px) saturate(1.8);
          -webkit-backdrop-filter: blur(22px) saturate(1.8);
          border-color: rgba(255,255,255,0.4);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.4), inset 0 -10px 18px -12px rgba(120,140,255,0.25), 0 18px 36px -22px rgba(30,32,70,0.22), 0 4px 12px -6px rgba(30,32,70,0.1);
          transition: height .5s cubic-bezier(0.22,1,0.36,1), background .5s ease, border-color .5s ease, box-shadow .5s ease;
        }
        .oc-s .oc-bar {
          height: var(--h1);
          background: linear-gradient(180deg, rgba(255,255,255,0.86), rgba(244,247,255,0.82));
          border-color: rgba(255,255,255,0.6);
          box-shadow: inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(255,255,255,0.45), inset 0 -10px 18px -12px rgba(120,140,255,0.22), 0 24px 44px -22px rgba(30,32,70,0.45), 0 4px 14px -6px rgba(30,32,70,0.16);
        }
        .oc-brand-logo { width: var(--l0); transition: width .5s cubic-bezier(0.22,1,0.36,1), transform .5s cubic-bezier(0.22,1,0.36,1); }
        .oc-s .oc-brand-logo { width: var(--l1); }
        .oc-brand-text { font-size: var(--f0); transition: font-size .5s cubic-bezier(0.22,1,0.36,1); }
        .oc-s .oc-brand-text { font-size: var(--f1); }

        /* ---- glass surfaces ---- */
        .oc-panel {
          background: linear-gradient(180deg, rgba(251,252,255,0.9), rgba(242,245,255,0.84));
          backdrop-filter: blur(24px) saturate(1.8);
          -webkit-backdrop-filter: blur(24px) saturate(1.8);
          border: 1px solid rgba(255,255,255,0.85);
          box-shadow: inset 0 1px 0 #fff, inset 0 -12px 24px -16px rgba(120,140,255,0.3), 0 30px 60px -24px rgba(30,32,70,0.5);
        }
        /* gradient rim light: a 1px ring that is bright on opposite corners */
        .oc-rim {
          position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none;
          background: linear-gradient(120deg, rgba(255,255,255,0.98), rgba(255,255,255,0.08) 28%, rgba(150,175,255,0.4) 62%, rgba(255,255,255,0.95));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
        }
        /* fine grain so the glass reads as a material, not a flat gradient */
        .oc-grain {
          position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
          opacity: 0.09; mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        }
        /* specular spot that tracks the pointer */
        .oc-spec {
          position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
          opacity: var(--hl, 0); transition: opacity .5s ease;
          background: radial-gradient(170px circle at var(--mx, 50%) var(--my, 0%), rgba(255,255,255,0.5), rgba(255,255,255,0.12) 50%, transparent 72%);
        }

        /* ---- liquid drifting under the glass ---- */
        .oc-blob {
          position: absolute; border-radius: 9999px; will-change: transform;
          background: radial-gradient(closest-side, rgba(var(--c)), transparent);
        }
        .oc-liquid-a { animation: oc-drift-a 22s ease-in-out infinite; }
        .oc-liquid-b { animation: oc-drift-b 26s ease-in-out infinite; }
        .oc-liquid-c { animation: oc-drift-a 32s ease-in-out infinite reverse; }
        @keyframes oc-drift-a {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(70px, 4px, 0) scale(1.12); }
        }
        @keyframes oc-drift-b {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1.05); }
          50% { transform: translate3d(-80px, -3px, 0) scale(0.95); }
        }
        .oc-sheen {
          position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none;
        }
        .oc-sheen::before {
          content: ""; position: absolute; top: -20%; bottom: -20%; width: 28%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,0.5), transparent);
          transform: translateX(-160%) skewX(-18deg);
          animation: oc-sheen 12s ease-in-out 2s infinite;
        }
        @keyframes oc-sheen {
          0%, 62% { transform: translateX(-160%) skewX(-18deg); }
          100% { transform: translateX(520%) skewX(-18deg); }
        }

        /* ---- entrance: the bar drops in and settles ---- */
        .oc-enter { animation: oc-drop .8s cubic-bezier(0.16, 1, 0.3, 1) both; will-change: transform, opacity; }
        @keyframes oc-drop {
          0% { transform: translate3d(0, -40px, 0); opacity: 0; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }

        /* ---- active pill squashes while it glides ---- */
        .oc-squash { animation: oc-squash .5s cubic-bezier(0.22, 1, 0.36, 1); }
        @keyframes oc-squash {
          0% { transform: scale(1, 1); }
          40% { transform: scale(1.03, 0.94); }
          100% { transform: scale(1, 1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .oc-head, .oc-wrap, .oc-bar, .oc-brand-logo, .oc-brand-text { transition: none; }
          .oc-menu-btn::after, .oc-logo-shine { transition: none; }
          .oc-liquid-a, .oc-liquid-b, .oc-liquid-c, .oc-enter, .oc-squash { animation: none; }
          .oc-sheen::before { animation: none; display: none; }
        }
      `}</style>

      <div className="oc-nav-scope">
        {/* fixed + floating. The strip itself ignores clicks; only the pill takes them. */}
        <header
          ref={headerRef}
          className={`oc-head fixed inset-x-0 top-0 z-50 px-3 sm:px-5 pointer-events-none ${scrolled ? "oc-s" : ""}`}
        >
          {/* width wrapper: narrows slightly on scroll; popover anchors to it */}
          <div
            className="oc-enter oc-wrap pointer-events-auto relative mx-auto
              [--h0:56px] [--h1:50px] [--l0:38px] [--l1:34px] [--f0:18px] [--f1:17px]
              sm:[--h0:60px] sm:[--h1:52px] sm:[--l0:40px] sm:[--l1:36px] sm:[--f0:20px] sm:[--f1:19px]
              lg:[--h0:68px] lg:[--h1:58px] lg:[--l0:46px] lg:[--l1:40px] lg:[--f0:23px] lg:[--f1:21px]"
          >
            {/* the glass pill */}
            <div
              ref={glassRef}
              className="oc-bar relative rounded-full border"
              onPointerMove={onGlassMove}
              onPointerLeave={onGlassLeave}
            >
              {/* liquid layers: colour drifting beneath the glass, clipped to the pill */}
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full overflow-hidden">
                <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent opacity-70" />
                <span className="oc-blob oc-liquid-a -left-12 -top-14 w-64 h-44" style={{ "--c": "255,255,255,0.7" }} />
                <span className="oc-blob oc-liquid-b right-8 -bottom-14 w-72 h-28" style={{ "--c": "170,190,255,0.5" }} />
                <span className="oc-blob oc-liquid-c left-1/3 -bottom-12 w-56 h-24" style={{ "--c": "150,215,245,0.4" }} />
              </span>
              <span aria-hidden className="oc-sheen" />
              <span aria-hidden className="oc-grain" />
              <span aria-hidden className="oc-spec" />
              <span aria-hidden className="oc-rim" />

              <div className="relative h-full flex items-center justify-between gap-3 px-2.5 sm:px-3 lg:px-3.5">
                <BrandMark onClick={() => setMenuOpen(false)} />

                {/* Desktop inline links (the menu still holds everything) */}
                <nav
                  ref={navRef}
                  aria-label="Primary"
                  onMouseLeave={() => setHoverPill(null)}
                  className="relative hidden lg:flex items-center gap-0.5 xl:gap-1 rounded-full p-1 bg-white/25 border border-white/60 shadow-[inset_0_1px_2px_rgba(22,24,39,0.06)]"
                >
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 rounded-full bg-white/75 shadow-[inset_0_1px_0_#fff,0_6px_14px_-8px_rgba(22,24,39,0.35)] transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                    style={{
                      left: hoverPill?.left ?? 0,
                      width: hoverPill?.width ?? 0,
                      opacity: hoverPill ? 1 : 0,
                    }}
                  />
                  <span
                    ref={activePillRef}
                    aria-hidden
                    className="absolute top-1 bottom-1 rounded-full bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_18px_-8px_rgba(79,70,229,0.85)] transition-[left,width,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                    style={{
                      left: activePill?.left ?? 0,
                      width: activePill?.width ?? 0,
                      opacity: activePill ? 1 : 0,
                    }}
                  />

                  {authLoading && (
                    <>
                      <span className="h-8 w-16 rounded-full bg-white/40 animate-pulse" />
                      <span className="h-8 w-20 rounded-full bg-white/40 animate-pulse" />
                    </>
                  )}

                  {!authLoading &&
                    links.filter((l) => !l.menuOnly).map((l) => {
                      const active = isActive(l);
                      return (
                        <Link
                          key={l.to}
                          to={l.to}
                          data-active={active}
                          aria-current={active ? "page" : undefined}
                          onMouseEnter={hoverIn}
                          onFocus={hoverIn}
                          className={`oc-focus relative z-10 px-3.5 xl:px-[17px] py-2 rounded-full text-[14px] xl:text-[14.5px] font-medium whitespace-nowrap transition-colors duration-200 ${
                            active ? "text-white" : "text-[color:var(--oc-ink)]/75 hover:text-[color:var(--oc-ink)]"
                          }`}
                        >
                          {l.label}
                        </Link>
                      );
                    })}
                </nav>

                {/* Right controls */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Logged-out quick actions (desktop) */}
                  {!authLoading && !user && (
                    <>
                      <Link
                        to="/login"
                        className="oc-focus hidden md:flex items-center h-10 px-4 rounded-full text-[13.5px] font-medium text-[color:var(--oc-ink)]/80 hover:text-[color:var(--oc-ink)] hover:bg-white/55 transition-colors"
                      >
                        Log in
                      </Link>
                      <Link
                        to="/register"
                        className="oc-focus oc-btn-primary hidden md:flex items-center gap-1.5 h-10 px-4 rounded-full text-[13.5px] font-medium"
                      >
                        <Sparkles className="w-4 h-4" />
                        Get started
                      </Link>
                    </>
                  )}

                  {/* Logged-in profile: name chip on xl, avatar on smaller screens */}
                  {!authLoading && user && (
                    <>
                      <Link
                        to="/profile"
                        aria-label="Your profile"
                        className={`oc-focus hidden xl:flex items-center gap-2 h-10 pl-1 pr-3.5 rounded-full border transition-all duration-300 hover:-translate-y-px ${
                          location.pathname === "/profile"
                            ? "bg-white/85 border-white shadow-[inset_0_1px_0_#fff,0_8px_20px_-12px_rgba(22,24,39,0.4)]"
                            : "bg-white/40 border-white/70 shadow-[inset_0_1px_0_#fff] hover:bg-white/70"
                        }`}
                      >
                        <Avatar name={displayName} size="w-8 h-8" text="text-[12px]" />
                        <span className="text-[13px] font-medium text-[color:var(--oc-ink)] max-w-[110px] truncate">
                          {displayName.split(" ")[0]}
                        </span>
                      </Link>
                      <Link
                        to="/profile"
                        aria-label="Your profile"
                        className="oc-focus xl:hidden w-10 h-10 flex items-center justify-center rounded-full bg-white/40 border border-white/70 shadow-[inset_0_1px_0_#fff] active:scale-95 transition-transform"
                      >
                        <Avatar name={displayName} size="w-8 h-8" text="text-[12px]" />
                      </Link>
                    </>
                  )}

                  {/* MENU button */}
                  <button
                    ref={menuBtnRef}
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label={menuOpen ? "Close menu" : "Open menu"}
                    aria-expanded={menuOpen}
                    aria-controls="site-menu"
                    className={`oc-focus flex items-center justify-center gap-2.5 h-10 min-w-10 px-3 sm:px-4 rounded-full text-[13.5px] font-medium transition-all duration-300 active:scale-95 ${
                      menuOpen
                        ? "bg-white/80 text-[color:var(--oc-ink)] border border-white shadow-[inset_0_1px_0_#fff,0_8px_20px_-12px_rgba(22,24,39,0.4)]"
                        : "oc-menu-btn border border-transparent"
                    }`}
                  >
                    <MenuIcon open={menuOpen} />
                    <span className="hidden sm:block w-[38px] text-left">{menuOpen ? "Close" : "Menu"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop menu panel (sibling of the pill so its blur sees the page) */}
            <div
              id="site-menu"
              ref={popoverRef}
              className={`oc-panel hidden md:block absolute right-0 top-full mt-3 w-[400px] max-h-[calc(100vh-110px)] overflow-y-auto rounded-[30px] p-3 origin-top-right transition-[opacity,transform] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                menuOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
              }`}
              aria-hidden={!menuOpen}
            >
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[30px] bg-gradient-to-b from-white/60 to-transparent" />
              <span aria-hidden className="oc-grain" />
              <div className="relative">{renderMenu()}</div>
            </div>
          </div>
        </header>

        {/* In-flow spacer: the header is fixed, so this reserves its space and
            pages don't need any extra top padding. */}
        <div
          aria-hidden
          className="h-[calc(76px+env(safe-area-inset-top,0px))] sm:h-[calc(80px+env(safe-area-inset-top,0px))] lg:h-[calc(88px+env(safe-area-inset-top,0px))]"
        />

        {/* Mobile drawer */}
        <div
          className={`fixed inset-0 z-[70] md:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          aria-hidden={!menuOpen}
        >
          <div
            onClick={() => setMenuOpen(false)}
            className={`absolute inset-0 bg-[#161827]/35 backdrop-blur-sm transition-opacity duration-300 ${
              menuOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <aside
            className={`oc-panel absolute right-2 w-[88%] max-w-sm rounded-[28px] flex flex-col overflow-hidden transition-transform duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
              menuOpen ? "translate-x-0" : "translate-x-[110%]"
            }`}
            style={{
              top: "calc(8px + env(safe-area-inset-top, 0px))",
              bottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/60 to-transparent" />
            <span aria-hidden className="oc-grain" />

            <div className="relative flex items-center justify-between px-5 py-4 border-b border-white/70 shrink-0">
              <BrandMark compact onClick={() => setMenuOpen(false)} />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="oc-focus w-10 h-10 flex items-center justify-center rounded-full bg-white/60 border border-white/80 text-[color:var(--oc-ink)] hover:bg-white/90 active:bg-white active:scale-95 transition-transform"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>

            <div className="relative flex-1 overflow-y-auto overscroll-contain px-4 py-5">{renderMenu()}</div>
          </aside>
        </div>
      </div>
    </>
  );
};

export default Navbar;
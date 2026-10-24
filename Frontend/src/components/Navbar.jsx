// src/components/Navbar.jsx
// OneCampus liquid-glass navbar.
//
// - Floating glass pill with a single Menu button. Everything (all pages,
//   account, login / sign up, search on mobile) also lives in the Menu.
// - Continuous scroll morph: one eased value (--p, 0 -> 1) drives height,
//   logo size, width, blur, tint, border and shadow together.
// - Desktop: inline links with a hover pill + a sliding active pill, and the
//   menu opens as a floating glass panel. Mobile: a floating glass drawer.
// - Self-contained colours (CSS vars in the <style> block below), so it does
//   not depend on any Tailwind theme tokens.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
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
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

/* ---------- config: edit routes here ---------- */

// auth: true  -> shown only when logged in
const NAV = [
  { to: "/", label: "Home", hint: "Back to the start", icon: Home, end: true },
  { to: "/dashboard", label: "Today", hint: "Mark today's classes", icon: LayoutDashboard, auth: true },
  { to: "/timetable", label: "Timetable", hint: "Weekly classes", icon: CalendarDays, auth: true },
  { to: "/attendance", label: "Attendance", hint: "Percentages and bunk calculator", icon: BarChart3, auth: true },
  { to: "/setups", label: "Setups", hint: "Subjects, calendar, official sync", icon: Layers, auth: true },
  { to: "/cr-studio", label: "CR Studio", hint: "Publish your class timetable", icon: Megaphone, auth: true, menuOnly: true },
];

const SCROLL_RANGE = 90; // px of scrolling over which the bar morphs
const P = "var(--p,0)"; // scroll progress: 0 (top) -> 1 (scrolled)

/* ---------- small pieces ---------- */

const BrandMark = ({ onClick, compact = false }) => (
  <Link
    to="/"
    onClick={onClick}
    aria-label="OneCampus home"
    className="oc-focus flex items-center gap-2.5 lg:gap-3 shrink-0 group min-w-0 rounded-full"
  >
    <span
      className={`oc-logo relative rounded-full flex items-center justify-center shrink-0 aspect-square transition-transform duration-500 ease-out group-hover:scale-105 group-hover:-rotate-6 ${
        compact ? "w-10" : ""
      }`}
      style={compact ? undefined : { width: `calc(var(--l0) - (var(--l0) - var(--l1)) * ${P})` }}
    >
      <GraduationCap className="w-[52%] h-[52%] text-white drop-shadow" strokeWidth={2.2} />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/55 via-transparent to-transparent" />
    </span>
    <span
      className="font-semibold tracking-tight leading-none whitespace-nowrap text-[color:var(--oc-ink)]"
      style={{ fontSize: compact ? "19px" : `calc(var(--f0) - (var(--f0) - var(--f1)) * ${P})` }}
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

  // sliding pills inside the desktop inline nav
  const [activePill, setActivePill] = useState(null);
  const [hoverPill, setHoverPill] = useState(null);

  const headerRef = useRef(null);
  const navRef = useRef(null);
  const menuBtnRef = useRef(null);
  const popoverRef = useRef(null);

  const links = NAV.filter((l) => !l.auth || user);
  const displayName = user?.displayName || user?.fullName || user?.username || user?.email || "Student";
  const isStaff = user?.role === "admin" || user?.role === "moderator";

  const isActive = (l) => (l.end ? location.pathname === "/" : location.pathname.startsWith(l.to));

  /* ---- continuous, eased scroll progress written straight to a CSS var ---- */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let target = 0;
    let current = 0;
    let raf = 0;

    const smooth = (t) => t * t * (3 - 2 * t); // smoothstep
    const apply = () => el.style.setProperty("--p", smooth(current).toFixed(4));
    const read = () => Math.min(1, Math.max(0, window.scrollY / SCROLL_RANGE));

    const tick = () => {
      current += (target - current) * 0.16; // glide toward target
      if (Math.abs(target - current) < 0.002) current = target;
      apply();
      raf = current === target ? 0 : requestAnimationFrame(tick);
    };

    const onScroll = () => {
      target = read();
      if (reduce) {
        current = target;
        apply();
      } else if (!raf) {
        raf = requestAnimationFrame(tick);
      }
    };

    target = read();
    current = target;
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* ---- measure the active inline link so the pill can glide to it ---- */
  const measureActive = useCallback(() => {
    const el = navRef.current?.querySelector('[data-active="true"]');
    if (el && el.offsetWidth > 0) setActivePill({ left: el.offsetLeft, width: el.offsetWidth });
    else setActivePill(null);
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
  const reveal = `transition-all duration-500 ease-out ${
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
          <nav className="flex flex-col gap-1">
            {links.map((l) => {
              const active = isActive(l);
              const Icon = l.icon;
              return (
                <div key={l.to} className={reveal} style={delay()}>
                  <Link
                    to={l.to}
                    onClick={() => setMenuOpen(false)}
                    className={`oc-focus flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors ${
                      active ? "oc-row-active" : "text-[color:var(--oc-ink)] hover:bg-white/70"
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
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
                    <ChevronRight className={`w-4 h-4 ${active ? "text-white/70" : "opacity-40"}`} />
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

  /* ---- scroll-driven glass (all values interpolate with --p) ---- */
  const barStyle = {
    height: `calc(var(--h0) - (var(--h0) - var(--h1)) * ${P})`,
    background: `rgba(255,255,255,calc(0.2 + 0.28 * ${P}))`,
    backdropFilter: `blur(calc(10px + 16px * ${P})) saturate(calc(1.5 + 0.4 * ${P}))`,
    WebkitBackdropFilter: `blur(calc(10px + 16px * ${P})) saturate(calc(1.5 + 0.4 * ${P}))`,
    borderColor: `rgba(255,255,255,calc(0.5 + 0.3 * ${P}))`,
    boxShadow: [
      "inset 0 1px 0 rgba(255,255,255,0.95)",
      "inset 0 -1px 0 rgba(255,255,255,0.35)",
      `inset 0 0 22px rgba(255,255,255,calc(0.22 + 0.13 * ${P}))`,
      `0 22px 44px -22px rgba(30,32,70,calc(0.42 * ${P}))`,
      `0 4px 12px -6px rgba(30,32,70,calc(0.16 * ${P}))`,
    ].join(","),
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
        .oc-panel {
          background: rgba(247,248,255,0.72);
          backdrop-filter: blur(28px) saturate(1.8);
          -webkit-backdrop-filter: blur(28px) saturate(1.8);
          border: 1px solid rgba(255,255,255,0.85);
          box-shadow: inset 0 1px 0 #fff, 0 28px 56px -22px rgba(30,32,70,0.5);
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-menu-btn::after { transition: none; }
        }
      `}</style>

      <div className="oc-nav-scope">
        <header
          ref={headerRef}
          className="sticky top-0 z-50 px-3 sm:px-5"
          style={{ paddingTop: `calc(12px - 5px * ${P})` }}
        >
          {/* width wrapper: narrows slightly on scroll; popover anchors to it */}
          <div
            className="relative mx-auto
              [--h0:56px] [--h1:50px] [--l0:38px] [--l1:34px] [--f0:18px] [--f1:17px]
              sm:[--h0:60px] sm:[--h1:52px] sm:[--l0:40px] sm:[--l1:36px] sm:[--f0:20px] sm:[--f1:19px]
              lg:[--h0:68px] lg:[--h1:58px] lg:[--l0:46px] lg:[--l1:40px] lg:[--f0:23px] lg:[--f1:21px]"
            style={{ width: `min(100%, calc(80rem - 9rem * ${P}))` }}
          >
            {/* the glass pill */}
            <div className="relative rounded-full border" style={barStyle}>
              {/* decorative liquid highlights */}
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full overflow-hidden">
                <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent opacity-70" />
                <span className="absolute -left-10 -top-10 w-56 h-40 rounded-full bg-white/60 blur-2xl opacity-60" />
                <span className="absolute right-10 -bottom-12 w-64 h-24 rounded-full bg-[#B9C8FF]/40 blur-2xl" />
              </span>

              <div className="relative h-full flex items-center justify-between gap-4 px-2.5 sm:px-3 lg:px-3.5">
                <BrandMark onClick={() => setMenuOpen(false)} />

                {/* Desktop inline links (the menu still holds everything) */}
                <nav
                  ref={navRef}
                  onMouseLeave={() => setHoverPill(null)}
                  className="relative hidden lg:flex items-center gap-1 rounded-full p-1 bg-white/25 border border-white/60 shadow-[inset_0_1px_2px_rgba(22,24,39,0.06)]"
                >
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 rounded-full bg-white/75 shadow-[inset_0_1px_0_#fff,0_6px_14px_-8px_rgba(22,24,39,0.35)] transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none"
                    style={{
                      left: hoverPill?.left ?? 0,
                      width: hoverPill?.width ?? 0,
                      opacity: hoverPill ? 1 : 0,
                    }}
                  />
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 rounded-full bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_18px_-8px_rgba(79,70,229,0.85)] transition-[left,width,opacity] duration-500 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none"
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
                          onMouseEnter={hoverIn}
                          onFocus={hoverIn}
                          className={`oc-focus relative z-10 px-[17px] py-2 rounded-full text-[14.5px] font-medium transition-colors duration-200 ${
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

                  {/* Logged-in profile button: name chip on desktop, avatar on mobile */}
                  {!authLoading && user && (
                    <>
                      <Link
                        to="/profile"
                        aria-label="Your profile"
                        className={`oc-focus hidden md:flex items-center gap-2 h-10 pl-1 pr-3.5 rounded-full border transition-colors ${
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
                        className="oc-focus md:hidden w-10 h-10 flex items-center justify-center rounded-full bg-white/40 border border-white/70 shadow-[inset_0_1px_0_#fff]"
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
                    className={`oc-focus flex items-center gap-2.5 h-10 px-3.5 sm:px-4 rounded-full text-[13.5px] font-medium transition-all duration-300 ${
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
              className={`oc-panel hidden md:block absolute right-0 top-full mt-3 w-[400px] max-h-[calc(100vh-110px)] overflow-y-auto rounded-[30px] p-3 origin-top-right transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                menuOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
              }`}
              aria-hidden={!menuOpen}
            >
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[30px] bg-gradient-to-b from-white/60 to-transparent" />
              <div className="relative">{renderMenu()}</div>
            </div>
          </div>
        </header>

        {/* Mobile drawer */}
        <div className={`fixed inset-0 z-[70] md:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
          <div
            onClick={() => setMenuOpen(false)}
            className={`absolute inset-0 bg-[#161827]/35 backdrop-blur-sm transition-opacity duration-300 ${
              menuOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <aside
            className={`oc-panel absolute right-2 top-2 bottom-2 w-[88%] max-w-sm rounded-[28px] flex flex-col overflow-hidden transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
              menuOpen ? "translate-x-0" : "translate-x-[110%]"
            }`}
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/60 to-transparent" />

            <div className="relative flex items-center justify-between px-5 py-4 border-b border-white/70 shrink-0">
              <BrandMark compact onClick={() => setMenuOpen(false)} />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="oc-focus w-10 h-10 flex items-center justify-center rounded-full bg-white/60 border border-white/80 text-[color:var(--oc-ink)] hover:bg-white/90"
              >
                <MenuIcon open />
              </button>
            </div>

            <div className="relative flex-1 overflow-y-auto px-4 py-5">{renderMenu()}</div>
          </aside>
        </div>
      </div>
    </>
  );
};

export default Navbar;
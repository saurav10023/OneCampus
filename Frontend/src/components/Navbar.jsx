// OneCampus navigation (v5: flat theme, responsive, dark mode toggle).
//
//  - Below 1024px: a slim floating top bar (with theme toggle) + a slide-in drawer.
//  - 1024px and up: a fixed left sidebar. It can collapse to an icon rail (remembered between visits).
//    Defaults to the rail on 1024–1279px screens and fully open from 1280px.
//  - The sidebar pushes the page right by adding `padding-left` to <body>, so no page edits are needed.
//    On small screens an in-flow spacer keeps content from sliding under the fixed top bar.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  Moon,
  PanelLeftClose,
  Sun,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ThemeToggle, { useTheme } from "./ThemeToggle";

/* ---------- config: edit routes here ---------- */

// auth: true  -> shown only when logged in
// group: "cr" -> listed under "Class representative" in the sidebar
const NAV = [
  { to: "/", label: "Home", hint: "Back to the start", icon: Home, end: true },
  { to: "/dashboard", label: "Today", hint: "Mark today's classes", icon: LayoutDashboard, auth: true },
  { to: "/attendance", label: "Attendance", hint: "Percentages and bunk calculator", icon: BarChart3, auth: true },
  { to: "/calendar", label: "Calendar", hint: "Holidays, exams and events", icon: CalendarRange, auth: true },
  { to: "/timetable", label: "Timetable", hint: "Weekly classes", icon: CalendarDays, auth: true },
  { to: "/setups", label: "Setups", hint: "Subjects, calendar, official sync", icon: Layers, auth: true },
  { to: "/cr-studio", label: "CR Studio", hint: "Publish your class timetable", icon: Megaphone, auth: true, group: "cr" },
];

const SIDE_OPEN = 264; // px
const SIDE_RAIL = 76; // px
const SIDE_KEY = "oc-side-collapsed";
const SCROLL_ON = 24; // px scrolled before the top bar compacts
const SCROLL_OFF = 6; // px to scroll back above before it expands again

const cx = (...a) => a.filter(Boolean).join(" ");
// One easing + duration for every collapse motion (width, page offset, icon turn) so they move as one.
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";
const DUR = "duration-[340ms]";
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1";

/* ---------- small pieces ---------- */

/* Text that fades (and is hidden from screen readers) while the sidebar is a rail.
   Fades out fast, then fades back in slightly late so it never overlaps the width change. */
const Fade = ({ hide, className, children }) => (
  <span
    aria-hidden={hide || undefined}
    className={cx("whitespace-nowrap transition-opacity motion-reduce:transition-none", hide ? "opacity-0 duration-100" : "opacity-100 duration-200 delay-100", className)}
  >
    {children}
  </span>
);

const Brand = ({ onClick, rail = false }) => (
  <Link to="/" onClick={onClick} aria-label="OneCampus home" title={rail ? "OneCampus" : undefined} className={cx("flex items-center gap-2.5 shrink-0 rounded-xl", FOCUS)}>
    <span className="w-9 h-9 rounded-xl bg-[color:var(--accent)] text-white flex items-center justify-center shrink-0">
      <GraduationCap className="w-[18px] h-[18px]" strokeWidth={2.2} aria-hidden="true" />
    </span>
    <Fade hide={rail} className="text-[17px] font-semibold tracking-tight leading-none text-[color:var(--ink)]">OneCampus</Fade>
  </Link>
);

/* Defined at module level so React keeps the same element between states and the CSS transitions can run.
   The icon never moves: it sits at a fixed left offset, and the label simply fades and is clipped. */
const SideItem = ({ l, active, collapsed }) => {
  const Icon = l.icon;
  return (
    <Link
      to={l.to}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? l.label : undefined}
      title={collapsed ? l.label : l.hint}
      className={cx(
        "relative flex items-center gap-3 h-11 px-4 rounded-xl overflow-hidden text-[14px] font-medium transition-colors active:scale-[0.98]",
        active ? "bg-[color:var(--brand-bg)] text-[color:var(--brand-fg)]" : "text-[color:var(--body)] hover:bg-[color:var(--inset)] hover:text-[color:var(--ink)]",
        FOCUS
      )}
    >
      <span aria-hidden="true" className={cx("absolute left-0 inset-y-2.5 w-[3px] rounded-r-full bg-[color:var(--accent)] transition-opacity duration-200", active ? "opacity-100" : "opacity-0")} />
      <Icon className="w-[19px] h-[19px] shrink-0" aria-hidden="true" />
      <Fade hide={collapsed} className="truncate">{l.label}</Fade>
    </Link>
  );
};

const Avatar = ({ name, size = "w-9 h-9", text = "text-[13px]" }) => (
  <span className={cx(size, text, "rounded-full bg-[color:var(--brand-bg)] text-[color:var(--brand-fg)] font-semibold flex items-center justify-center uppercase shrink-0")}>
    {name?.charAt(0) || "U"}
  </span>
);

// Animated hamburger -> X
const MenuIcon = ({ open }) => (
  <span className="relative block w-[18px] h-[14px]" aria-hidden="true">
    <span className={cx("absolute left-0 h-[2px] w-full rounded bg-current transition-all duration-300 ease-out", open ? "top-[6px] rotate-45" : "top-0")} />
    <span className={cx("absolute left-0 top-[6px] h-[2px] w-full rounded bg-current transition-all duration-200", open ? "opacity-0 scale-x-0" : "opacity-100")} />
    <span className={cx("absolute left-0 h-[2px] w-full rounded bg-current transition-all duration-300 ease-out", open ? "top-[6px] -rotate-45" : "top-[12px]")} />
  </span>
);

/* ---------- navbar ---------- */

const Navbar = () => {
  const { user, logout, loading: authLoading } = useAuth();
  const location = useLocation();
  const { dark, toggle: toggleTheme } = useTheme();

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem(SIDE_KEY);
      if (v !== null) return v === "1";
    } catch { /* storage unavailable */ }
    return typeof window !== "undefined" && window.innerWidth < 1280;
  });
  const closeRef = useRef(null);

  const links = NAV.filter((l) => !l.auth || user);
  const mainLinks = links.filter((l) => l.group !== "cr");
  const crLinks = links.filter((l) => l.group === "cr");
  const displayName = user?.displayName || user?.fullName || user?.username || user?.email || "Student";
  const isStaff = user?.role === "admin" || user?.role === "moderator";
  const isActive = (l) => (l.end ? location.pathname === "/" : location.pathname.startsWith(l.to));
  const onProfile = location.pathname === "/profile";

  /* ---- sidebar pushes the page: width as a CSS variable + a body class (applied from 1024px up).
         Layout effects so the very first paint is already correct (no slide on page load). ---- */
  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--oc-side-w", `${collapsed ? SIDE_RAIL : SIDE_OPEN}px`);
    document.body.classList.add("oc-has-side");
    return () => document.body.classList.remove("oc-has-side");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--oc-side-w", `${collapsed ? SIDE_RAIL : SIDE_OPEN}px`);
  }, [collapsed]);

  const toggleCollapsed = () =>
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(SIDE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });

  /* ---- top bar compacts once (with hysteresis) ---- */
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
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* ---- drawer behaviour (small screens) ---- */
  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    const onResize = () => { if (window.innerWidth >= 1024) setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
  };

  /* ---------- sidebar (desktop) ----------
     Same DOM in both states. Only the width changes; icons stay put and labels fade, so nothing jumps. */
  const sidebar = (
    <aside
      aria-label="Sidebar"
      data-collapsed={collapsed}
      className={cx("hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col overflow-hidden bg-[color:var(--surface)] border-r border-[color:var(--line)] transition-[width] motion-reduce:transition-none", DUR, EASE)}
      style={{ width: collapsed ? SIDE_RAIL : SIDE_OPEN }}
    >
      <div className="h-16 shrink-0 flex items-center px-5">
        <Brand rail={collapsed} />
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-2">
        {authLoading ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => <span key={i} className="block h-11 rounded-xl bg-[color:var(--inset)] animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="space-y-1">{mainLinks.map((l) => <SideItem key={l.to} l={l} active={isActive(l)} collapsed={collapsed} />)}</div>
            {crLinks.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[color:var(--line-soft)]">
                {/* label folds away smoothly instead of popping out */}
                <div className={cx("grid transition-[grid-template-rows,opacity] motion-reduce:transition-none", DUR, EASE, collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100")} aria-hidden={collapsed || undefined}>
                  <p className="overflow-hidden px-4 text-[12px] font-medium text-[color:var(--muted)] whitespace-nowrap"><span className="block pb-1.5">Class representative</span></p>
                </div>
                <div className="space-y-1">{crLinks.map((l) => <SideItem key={l.to} l={l} active={isActive(l)} collapsed={collapsed} />)}</div>
              </div>
            )}
          </>
        )}
      </nav>

      <div className="shrink-0 border-t border-[color:var(--line-soft)] p-3 space-y-2">
        {/* Theme toggle: icon stays fixed, label fades like the other rows */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          title={collapsed ? (dark ? "Light mode" : "Dark mode") : undefined}
          className={cx("flex items-center gap-3 h-10 w-full px-4 rounded-xl overflow-hidden text-[13.5px] font-medium text-[color:var(--muted)] hover:bg-[color:var(--inset)] hover:text-[color:var(--ink)] transition-colors active:scale-[0.98]", FOCUS)}
        >
          {dark ? <Sun className="w-[19px] h-[19px] shrink-0" aria-hidden="true" /> : <Moon className="w-[19px] h-[19px] shrink-0" aria-hidden="true" />}
          <Fade hide={collapsed}>{dark ? "Light mode" : "Dark mode"}</Fade>
        </button>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cx("flex items-center gap-3 h-10 w-full px-4 rounded-xl overflow-hidden text-[13.5px] font-medium text-[color:var(--muted)] hover:bg-[color:var(--inset)] hover:text-[color:var(--ink)] transition-colors active:scale-[0.98]", FOCUS)}
        >
          <PanelLeftClose className={cx("w-[19px] h-[19px] shrink-0 transition-transform motion-reduce:transition-none", DUR, EASE, collapsed && "rotate-180")} aria-hidden="true" />
          <Fade hide={collapsed}>Collapse</Fade>
        </button>

        {authLoading ? null : user ? (
          <div className={cx("rounded-xl p-1.5 transition-colors", DUR, collapsed ? "bg-transparent" : "bg-[color:var(--inset)]")}>
            <Link
              to="/profile"
              aria-label="Your profile"
              title={collapsed ? displayName : undefined}
              className={cx("flex items-center gap-2.5 h-10 rounded-lg overflow-hidden transition-colors", onProfile ? "bg-[color:var(--surface)] shadow-sm" : "hover:bg-[color:var(--surface)]", FOCUS)}
            >
              <Avatar name={displayName} size="w-10 h-10" text="text-[14px]" />
              <Fade hide={collapsed} className="min-w-0 pr-2">
                <span className="block text-[13.5px] font-semibold text-[color:var(--ink)] truncate max-w-[140px]">{displayName}</span>
                <span className="block text-[12px] text-[color:var(--muted)] capitalize">{isStaff ? user.role : "Student"}</span>
              </Fade>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              title={collapsed ? "Log out" : undefined}
              className={cx("mt-1 w-full flex items-center gap-2.5 h-9 px-3 rounded-lg overflow-hidden text-[13px] font-medium text-[color:var(--muted)] hover:bg-[color:var(--bad-bg)] hover:text-[color:var(--bad-icon)] transition-colors", FOCUS)}
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              <Fade hide={collapsed}>Log out</Fade>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Link
              to="/register"
              aria-label="Create account"
              title={collapsed ? "Create account" : undefined}
              className={cx("flex items-center gap-2.5 h-10 px-[18px] rounded-xl overflow-hidden bg-[color:var(--accent)] text-white text-[13.5px] font-medium hover:bg-[color:var(--accent-hover)] transition-colors active:scale-[0.98]", FOCUS)}
            >
              <UserPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
              <Fade hide={collapsed}>Create account</Fade>
            </Link>
            <Link
              to="/login"
              aria-label="Log in"
              title={collapsed ? "Log in" : undefined}
              className={cx("flex items-center gap-2.5 h-10 px-[18px] rounded-xl overflow-hidden border border-[color:var(--line)] text-[13.5px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--inset)] transition-colors active:scale-[0.98]", FOCUS)}
            >
              <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
              <Fade hide={collapsed}>Log in</Fade>
            </Link>
          </div>
        )}
      </div>
    </aside>
  );

  /* ---------- drawer body (small screens) ---------- */
  const renderMenu = () => (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-col gap-1" aria-label="Site pages">
        {links.map((l) => {
          const active = isActive(l);
          const Icon = l.icon;
          return (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMenuOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cx("flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors", active ? "bg-[color:var(--brand-bg)]" : "hover:bg-[color:var(--inset)] active:bg-[color:var(--line-soft)]", FOCUS)}
            >
              <span className={cx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", active ? "bg-[color:var(--surface)] text-[color:var(--accent-soft)] shadow-sm" : "bg-[color:var(--inset)] text-[color:var(--body)]")}>
                <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <span className={cx("block text-[15px] font-medium leading-tight", active ? "text-[color:var(--brand-fg)]" : "text-[color:var(--ink)]")}>{l.label}</span>
                <span className="block text-[12px] leading-tight mt-0.5 text-[color:var(--muted)] truncate">{l.hint}</span>
              </span>
              <ChevronRight className={cx("w-4 h-4 shrink-0", active ? "text-[color:var(--brand-dot)]" : "text-[color:var(--faint)]")} aria-hidden="true" />
            </Link>
          );
        })}
      </nav>

      <div className="pt-3 border-t border-[color:var(--line-soft)]">
        {authLoading ? null : user ? (
          <div className="rounded-2xl bg-[color:var(--inset)] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Avatar name={displayName} size="w-10 h-10" text="text-[14px]" />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[color:var(--ink)] truncate">{displayName}</p>
                <p className="text-[12px] text-[color:var(--muted)] capitalize">{isStaff ? user.role : "Student"}</p>
              </div>
            </div>
            <div className="p-1.5 border-t border-[color:var(--line)]">
              <Link to="/profile" onClick={() => setMenuOpen(false)} className={cx("flex items-center gap-2.5 px-3 h-11 rounded-xl text-[14px] text-[color:var(--ink)] hover:bg-[color:var(--surface)] transition-colors", FOCUS)}>
                <User className="w-4 h-4" aria-hidden="true" />Your account
              </Link>
              <button type="button" onClick={toggleTheme} className={cx("w-full flex items-center gap-2.5 text-left px-3 h-11 rounded-xl text-[14px] text-[color:var(--ink)] hover:bg-[color:var(--surface)] transition-colors", FOCUS)}>
                {dark ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
                {dark ? "Light mode" : "Dark mode"}
              </button>
              <button type="button" onClick={handleLogout} className={cx("w-full flex items-center gap-2.5 text-left px-3 h-11 rounded-xl text-[14px] text-[color:var(--bad-icon)] hover:bg-[color:var(--surface)] transition-colors", FOCUS)}>
                <LogOut className="w-4 h-4" aria-hidden="true" />Log out
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Link to="/register" onClick={() => setMenuOpen(false)} className={cx("flex items-center justify-center gap-2 h-12 rounded-xl bg-[color:var(--accent)] text-white text-[14px] font-medium hover:bg-[color:var(--accent-hover)] transition-colors", FOCUS)}>
              <UserPlus className="w-4 h-4" aria-hidden="true" />Create account
            </Link>
            <Link to="/login" onClick={() => setMenuOpen(false)} className={cx("flex items-center justify-center gap-2 h-12 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] text-[14px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--inset)] transition-colors", FOCUS)}>
              <LogIn className="w-4 h-4" aria-hidden="true" />Log in
            </Link>
            <button type="button" onClick={toggleTheme} className={cx("flex items-center justify-center gap-2 h-12 rounded-xl text-[14px] font-medium text-[color:var(--body)] hover:bg-[color:var(--inset)] transition-colors", FOCUS)}>
              {dark ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @media (min-width: 1024px) {
          body.oc-has-side { padding-left: var(--oc-side-w, ${SIDE_OPEN}px); transition: padding-left 340ms cubic-bezier(0.32, 0.72, 0, 1); }
        }
        @media (prefers-reduced-motion: reduce) { body.oc-has-side { transition: none; } }
      `}</style>

      {/* Desktop: left sidebar */}
      {sidebar}

      {/* Small screens: floating top bar. The strip ignores clicks; only the bar takes them. */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-50 px-3 sm:px-5 pointer-events-none" style={{ paddingTop: "calc(8px + env(safe-area-inset-top, 0px))" }}>
        <div
          className={cx(
            "pointer-events-auto mx-auto max-w-5xl flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] px-2.5 sm:px-3 backdrop-blur-md transition-all duration-300 motion-reduce:transition-none",
            scrolled ? "h-[52px] bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] sh-float" : "h-14 bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] sh-card"
          )}
        >
          <Brand onClick={() => setMenuOpen(false)} />

          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            {!authLoading && !user && (
              <>
                <Link to="/login" className={cx("hidden md:flex items-center h-10 px-4 rounded-xl text-[13.5px] font-medium text-[color:var(--body)] hover:bg-[color:var(--inset)] hover:text-[color:var(--ink)] transition-colors", FOCUS)}>Log in</Link>
                <Link to="/register" className={cx("hidden md:flex items-center h-10 px-4 rounded-xl bg-[color:var(--accent)] text-white text-[13.5px] font-medium hover:bg-[color:var(--accent-hover)] transition-colors", FOCUS)}>Get started</Link>
              </>
            )}
            {!authLoading && user && (
              <Link to="/profile" aria-label="Your profile" className={cx("w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-transform", onProfile && "ring-2 ring-[color:var(--brand-ring)]", FOCUS)}>
                <Avatar name={displayName} size="w-9 h-9" text="text-[13px]" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              className={cx("flex items-center justify-center gap-2.5 h-10 min-w-10 px-3 sm:px-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink)] text-[13.5px] font-medium hover:bg-[color:var(--inset)] active:scale-95 transition", FOCUS)}
            >
              <MenuIcon open={menuOpen} />
              <span className="hidden sm:block">Menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* In-flow spacer so content doesn't slide under the fixed top bar (small screens only) */}
      <div aria-hidden="true" className="lg:hidden h-[calc(70px+env(safe-area-inset-top,0px))]" />

      {/* Drawer (small screens) */}
      <div
        id="site-menu"
        className={cx("fixed inset-0 z-[70] lg:hidden", menuOpen ? "pointer-events-auto" : "pointer-events-none")}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!menuOpen}
      >
        <div onClick={() => setMenuOpen(false)} className={cx("absolute inset-0 bg-[color:var(--overlay)] backdrop-blur-sm transition-opacity duration-[420ms]", menuOpen ? "opacity-100" : "opacity-0")} />
        <aside
          className={cx(
            "absolute right-2 w-[88%] max-w-sm rounded-3xl border border-[color:var(--line)] bg-[color:var(--surface)] sh-pop flex flex-col overflow-hidden transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            menuOpen ? "translate-x-0" : "translate-x-[110%]"
          )}
          style={{ top: "calc(8px + env(safe-area-inset-top, 0px))", bottom: "calc(8px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[color:var(--line-soft)] shrink-0">
            <Brand onClick={() => setMenuOpen(false)} />
            <button
              ref={closeRef}
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className={cx("w-10 h-10 flex items-center justify-center rounded-xl bg-[color:var(--inset)] text-[color:var(--ink)] hover:bg-[color:var(--line-soft)] active:scale-95 transition", FOCUS)}
            >
              <X className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">{renderMenu()}</div>
        </aside>
      </div>
    </>
  );
};

export default Navbar;
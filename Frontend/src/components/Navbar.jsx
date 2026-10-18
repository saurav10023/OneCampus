// src/components/Navbar.jsx
// Liquid-glass navbar with a single Menu button.
//
// - The Staff-login button is gone. Everything (all categories, contact,
//   login / account / dashboard / logout, search on mobile) lives in the Menu.
// - Scroll transition is continuous: one eased progress value (--p, 0 → 1)
//   drives height, logo size, width, blur, tint, border and shadow together,
//   so the bar morphs smoothly instead of snapping at a threshold.
// - Desktop: menu opens as a floating glass panel under the bar.
//   Mobile: menu opens as a floating glass drawer.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, LayoutDashboard, LogIn, LogOut, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCategories } from "../hooks/useCategories";
import logo from "../assets/logo.PNG";

// Set to false if you want ONLY the Menu button (no inline links on laptops).
const SHOW_INLINE_NAV = true;
const MAX_INLINE_CATEGORIES = 4;
const SCROLL_RANGE = 90; // px of scrolling over which the bar morphs
const P = "var(--p,0)"; // scroll progress 0 (top) → 1 (scrolled)

/* ---------- glass recipes ---------- */

const glassPanel =
  "bg-[#FBF7EE]/75 backdrop-blur-2xl backdrop-saturate-[1.8] border border-white/80 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,1),0_28px_56px_-22px_rgba(42,37,31,0.5)]";

const darkGlassBtn =
  "bg-gradient-to-b from-[#3A332B] to-ink text-paper border border-transparent " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_12px_24px_-12px_rgba(42,37,31,0.75)]";

const navLink =
  "relative z-10 px-4 lg:px-[17px] py-2 rounded-full text-[14px] lg:text-[14.5px] font-medium transition-colors duration-200 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-moss/50";
const navIdle = "text-ink/75 hover:text-ink";
const navActive = "text-paper";

/* ---------- small pieces ---------- */

const BrandMark = ({ onClick, compact = false }) => (
  <Link
    to="/"
    onClick={onClick}
    className="flex items-center gap-2.5 lg:gap-3 shrink-0 group min-w-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-moss/50"
  >
    <span
      className={`relative rounded-full bg-white ring-1 ring-black/10 shadow-[0_8px_20px_-8px_rgba(42,37,31,0.5),inset_0_1px_0_rgba(255,255,255,1)] flex items-center justify-center shrink-0 aspect-square transition-transform duration-500 ease-out group-hover:scale-105 group-hover:-rotate-3 ${
        compact ? "w-10" : ""
      }`}
      style={compact ? undefined : { width: `calc(var(--l0) - (var(--l0) - var(--l1)) * ${P})` }}
    >
      <img src={logo} alt="Galaxy Furniture" className="w-full h-full object-contain rounded-full" />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/50 via-transparent to-transparent" />
    </span>
    <span
      className="font-serif font-semibold text-ink tracking-[0.04em] sm:tracking-[0.02em] leading-none whitespace-nowrap"
      style={{
        fontSize: compact ? "19px" : `calc(var(--f0) - (var(--f0) - var(--f1)) * ${P})`,
      }}
    >
      GALAXY <span className="text-clay italic font-medium">Furniture</span>
    </span>
  </Link>
);

const Avatar = ({ name, size = "w-9 h-9", text = "text-[13px]" }) => (
  <span
    className={`${size} ${text} rounded-full bg-gradient-to-br from-[#5E5F3D] to-moss text-paper font-semibold flex items-center justify-center uppercase shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]`}
  >
    {name?.charAt(0) || "U"}
  </span>
);

// Animated hamburger → X
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
  const navigate = useNavigate();
  const location = useLocation();
  const { categories, loading: catLoading, error: catError } = useCategories();

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // sliding pills inside the desktop inline nav
  const [activePill, setActivePill] = useState(null);
  const [hoverPill, setHoverPill] = useState(null);

  const headerRef = useRef(null);
  const navRef = useRef(null);
  const menuBtnRef = useRef(null);
  const popoverRef = useRef(null);
  const mobileSearchRef = useRef(null);

  const isStaff = user?.role === "admin";
  const activeCategory = new URLSearchParams(location.search).get("category");
  const onContact = location.pathname === "/contact";

  const inline = categories.slice(0, MAX_INLINE_CATEGORIES);
  const catsReady = !catLoading && !catError;

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

    const tick = () => {
      current += (target - current) * 0.16; // glide toward target
      if (Math.abs(target - current) < 0.002) current = target;
      apply();
      raf = current === target ? 0 : requestAnimationFrame(tick);
    };

    const onScroll = () => {
      target = Math.min(1, Math.max(0, window.scrollY / SCROLL_RANGE));
      if (reduce) {
        current = target;
        apply();
      } else if (!raf) {
        raf = requestAnimationFrame(tick);
      }
    };

    target = Math.min(1, Math.max(0, window.scrollY / SCROLL_RANGE));
    current = target;
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* ---- measure the active inline link so the moss pill can glide to it ---- */
  const measureActive = useCallback(() => {
    const el = navRef.current?.querySelector('[data-active="true"]');
    if (el && el.offsetWidth > 0) setActivePill({ left: el.offsetLeft, width: el.offsetWidth });
    else setActivePill(null);
  }, []);

  useLayoutEffect(() => {
    measureActive();
  }, [measureActive, categories, catLoading, catError, activeCategory, onContact]);

  useEffect(() => {
    window.addEventListener("resize", measureActive);
    return () => window.removeEventListener("resize", measureActive);
  }, [measureActive]);

  const hoverIn = (e) =>
    setHoverPill({ left: e.currentTarget.offsetLeft, width: e.currentTarget.offsetWidth });

  /* ---- menu behaviour ---- */
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

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

  const submitSearch = (e) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (!q) return;
    navigate(`/shop?search=${encodeURIComponent(q)}`);
    setSearchOpen(false);
    setMenuOpen(false);
    setSearchValue("");
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/");
  };

  const openMenuForSearch = () => {
    setMenuOpen(true);
    setTimeout(() => mobileSearchRef.current?.focus(), 350);
  };

  /* ---- menu body, shared by desktop popover and mobile drawer ---- */
  const reveal = `transition-all duration-500 ease-out ${
    menuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
  }`;

  const renderMenu = (showSearch, inputRef) => {
    let n = 0;
    const delay = () => ({ transitionDelay: menuOpen ? `${70 + n++ * 30}ms` : "0ms" });

    const rowBase = "flex items-center justify-between px-4 py-3 rounded-2xl text-[15px] font-medium transition-colors";
    const rowActive = "bg-gradient-to-b from-[#6A6B47] to-moss text-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]";
    const rowIdle = "text-ink hover:bg-white/65";

    return (
      <div className="flex flex-col gap-4">
        {showSearch && (
          <div className={reveal} style={delay()}>
            <form onSubmit={submitSearch}>
              <div className="flex items-center gap-2.5 bg-white/60 border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,1)] rounded-full px-4 py-3">
                <Search className="w-[18px] h-[18px] text-stone shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search sofas, beds, decor…"
                  className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-stone/70 focus:outline-none"
                />
              </div>
            </form>
          </div>
        )}

        <div>
          <p className={`${reveal} text-[11px] font-medium uppercase tracking-[0.18em] text-stone mb-2 px-2`} style={delay()}>
            Shop by category
          </p>
          <nav className="grid grid-cols-1 md:grid-cols-2 gap-1">
            <div className={reveal} style={delay()}>
              <Link
                to="/shop"
                onClick={() => setMenuOpen(false)}
                className={`${rowBase} ${location.pathname === "/shop" && !activeCategory ? rowActive : rowIdle}`}
              >
                All furniture
                <ChevronRight className="w-4 h-4 opacity-40" />
              </Link>
            </div>

            {catLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className="h-11 rounded-2xl bg-white/40 animate-pulse" />
              ))}

            {!catLoading && catError && (
              <span className="px-3 py-2.5 text-[14px] text-[#B5472F] italic">Couldn't load categories</span>
            )}

            {catsReady &&
              categories.map((cat) => {
                const active = activeCategory === cat.slug;
                return (
                  <div key={cat._id || cat.slug} className={reveal} style={delay()}>
                    <Link
                      to={`/shop?category=${cat.slug}`}
                      onClick={() => setMenuOpen(false)}
                      className={`${rowBase} ${active ? rowActive : rowIdle}`}
                    >
                      {cat.name}
                      <ChevronRight className={`w-4 h-4 ${active ? "text-paper/70" : "opacity-40"}`} />
                    </Link>
                  </div>
                );
              })}
          </nav>
        </div>

        <div className={reveal} style={delay()}>
          <Link
            to="/contact"
            onClick={() => setMenuOpen(false)}
            className={`${rowBase} ${onContact ? rowActive : rowIdle}`}
          >
            Contact the showroom
            <ChevronRight className={`w-4 h-4 ${onContact ? "text-paper/70" : "opacity-40"}`} />
          </Link>
        </div>

        {/* account / login */}
        <div className={`${reveal} pt-3 border-t border-ink/10`} style={delay()}>
          {!authLoading && user ? (
            <div className="rounded-3xl bg-white/50 border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,1)] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar name={user.username} size="w-10 h-10" text="text-[14px]" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink truncate">{user.username}</p>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-stone">
                    {isStaff ? "Staff account" : "Account"}
                  </p>
                </div>
              </div>
              <div className="h-px bg-gradient-to-r from-transparent via-ink/15 to-transparent" />
              <div className="p-1.5">
                {isStaff && (
                  <Link
                    to="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] text-ink hover:bg-white/70 transition-colors"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Admin dashboard
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-[14px] text-[#B5472F] hover:bg-white/70 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            </div>
          ) : (
            !authLoading && (
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-white/50 border border-white/80 text-[14px] font-medium text-ink hover:bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,1)] transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Staff login
              </Link>
            )
          )}
        </div>
      </div>
    );
  };

  /* ---- scroll-driven glass (all values interpolate with --p) ---- */
  const barStyle = {
    height: `calc(var(--h0) - (var(--h0) - var(--h1)) * ${P})`,
    background: `rgba(255,255,255,calc(0.14 + 0.24 * ${P}))`,
    backdropFilter: `blur(calc(8px + 16px * ${P})) saturate(calc(1.4 + 0.4 * ${P}))`,
    WebkitBackdropFilter: `blur(calc(8px + 16px * ${P})) saturate(calc(1.4 + 0.4 * ${P}))`,
    borderColor: `rgba(255,255,255,calc(0.4 + 0.3 * ${P}))`,
    boxShadow: [
      "inset 0 1px 0 rgba(255,255,255,0.95)",
      "inset 0 -1px 0 rgba(255,255,255,0.35)",
      `inset 0 0 22px rgba(255,255,255,calc(0.22 + 0.13 * ${P}))`,
      `0 22px 44px -22px rgba(42,37,31,calc(0.4 * ${P}))`,
      `0 4px 12px -6px rgba(42,37,31,calc(0.15 * ${P}))`,
    ].join(","),
  };

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-50 px-3 sm:px-5"
        style={{ paddingTop: `calc(12px - 5px * ${P})` }}
      >
        {/* width wrapper: narrows slightly on scroll; popover anchors to it */}
        <div
          className="relative mx-auto
            [--h0:56px] [--h1:50px] [--l0:40px] [--l1:36px] [--f0:17px] [--f1:16px]
            sm:[--h0:60px] sm:[--h1:52px] sm:[--l0:44px] sm:[--l1:38px] sm:[--f0:21px] sm:[--f1:19px]
            lg:[--h0:72px] lg:[--h1:60px] lg:[--l0:54px] lg:[--l1:44px] lg:[--f0:25px] lg:[--f1:22px]"
          style={{ width: `min(100%, calc(80rem - 9rem * ${P}))` }}
        >
          {/* the glass pill */}
          <div className="relative rounded-full border" style={barStyle}>
            {/* decorative liquid highlights */}
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full overflow-hidden">
              <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/55 to-transparent opacity-70" />
              <span className="absolute -left-10 -top-10 w-56 h-40 rounded-full bg-white/50 blur-2xl opacity-60" />
              <span className="absolute right-10 -bottom-12 w-64 h-24 rounded-full bg-[#E8D9B8]/40 blur-2xl" />
            </span>

            <div className="relative h-full flex items-center justify-between gap-4 px-2.5 sm:px-3 lg:px-3.5">
              <BrandMark onClick={() => setMenuOpen(false)} />

              {/* Desktop inline links (menu still holds everything) */}
              {SHOW_INLINE_NAV && (
                <nav
                  ref={navRef}
                  onMouseLeave={() => setHoverPill(null)}
                  className="relative hidden lg:flex items-center gap-1 rounded-full p-1 bg-white/20 border border-white/50 shadow-[inset_0_1px_2px_rgba(42,37,31,0.06)]"
                >
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 rounded-full bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_6px_14px_-8px_rgba(42,37,31,0.35)] transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none"
                    style={{
                      left: hoverPill?.left ?? 0,
                      width: hoverPill?.width ?? 0,
                      opacity: hoverPill ? 1 : 0,
                    }}
                  />
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 rounded-full bg-gradient-to-b from-[#6A6B47] to-moss shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_18px_-8px_rgba(57,58,34,0.85)] transition-[left,width,opacity] duration-500 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none"
                    style={{
                      left: activePill?.left ?? 0,
                      width: activePill?.width ?? 0,
                      opacity: activePill ? 1 : 0,
                    }}
                  />

                  {catLoading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <span key={i} className="h-8 w-20 rounded-full bg-white/40 animate-pulse" />
                    ))}

                  {catsReady &&
                    inline.map((cat) => {
                      const active = activeCategory === cat.slug;
                      return (
                        <Link
                          key={cat._id || cat.slug}
                          to={`/shop?category=${cat.slug}`}
                          data-active={active}
                          onMouseEnter={hoverIn}
                          onFocus={hoverIn}
                          className={`${navLink} ${active ? navActive : navIdle}`}
                        >
                          {cat.name}
                        </Link>
                      );
                    })}

                  {!catLoading && (
                    <Link
                      to="/contact"
                      data-active={onContact}
                      onMouseEnter={hoverIn}
                      onFocus={hoverIn}
                      className={`${navLink} ${onContact ? navActive : navIdle}`}
                    >
                      Contact
                    </Link>
                  )}
                </nav>
              )}

              {/* Right controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Desktop expanding search */}
                <form onSubmit={submitSearch} className="hidden sm:flex">
                  <div
                    className={`flex items-center overflow-hidden rounded-full border transition-all duration-300 ease-out ${
                      searchOpen
                        ? "w-60 bg-white/60 border-white shadow-[inset_0_1px_0_rgba(255,255,255,1),0_8px_20px_-12px_rgba(42,37,31,0.4)] pl-3 pr-1"
                        : "w-10 bg-white/25 border-white/60 hover:bg-white/50"
                    }`}
                  >
                    <button
                      type={searchOpen ? "button" : "submit"}
                      onClick={() => !searchOpen && setSearchOpen(true)}
                      aria-label="Search products"
                      className="w-9 h-10 shrink-0 flex items-center justify-center text-ink/75 hover:text-ink -ml-0.5"
                    >
                      <Search className="w-[17px] h-[17px]" />
                    </button>
                    <input
                      type="text"
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                      onBlur={() => !searchValue && setSearchOpen(false)}
                      placeholder="Search sofas, beds, decor…"
                      tabIndex={searchOpen ? 0 : -1}
                      className={`bg-transparent text-[13px] text-ink placeholder:text-stone/70 focus:outline-none py-2 transition-opacity duration-200 ${
                        searchOpen ? "opacity-100 w-full pr-2" : "opacity-0 w-0"
                      }`}
                    />
                  </div>
                </form>

                {/* Mobile search → opens the menu with search focused */}
                <button
                  onClick={openMenuForSearch}
                  aria-label="Search products"
                  className="sm:hidden w-10 h-10 flex items-center justify-center rounded-full bg-white/30 border border-white/60 text-ink/75 hover:bg-white/60"
                >
                  <Search className="w-[17px] h-[17px]" />
                </button>

                {/* MENU button */}
                <button
                  ref={menuBtnRef}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={menuOpen ? "Close menu" : "Open menu"}
                  aria-expanded={menuOpen}
                  aria-controls="site-menu"
                  className={`flex items-center gap-2.5 h-10 px-3.5 sm:px-4 rounded-full text-[13.5px] font-medium transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss/50 ${
                    menuOpen
                      ? "bg-white/75 text-ink border border-white shadow-[inset_0_1px_0_rgba(255,255,255,1),0_8px_20px_-12px_rgba(42,37,31,0.4)]"
                      : `${darkGlassBtn} hover:brightness-110`
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
            className={`hidden md:block absolute right-0 top-full mt-3 w-[420px] max-h-[calc(100vh-110px)] overflow-y-auto rounded-[30px] p-3 origin-top-right transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${glassPanel} ${
              menuOpen
                ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
            }`}
            aria-hidden={!menuOpen}
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[30px] bg-gradient-to-b from-white/60 to-transparent" />
            <div className="relative">{renderMenu(false, null)}</div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-[70] md:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
        <div
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-ink/35 backdrop-blur-sm transition-opacity duration-300 ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute right-2 top-2 bottom-2 w-[88%] max-w-sm rounded-[28px] bg-[#F4EFE6]/80 backdrop-blur-2xl backdrop-saturate-[1.8] border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,1),-24px_0_60px_-30px_rgba(42,37,31,0.55)] flex flex-col overflow-hidden transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            menuOpen ? "translate-x-0" : "translate-x-[110%]"
          }`}
        >
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/60 to-transparent" />

          <div className="relative flex items-center justify-between px-5 py-4 border-b border-white/70 shrink-0">
            <BrandMark compact onClick={() => setMenuOpen(false)} />
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/60 border border-white/80 text-ink hover:bg-white/90"
            >
              <MenuIcon open />
            </button>
          </div>

          <div className="relative flex-1 overflow-y-auto px-4 py-5">{renderMenu(true, mobileSearchRef)}</div>
        </aside>
      </div>
    </>
  );
};

export default Navbar;
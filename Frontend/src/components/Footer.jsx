// src/components/Footer.jsx
// OneCampus footer (v3), matching the flat theme used by the sidebar and pages.
//
// - One white panel with a hairline border. No glass, grain or drifting colour.
// - One entrance moment: the panel rises in once when it scrolls into view and
//   the columns follow in a short stagger. Nothing else moves on its own.
// - Support is WhatsApp-first: "Chat on WhatsApp" and "Report a problem" both
//   open a chat with a ready-to-send message (edit WHATSAPP_NUMBER below).
// - Auth-aware: only shows links the visitor can actually use.
// - It sits in normal page flow, so the desktop sidebar's page offset applies to it automatically.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, ArrowUpRight, GraduationCap } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/* ---------- CONFIG ---------- */

const WHATSAPP_NUMBER = "919801733223"; // country code + number, digits only
const WHATSAPP_DISPLAY = "+91 98017 33223";

const waLink = (text) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

// Only entries with an href are shown. Add your real profile links.
const SOCIALS = [
  { label: "GitHub", href: "" },
  { label: "Instagram", href: "" },
  { label: "LinkedIn", href: "" },
];

// Set to true once you have /privacy and /terms pages (otherwise the links 404).
const LEGAL_PAGES_READY = false;

/* ---------- link columns ---------- */

// auth: true  -> logged-in only      guest: true -> logged-out only
const COLUMNS = [
  {
    title: "Product",
    links: [
      { to: "/", label: "Home" },
      { to: "/dashboard", label: "Today", auth: true },
      { to: "/timetable", label: "Timetable", auth: true },
      { to: "/attendance", label: "Attendance", auth: true },
      { to: "/setups", label: "Setups", auth: true },
      { to: "/register", label: "Get started", guest: true },
    ],
  },
  {
    title: "For class reps",
    links: [
      { to: "/cr-studio", label: "CR Studio", auth: true },
      { to: "/cr-studio", label: "Request CR role", auth: true },
      { to: "/login", label: "Log in to publish", guest: true },
    ],
  },
  {
    title: "Account",
    links: [
      { to: "/profile", label: "Your profile", auth: true },
      { to: "/login", label: "Log in", guest: true },
      { to: "/register", label: "Create account", guest: true },
    ],
  },
];

const supportLinks = [
  { href: waLink("Hi OneCampus, I need some help."), label: "Chat on WhatsApp", external: true },
  {
    href: waLink("Hi OneCampus, I want to report a problem.\n\nWhat happened:\nPage / screen:\nDevice and browser:"),
    label: "Report a problem",
    external: true,
  },
  ...(LEGAL_PAGES_READY
    ? [
        { to: "/privacy", label: "Privacy" },
        { to: "/terms", label: "Terms" },
      ]
    : []),
];

/* ---------- small pieces ---------- */

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1";

const WhatsAppIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29Z" />
  </svg>
);

const linkCls = "group relative inline-flex w-fit items-center gap-1 text-[14px] text-[color:var(--muted)] hover:text-[color:var(--ink)] transition-colors duration-200 rounded-md " + FOCUS;

const Underline = () => (
  <span
    aria-hidden="true"
    className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-[#4F46E5] transition-transform duration-300 ease-out group-hover:scale-x-100 motion-reduce:transition-none"
  />
);

const FooterLink = ({ to, href, external, children }) =>
  to ? (
    <Link to={to} className={linkCls}>
      {children}
      <Underline />
    </Link>
  ) : (
    <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={linkCls}>
      {children}
      {external && <ArrowUpRight className="w-3 h-3 opacity-50" aria-hidden="true" />}
      <Underline />
    </a>
  );

const Column = ({ title, index, children }) => (
  <nav aria-label={title} className="oc-f-rise" style={{ "--i": index }}>
    <h3 className="text-[13.5px] font-semibold text-[color:var(--ink)] mb-3.5">{title}</h3>
    <ul className="flex flex-col gap-2.5">{children}</ul>
  </nav>
);

const pillCls =
  "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-[13px] font-medium text-[color:var(--ink)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] backdrop-blur-md border border-[color:var(--line)] " +
  "hover:bg-[color:var(--surface)] hover:border-[color:var(--line-strong)] active:scale-[0.98] transition-[background-color,border-color,transform] duration-200 " + FOCUS;

/* ---------- footer ---------- */

const Footer = () => {
  const { user, loading } = useAuth();
  const [shown, setShown] = useState(false);
  const rootRef = useRef(null);

  // reveal once, the first time the footer scrolls into view
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    if (!("IntersectionObserver" in window)) {
      setShown(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const columns = COLUMNS.map((c) => ({
    ...c,
    links: c.links.filter((l) => (l.auth ? user : l.guest ? !user && !loading : true)),
  })).filter((c) => c.links.length > 0);

  const socials = SOCIALS.filter((s) => s.href);
  const year = new Date().getFullYear();

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <footer
      ref={rootRef}
      className={`oc-f-scope relative z-10 mt-16 px-3 sm:px-5 pb-[max(1rem,env(safe-area-inset-bottom))] ${shown ? "oc-f-in" : ""}`}
    >
      <style>{`
        /* entrance: one gentle rise for the panel, a short stagger for the columns */
        .oc-f-panel-wrap { opacity: 0; transform: translate3d(0, 18px, 0); will-change: transform, opacity; }
        .oc-f-in .oc-f-panel-wrap {
          opacity: 1; transform: none;
          transition: opacity .6s cubic-bezier(0.32,0.72,0,1), transform .6s cubic-bezier(0.32,0.72,0,1);
        }
        .oc-f-rise { opacity: 0; transform: translate3d(0, 10px, 0); }
        .oc-f-in .oc-f-rise {
          opacity: 1; transform: none;
          transition: opacity .5s cubic-bezier(0.32,0.72,0,1), transform .5s cubic-bezier(0.32,0.72,0,1);
          transition-delay: calc(120ms + var(--i, 0) * 60ms);
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-f-panel-wrap, .oc-f-rise { opacity: 1; transform: none; transition: none !important; }
        }
      `}</style>

      <div className="oc-f-panel-wrap mx-auto max-w-7xl">
        <div className="rounded-2xl sm:rounded-3xl border border-[color:var(--line)] bg-[color:var(--surface)] shadow-[0_1px_2px_rgba(27,31,51,0.04)]">
          <div className="px-5 pt-8 pb-5 sm:px-10 sm:pt-11 sm:pb-6 lg:px-12">
            <div className="grid gap-9 grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
              {/* brand */}
              <div className="oc-f-rise col-span-2 md:col-span-4 lg:col-span-1 max-w-sm" style={{ "--i": 0 }}>
                <Link to="/" aria-label="OneCampus home" className={`inline-flex items-center gap-2.5 rounded-xl ${FOCUS}`}>
                  <span className="w-10 h-10 rounded-xl bg-[#4F46E5] flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-white" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <span className="text-[20px] font-semibold tracking-tight text-[color:var(--ink)] leading-none">OneCampus</span>
                </Link>

                <p className="text-[14px] leading-relaxed text-[color:var(--muted)] mt-4">
                  Timetables, attendance and academic calendars for your class, in one clean place. Your CR publishes, everyone stays in sync.
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-5">
                  <a
                    href={waLink("Hi OneCampus, I need some help.")}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Chat on WhatsApp at ${WHATSAPP_DISPLAY}`}
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-[13px] font-medium text-white bg-[#16A34A] hover:bg-[#15803D] active:scale-[0.98] transition-[background-color,transform] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    <WhatsAppIcon className="w-4 h-4" />
                    {WHATSAPP_DISPLAY}
                  </a>
                  {socials.map(({ label, href }) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={pillCls}>
                      {label}
                      <ArrowUpRight className="w-3.5 h-3.5 opacity-60" aria-hidden="true" />
                    </a>
                  ))}
                </div>
                <p className="text-[12px] text-[color:var(--muted)] mt-3">Found a bug? Message us on WhatsApp and we will look into it.</p>
              </div>

              {/* link columns */}
              {columns.map((c, i) => (
                <Column key={c.title} title={c.title} index={i + 1}>
                  {c.links.map((l) => (
                    <li key={`${c.title}-${l.label}`}>
                      <FooterLink to={l.to}>{l.label}</FooterLink>
                    </li>
                  ))}
                </Column>
              ))}

              <Column title="Support" index={columns.length + 1}>
                {supportLinks.map((l) => (
                  <li key={l.label}>
                    <FooterLink to={l.to} href={l.href} external={l.external}>
                      {l.label}
                    </FooterLink>
                  </li>
                ))}
              </Column>
            </div>

            {/* bottom bar */}
            <div className="flex flex-col-reverse items-center gap-4 mt-9 pt-5 border-t border-[color:var(--line-soft)] sm:flex-row sm:justify-between">
              <p className="text-[12.5px] text-[color:var(--muted)] text-center sm:text-left">
                &copy; {year} OneCampus. Built for students, by students.
              </p>

              <button
                type="button"
                onClick={toTop}
                className={`group inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-[12.5px] font-medium text-[color:var(--ink)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] backdrop-blur-md border border-[color:var(--line)] hover:bg-[color:var(--surface)] hover:border-[color:var(--line-strong)] active:scale-[0.98] transition-[background-color,border-color,transform] duration-200 ${FOCUS}`}
              >
                <ArrowUp className="w-3.5 h-3.5 transition-transform duration-300 ease-out group-hover:-translate-y-0.5" aria-hidden="true" />
                Back to top
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
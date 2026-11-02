// src/components/Footer.jsx
// OneCampus liquid-glass footer (v2), built to match the floating Navbar.
//
// - Same glass recipe as the navbar: dense tint, rim light, grain, soft colour.
// - One entrance moment: the panel rises in once when it scrolls into view and
//   the columns follow in a short stagger. Nothing else moves on its own.
// - Support is WhatsApp-first: "Chat on WhatsApp" and "Report a problem" both
//   open a chat with a ready-to-send message (edit WHATSAPP_NUMBER below).
// - Auth-aware: only shows links the visitor can actually use.

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

const WhatsAppIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29Z" />
  </svg>
);

const linkCls =
  "oc-f-link group relative inline-flex w-fit items-center gap-1 text-[14px] text-[#161827]/70 hover:text-[#161827] transition-colors duration-300 " +
  "rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50";

const Underline = () => (
  <span
    aria-hidden
    className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-gradient-to-r from-[#4F46E5] to-[#0EA5E9] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100 motion-reduce:transition-none"
  />
);

const FooterLink = ({ to, href, external, children }) =>
  to ? (
    <Link to={to} className={linkCls}>
      {children}
      <Underline />
    </Link>
  ) : (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={linkCls}
    >
      {children}
      {external && <ArrowUpRight className="w-3 h-3 opacity-50" />}
      <Underline />
    </a>
  );

const Column = ({ title, index, children }) => (
  <nav aria-label={title} className="oc-f-rise" style={{ "--i": index }}>
    <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#6A6F85] mb-4">{title}</h3>
    <ul className="flex flex-col gap-2.5">{children}</ul>
  </nav>
);

const pillCls =
  "inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-medium text-[#161827]/85 bg-white/65 border border-white/85 " +
  "shadow-[inset_0_1px_0_#fff,0_6px_14px_-10px_rgba(22,24,39,0.35)] hover:bg-white hover:text-[#161827] hover:-translate-y-0.5 " +
  "active:translate-y-0 active:scale-[0.98] transition-[background-color,color,transform] duration-300 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50";

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
        .oc-f-panel {
          background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(243,246,255,0.6));
          backdrop-filter: blur(24px) saturate(1.8);
          -webkit-backdrop-filter: blur(24px) saturate(1.8);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.95),
            inset 0 -1px 0 rgba(255,255,255,0.4),
            inset 0 -14px 28px -18px rgba(120,140,255,0.28),
            0 30px 60px -28px rgba(30,32,70,0.4),
            0 6px 16px -8px rgba(30,32,70,0.12);
        }
        .oc-f-rim {
          position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none;
          background: linear-gradient(120deg, rgba(255,255,255,0.98), rgba(255,255,255,0.08) 28%, rgba(150,175,255,0.4) 62%, rgba(255,255,255,0.95));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
        }
        .oc-f-grain {
          position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
          opacity: 0.09; mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        }
        .oc-f-blob {
          position: absolute; border-radius: 9999px;
          background: radial-gradient(closest-side, rgba(var(--c)), transparent);
        }
        .oc-f-wa {
          color: #fff;
          background: linear-gradient(135deg, #2BD96B, #12A150);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.45), 0 12px 24px -12px rgba(18,161,80,0.85);
          transition: filter .3s ease, transform .3s cubic-bezier(0.22,1,0.36,1);
        }
        .oc-f-wa:hover { filter: brightness(1.07); transform: translateY(-2px); }
        .oc-f-wa:active { transform: scale(0.98); }

        /* entrance: one rise for the panel, a short stagger for the columns */
        .oc-f-panel-wrap { opacity: 0; transform: translate3d(0, 28px, 0); will-change: transform, opacity; }
        .oc-f-in .oc-f-panel-wrap {
          opacity: 1; transform: none;
          transition: opacity .8s cubic-bezier(0.16,1,0.3,1), transform .8s cubic-bezier(0.16,1,0.3,1);
        }
        .oc-f-rise { opacity: 0; transform: translate3d(0, 14px, 0); }
        .oc-f-in .oc-f-rise {
          opacity: 1; transform: none;
          transition: opacity .7s cubic-bezier(0.22,1,0.36,1), transform .7s cubic-bezier(0.22,1,0.36,1);
          transition-delay: calc(140ms + var(--i, 0) * 70ms);
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-f-panel-wrap, .oc-f-rise { opacity: 1; transform: none; transition: none !important; }
          .oc-f-wa { transition: none; }
        }
      `}</style>

      <div className="oc-f-panel-wrap mx-auto max-w-7xl">
        <div className="oc-f-panel relative overflow-hidden rounded-[28px] sm:rounded-[36px] border border-white/40">
          {/* liquid colour under the glass (gradients, no blur filters) */}
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/70 to-transparent" />
            <span className="oc-f-blob -left-20 -top-24 w-[26rem] h-72" style={{ "--c": "255,255,255,0.7" }} />
            <span className="oc-f-blob -right-16 -bottom-28 w-[28rem] h-72" style={{ "--c": "170,190,255,0.5" }} />
            <span className="oc-f-blob left-1/3 -bottom-24 w-80 h-56" style={{ "--c": "150,215,245,0.32" }} />
          </span>
          <span aria-hidden className="oc-f-grain" />
          <span aria-hidden className="oc-f-rim" />

          <div className="relative px-6 pt-10 pb-6 sm:px-10 sm:pt-12 lg:px-14">
            <div className="grid gap-10 grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
              {/* brand */}
              <div className="oc-f-rise col-span-2 md:col-span-4 lg:col-span-1 max-w-sm" style={{ "--i": 0 }}>
                <Link
                  to="/"
                  aria-label="OneCampus home"
                  className="group inline-flex items-center gap-3 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                >
                  <span className="relative overflow-hidden w-11 h-11 rounded-full bg-gradient-to-br from-[#4F46E5] to-[#0EA5E9] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_18px_-8px_rgba(79,70,229,0.7)] flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 group-hover:-rotate-6">
                    <GraduationCap className="relative z-10 w-[22px] h-[22px] text-white" strokeWidth={2.2} />
                    <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/55 via-transparent to-transparent" />
                  </span>
                  <span className="text-[22px] font-semibold tracking-tight text-[#161827] leading-none">
                    One<span className="bg-gradient-to-r from-[#4F46E5] to-[#0EA5E9] bg-clip-text text-transparent">Campus</span>
                  </span>
                </Link>

                <p className="text-[14px] leading-relaxed text-[#6A6F85] mt-4">
                  Timetables, attendance and academic calendars for your class, in one clean place. Your CR publishes, everyone stays in sync.
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-5">
                  <a
                    href={waLink("Hi OneCampus, I need some help.")}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Chat on WhatsApp at ${WHATSAPP_DISPLAY}`}
                    className="oc-f-wa inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  >
                    <WhatsAppIcon className="w-4 h-4" />
                    {WHATSAPP_DISPLAY}
                  </a>
                  {socials.map(({ label, href }) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={pillCls}>
                      {label}
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  ))}
                </div>
                <p className="text-[12px] text-[#6A6F85] mt-3">Found a bug? Message us on WhatsApp and we will look into it.</p>
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

            {/* divider */}
            <div className="h-px mt-10 bg-gradient-to-r from-transparent via-[#161827]/15 to-transparent" />

            {/* bottom bar */}
            <div className="flex flex-col-reverse items-center gap-4 pt-5 sm:flex-row sm:justify-between">
              <p className="text-[12.5px] text-[#6A6F85] text-center sm:text-left">
                &copy; {year} OneCampus. Built for students, by students.
              </p>

              <button
                type="button"
                onClick={toTop}
                className="group inline-flex items-center gap-2 h-9 px-4 rounded-full text-[12.5px] font-medium text-[#161827]/80 bg-white/65 border border-white/85 shadow-[inset_0_1px_0_#fff] hover:bg-white hover:text-[#161827] active:scale-[0.98] transition-[background-color,color,transform] duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
              >
                <ArrowUp className="w-3.5 h-3.5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5" />
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
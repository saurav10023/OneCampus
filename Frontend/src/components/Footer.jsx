// src/components/Footer.jsx
// OneCampus liquid-glass footer.
//
// - Floating glass panel that matches the Navbar.
// - Responsive: stacked brand + 2-column links on phones, 4 columns on tablets,
//   brand + 3 columns on laptops. Bottom bar wraps cleanly on every width.
// - Auth-aware: only shows links the visitor can actually use.
// - Edit the CONFIG block below (email, socials, legal pages).

import { Link } from "react-router-dom";
import { ArrowUp, ArrowUpRight, GraduationCap, Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/* ---------- CONFIG ---------- */

const CONTACT_EMAIL = "support@onecampus.app"; // change to your real address

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
  { href: `mailto:${CONTACT_EMAIL}`, label: "Contact us" },
  { href: `mailto:${CONTACT_EMAIL}?subject=OneCampus%20bug%20report`, label: "Report a problem" },
  ...(LEGAL_PAGES_READY
    ? [
        { to: "/privacy", label: "Privacy" },
        { to: "/terms", label: "Terms" },
      ]
    : []),
];

/* ---------- small pieces ---------- */

const linkCls =
  "group relative inline-flex w-fit items-center text-[14px] text-[#161827]/70 hover:text-[#161827] transition-colors " +
  "rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50";

const Underline = () => (
  <span
    aria-hidden
    className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-gradient-to-r from-[#4F46E5] to-[#0EA5E9] transition-transform duration-300 group-hover:scale-x-100 motion-reduce:transition-none"
  />
);

const FooterLink = ({ to, href, children }) =>
  to ? (
    <Link to={to} className={linkCls}>
      {children}
      <Underline />
    </Link>
  ) : (
    <a href={href} className={linkCls}>
      {children}
      <Underline />
    </a>
  );

const Column = ({ title, children }) => (
  <nav aria-label={title}>
    <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#6A6F85] mb-4">{title}</h3>
    <ul className="flex flex-col gap-2.5">{children}</ul>
  </nav>
);

/* ---------- footer ---------- */

const Footer = () => {
  const { user, loading } = useAuth();

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
    <footer className="relative z-10 mt-16 px-3 sm:px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        className="relative mx-auto max-w-7xl overflow-hidden rounded-[28px] sm:rounded-[36px] border border-white/80
          bg-white/50 backdrop-blur-2xl backdrop-saturate-[1.6]
          shadow-[inset_0_1px_0_#fff,inset_0_0_30px_rgba(255,255,255,0.3),0_28px_60px_-30px_rgba(30,32,70,0.4)]"
      >
        {/* liquid highlights */}
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/70 to-transparent" />
          <span className="absolute -left-16 -top-16 w-72 h-56 rounded-full bg-white/60 blur-3xl" />
          <span className="absolute -right-10 -bottom-20 w-80 h-56 rounded-full bg-[#B9C8FF]/40 blur-3xl" />
        </span>

        <div className="relative px-6 pt-10 pb-6 sm:px-10 sm:pt-12 lg:px-14">
          <div className="grid gap-10 grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
            {/* brand */}
            <div className="col-span-2 md:col-span-4 lg:col-span-1 max-w-sm">
              <Link
                to="/"
                aria-label="OneCampus home"
                className="inline-flex items-center gap-3 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
              >
                <span className="w-11 h-11 rounded-full bg-gradient-to-br from-[#4F46E5] to-[#0EA5E9] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_18px_-8px_rgba(79,70,229,0.7)] flex items-center justify-center">
                  <GraduationCap className="w-[22px] h-[22px] text-white" strokeWidth={2.2} />
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
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-medium text-[#161827] bg-white/60 border border-white/80 shadow-[inset_0_1px_0_#fff] hover:bg-white/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                >
                  <Mail className="w-4 h-4" />
                  {CONTACT_EMAIL}
                </a>
                {socials.map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-[13px] font-medium text-[#161827]/80 bg-white/60 border border-white/80 shadow-[inset_0_1px_0_#fff] hover:bg-white/90 hover:text-[#161827] hover:-translate-y-0.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                  >
                    {label}
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                ))}
              </div>
            </div>

            {/* link columns */}
            {columns.map((c) => (
              <Column key={c.title} title={c.title}>
                {c.links.map((l) => (
                  <li key={`${c.title}-${l.label}`}>
                    <FooterLink to={l.to}>{l.label}</FooterLink>
                  </li>
                ))}
              </Column>
            ))}

            <Column title="Support">
              {supportLinks.map((l) => (
                <li key={l.label}>
                  <FooterLink to={l.to} href={l.href}>
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
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-[12.5px] font-medium text-[#161827]/80 bg-white/60 border border-white/80 shadow-[inset_0_1px_0_#fff] hover:bg-white/90 hover:text-[#161827] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              Back to top
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
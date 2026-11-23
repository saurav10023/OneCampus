import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, CalendarDays, CalendarRange, CheckCircle2, ChevronDown, Megaphone, Users } from "lucide-react";
import { cx } from "../Ui";
import { H2, ROUTES } from "./Shared";
import { useDemo } from "./useHomeData";
import DashboardView from "./DashboardView";
import LandingHero from "./LandingHero";

/* Uses the .hm-btn / .hm-btn-primary classes and the flat .lq overrides
   defined in the `polish` stylesheet in Home.jsx (this page renders inside it). */

/* One calm palette: soft tinted tiles with a darker icon, no gradients. */
const features = [
  { icon: CalendarDays, tile: "bg-[color:var(--brand-bg)] text-[color:var(--accent-soft)]", title: "Weekly timetable", text: "Build your setup once. Every class for the semester is generated for you." },
  { icon: CheckCircle2, tile: "bg-[color:var(--ok-bg)] text-[color:var(--ok-icon)]", title: "Honest attendance", text: "Mark present, absent or excused in one tap. Holidays and cancellations never count against you." },
  { icon: CalendarClock, tile: "bg-[color:var(--warn-bg)] text-[color:var(--warn-icon)]", title: "Semester forecast", text: "See how many of the remaining classes you can skip and still finish above your target." },
  { icon: CalendarRange, tile: "bg-[color:var(--info-bg)] text-[color:var(--info-icon)]", title: "Academic calendar", text: "Exams, quizzes and holidays sit on the same calendar as your classes." },
  { icon: Users, tile: "bg-[color:var(--violet-bg)] text-[color:var(--violet-icon)]", title: "Share with classmates", text: "Publish your setup so others can take their own copy and edit it." },
  { icon: Megaphone, tile: "bg-[color:var(--bad-bg)] text-[color:var(--bad-icon)]", title: "Official schedule", text: "Your CR publishes the timetable. Join it and every change reaches you without retyping." },
];
const steps = [
  { n: "1", t: "Set up your week", d: "Add subjects and weekly classes in a few minutes, or join your CR's timetable." },
  { n: "2", t: "Mark as you go", d: "One tap per class. Holidays and cancellations are handled automatically." },
  { n: "3", t: "Plan with confidence", d: "The skip planner shows exactly how many classes you can afford to miss." },
];
const faqs = [
  { q: "Do I need my CR to use it?", a: "No. You can build your own timetable and track attendance alone. If your CR publishes an official schedule, you can join it to stay in sync." },
  { q: "How does the skip planner predict my attendance?", a: "It counts the classes still on your calendar, with holidays and cancellations removed, and shows where you'd finish for any number you choose to skip." },
  { q: "What happens on holidays and cancelled classes?", a: "They sit on the calendar and the affected classes are handled for you, so they don't count against your attendance." },
  { q: "Can I share my timetable with friends?", a: "Yes. Publish your setup and classmates in your college can take their own copy, which they can then edit." },
  { q: "How does someone become a CR?", a: "They request the role with their college, branch and section. A college admin reviews and approves it before they can publish schedules." },
];

const Eyebrow = ({ children }) => (
  <p className="inline-flex items-center rounded-full lq-btn px-3 py-1 text-[12px] font-medium text-[color:var(--accent-soft)]">{children}</p>
);

const Faq = () => {
  const [open, setOpen] = useState(0);
  return (
    <div className="max-w-3xl mx-auto space-y-2">
      {faqs.map((f, i) => {
        const on = open === i;
        return (
          <div key={f.q} className="lq overflow-hidden relative">
            <span aria-hidden="true" className={cx("absolute left-0 inset-y-3 w-0.5 rounded-r-full bg-[color:var(--accent)] transition-opacity", on ? "opacity-100" : "opacity-0")} />
            <button type="button" aria-expanded={on} aria-controls={`faq-${i}`} onClick={() => setOpen(on ? -1 : i)}
              className="w-full min-h-14 flex items-center justify-between gap-4 pl-5 pr-4 sm:px-6 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)]">
              <span className="text-[14.5px] sm:text-[15px] font-semibold text-[color:var(--ink)]">{f.q}</span>
              <span className={cx("shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors", on ? "bg-[color:var(--brand-bg)] text-[color:var(--accent-soft)]" : "bg-[color:var(--inset)] text-[color:var(--muted)]")}>
                <ChevronDown className={cx("w-4 h-4 transition-transform duration-200 motion-reduce:transition-none", on && "rotate-180")} aria-hidden="true" />
              </span>
            </button>
            <div id={`faq-${i}`} className={cx("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className={cx("overflow-hidden", !on && "invisible")}><p className="pl-5 pr-5 sm:px-6 pb-5 text-[14px] leading-relaxed text-[color:var(--body)]">{f.a}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* Signed-out landing page, with a live sample dashboard people can poke at. */
export default function Landing() {
  const demo = useDemo();
  return (
    <>
      <LandingHero />

      <section className="mt-12 sm:mt-16" aria-label="Sample dashboard">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 mb-4 px-1">
          <div>
            <Eyebrow>Live preview</Eyebrow>
            <h2 className="text-[20px] sm:text-[24px] font-semibold tracking-tight text-[color:var(--ink)] mt-2">Your home screen</h2>
          </div>
          <p className="text-[12.5px] text-[color:var(--muted)] max-w-sm">Sample data. Mark a class, flip to tomorrow, then drag the skip slider.</p>
        </div>
        <DashboardView vm={demo.vm} remaining={demo.remaining} note="" onMark={demo.mark} onReadAll={demo.readAll} onLoadDay={demo.loadDay} />
      </section>

      <section className="mt-16 sm:mt-24">
        <div className="text-center max-w-xl mx-auto">
          <Eyebrow>Features</Eyebrow>
          <h2 className={cx(H2, "mt-3")}>Built around how college actually works</h2>
          <p className="text-[14.5px] sm:text-[16px] leading-relaxed text-[color:var(--muted)] mt-2.5">Changing timetables, holidays, quizzes and attendance rules are handled for you.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-8">
          {features.map(({ icon: Icon, tile, title, text }) => (
            <div key={title} className="lq p-5">
              <span className={cx("w-10 h-10 rounded-xl flex items-center justify-center", tile)}>
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <h3 className="text-[15.5px] font-semibold text-[color:var(--ink)] mt-4">{title}</h3>
              <p className="text-[13.5px] leading-relaxed text-[color:var(--muted)] mt-1.5">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 sm:mt-24">
        <div className="text-center max-w-xl mx-auto">
          <Eyebrow>How it works</Eyebrow>
          <h2 className={cx(H2, "mt-3")}>Up and running in minutes</h2>
        </div>
        <ol className="grid md:grid-cols-3 gap-3 sm:gap-4 mt-8">
          {steps.map((s) => (
            <li key={s.n} className="lq p-5 flex gap-4 md:block">
              <span className="shrink-0 w-9 h-9 rounded-full bg-[color:var(--brand-bg)] text-[color:var(--accent-soft)] flex items-center justify-center text-[14px] font-semibold tabular-nums">{s.n}</span>
              <div className="md:mt-4">
                <h3 className="text-[15.5px] font-semibold text-[color:var(--ink)]">{s.t}</h3>
                <p className="text-[13.5px] leading-relaxed text-[color:var(--muted)] mt-1">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 sm:mt-24">
        <div className="lq p-5 sm:p-10 grid md:grid-cols-[1.2fr_1fr] gap-6 md:gap-12 items-center">
          <div>
            <Eyebrow>For class representatives</Eyebrow>
            <h2 className={cx(H2, "mt-3")}>Publish the timetable once. Your whole class stays in sync.</h2>
            <p className="text-[14.5px] leading-relaxed text-[color:var(--muted)] mt-3 max-w-lg">CR Studio manages the official schedule: subjects, weekly classes, exams and cancellations, with undo for every change.</p>
            <Link to={ROUTES.register} className="hm-btn hm-btn-primary mt-6 !h-11 !px-5">Create an account<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          </div>
          <ul className="space-y-2.5">
            {["Publish the class timetable once", "Changes reach joined students automatically", "Undo or redo any change from the history"].map((t) => (
              <li key={t} className="flex items-center gap-3 rounded-xl bg-[color:var(--inset)] px-3.5 py-3 text-[14px] font-medium text-[color:var(--ink)]">
                <span className="shrink-0 w-7 h-7 rounded-full bg-[color:var(--ok-bg)] text-[color:var(--ok-icon)] flex items-center justify-center"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /></span>{t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-16 sm:mt-24">
        <div className="text-center mb-8"><Eyebrow>FAQ</Eyebrow><h2 className={cx(H2, "mt-3")}>Questions, answered</h2></div>
        <Faq />
      </section>

      <section className="mt-16 sm:mt-24">
        <div className="lq text-center px-5 py-12 sm:py-16">
          <h2 className={cx(H2, "sm:text-[34px]")}>Start the semester organised</h2>
          <p className="text-[14.5px] sm:text-[16px] text-[color:var(--muted)] mt-3">Set up your week in a few minutes.</p>
          <div className="flex flex-col min-[420px]:flex-row justify-center gap-2.5 mt-7 max-w-sm min-[420px]:max-w-none mx-auto">
            <Link to={ROUTES.register} className="hm-btn hm-btn-primary !h-11 !px-6">Get started<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
            <Link to={ROUTES.login} className="hm-btn !h-11 !px-6">Log in</Link>
          </div>
        </div>
      </section>

      {/* Sticky mobile CTA: frosted bar, safe-area aware */}
      <div aria-hidden="true" className="h-20 md:hidden" />
      <div className="md:hidden fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.6rem)] z-30 rounded-full p-1.5 border border-[color:var(--line)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] backdrop-blur-md sh-float">
        <div className="flex gap-1.5">
          <Link to={ROUTES.login} className="hm-btn !rounded-full flex-1 !h-11">Log in</Link>
          <Link to={ROUTES.register} className="hm-btn hm-btn-primary !rounded-full flex-[1.6] !h-11">Get started</Link>
        </div>
      </div>
    </>
  );
}
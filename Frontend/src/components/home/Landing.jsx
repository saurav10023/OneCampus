import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, CalendarDays, CalendarRange, Check, CheckCircle2, ChevronDown, Megaphone, Users } from "lucide-react";
import { cx } from "../Ui";
import { H2, ROUTES, linkBase, linkGlass, linkPrimary } from "./Shared";
import { useDemo } from "./useHomeData";
import DashboardView from "./DashboardView";

const features = [
  { icon: CalendarDays, title: "Weekly timetable", text: "Build your setup once. Every class for the semester is generated for you." },
  { icon: CheckCircle2, title: "Honest attendance", text: "Mark present, absent or excused in one tap. Holidays and cancellations never count against you." },
  { icon: CalendarClock, title: "Semester forecast", text: "See how many of the remaining classes you can skip and still finish above your target." },
  { icon: CalendarRange, title: "Academic calendar", text: "Exams, quizzes and holidays sit on the same calendar as your classes." },
  { icon: Users, title: "Share with classmates", text: "Publish your setup so others can take their own copy and edit it." },
  { icon: Megaphone, title: "Official schedule", text: "Your CR publishes the timetable. Join it and every change reaches you without retyping." },
];
const faqs = [
  { q: "Do I need my CR to use it?", a: "No. You can build your own timetable and track attendance alone. If your CR publishes an official schedule, you can join it to stay in sync." },
  { q: "How does the skip planner predict my attendance?", a: "It counts the classes still on your calendar, with holidays and cancellations removed, and shows where you'd finish for any number you choose to skip." },
  { q: "What happens on holidays and cancelled classes?", a: "They sit on the calendar and the affected classes are handled for you, so they don't count against your attendance." },
  { q: "Can I share my timetable with friends?", a: "Yes. Publish your setup and classmates in your college can take their own copy, which they can then edit." },
  { q: "How does someone become a CR?", a: "They request the role with their college, branch and section. A college admin reviews and approves it before they can publish schedules." },
];

const Faq = () => {
  const [open, setOpen] = useState(0);
  return (
    <div className="max-w-3xl mx-auto lg divide-y divide-[#161827]/8 overflow-hidden">
      {faqs.map((f, i) => {
        const on = open === i;
        return (
          <div key={f.q}>
            <button type="button" aria-expanded={on} aria-controls={`faq-${i}`} onClick={() => setOpen(on ? -1 : i)} className="w-full min-h-14 flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5 text-left hover:bg-white/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400">
              <span className="text-[14.5px] font-semibold text-[#161827]">{f.q}</span>
              <ChevronDown className={cx("w-5 h-5 shrink-0 text-[#6A6F85] transition-transform duration-200 motion-reduce:transition-none", on && "rotate-180")} aria-hidden="true" />
            </button>
            <div id={`faq-${i}`} className={cx("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className={cx("overflow-hidden", !on && "invisible")}><p className="px-4 sm:px-5 pb-4 text-[14px] leading-relaxed text-[#6A6F85]">{f.a}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* 6 / 6: Signed-out landing page, with a live sample dashboard people can poke at. */
export default function Landing() {
  const demo = useDemo();
  return (
    <>
      <section className="w-full min-w-0 max-w-3xl mx-auto text-center pt-2 sm:pt-8">
        <h1 className="hm-rise text-[32px] min-[380px]:text-[36px] sm:text-[52px] font-semibold tracking-[-0.025em] leading-[1.07] text-[#161827]">Know what's next, and whether you can skip it.</h1>
        <p className="hm-rise text-[15px] sm:text-[17px] leading-relaxed text-[#444A63] mt-4 max-w-xl mx-auto" style={{ animationDelay: "80ms" }}>
          Your timetable, attendance and academic calendar in one calm place, kept in sync with your class representative.
        </p>
        <div className="hm-rise flex flex-col min-[420px]:flex-row justify-center gap-2.5 mt-6" style={{ animationDelay: "160ms" }}>
          <Link to={ROUTES.register} className={cx(linkBase, linkPrimary)}>Get started<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          <Link to={ROUTES.login} className={cx(linkBase, linkGlass)}>Log in</Link>
        </div>
        <ul className="hm-rise flex flex-wrap justify-center gap-x-5 gap-y-1.5 mt-5 text-[12.5px] text-[#6A6F85]" style={{ animationDelay: "240ms" }}>
          {["Works on phone and laptop", "Holidays handled for you", "Syncs with your CR"].map((t) => (
            <li key={t} className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />{t}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10 sm:mt-14" aria-label="Sample dashboard">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3 px-1">
          <h2 className="text-[16px] font-semibold text-[#161827]">Your home screen</h2>
          <p className="text-[12.5px] text-[#6A6F85]">Sample data. Mark a class, flip to tomorrow, then drag the skip slider.</p>
        </div>
        <DashboardView vm={demo.vm} remaining={demo.remaining} note="" onMark={demo.mark} onReadAll={demo.readAll} onLoadDay={demo.loadDay} />
      </section>

      <section className="mt-14 sm:mt-20">
        <h2 className={cx(H2, "max-w-xl")}>Built around how college actually works</h2>
        <p className="text-[14.5px] sm:text-[16px] leading-relaxed text-[#6A6F85] mt-2.5 max-w-xl">Changing timetables, holidays, quizzes and attendance rules are handled for you.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-6">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="lg p-4 sm:p-5">
              <span className="w-9 h-9 rounded-xl bg-white border border-[#161827]/10 text-[#161827] flex items-center justify-center"><Icon className="w-[18px] h-[18px]" aria-hidden="true" /></span>
              <h3 className="text-[15px] font-semibold text-[#161827] mt-3">{title}</h3>
              <p className="text-[13.5px] leading-relaxed text-[#6A6F85] mt-1">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 sm:mt-20">
        <div className="lg p-5 sm:p-9 grid md:grid-cols-[1.2fr_1fr] gap-6 md:gap-12 items-center">
          <div>
            <h2 className={H2}>Publish the timetable once. Your whole class stays in sync.</h2>
            <p className="text-[14.5px] leading-relaxed text-[#6A6F85] mt-3 max-w-lg">CR Studio manages the official schedule: subjects, weekly classes, exams and cancellations, with undo for every change.</p>
            <Link to={ROUTES.register} className={cx(linkBase, linkPrimary, "mt-5")}>Create an account<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          </div>
          <ul className="space-y-3">
            {["Publish the class timetable once", "Changes reach joined students automatically", "Undo or redo any change from the history"].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[14px] text-[#161827]"><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-px" aria-hidden="true" />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-14 sm:mt-20">
        <h2 className={cx(H2, "text-center mb-6")}>Questions, answered</h2>
        <Faq />
      </section>

      <section className="mt-14 sm:mt-20 pt-10 sm:pt-14 border-t border-[#161827]/8 text-center">
        <h2 className={H2}>Start the semester organised</h2>
        <p className="text-[14.5px] sm:text-[16px] text-[#6A6F85] mt-2.5">Set up your week in a few minutes.</p>
        <div className="flex flex-col min-[420px]:flex-row justify-center gap-2.5 mt-6">
          <Link to={ROUTES.register} className={cx(linkBase, linkPrimary)}>Get started<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          <Link to={ROUTES.login} className={cx(linkBase, linkGlass)}>Log in</Link>
        </div>
      </section>

      {/* Sticky mobile CTA, safe-area aware */}
      <div aria-hidden="true" className="h-20 md:hidden" />
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-[#161827]/8 bg-white/80 backdrop-blur-xl px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.65rem)]">
        <div className="flex gap-2">
          <Link to={ROUTES.login} className={cx(linkBase, linkGlass, "!w-auto flex-1")}>Log in</Link>
          <Link to={ROUTES.register} className={cx(linkBase, linkPrimary, "!w-auto flex-[1.6]")}>Get started</Link>
        </div>
      </div>
    </>
  );
}
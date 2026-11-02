import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock, MapPin, Sparkles } from "lucide-react";
import { cx } from "../Ui";
import { ROUTES, linkBase, linkGlass, linkPrimary } from "./Shared";

const perks = ["Works on phone and laptop", "Holidays handled for you", "Syncs with your CR"];

/* Static preview of the real hero card, so visitors see the product before signing up. */
const Preview = () => (
  <div className="relative mx-auto w-full max-w-[26rem] lg:max-w-none">
    <div aria-hidden="true" className="hm-orb -z-10 -top-6 -right-4 h-40 w-40 bg-indigo-300" />
    <div aria-hidden="true" className="hm-orb -z-10 -bottom-8 -left-4 h-44 w-44 bg-sky-300" style={{ animationDelay: "-6s" }} />

    <div className="lq lq-glow relative p-4 sm:p-5">
      <p className="inline-flex items-center gap-2 rounded-full lq-btn px-3 py-1.5 text-[12px] font-semibold text-[#161827]">
        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[#5B52EE] shadow-[0_0_0_4px_rgba(91,82,238,.18)]" />
        Starts in 12 min
      </p>
      <p className="text-[24px] sm:text-[28px] font-semibold tracking-tight leading-[1.1] text-[#161827] mt-3">Operating Systems</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] font-medium text-[#161827] tabular-nums"><Clock className="w-3.5 h-3.5 text-[#6A6F85]" aria-hidden="true" />09:00 to 10:00</span>
        <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] font-medium text-[#161827]"><MapPin className="w-3.5 h-3.5 text-[#6A6F85]" aria-hidden="true" />LH-201</span>
      </div>
      <div className="mt-4 h-1.5 rounded-full bg-[#161827]/[.07] overflow-hidden"><span className="block h-full w-1/3 rounded-full bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0]" /></div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[["82%", "Attendance", "text-emerald-700"], ["1/4", "Marked", "text-[#161827]"], ["3", "Updates", "text-[#161827]"]].map(([v, k, c]) => (
          <div key={k} className="lq-in p-2 min-h-[72px] flex flex-col items-center justify-center text-center">
            <p className={cx("text-[20px] sm:text-[22px] font-semibold leading-none tabular-nums", c)}>{v}</p>
            <p className="text-[11.5px] font-medium text-[#444A63] mt-1.5">{k}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="hm-float lq-btn absolute -bottom-4 right-2 sm:-right-3 hidden min-[420px]:flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold text-[#161827]">
      <Sparkles className="w-4 h-4 text-[#5B52EE]" aria-hidden="true" />You can skip 4 classes
    </div>
    <div className="hm-float lq-btn absolute -top-4 left-2 sm:-left-3 hidden min-[420px]:flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold text-[#161827]" style={{ animationDelay: "-3s" }}>
      <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />DBMS cancelled by CR
    </div>
  </div>
);

export default function LandingHero() {
  return (
    <section className="w-full min-w-0 grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-10 lg:gap-14 items-center pt-2 sm:pt-8 lg:pt-12">
      <div className="text-center lg:text-left">
        <p className="hm-rise inline-flex items-center gap-2 rounded-full lq-btn px-3.5 py-1.5 text-[12.5px] font-semibold text-[#161827]">
          <Sparkles className="w-4 h-4 text-[#5B52EE]" aria-hidden="true" />Built for college timetables
        </p>
        <h1 className="hm-rise text-[34px] min-[380px]:text-[38px] sm:text-[54px] xl:text-[60px] font-semibold tracking-[-0.03em] leading-[1.06] text-[#161827] mt-4" style={{ animationDelay: "60ms" }}>
          Know what's next, and whether you can <span className="hm-grad-text">skip it.</span>
        </h1>
        <p className="hm-rise text-[15px] sm:text-[17px] leading-relaxed text-[#444A63] mt-4 max-w-xl mx-auto lg:mx-0" style={{ animationDelay: "120ms" }}>
          Your timetable, attendance and academic calendar in one calm place, kept in sync with your class representative.
        </p>
        <div className="hm-rise flex flex-col min-[420px]:flex-row justify-center lg:justify-start gap-2.5 mt-7" style={{ animationDelay: "180ms" }}>
          <Link to={ROUTES.register} className={cx(linkBase, linkPrimary)}>Get started<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          <Link to={ROUTES.login} className={cx(linkBase, linkGlass)}>Log in</Link>
        </div>
        <ul className="hm-rise flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-1.5 mt-5 text-[12.5px] text-[#6A6F85]" style={{ animationDelay: "240ms" }}>
          {perks.map((t) => (
            <li key={t} className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />{t}</li>
          ))}
        </ul>
      </div>
      <div className="hm-rise pb-4" style={{ animationDelay: "200ms" }} aria-hidden="true"><Preview /></div>
    </section>
  );
}
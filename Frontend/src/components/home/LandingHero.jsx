import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock, MapPin, Sparkles } from "lucide-react";
import { cx } from "../Ui";
import { ROUTES } from "./Shared";

const perks = ["Works on phone and laptop", "Holidays handled for you", "Syncs with your CR"];

/* Static preview of the real hero card, so visitors see the product before signing up. */
const Preview = () => (
  <div className="relative mx-auto w-full max-w-[26rem] lg:max-w-none">
    <div className="lq relative p-4 sm:p-5">
      <p className="inline-flex items-center gap-2 rounded-full bg-[color:var(--brand-bg)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--brand-fg)]">
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)]" />
        Starts in 12 min
      </p>
      <p className="text-[24px] sm:text-[28px] font-semibold tracking-tight leading-[1.1] text-[color:var(--ink)] mt-3">Operating Systems</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--inset)] px-2.5 py-1 text-[12.5px] font-medium text-[color:var(--ink)] tabular-nums"><Clock className="w-3.5 h-3.5 text-[color:var(--muted)]" aria-hidden="true" />09:00 to 10:00</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--inset)] px-2.5 py-1 text-[12.5px] font-medium text-[color:var(--ink)]"><MapPin className="w-3.5 h-3.5 text-[color:var(--muted)]" aria-hidden="true" />LH-201</span>
      </div>
      <div className="mt-4 h-1.5 rounded-full bg-[color:var(--line)] overflow-hidden"><span className="block h-full w-1/3 rounded-full bg-[color:var(--accent)]" /></div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[["82%", "Attendance", "text-[color:var(--ok-fg)]"], ["1/4", "Marked", "text-[color:var(--ink)]"], ["3", "Updates", "text-[color:var(--ink)]"]].map(([v, k, c]) => (
          <div key={k} className="rounded-xl bg-[color:var(--inset)] p-2 min-h-[72px] flex flex-col items-center justify-center text-center">
            <p className={cx("text-[20px] sm:text-[22px] font-semibold leading-none tabular-nums", c)}>{v}</p>
            <p className="text-[11.5px] font-medium text-[color:var(--muted)] mt-1.5">{k}</p>
          </div>
        ))}
      </div>
    </div>

    {/* Two small frosted notes, static (no floating animation) */}
    <div className="lq-btn absolute -bottom-4 right-2 sm:-right-3 hidden min-[420px]:flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium text-[color:var(--ink)]">
      <Sparkles className="w-4 h-4 text-[color:var(--accent-soft)]" aria-hidden="true" />You can skip 4 classes
    </div>
    <div className="lq-btn absolute -top-4 left-2 sm:-left-3 hidden min-[420px]:flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium text-[color:var(--ink)]">
      <Check className="w-4 h-4 text-[color:var(--ok-icon)]" aria-hidden="true" />DBMS cancelled by CR
    </div>
  </div>
);

export default function LandingHero() {
  return (
    <section className="w-full min-w-0 grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-10 lg:gap-14 items-center pt-2 sm:pt-8 lg:pt-12">
      <div className="text-center lg:text-left">
        <p className="inline-flex items-center rounded-full lq-btn px-3.5 py-1.5 text-[12.5px] font-medium text-[color:var(--accent-soft)]">
          Built for college timetables
        </p>
        <h1 className="hm-rise text-[34px] min-[380px]:text-[38px] sm:text-[50px] xl:text-[56px] font-semibold tracking-[-0.03em] leading-[1.08] text-[color:var(--ink)] mt-4">
          Know what's next, and whether you can skip it.
        </h1>
        <p className="text-[15px] sm:text-[17px] leading-relaxed text-[color:var(--muted)] mt-4 max-w-xl mx-auto lg:mx-0">
          Your timetable, attendance and academic calendar in one calm place, kept in sync with your class representative.
        </p>
        <div className="flex flex-col min-[420px]:flex-row justify-center lg:justify-start gap-2.5 mt-7">
          <Link to={ROUTES.register} className="hm-btn hm-btn-primary !h-11 !px-6">Get started<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
          <Link to={ROUTES.login} className="hm-btn !h-11 !px-6">Log in</Link>
        </div>
        <ul className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-1.5 mt-5 text-[12.5px] text-[color:var(--muted)]">
          {perks.map((t) => (
            <li key={t} className="flex items-center gap-1.5"><Check className="w-4 h-4 text-[color:var(--ok-icon)]" aria-hidden="true" />{t}</li>
          ))}
        </ul>
      </div>
      <div className="pb-4" aria-hidden="true"><Preview /></div>
    </section>
  );
}
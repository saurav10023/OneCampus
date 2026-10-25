// Thin progress bar showing how far through the semester we are. Renders nothing if the dates are unusable.
import { cx } from "./Ui";

const SemesterMeter = ({ start, end, className }) => {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!s || !e || e <= s) return null;

  const now = Date.now();
  const pct = Math.round(Math.min(1, Math.max(0, (now - s) / (e - s))) * 100);
  const label = now < s ? "The semester hasn't started yet" : now > e ? "The semester has ended" : `${pct}% of the semester is done`;

  return (
    <div className={className}>
      <div
        className="h-1.5 rounded-full bg-[#161827]/10 overflow-hidden"
        role="progressbar"
        aria-label="Semester progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={cx("h-full rounded-full bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0] transition-[width] duration-700 motion-reduce:transition-none")} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[12px] text-[#6A6F85] mt-1.5">{label}</p>
    </div>
  );
};

export default SemesterMeter;
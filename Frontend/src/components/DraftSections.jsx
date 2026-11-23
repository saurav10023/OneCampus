// Shared review editor for the two image-import dialogs (subjects, weekly classes, holidays).
// Every layout switch uses the width of THIS wrapper (the dialog), not the screen, so fields cannot overlap.
import { X } from "lucide-react";
import { WEEKDAYS } from "../lib/dates";
import { cx } from "./Ui";

const CLASS_TYPES = ["lecture", "lab", "tutorial"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

// min-w-0 lets each control shrink inside its grid cell instead of pushing its neighbour.
const inp =
  "h-11 @md:h-10 w-full min-w-0 rounded-xl bg-[color:var(--surface)] border border-[color:var(--line)] px-3 text-[16px] sm:text-[14px] text-[color:var(--ink)] " +
  "placeholder:text-[color:var(--faint)] hover:border-[color:var(--line-strong)] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/25";

const rm =
  "w-11 h-11 @md:w-10 @md:h-10 shrink-0 rounded-xl flex items-center justify-center text-rose-600 hover:bg-rose-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1";

const check = "w-4 h-4 accent-indigo-600 shrink-0";

const Empty = ({ children }) => <p className="text-[13px] text-[color:var(--muted)]">{children}</p>;
const Heading = ({ children }) => <p className="text-[15px] font-semibold text-[color:var(--ink)] mb-2 tabular-nums">{children}</p>;

const DraftSections = ({ draft, upd, del, delSubject, semStart, semEnd, withCredits = false, holidayTitleMax = 100 }) => (
  <div className="@container space-y-6 min-w-0">
    {/* subjects */}
    <section>
      <Heading>Subjects ({draft.subjects.length})</Heading>
      <div className="space-y-2">
        {draft.subjects.map((s) => (
          <div
            key={s.id}
            className={cx(
              "rounded-xl bg-[color:var(--inset)] p-2.5 grid gap-2 items-center min-w-0 grid-cols-[minmax(0,1fr)_44px]",
              withCredits ? "@md:grid-cols-[minmax(0,1fr)_130px_90px_40px]" : "@md:grid-cols-[minmax(0,1fr)_130px_40px]"
            )}
          >
            <input className={inp} value={s.name} maxLength={80} placeholder="Subject name" onChange={(e) => upd("subjects", s.id, { name: e.target.value })} aria-label="Subject name" />
            <button type="button" onClick={() => delSubject(s.id)} aria-label={`Remove ${s.name || "subject"}`} className={cx(rm, "@md:order-last")}>
              <X className="w-4 h-4" />
            </button>
            {/* second line on narrow dialogs, joins the main row on wide ones */}
            <div className={cx("col-span-2 grid gap-2 min-w-0 @md:contents", withCredits ? "grid-cols-2" : "grid-cols-1")}>
              <input className={inp} value={s.code} maxLength={20} placeholder="Code" onChange={(e) => upd("subjects", s.id, { code: e.target.value })} aria-label="Subject code" />
              {withCredits && (
                <input className={inp} type="number" min="0" max="30" value={s.credits ?? ""} placeholder="Credits" onChange={(e) => upd("subjects", s.id, { credits: e.target.value })} aria-label="Credits" />
              )}
            </div>
          </div>
        ))}
        {draft.subjects.length === 0 && <Empty>No subjects found.</Empty>}
      </div>
    </section>

    {/* weekly classes: two columns when narrow, a six-column grid when the dialog has room */}
    <section>
      <Heading>Weekly classes ({draft.classes.length})</Heading>
      <div className="space-y-2">
        {draft.classes.map((c) => (
          <div
            key={c.id}
            className={cx("rounded-xl bg-[color:var(--inset)] p-2.5 grid grid-cols-2 @lg:grid-cols-6 gap-2 items-center min-w-0", !c.on && "opacity-50")}
          >
            <div className="col-span-2 @lg:col-span-6 flex items-center justify-between gap-2 min-w-0">
              <label className="inline-flex items-center gap-2 text-[13px] text-[color:var(--body)] min-w-0">
                <input type="checkbox" checked={c.on} onChange={(e) => upd("classes", c.id, { on: e.target.checked })} className={check} />
                Include this class
              </label>
              <button type="button" onClick={() => del("classes", c.id)} aria-label="Remove class" className={rm}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <select className={cx(inp, "col-span-2")} value={c.weekday} onChange={(e) => upd("classes", c.id, { weekday: Number(e.target.value) })} aria-label="Day">
              {ORDER.map((d) => (
                <option key={d} value={d}>{WEEKDAYS[d]}</option>
              ))}
            </select>
            <select className={cx(inp, "col-span-2 @lg:col-span-4")} value={c.subjectId} onChange={(e) => upd("classes", c.id, { subjectId: e.target.value })} aria-label="Subject">
              {draft.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <input type="time" className={cx(inp, "@lg:col-span-2")} value={c.startTime} onChange={(e) => upd("classes", c.id, { startTime: e.target.value })} aria-label="Start" />
            <input type="time" className={cx(inp, "@lg:col-span-2")} value={c.endTime} onChange={(e) => upd("classes", c.id, { endTime: e.target.value })} aria-label="End" />
            <select className={cx(inp, "col-span-2")} value={c.classType} onChange={(e) => upd("classes", c.id, { classType: e.target.value })} aria-label="Type">
              {CLASS_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <input className={cx(inp, "col-span-2 @lg:col-span-3")} value={c.room || ""} maxLength={30} placeholder="Room" onChange={(e) => upd("classes", c.id, { room: e.target.value })} aria-label="Room" />
            <input className={cx(inp, "col-span-2 @lg:col-span-3")} value={c.professor || ""} maxLength={80} placeholder="Professor" onChange={(e) => upd("classes", c.id, { professor: e.target.value })} aria-label="Professor" />
          </div>
        ))}
        {draft.classes.length === 0 && <Empty>No classes found.</Empty>}
      </div>
    </section>

    {/* holidays: the same stacked card at every width, so nothing can collide */}
    <section>
      <Heading>Holidays ({draft.holidays.length})</Heading>
      <div className="space-y-2">
        {draft.holidays.map((h) => {
          const out = h.startDate < semStart || h.endDate > semEnd;
          return (
            <div key={h.id} className={cx("rounded-xl bg-[color:var(--inset)] p-2.5 grid grid-cols-2 gap-2 items-center min-w-0", !h.on && "opacity-50")}>
              <div className="col-span-2 flex items-center justify-between gap-2 min-w-0">
                <label className="inline-flex items-center gap-2 text-[13px] text-[color:var(--body)] min-w-0">
                  <input type="checkbox" checked={h.on} onChange={(e) => upd("holidays", h.id, { on: e.target.checked })} className={check} />
                  Include this holiday
                </label>
                <button type="button" onClick={() => del("holidays", h.id)} aria-label="Remove holiday" className={rm}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input className={cx(inp, "col-span-2")} value={h.title} maxLength={holidayTitleMax} placeholder="Title" onChange={(e) => upd("holidays", h.id, { title: e.target.value })} aria-label="Title" />
              <input
                type="date"
                className={inp}
                value={h.startDate}
                onChange={(e) => upd("holidays", h.id, { startDate: e.target.value, endDate: h.endDate < e.target.value ? e.target.value : h.endDate })}
                aria-label="Start date"
              />
              <input type="date" className={inp} min={h.startDate} value={h.endDate} onChange={(e) => upd("holidays", h.id, { endDate: e.target.value })} aria-label="End date" />
              {out && <p className="col-span-2 text-[12px] text-amber-700">Outside the semester dates, so it is unchecked.</p>}
            </div>
          );
        })}
        {draft.holidays.length === 0 && <Empty>No holidays found.</Empty>}
      </div>
    </section>
  </div>
);

export default DraftSections;
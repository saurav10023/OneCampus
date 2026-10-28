import { useState } from "react";
import { X } from "lucide-react";
import * as endpoints from "../api/endpoints";
import { subjectsApi, eventsApi, errMsg, toDateInput } from "../api/endpoints";
import { WEEKDAYS } from "../lib/dates";
import { Alert } from "./Ui";
import { FormModal } from "./FormKit";
import { ocr, parseTimetable, parseHolidays } from "../lib/imageImport";

const COLORS = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6", "#14B8A6"]; // same as SubjectsTab
const MAX_FILE_MB = 15;
const CLASS_TYPES = ["lecture", "lab", "tutorial"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const inp = "h-9 w-full rounded-xl bg-white/70 border border-white/80 px-2.5 text-[13.5px] text-[#161827] focus:outline-none focus:ring-2 focus:ring-indigo-500/40";

/* ---------- WEEKLY CLASSES: the one place to adapt ----------
   I have not seen the student-side weekly-class API. This looks for one on api/endpoints
   (rulesApi, recurringRulesApi or classesApi) and sends the same fields the official rules use.
   If your API or field names differ, change only this block. */
const classApi = endpoints.rulesApi || endpoints.recurringRulesApi || endpoints.classesApi || null;
const createClass = (setupId, subjectId, c) =>
  classApi.create(setupId, {
    subjectId,
    weekday: Number(c.weekday),
    startTime: c.startTime,
    endTime: c.endTime,
    classType: c.classType,
    room: (c.room || "").trim(),
    professor: (c.professor || "").trim(),
    attendanceUnits: 1,
  });

const ImportToSetup = ({ open, onClose, setup, onDone }) => {
  const setupId = setup?._id;
  const semStart = toDateInput(setup?.startDate);
  const semEnd = toDateInput(setup?.endDate);

  const [ttFile, setTtFile] = useState(null);
  const [holFile, setHolFile] = useState(null);
  const [draft, setDraft] = useState(null); // { subjects, classes, holidays }
  const [notes, setNotes] = useState([]);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    setTtFile(null);
    setHolFile(null);
    setDraft(null);
    setNotes([]);
    setError("");
    onClose();
  };

  /* ---- file picker with checks ---- */
  const choose = (setter) => (e) => {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return setter(null);
    const reject = (msg) => {
      setError(msg);
      input.value = "";
      setter(null);
    };
    if (/heic|heif/i.test(`${f.type} ${f.name}`)) return reject("This photo is in HEIC format. Please take a screenshot of it, or convert it to JPG, and try again.");
    if (!f.type.startsWith("image/")) return reject("Please choose an image (JPG, PNG or WebP). PDFs are not supported.");
    if (f.size > MAX_FILE_MB * 1024 * 1024) return reject(`That image is larger than ${MAX_FILE_MB} MB. Please choose a smaller one.`);
    setError("");
    setter(f);
  };

  /* ---- step 1: read the images ---- */
  const read = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!ttFile && !holFile) return setError("Choose at least one image.");
    setBusy(true);
    setError("");
    try {
      const next = { subjects: [], classes: [], holidays: [] };
      const warn = [];
      if (ttFile) {
        setStatus("Reading timetable");
        const { words, canvas } = await ocr(ttFile, { mode: "table", onProgress: setProgress });
        const r = parseTimetable(words, canvas);
        next.subjects = r.subjects.map((s) => ({ ...s, credits: s.credits ?? "" }));
        next.classes = r.classes;
        if (r.warning) warn.push(r.warning);
      }
      if (holFile) {
        setStatus("Reading holiday list");
        const { text } = await ocr(holFile, { mode: "list", onProgress: setProgress });
        next.holidays = parseHolidays(text, semStart, semEnd);
        if (!next.holidays.length) warn.push("No holidays were found in the holiday image.");
      }
      setDraft(next);
      setNotes(warn);
    } catch (err) {
      setError(errMsg(err, "Could not read the image. Try a clearer one."));
    } finally {
      setBusy(false);
      setStatus("");
      setProgress(0);
    }
  };

  /* ---- step 2: edit the draft ---- */
  const upd = (key, id, patch) => setDraft((d) => ({ ...d, [key]: d[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const del = (key, id) => setDraft((d) => ({ ...d, [key]: d[key].filter((x) => x.id !== id) }));
  const delSubject = (id) =>
    setDraft((d) => ({ ...d, subjects: d.subjects.filter((s) => s.id !== id), classes: d.classes.filter((c) => c.subjectId !== id) }));
  const nameOf = (id) => draft.subjects.find((s) => s.id === id)?.name || "?";

  const validate = () => {
    const names = new Set();
    for (const s of draft.subjects) {
      const n = s.name.trim();
      if (!n) return "A subject has no name.";
      if (names.has(n.toLowerCase())) return `Two subjects are named "${n}". Rename or remove one.`;
      names.add(n.toLowerCase());
      const cr = String(s.credits ?? "").trim();
      if (cr !== "" && !(Number(cr) >= 0 && Number(cr) <= 30)) return `Credits for "${n}" must be a number from 0 to 30.`;
    }
    const on = draft.classes.filter((c) => c.on);
    for (const c of on) {
      if (!c.startTime || !c.endTime || c.endTime <= c.startTime) return `${nameOf(c.subjectId)} on ${WEEKDAYS[c.weekday]}: the end time must be after the start time.`;
    }
    for (let i = 0; i < on.length; i++)
      for (let j = i + 1; j < on.length; j++) {
        const a = on[i], b = on[j];
        if (a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime) {
          return `${WEEKDAYS[a.weekday]}: ${nameOf(a.subjectId)} and ${nameOf(b.subjectId)} overlap.`;
        }
      }
    for (const h of draft.holidays.filter((x) => x.on)) {
      if (!h.title.trim() || !h.startDate || !h.endDate || h.endDate < h.startDate) return `Check the holiday "${h.title || "untitled"}".`;
    }
    return "";
  };

  /* ---- step 3: save into this setup ---- */
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = validate();
    if (problem) return setError(problem);

    setBusy(true);
    setError("");
    const failed = [];
    try {
      const listSubjects = async () =>
        ((await subjectsApi.list(setupId, { limit: 100, sort: "name" })).subjects || []).filter((s) => s.isActive !== false);

      // subjects first (skip names that already exist)
      const existing = await listSubjects();
      const known = new Set(existing.map((s) => s.name.toLowerCase()));
      let count = existing.length;
      for (const s of draft.subjects) {
        if (known.has(s.name.trim().toLowerCase())) continue;
        const code = s.code.trim();
        const credits = String(s.credits ?? "").trim();
        try {
          await subjectsApi.create(setupId, {
            name: s.name.trim(),
            ...(code ? { code } : {}),
            ...(credits !== "" ? { credits: Number(credits) } : {}),
            color: COLORS[count % COLORS.length],
          });
          count++;
        } catch (err) {
          failed.push(`${s.name}: ${errMsg(err, "failed")}`);
        }
      }
      const idByName = new Map((await listSubjects()).map((s) => [s.name.toLowerCase(), s._id]));

      // weekly classes
      const doneC = new Set();
      const toAdd = draft.classes.filter((x) => x.on);
      if (toAdd.length && !classApi) {
        failed.push("Weekly classes were skipped because the classes API is not connected yet (see createClass in ImportToSetup.jsx).");
      } else {
        for (const c of toAdd) {
          const subjectId = idByName.get(nameOf(c.subjectId).trim().toLowerCase());
          if (!subjectId) {
            failed.push(`${nameOf(c.subjectId)} ${WEEKDAYS[c.weekday]}: subject was not created`);
            continue;
          }
          try {
            await createClass(setupId, subjectId, c);
            doneC.add(c.id);
          } catch (err) {
            failed.push(`${nameOf(c.subjectId)} ${WEEKDAYS[c.weekday]} ${c.startTime}: ${errMsg(err, "failed")}`);
          }
        }
      }

      // holidays become calendar events; confirm them so they start cancelling classes
      const events = await eventsApi.list(setupId).catch(() => []);
      const have = new Set((Array.isArray(events) ? events : []).map((ev) => `${toDateInput(ev.startDate)}|${(ev.title || "").toLowerCase()}`));
      const doneH = new Set();
      for (const h of draft.holidays.filter((x) => x.on)) {
        if (have.has(`${h.startDate}|${h.title.trim().toLowerCase()}`)) {
          doneH.add(h.id);
          continue;
        }
        try {
          const data = await eventsApi.create(setupId, { title: h.title.trim(), type: "holiday", startDate: h.startDate, endDate: h.endDate });
          doneH.add(h.id);
          const id = data?.event?._id || data?._id;
          if (id) await eventsApi.confirm(setupId, id).catch(() => {}); // if this fails, the Calendar tab still offers "Confirm"
        } catch (err) {
          failed.push(`${h.title}: ${errMsg(err, "failed")}`);
        }
      }

      onDone?.();
      if (!failed.length) return close();
      // keep only what failed so a retry does not create duplicates
      setDraft((d) => ({ ...d, classes: d.classes.filter((c) => !doneC.has(c.id)), holidays: d.holidays.filter((h) => !doneH.has(h.id)) }));
      setError(`Saved what worked. These need attention: ${failed.join(" | ")}`);
    } catch (err) {
      setError(errMsg(err, "Could not save. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const nClasses = draft?.classes.filter((c) => c.on).length || 0;
  const nHolidays = draft?.holidays.filter((h) => h.on).length || 0;

  return (
    <FormModal
      open={open}
      onClose={close}
      title={draft ? "Review before saving" : "Import from images"}
      size="xl"
      onSubmit={draft ? save : read}
      submitLabel={draft ? `Save ${draft.subjects.length} subjects, ${nClasses} classes, ${nHolidays} holidays` : "Read images"}
      saving={busy}
      dirty={Boolean(ttFile || holFile || draft)}
      error={error}
    >
      {!draft ? (
        <>
          {setup?.officialScheduleId && (
            <Alert type="info">
              This setup follows your CR&apos;s official schedule, which already provides the subjects, classes and holidays. Only import here to add things your CR hasn&apos;t.
            </Alert>
          )}
          <label className="block text-[14px] font-medium text-[#161827]">
            Class timetable image
            <input type="file" accept="image/*" onChange={choose(setTtFile)} className="block mt-1.5 text-[13px] w-full" />
          </label>
          <label className="block text-[14px] font-medium text-[#161827]">
            Academic holiday list image
            <input type="file" accept="image/*" onChange={choose(setHolFile)} className="block mt-1.5 text-[13px] w-full" />
          </label>
          {busy && (
            <Alert type="info">
              {status}… {Math.round(progress * 100)}%
            </Alert>
          )}
          <Alert type="info">
            Nothing is saved yet. The text is read on your device, then you check and fix it on the next screen. A straight, sharp image (JPG, PNG or WebP) with visible day names and time slots works best.
          </Alert>
        </>
      ) : (
        <div className="space-y-6">
          {notes.map((n) => (
            <Alert key={n} type="warning">{n}</Alert>
          ))}

          {/* subjects */}
          <section>
            <p className="text-[14px] font-semibold text-[#161827] mb-2">Subjects ({draft.subjects.length})</p>
            <div className="space-y-2">
              {draft.subjects.map((s) => (
                <div key={s.id} className="grid grid-cols-[1fr_80px_64px_36px] sm:grid-cols-[1fr_130px_90px_36px] gap-2 items-center">
                  <input className={inp} value={s.name} maxLength={80} onChange={(e) => upd("subjects", s.id, { name: e.target.value })} aria-label="Subject name" />
                  <input className={inp} value={s.code} maxLength={20} placeholder="Code" onChange={(e) => upd("subjects", s.id, { code: e.target.value })} aria-label="Subject code" />
                  <input className={inp} type="number" min="0" max="30" value={s.credits ?? ""} placeholder="Credits" onChange={(e) => upd("subjects", s.id, { credits: e.target.value })} aria-label="Credits" />
                  <button type="button" onClick={() => delSubject(s.id)} aria-label={`Remove ${s.name}`} className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {draft.subjects.length === 0 && <p className="text-[13px] text-[#6A6F85]">No subjects found.</p>}
            </div>
          </section>

          {/* classes */}
          <section>
            <p className="text-[14px] font-semibold text-[#161827] mb-2">Weekly classes ({draft.classes.length})</p>
            <div className="space-y-2">
              {draft.classes.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-2xl bg-white/60 border border-white/80 p-2.5 grid grid-cols-2 sm:grid-cols-[auto_90px_1fr_104px_104px_104px_36px] gap-2 items-center ${c.on ? "" : "opacity-50"}`}
                >
                  <input type="checkbox" checked={c.on} onChange={(e) => upd("classes", c.id, { on: e.target.checked })} aria-label="Include this class" className="w-4 h-4 justify-self-start" />
                  <select className={inp} value={c.weekday} onChange={(e) => upd("classes", c.id, { weekday: Number(e.target.value) })} aria-label="Day">
                    {ORDER.map((d) => (
                      <option key={d} value={d}>{WEEKDAYS[d]}</option>
                    ))}
                  </select>
                  <select className={`${inp} col-span-2 sm:col-span-1`} value={c.subjectId} onChange={(e) => upd("classes", c.id, { subjectId: e.target.value })} aria-label="Subject">
                    {draft.subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input type="time" className={inp} value={c.startTime} onChange={(e) => upd("classes", c.id, { startTime: e.target.value })} aria-label="Start" />
                  <input type="time" className={inp} value={c.endTime} onChange={(e) => upd("classes", c.id, { endTime: e.target.value })} aria-label="End" />
                  <select className={inp} value={c.classType} onChange={(e) => upd("classes", c.id, { classType: e.target.value })} aria-label="Type">
                    {CLASS_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => del("classes", c.id)} aria-label="Remove class" className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50 justify-self-end">
                    <X className="w-4 h-4" />
                  </button>
                  <input className={`${inp} sm:col-start-3 sm:col-span-2`} value={c.room || ""} maxLength={30} placeholder="Room" onChange={(e) => upd("classes", c.id, { room: e.target.value })} aria-label="Room" />
                  <input className={`${inp} sm:col-span-3`} value={c.professor || ""} maxLength={80} placeholder="Professor" onChange={(e) => upd("classes", c.id, { professor: e.target.value })} aria-label="Professor" />
                </div>
              ))}
              {draft.classes.length === 0 && <p className="text-[13px] text-[#6A6F85]">No classes found.</p>}
            </div>
          </section>

          {/* holidays */}
          <section>
            <p className="text-[14px] font-semibold text-[#161827] mb-2">Holidays ({draft.holidays.length})</p>
            <div className="space-y-2">
              {draft.holidays.map((h) => {
                const out = h.startDate < semStart || h.endDate > semEnd;
                return (
                  <div
                    key={h.id}
                    className={`rounded-2xl bg-white/60 border border-white/80 p-2.5 grid grid-cols-2 sm:grid-cols-[auto_1fr_140px_140px_36px] gap-2 items-center ${h.on ? "" : "opacity-50"}`}
                  >
                    <input type="checkbox" checked={h.on} onChange={(e) => upd("holidays", h.id, { on: e.target.checked })} aria-label="Include this holiday" className="w-4 h-4 justify-self-start" />
                    <input className={`${inp} col-span-2 sm:col-span-1 order-last sm:order-none`} value={h.title} maxLength={120} onChange={(e) => upd("holidays", h.id, { title: e.target.value })} aria-label="Title" />
                    <input
                      type="date"
                      className={inp}
                      value={h.startDate}
                      onChange={(e) => upd("holidays", h.id, { startDate: e.target.value, endDate: h.endDate < e.target.value ? e.target.value : h.endDate })}
                      aria-label="Start date"
                    />
                    <input type="date" className={inp} min={h.startDate} value={h.endDate} onChange={(e) => upd("holidays", h.id, { endDate: e.target.value })} aria-label="End date" />
                    <button type="button" onClick={() => del("holidays", h.id)} aria-label="Remove holiday" className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50 justify-self-end">
                      <X className="w-4 h-4" />
                    </button>
                    {out && <p className="col-span-2 sm:col-span-5 text-[12px] text-amber-700">Outside the semester dates, so it is unchecked.</p>}
                  </div>
                );
              })}
              {draft.holidays.length === 0 && <p className="text-[13px] text-[#6A6F85]">No holidays found.</p>}
            </div>
          </section>
        </div>
      )}
    </FormModal>
  );
};

export default ImportToSetup;
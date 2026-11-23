import { useState } from "react";
import * as endpoints from "../api/endpoints";
import { subjectsApi, eventsApi, errMsg, toDateInput } from "../api/endpoints";
import { WEEKDAYS } from "../lib/dates";
import { Alert } from "./Ui";
import { FormModal } from "./FormKit";
import DraftSections from "./DraftSections";
import { ocr, parseTimetable, parseHolidays } from "../lib/imageImport";

const COLORS = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6", "#14B8A6"]; // same as SubjectsTab
const MAX_FILE_MB = 15;

const fileCls =
  "block mt-1.5 w-full min-w-0 text-[13px] text-[color:var(--body)] " +
  "file:mr-3 file:h-10 file:px-4 file:rounded-xl file:border file:border-[color:var(--line)] file:bg-[color:var(--surface)] " +
  "file:text-[13px] file:font-medium file:text-[color:var(--ink)] hover:file:bg-[color:var(--inset)] file:cursor-pointer";

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
          <label className="block text-[13px] font-medium text-[color:var(--body)]">
            Class timetable image
            <input type="file" accept="image/*" onChange={choose(setTtFile)} className={fileCls} />
          </label>
          <label className="block text-[13px] font-medium text-[color:var(--body)]">
            Academic holiday list image
            <input type="file" accept="image/*" onChange={choose(setHolFile)} className={fileCls} />
          </label>
          {busy && (
            <Alert type="info">
              <span className="tabular-nums">{status}… {Math.round(progress * 100)}%</span>
            </Alert>
          )}
          <Alert type="info">
            Nothing is saved yet. The text is read on your device, then you check and fix it on the next screen. A straight, sharp image (JPG, PNG or WebP) with visible day names and time slots works best.
          </Alert>
        </>
      ) : (
        <>
          {notes.map((n) => (
            <Alert key={n} type="warning">{n}</Alert>
          ))}
          <DraftSections
            draft={draft}
            upd={upd}
            del={del}
            delSubject={delSubject}
            semStart={semStart}
            semEnd={semEnd}
            withCredits
            holidayTitleMax={120}
          />
        </>
      )}
    </FormModal>
  );
};

export default ImportToSetup;
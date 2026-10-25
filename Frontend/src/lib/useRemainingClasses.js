import { useEffect, useState } from "react";
import { errMsg, occurrencesApi } from "../api/endpoints";

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);

// "Today" in the setup's own time zone, as YYYY-MM-DD (not the phone's).
const todayIn = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Kolkata" }).format(new Date());

// Works whether the api wrapper returns the envelope, the data object, or the array itself.
const listOf = (res) => {
  if (Array.isArray(res)) return res;
  for (const x of [res, res?.data, res?.data?.data]) {
    if (Array.isArray(x?.occurrences)) return x.occurrences;
  }
  return [];
};

const subjectIdOf = (o) => {
  const s = o?.subject;
  const id = (s && typeof s === "object" ? s.id ?? s._id : s) ?? o?.subjectId;
  return id == null ? null : String(typeof id === "object" ? id._id ?? id.id : id);
};

/**
 * Class units still to happen, per subject id, from today to the setup's end date.
 *
 * The server turns holidays, mass bunks and cancelled classes into status "cancelled",
 * so keeping only status "pending" leaves them out. Draft (unconfirmed) holidays cancel
 * nothing, so those classes still count.
 *
 * The occurrences endpoint allows at most 93 days per call, so the semester is fetched
 * in 90-day chunks. Filtering by status happens here, so it works even if the endpoint
 * ignores or rejects a `status` query.
 *
 * Returns { status: "loading" | "ready" | "error", bySubject, total, message }
 */
export const useRemainingClasses = (setup) => {
  const [state, setState] = useState({ status: "loading", bySubject: {}, total: 0, message: "" });

  useEffect(() => {
    let dead = false;
    setState((s) => ({ ...s, status: "loading" }));

    (async () => {
      try {
        const today = todayIn(setup.timezone);
        const start = iso(new Date(setup.startDate));
        const end = iso(new Date(setup.endDate));
        const from = today > start ? today : start;
        const bySubject = {};
        let total = 0;

        if (from <= end) {
          let cursor = new Date(`${from}T00:00:00Z`);
          const last = new Date(`${end}T00:00:00Z`);
          while (cursor <= last) {
            const chunkEnd = new Date(Math.min(cursor.getTime() + 89 * DAY, last.getTime()));
            const res = await occurrencesApi.range(setup._id, { from: iso(cursor), to: iso(chunkEnd) });
            for (const o of listOf(res)) {
              if (o.status !== "pending") continue;
              const units = Number(o.attendanceUnits) || 1;
              total += units;
              const id = subjectIdOf(o);
              if (id) bySubject[id] = (bySubject[id] || 0) + units;
            }
            cursor = new Date(chunkEnd.getTime() + DAY);
          }
        }
        if (!dead) setState({ status: "ready", bySubject, total, message: "" });
      } catch (e) {
        console.error("Could not load remaining classes", e);
        if (!dead) setState({ status: "error", bySubject: {}, total: 0, message: errMsg(e, "Request failed") });
      }
    })();

    return () => {
      dead = true;
    };
  }, [setup._id, setup.startDate, setup.endDate, setup.timezone]);

  return state;
};
// One-off: give existing setups a scopeKey. Safe to run more than once.
// Usage: MONGO_URI=... node scripts/backfillScopeKey.js
import mongoose from 'mongoose';
import Setup from '../models/TimeTable/setup.model.js'
import { buildScopeKey } from '../utils/scopeKey.js'; // CHECK PATH

await mongoose.connect(process.env.MONGO_URI);

const cursor = Setup.find({}).select('academicYear semesterLabel branch section scopeKey').lean().cursor();
const ops = [];
let changed = 0;

for await (const s of cursor) {
  const key = buildScopeKey(s);
  if (s.scopeKey !== key) {
    ops.push({ updateOne: { filter: { _id: s._id }, update: { $set: { scopeKey: key } } } });
    changed++;
  }
  if (ops.length >= 500) await Setup.bulkWrite(ops.splice(0), { timestamps: false });
}
if (ops.length) await Setup.bulkWrite(ops, { timestamps: false });

console.log(`scopeKey updated on ${changed} setup(s)`);
await mongoose.disconnect();
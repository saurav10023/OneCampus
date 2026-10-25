import mongoose from 'mongoose';
import Setup from '../models/TimeTable/setup.model.js';
import { syncSetup } from '../services/officialSync.service.js';

// One sync per setup at a time: parallel GETs (day view, attendance, subjects) share it
const running = new Map();
const syncOnce = (setup) => {
  const key = String(setup._id);
  if (!running.has(key)) {
    running.set(key, syncSetup({ setup }).finally(() => running.delete(key)));
  }
  return running.get(key);
};

// Never fails the request: if the sync breaks, the error is logged and the read goes on.
const syncOnRead = async (req, res, next) => {
  try {
    let setup = req.setup;
    if (!setup && mongoose.isValidObjectId(req.params?.setupId) && req.user?._id) {
      setup = await Setup.findOne({ _id: req.params.setupId, ownerId: req.user._id });
    }
    if (setup?.officialScheduleId) {
      const result = await syncOnce(setup);
      req.officialSync = result;
      if (result?.status === 'synced' && result.updates) res.set('X-Official-Updates', String(result.updates));
      if (result?.status === 'unavailable') res.set('X-Official-Status', 'unavailable');
    }
  } catch (err) {
    console.error('Official sync failed:', err);
    req.officialSync = { status: 'failed' };
  }
  next();
};

export { syncOnRead };
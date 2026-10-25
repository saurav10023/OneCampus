import mongoose from 'mongoose';
import Setup from '../models/TimeTable/setup.model.js';
import { syncSetup } from '../services/officialSync.service.js';

// Brings a joined setup up to date with its official schedule before the request is answered.
// Put it right after loadSetup (it uses req.setup). A router that has no loadSetup, such as the
// calendar router, can use it anyway: it loads the caller's own setup from the URL.
//
// It never fails the request. If the sync breaks, the error is logged and the read goes on with
// the data as it was; the next request tries again.
const syncOnRead = async (req, res, next) => {
  try {
    let setup = req.setup;
    if (!setup && mongoose.isValidObjectId(req.params?.setupId) && req.user?._id) {
      setup = await Setup.findOne({ _id: req.params.setupId, ownerId: req.user._id });
    }
    if (setup?.officialScheduleId) {
      const result = await syncSetup({ setup });
      req.officialSync = result;
      // lets the app know there is something new to show without changing any response body
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
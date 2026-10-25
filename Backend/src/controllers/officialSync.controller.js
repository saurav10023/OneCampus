import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import { syncSetup, listOfficialUpdates } from '../services/officialSync.service.js';

// Thin handlers. req.setup is the caller's own setup (loadSetup).

// Runs the sync now and says what it did. The sync also runs by itself on every read.
const syncNow = asyncHandler(async (req, res) => {
  const result = (await syncSetup({ setup: req.setup })) ?? { status: 'not_joined' };
  return res.status(200).json(new ApiResponse(200, { sync: result }, 'Sync finished'));
});

const updates = asyncHandler(async (req, res) => {
  const result = await listOfficialUpdates({ setup: req.setup, query: req.validatedQuery });
  return res.status(200).json(new ApiResponse(200, result, 'Official updates fetched successfully'));
});

export { syncNow, updates };
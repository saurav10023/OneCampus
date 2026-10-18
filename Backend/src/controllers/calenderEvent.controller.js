import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import Setup from '../models/TimeTable/setup.model.js';
import CalendarEvent from '../models/Calendar/calendarEvent.model.js';
import { EVENT_SOURCE } from '../utils/constants.js';
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  confirmEvent,
} from '../services/calendarEvent.service.js';

// Turns database errors into clean HTTP errors; everything else goes to your error middleware
const toApiError = (err) => {
  if (err instanceof ApiError) return err;
  if (err?.name === 'ValidationError' && err.errors) {
    return new ApiError(
      400,
      'Validation failed',
      Object.values(err.errors).map((e) => `${e.path}: ${e.message}`)
    );
  }
  if (err?.code === 11000) return new ApiError(409, 'This event already exists');
  return err;
};

const guard = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    throw toApiError(err);
  }
};

// The setup must belong to the caller. Anything else is a 404, never a 403, so ids cannot be probed.
const getOwnedSetup = async (req) => {
  const { setupId } = req.params;
  if (!mongoose.isValidObjectId(setupId)) throw new ApiError(404, 'Setup not found');
  const setup = await Setup.findOne({ _id: setupId, ownerId: req.user._id });
  if (!setup) throw new ApiError(404, 'Setup not found');
  return setup;
};

const assertWritable = (setup) => {
  // An archived setup is read-only
  if (setup.status === 'archived') {
    throw new ApiError(409, 'An archived setup cannot be changed');
  }
};

// Loads the event inside the caller's setup. Official events are read-only for students.
const getEditableEvent = async (req, setup) => {
  const { eventId } = req.params;
  if (!mongoose.isValidObjectId(eventId)) throw new ApiError(404, 'Event not found');
  const event = await CalendarEvent.findOne({ _id: eventId, setupId: setup._id });
  if (!event) throw new ApiError(404, 'Event not found');
  if (event.source === EVENT_SOURCE.OFFICIAL) {
    throw new ApiError(
      403,
      'Official calendar events cannot be changed. Add your own event instead.'
    );
  }
  return event;
};

const list = asyncHandler(async (req, res) => {
  const setup = await getOwnedSetup(req);
  // Lifecycle Section 3: the sync-on-read middleware runs before this handler
  const events = await listEvents(setup, req.validated?.query);
  return res.status(200).json(new ApiResponse(200, { events }, 'Events fetched successfully'));
});

const create = asyncHandler(async (req, res) => {
  const setup = await getOwnedSetup(req);
  assertWritable(setup);
  const result = await guard(() =>
    createEvent({ setup, userId: req.user._id, input: req.validated.body })
  );
  return res.status(201).json(new ApiResponse(201, result, 'Event created successfully'));
});

const update = asyncHandler(async (req, res) => {
  const setup = await getOwnedSetup(req);
  assertWritable(setup);
  const event = await getEditableEvent(req, setup);
  const result = await guard(() =>
    updateEvent({ setup, userId: req.user._id, event, input: req.validated.body })
  );
  return res.status(200).json(new ApiResponse(200, result, 'Event updated successfully'));
});

const remove = asyncHandler(async (req, res) => {
  const setup = await getOwnedSetup(req);
  assertWritable(setup);
  const event = await getEditableEvent(req, setup);
  const result = await guard(() => deleteEvent({ setup, userId: req.user._id, event }));
  return res.status(200).json(new ApiResponse(200, result, 'Event deleted successfully'));
});

const confirm = asyncHandler(async (req, res) => {
  const setup = await getOwnedSetup(req);
  assertWritable(setup);
  const event = await getEditableEvent(req, setup);
  const result = await guard(() => confirmEvent({ setup, userId: req.user._id, event }));
  return res.status(200).json(new ApiResponse(200, result, 'Event confirmed successfully'));
});

export { list, create, update, remove, confirm };
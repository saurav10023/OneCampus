// Loads every model once. Import this file from your server entry, before the app starts:
//   import './models/index.js';
//
// Two things depend on it:
//  - mongoose.models.ScheduleSubject (used by officialOverride.service) is empty until the model
//    file has been loaded.
//  - syncIndexes() only builds indexes for models that have been loaded.

// Student side
import Setup from './TimeTable/setup.model.js';
import Subject from './TimeTable/subject.model.js';
import RecurringRule from './TimeTable/recurringRule.model.js';
import Occurrence from './Schedule/occurrence.model.js';
import OccurrenceStatus from './Attendance/occurrenceStatus.model.js';
import CalendarEvent from './Calendar/calendarEvent.model.js';

// Official side
import OfficialSchedule from './Official/officialSchedule.model.js';
import ScheduleSubject from './Official/scheduleSubject.model.js';
import ScheduleRule from './Official/scheduleRule.model.js';
import ScheduleItem from './Official/scheduleItem.model.js';
import ScheduleAction from './Official/scheduleAction.model.js';
import ScheduleRole from './Official/scheduleRole.model.js';

// TODO: add the models whose paths I have not seen, so they are loaded and indexed too:
//   User, ExtraClassAdjustment, ImportJob (referenced by CalendarEvent), and any others.

export {
  Setup,
  Subject,
  RecurringRule,
  Occurrence,
  OccurrenceStatus,
  CalendarEvent,
  OfficialSchedule,
  ScheduleSubject,
  ScheduleRule,
  ScheduleItem,
  ScheduleAction,
  ScheduleRole,
};
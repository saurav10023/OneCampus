import { Card, toIso } from "./Shared";
import NextUpHero from "./NextUpHero";
import ScheduleCard from "./ScheduleCard";
import AttendanceCard from "./AttendanceCard";
import SkipPlanner from "./SkipPlanner";
import { WeekCard, EventsCard, OfficialCard } from "./CalendarPanels";

/* One view for both audiences: live data for users, sample data for visitors.
   Mobile order: hero, schedule, attendance, skip planner, week, coming up, updates. */
export default function DashboardView({ vm, remaining, note, onMark, onReadAll, onLoadDay }) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <NextUpHero vm={vm} />
      <div className="grid lg:grid-cols-12 gap-3 sm:gap-4">
        <div className="lg:col-span-7 [&>*]:h-full">
          {vm.today
            ? <ScheduleCard today={vm.today} days={vm.days || []} events={vm.events || []} note={note} onMark={onMark} onLoadDay={onLoadDay} demo={vm.demo} />
            : <Card className="p-5 text-[13.5px] text-[#6A6F85]">Today's classes could not be loaded.</Card>}
        </div>
        <div className="lg:col-span-5"><AttendanceCard att={vm.att} target={vm.target} demo={vm.demo} /></div>
      </div>
      <SkipPlanner att={vm.att} target={vm.target} remaining={remaining} />
      {vm.week?.length > 0 && <WeekCard week={vm.week} demo={vm.demo} />}
      <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
        <EventsCard events={vm.events || []} today={vm.today?.date || toIso(new Date())} demo={vm.demo} />
        <OfficialCard official={vm.official} onReadAll={onReadAll} demo={vm.demo} />
      </div>
    </div>
  );
}
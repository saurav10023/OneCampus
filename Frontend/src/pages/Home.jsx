import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, Card } from "../components/Ui";

const features = [
  { icon: CalendarDays, title: "Weekly timetable", text: "Build a setup once; classes are generated for the whole semester." },
  { icon: CheckCircle2, title: "Honest attendance", text: "Mark present or absent, and holidays are handled for you." },
  { icon: Users, title: "Share with classmates", text: "Publish your setup so others can take their own copy." },
];

const Home = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-6xl mx-auto px-4 pt-16 pb-20">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-[40px] sm:text-[56px] font-semibold tracking-tight leading-[1.05] text-[#161827]">
          Your campus life, <span className="bg-gradient-to-r from-[#4F46E5] to-[#0EA5E9] bg-clip-text text-transparent">organised</span>.
        </h1>
        <p className="text-[16px] text-[#6A6F85] mt-5">
          Timetables, attendance and academic calendars in one clean place.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          {user ? (
            <Link to="/dashboard"><Button>Open dashboard</Button></Link>
          ) : (
            <>
              <Link to="/register"><Button>Get started</Button></Link>
              <Link to="/login"><Button variant="glass">Log in</Button></Link>
            </>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5 mt-16">
        {features.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="p-6">
            <span className="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </span>
            <h3 className="text-[16px] font-semibold text-[#161827] mt-4">{title}</h3>
            <p className="text-[14px] text-[#6A6F85] mt-1.5">{text}</p>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Home;
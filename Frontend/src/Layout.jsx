import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

// Soft gradient + blurred colour blobs so the glass surfaces have something to refract.
const Layout = () => (
  <div className="relative min-h-screen flex flex-col bg-gradient-to-br from-[#F4F6FF] via-[#EEF3FF] to-[#EAF6FF] overflow-x-clip">
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0">
      <div className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-indigo-300/35 blur-3xl" />
      <div className="absolute top-1/3 -right-32 w-[460px] h-[460px] rounded-full bg-sky-300/35 blur-3xl" />
      <div className="absolute -bottom-40 left-1/4 w-[420px] h-[420px] rounded-full bg-violet-300/25 blur-3xl" />
    </div>

    <Navbar />
    <main className="relative z-10 flex-1">
      <Outlet />
    </main>
    <Footer></Footer>
  </div>
);

export default Layout;
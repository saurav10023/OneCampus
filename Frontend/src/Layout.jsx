import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

// Flat page shell: one soft grey background, white cards on top. No gradient, no blobs.
// The desktop sidebar (in Navbar) offsets the page by padding <body>, so nothing is needed here for it.
const Layout = () => (
  <div className="relative min-h-screen flex flex-col bg-[color:var(--inset)] text-[color:var(--ink)] overflow-x-clip">
    {/* keyboard users can jump past the navigation */}
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-xl focus:bg-[color:var(--surface)] focus:border focus:border-[color:var(--line)] focus:px-4 focus:py-2.5 focus:text-[14px] focus:font-medium focus:text-[color:var(--ink)] focus:shadow-[0_8px_24px_-14px_rgba(27,31,51,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      Skip to content
    </a>

    <Navbar />
    <main id="main" tabIndex={-1} className="relative z-10 flex-1 focus:outline-none">
      <Outlet />
    </main>
    <Footer />
  </div>
);

export default Layout;
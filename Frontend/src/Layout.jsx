
import React from "react";
import { Outlet } from "react-router-dom";
import ScrollToTop from "./ScrollToTop";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

function Layout() {
  return (
    <>
      <ScrollToTop />
      <Navbar />
      <Outlet />
      <Footer />
    </>
  );
}

export default Layout;


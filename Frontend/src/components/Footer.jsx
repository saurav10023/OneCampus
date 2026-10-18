// src/components/Footer.jsx
// "Liquid glass" footer: soft colour blobs sit behind a frosted, specular
// glass panel (backdrop-blur + saturate + inner highlights). Links and
// contact rows are small glass chips of their own.

import { Link } from "react-router-dom";
import { MapPin, MessageCircle, Mail, Phone } from "lucide-react";
import logo from "../assets/logo.PNG";
import { useCategories } from "../hooks/useCategories";
import { SITE, whatsappLink } from "../lib/site";

// reusable glass utility strings
const glassChip =
  "rounded-full border border-white/70 bg-white/35 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-all duration-200 hover:bg-white/70 hover:-translate-y-0.5";
const glassRow =
  "flex items-center gap-3 rounded-2xl border border-white/60 bg-white/30 backdrop-blur-md px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors hover:bg-white/55";
const heading = "text-[11px] font-medium uppercase tracking-[0.2em] text-ink/70 mb-4";

const Footer = () => {
  const { categories } = useCategories();

  return (
    <footer className="relative overflow-hidden bg-gradient-to-b from-paper via-[#EADFC9] to-[#DACBAC] pt-20 pb-6">
      {/* colour the glass can refract */}
      <div aria-hidden className="pointer-events-none absolute -left-24 top-8 h-80 w-80 rounded-full bg-moss/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-[-6rem] top-24 h-96 w-96 rounded-full bg-clay/45 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute left-1/3 bottom-[-6rem] h-72 w-96 rounded-full bg-[#C9B48A]/60 blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-10">
        {/* main glass panel */}
        <div className="relative overflow-hidden rounded-[36px] border border-white/60 bg-white/30 backdrop-blur-2xl backdrop-saturate-[1.6] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(255,255,255,0.25),0_30px_80px_-30px_rgba(42,37,31,0.5)]">
          {/* specular sheen + top edge highlight */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/55 via-transparent to-white/10" />
          <div aria-hidden className="pointer-events-none absolute -top-px left-12 right-12 h-px bg-gradient-to-r from-transparent via-white to-transparent" />

          <div className="relative p-7 sm:p-12">
            <div className="grid gap-12 md:grid-cols-[1.3fr_1fr_1.2fr]">
              {/* Brand */}
              <div className="max-w-sm">
                <Link to="/" className="inline-flex items-center gap-3">
                  <span className="w-12 h-12 rounded-full bg-white/90 ring-1 ring-white overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                    <img src={logo} alt="Galaxy Furniture" className="w-full h-full object-cover" />
                  </span>
                  <span className="font-serif text-[26px] font-semibold tracking-[0.02em] leading-none text-ink">
                    GALAXY <span className="text-clay italic font-medium">Furniture</span>
                  </span>
                </Link>
                <p className="mt-5 text-[14.5px] leading-relaxed text-ink/70">
                  Sofas, beds and finishing pieces with real dimensions, real materials and honest
                  prices — made to sit well in everyday rooms.
                </p>
                <a
                  href={whatsappLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-moss text-paper text-[14px] font-medium px-6 py-3 shadow-[0_14px_30px_-14px_rgba(57,58,34,0.8)] transition-all hover:bg-moss-dark hover:-translate-y-0.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  Chat on WhatsApp
                </a>
              </div>

              {/* Shop chips */}
              <nav aria-label="Shop">
                <h4 className={heading}>Shop</h4>
                <div className="flex flex-wrap gap-2.5">
                  <Link to="/shop" className={`${glassChip} px-4 py-2 text-[13.5px] font-medium text-ink`}>
                    All pieces
                  </Link>
                  {categories.slice(0, 8).map((c) => (
                    <Link
                      key={c._id || c.slug}
                      to={`/shop?category=${c.slug}`}
                      className={`${glassChip} px-4 py-2 text-[13.5px] text-ink/80 hover:text-ink`}
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </nav>

              {/* Visit */}
              <div>
                <h4 className={heading}>Visit the showroom</h4>
                <div className="space-y-2.5 text-[14px] text-ink/80">
                  <a href={SITE.mapsHref} target="_blank" rel="noopener noreferrer" className={`${glassRow} items-start`}>
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-moss" />
                    <span>
                      {SITE.address.map((l) => (
                        <span key={l} className="block">{l}</span>
                      ))}
                    </span>
                  </a>
                  <a href={SITE.phoneHref} className={glassRow}>
                    <Phone className="w-4 h-4 shrink-0 text-moss" />
                    {SITE.phone}
                  </a>
                  <a href={`mailto:${SITE.email}`} className={glassRow}>
                    <Mail className="w-4 h-4 shrink-0 text-moss" />
                    <span className="break-all">{SITE.email}</span>
                  </a>
                </div>
              </div>
            </div>

            {/* bottom bar */}
            <div className="mt-12 pt-6 border-t border-white/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-[12.5px] text-ink/60">
                © {new Date().getFullYear()} Galaxy Furniture. All rights reserved.
              </p>
              <div className="flex items-center gap-5 text-[12.5px] text-ink/60">
                <Link to="/contact" className="hover:text-moss transition-colors">Contact</Link>
                <Link to="/login" className="hover:text-moss transition-colors">Staff login</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
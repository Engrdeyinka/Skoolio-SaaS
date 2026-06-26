import React, { useState, useEffect } from "react";
import { BRAND } from "@/config/brand";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, BookOpen, GraduationCap, Menu, X,
  CheckCircle2, Trophy, Heart, Lightbulb, Users,
  Music, Dumbbell, Microscope, Globe2, Phone, MapPin,
  Mail, Star, ShieldCheck, Cpu, PenLine, LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { getLagosYear } from "@/lib/timezone";

/* ── constants ──────────────────────────────────────────────────────── */
const GOLD       = "#C9A44A";
const GOLD_DIM   = "#8A6E2F";
const DEFAULT_SCHOOL_NAME = BRAND.schoolName;
const MOTTO = "Excellence · Integrity · Service";

const PLACEHOLDER_SLIDES = [
  "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=80",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1600&q=80",
  "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=1600&q=80",
  "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1600&q=80",
];

/* ── helpers ─────────────────────────────────────────────────────────── */
const GoldLine = () => (
  <div className="w-10 h-0.5 mt-3 mb-5" style={{ backgroundColor: GOLD }} />
);

const EyeBrow = ({ children }) => (
  <p className="text-[11px] font-bold uppercase tracking-[0.35em] mb-2" style={{ color: GOLD }}>
    {children}
  </p>
);

/* ── component ───────────────────────────────────────────────────────── */
export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  const { schoolLogoUrl, schoolName, schoolAddress, schoolPhone, schoolEmail, heroImages } =
    useSchoolSettings();

  const [menuOpen,       setMenuOpen]       = useState(false);
  const [scrolled,       setScrolled]       = useState(false);
  const [slideIndex,     setSlideIndex]     = useState(0);
  const [activeSection,  setActiveSection]  = useState(null); // null | "about" | "life"
  const sectionRef = React.useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const slides = heroImages?.length > 0 ? heroImages : PLACEHOLDER_SLIDES;
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setSlideIndex(i => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  useEffect(() => {
    if (activeSection && sectionRef.current) {
      setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [activeSection]);

  const openSection = (key) => {
    setActiveSection(prev => prev === key ? null : key);
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) {
      const role = user?.school_role;
      if (!role)                   window.location.href = "/Onboarding";
      else if (role === "student") window.location.href = "/StudentDashboard";
      else                         window.location.href = "/Dashboard";
    }
  }, [isAuthenticated, isLoadingAuth, user]);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-4 border-stone-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const displayName    = schoolName    || DEFAULT_SCHOOL_NAME;
  const displayAddress = schoolAddress || "";
  const displayPhone   = schoolPhone   || "";
  const displayEmail   = schoolEmail   || "";

  const featureCards = [
    {
      eyebrow: "Academics",
      title: "Rigorous Curriculum",
      desc: "JSS 1 through SSS 3 — preparing students for WAEC, NECO, JAMB and beyond.",
      cta: "VIEW CURRICULUM",
      action: () => openSection("about"),
    },
    {
      eyebrow: "Student Life",
      title: "Beyond the Classroom",
      desc: "Sports, arts, debates, digital learning, and leadership programmes that shape character.",
      cta: "EXPLORE ACTIVITIES",
      action: () => openSection("life"),
    },
    {
      eyebrow: "School Portal",
      title: "Access Your Account",
      desc: "Results, attendance, timetable, payments — everything in one secure portal.",
      cta: "SIGN IN",
      href: null,
      action: () => navigate("/Login"),
    },
  ];

  const whyUs = [
    { icon: Trophy,      title: "Proven Results",       desc: "Consistent WAEC & JAMB performance, with students gaining admissions to top universities." },
    { icon: Heart,       title: "Caring Environment",   desc: "Every child is known by name. Our teachers invest personally in each student's wellbeing." },
    { icon: Lightbulb,   title: "Beyond the Classroom", desc: "Clubs, sports, arts, and leadership ensure every student finds their unique strength." },
    { icon: ShieldCheck, title: "Safe & Structured",    desc: "A disciplined, respectful culture where students thrive in a secure environment." },
    { icon: Users,       title: "Dedicated Teachers",   desc: "Qualified educators passionate about teaching and committed to your child's future." },
    { icon: Star,        title: "Holistic Development", desc: "Academic, moral, social, and physical growth for a fulfilled life." },
  ];

  const activities = [
    { icon: Dumbbell,   title: "Sports & Athletics",  desc: "Football, basketball, athletics, and inter-house competitions." },
    { icon: Music,      title: "Arts & Culture",       desc: "Music, drama, dance, and visual arts that build creativity and confidence." },
    { icon: Microscope, title: "Science & Innovation", desc: "Laboratory sessions and technology projects that inspire curiosity." },
    { icon: Globe2,     title: "Debates & Leadership", desc: "Public speaking, quiz competitions, and student council programmes." },
    { icon: BookOpen,   title: "Reading & Library",    desc: "A well-stocked library and reading culture that broadens horizons." },
    { icon: Cpu,        title: "Digital Learning",     desc: "Computer literacy and digital skills woven into daily learning." },
  ];

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white overflow-x-hidden">

      {/* ── Navbar ───────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 ${
        scrolled ? "bg-[#0e0e0e]/95 backdrop-blur-md border-b border-white/5" : "bg-transparent"
      }`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-sm overflow-hidden flex-shrink-0 border"
                style={{ borderColor: GOLD_DIM }}>
                {schoolLogoUrl
                  ? <img src={schoolLogoUrl} alt={displayName} className="w-full h-full object-cover" />
                  : (
                    <div className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: "#1a1508" }}>
                      <GraduationCap className="w-4 h-4" style={{ color: GOLD }} />
                    </div>
                  )
                }
              </div>
              <div>
                <p className="font-bold text-xs tracking-wide text-white leading-tight">
                  {displayName.split(" ").slice(0, 2).join(" ").toUpperCase()}
                </p>
                <p className="text-[9px] tracking-[0.25em] uppercase" style={{ color: GOLD }}>
                  {displayName.split(" ").slice(2).join(" ") || "Private School"}
                </p>
              </div>
            </div>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-8">
              {[
                { label: "About",        key: "about" },
                { label: "Student Life", key: "life"  },
              ].map(({ label, key }) => (
                <button key={label} onClick={() => openSection(key)}
                  className="text-xs font-semibold uppercase tracking-[0.2em] transition-colors"
                  style={{ color: activeSection === key ? GOLD : "rgba(255,255,255,0.5)" }}>
                  {label}
                </button>
              ))}
              <button
                onClick={() => navigate("/Login")}
                className="text-xs font-bold uppercase tracking-[0.2em] px-5 py-2.5 border transition-colors"
                style={{ borderColor: GOLD, color: GOLD }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = GOLD; e.currentTarget.style.color = "#0e0e0e"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = GOLD; }}
              >
                School Portal
              </button>
            </div>

            {/* Mobile toggle */}
            <button className="md:hidden p-2" onClick={() => setMenuOpen(o => !o)}>
              {menuOpen
                ? <X    className="w-5 h-5 text-white/70" />
                : <Menu className="w-5 h-5 text-white/70" />
              }
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-[#111] border-t border-white/5 px-5 py-5 space-y-1">
            {[{ label: "About", key: "about" }, { label: "Student Life", key: "life" }].map(({ label, key }) => (
              <button key={label}
                onClick={() => openSection(key)}
                className="block w-full text-left py-3 text-xs font-semibold uppercase tracking-[0.2em] border-b border-white/5 transition-colors"
                style={{ color: activeSection === key ? GOLD : "rgba(255,255,255,0.5)" }}>
                {label}
              </button>
            ))}
            <button
              onClick={() => navigate("/Login")}
              className="mt-4 w-full py-3 text-xs font-bold uppercase tracking-[0.2em] border"
              style={{ borderColor: GOLD, color: GOLD }}>
              Sign In to Portal
            </button>
          </div>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-between overflow-hidden"
        style={{ backgroundColor: "#050505" }}>

        {/* Slideshow background */}
        <div className="absolute inset-0">
          {slides.map((src, i) => (
            <div key={src} className="absolute inset-0 transition-opacity duration-1500"
              style={{ opacity: i === slideIndex ? 1 : 0 }}>
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {/* Heavy dark overlay — Brownson-style monochrome effect */}
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(to bottom, rgba(5,5,5,0.72) 0%, rgba(5,5,5,0.55) 40%, rgba(5,5,5,0.82) 80%, rgba(5,5,5,1) 100%)" }} />
          {/* Sepia tint for that gold/dark newspaper feel */}
          <div className="absolute inset-0 mix-blend-multiply"
            style={{ backgroundColor: "#1a1508", opacity: 0.45 }} />
        </div>

        {/* Hero text — left-aligned, uppercase */}
        <div className="relative flex-1 flex items-center">
          <div className="max-w-7xl w-full mx-auto px-5 sm:px-8 lg:px-10 pt-28 pb-12">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.5em] mb-6"
                style={{ color: GOLD }}>
                Private Secondary School &nbsp;·&nbsp; Nigeria
              </p>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black uppercase
                tracking-tight text-white leading-[1.05]">
                {displayName.split(" ").slice(0, 2).join(" ")}
                <br />
                <span style={{ color: GOLD }}>
                  {displayName.split(" ").slice(2).join(" ") || "Private School"}
                </span>
              </h1>

              <div className="mt-5 mb-6 w-16 h-px" style={{ backgroundColor: GOLD }} />

              <p className="text-xs sm:text-sm uppercase tracking-[0.35em] font-medium text-white/50">
                {MOTTO}
              </p>

              <div className="mt-9 flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate("/Login")}
                  className="group inline-flex items-center gap-3 px-7 py-3.5 text-xs font-bold
                    uppercase tracking-[0.25em] transition-all duration-200"
                  style={{ backgroundColor: GOLD, color: "#0e0e0e" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "#e8c77a"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = GOLD}
                >
                  Access Portal
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  onClick={() => openSection("about")}
                  className="inline-flex items-center gap-2 px-7 py-3.5 text-xs font-bold
                    uppercase tracking-[0.25em] border border-white/20 text-white/60
                    hover:border-white/50 hover:text-white transition-all duration-200">
                  Discover Our School
                </button>
              </div>

              {/* Contact strip */}
              {(displayPhone || displayAddress) && (
                <div className="mt-10 flex flex-wrap gap-6">
                  {displayPhone && (
                    <div className="flex items-center gap-2 text-white/35 text-xs uppercase tracking-wider">
                      <Phone className="w-3 h-3" style={{ color: GOLD }} />
                      {displayPhone}
                    </div>
                  )}
                  {displayAddress && (
                    <div className="flex items-center gap-2 text-white/35 text-xs uppercase tracking-wider">
                      <MapPin className="w-3 h-3" style={{ color: GOLD }} />
                      {displayAddress}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Slide dots */}
        {slides.length > 1 && (
          <div className="relative flex justify-center gap-2 pb-6 z-10">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setSlideIndex(i)}
                className="rounded-none transition-all duration-300"
                style={{
                  width: i === slideIndex ? 28 : 8,
                  height: 2,
                  backgroundColor: i === slideIndex ? GOLD : "rgba(255,255,255,0.25)",
                }}
              />
            ))}
          </div>
        )}

        {/* ── Three feature cards at the bottom of hero ── */}
        <div className="relative grid grid-cols-1 sm:grid-cols-3 border-t border-white/8">
          {featureCards.map((card, idx) => (
            <div key={card.eyebrow}
              className={`group relative p-7 sm:p-8 border-b sm:border-b-0 border-white/8
                ${idx < 2 ? "sm:border-r border-white/8" : ""}
                transition-all duration-300 cursor-pointer`}
              style={{ backgroundColor: idx === 2 ? "#131309" : "#0e0e0e" }}
              onClick={card.action}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#1a1508"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = idx === 2 ? "#131309" : "#0e0e0e"}
            >
              {/* Gold top border on hover */}
              <div className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ backgroundColor: GOLD }} />

              <p className="text-[10px] font-bold uppercase tracking-[0.35em] mb-3"
                style={{ color: GOLD }}>
                {card.eyebrow}
              </p>
              <h3 className="text-base font-bold uppercase tracking-wide text-white mb-3">
                {card.title}
              </h3>
              <p className="text-xs text-white/40 leading-6 mb-5">
                {card.desc}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] flex items-center gap-2"
                style={{ color: GOLD }}>
                {card.cta}
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Expandable sections (About / Student Life) ───────────────── */}
      <div ref={sectionRef}>

        {/* About */}
        {activeSection === "about" && (
          <section className="bg-[#0e0e0e] py-24 lg:py-32 border-t border-white/5 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10">

              {/* Close bar */}
              <div className="flex items-center justify-between mb-14">
                <div>
                  <EyeBrow>About Our School</EyeBrow>
                  <GoldLine />
                </div>
                <button onClick={() => setActiveSection(null)}
                  className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/30 hover:text-white transition-colors">
                  <X className="w-3.5 h-3.5" /> Close
                </button>
              </div>

              <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
                <div>
                  <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white leading-tight">
                    More Than a School —<br />
                    <span style={{ color: GOLD }}>A Community of Excellence</span>
                  </h2>
                  <p className="mt-6 text-white/45 leading-8 text-sm">
                    {displayName} is dedicated to providing every student with the highest quality education
                    in a safe, structured, and inspiring environment. We believe every child has unique gifts,
                    and our mission is to discover and develop them.
                  </p>
                  <p className="mt-4 text-white/45 leading-8 text-sm">
                    From junior secondary through SSS 3, our students receive rigorous academic training
                    alongside a rich programme of sports, arts, leadership, and life skills.
                  </p>
                  <div className="mt-8 space-y-3.5">
                    {[
                      "Strong academic foundation from JSS 1 to SSS 3",
                      "Experienced and passionate teaching staff",
                      "Character development and values-based education",
                      "Active parent-school partnership",
                      "Preparation for WAEC, NECO, JAMB, and university entry",
                    ].map(item => (
                      <div key={item} className="flex items-start gap-3">
                        <div className="w-1 h-1 rounded-full mt-2.5 flex-shrink-0" style={{ backgroundColor: GOLD }} />
                        <span className="text-sm text-white/50">{item}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => navigate("/Login")}
                    className="mt-10 inline-flex items-center gap-3 px-7 py-3.5 text-xs font-bold uppercase tracking-[0.25em] border transition-all duration-200"
                    style={{ borderColor: GOLD, color: GOLD }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = GOLD; e.currentTarget.style.color = "#0e0e0e"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = GOLD; }}
                  >
                    Access School Portal
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-px bg-white/5">
                  {whyUs.map(({ icon: Icon, title, desc }) => (
                    <div key={title}
                      className="group bg-[#0e0e0e] p-6 hover:bg-[#1a1508] transition-colors duration-300 cursor-default">
                      <div className="w-8 h-8 flex items-center justify-center mb-4 border border-white/10 group-hover:border-amber-900/50"
                        style={{ color: GOLD }}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-white mb-2">{title}</h4>
                      <p className="text-xs text-white/35 leading-6">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Student Life */}
        {activeSection === "life" && (
          <section className="bg-[#080808] py-24 lg:py-32 border-t border-white/5 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10">

              {/* Close bar */}
              <div className="flex items-center justify-between mb-10">
                <div>
                  <EyeBrow>Student Life</EyeBrow>
                  <GoldLine />
                </div>
                <button onClick={() => setActiveSection(null)}
                  className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/30 hover:text-white transition-colors">
                  <X className="w-3.5 h-3.5" /> Close
                </button>
              </div>

              <div className="mb-16">
                <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white leading-tight max-w-xl">
                  Life Here Is<br />
                  <span style={{ color: GOLD }}>Never Dull</span>
                </h2>
                <p className="mt-4 text-white/40 text-sm leading-7 max-w-lg">
                  School life extends well beyond the classroom — activities that help every student
                  discover their passions, build friendships, and grow as individuals.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5">
                {activities.map(({ icon: Icon, title, desc }) => (
                  <div key={title}
                    className="group bg-[#080808] hover:bg-[#1a1508] transition-colors duration-300 p-8 cursor-default">
                    <div className="mb-5 w-9 h-9 flex items-center justify-center border border-white/10 group-hover:border-amber-900/50"
                      style={{ color: GOLD }}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-white mb-3">{title}</h4>
                    <p className="text-xs text-white/35 leading-6">{desc}</p>
                    <div className="mt-5 w-6 h-px" style={{ backgroundColor: GOLD_DIM }} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      </div>

      {/* ── Portal CTA ───────────────────────────────────────────────── */}
      <section className="relative border-t border-white/5 overflow-hidden"
        style={{ backgroundColor: "#111008" }}>
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: `repeating-linear-gradient(0deg, ${GOLD} 0, ${GOLD} 1px, transparent 1px, transparent 60px), repeating-linear-gradient(90deg, ${GOLD} 0, ${GOLD} 1px, transparent 1px, transparent 60px)` }} />
        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 py-16 sm:py-20
          flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
          <div>
            <EyeBrow>School Portal</EyeBrow>
            <GoldLine />
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              Already a Student<br />or Staff Member?
            </h2>
            <p className="mt-3 text-white/40 text-sm">
              Access results, attendance, timetable, fees and more.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 flex-shrink-0">
            <button
              onClick={() => navigate("/Login")}
              className="inline-flex items-center gap-3 px-7 py-3.5 text-xs font-bold uppercase
                tracking-[0.25em] transition-all duration-200"
              style={{ backgroundColor: GOLD, color: "#0e0e0e" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#e8c77a"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = GOLD}
            >
              <LogIn className="w-4 h-4" />
              Sign In to Portal
            </button>
            <button
              onClick={() => navigate("/QuickTest")}
              className="inline-flex items-center gap-3 px-7 py-3.5 text-xs font-bold uppercase
                tracking-[0.25em] border border-white/15 text-white/60
                hover:border-white/40 hover:text-white transition-all duration-200"
            >
              <PenLine className="w-4 h-4" />
              Quick Test
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="bg-[#060606] border-t border-white/5 pt-14 pb-8">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-10 border-b border-white/5">

            {/* Brand */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 overflow-hidden flex-shrink-0 border"
                  style={{ borderColor: GOLD_DIM }}>
                  {schoolLogoUrl
                    ? <img src={schoolLogoUrl} alt={displayName} className="w-full h-full object-cover" />
                    : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ backgroundColor: "#1a1508" }}>
                        <GraduationCap className="w-5 h-5" style={{ color: GOLD }} />
                      </div>
                    )
                  }
                </div>
                <div>
                  <p className="font-bold text-xs uppercase tracking-wider text-white">{displayName}</p>
                  <p className="text-[9px] uppercase tracking-[0.3em] mt-0.5" style={{ color: GOLD_DIM }}>{MOTTO}</p>
                </div>
              </div>
              <p className="text-white/30 text-xs leading-7 max-w-xs">
                Nurturing the next generation of thinkers, leaders, and innovators through academic
                excellence and holistic character development.
              </p>
              <div className="mt-5 space-y-2.5">
                {displayAddress && (
                  <div className="flex items-start gap-2 text-white/25 text-xs">
                    <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: GOLD_DIM }} />
                    <span>{displayAddress}</span>
                  </div>
                )}
                {displayPhone && (
                  <a href={`tel:${displayPhone}`} className="flex items-center gap-2 text-white/25 text-xs hover:text-white/50 transition-colors">
                    <Phone className="w-3 h-3 flex-shrink-0" style={{ color: GOLD_DIM }} />
                    {displayPhone}
                  </a>
                )}
                {displayEmail && (
                  <a href={`mailto:${displayEmail}`} className="flex items-center gap-2 text-white/25 text-xs hover:text-white/50 transition-colors">
                    <Mail className="w-3 h-3 flex-shrink-0" style={{ color: GOLD_DIM }} />
                    {displayEmail}
                  </a>
                )}
              </div>
            </div>

            {/* School links */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] mb-5" style={{ color: GOLD_DIM }}>
                School
              </p>
              <ul className="space-y-3">
                {[
                  { label: "About Us",     key: "about" },
                  { label: "Student Life", key: "life"  },
                ].map(({ label, key }) => (
                  <li key={label}>
                    <button onClick={() => openSection(key)}
                      className="text-white/30 hover:text-white text-xs uppercase tracking-wider transition-colors">
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Portal */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] mb-5" style={{ color: GOLD_DIM }}>
                Portal
              </p>
              <ul className="space-y-3">
                {[
                  { label: "Sign In",        path: "/Login"             },
                  { label: "Student Portal", path: "/StudentDashboard"  },
                  { label: "Quick Test",     path: "/QuickTest"         },
                  { label: "Create Account", path: "/Login?mode=signup" },
                ].map(({ label, path }) => (
                  <li key={label}>
                    <button onClick={() => navigate(path)}
                      className="text-white/30 hover:text-white text-xs uppercase tracking-wider transition-colors">
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-white/15 text-[10px] uppercase tracking-wider">
              © {getLagosYear()} {displayName}. All rights reserved.
            </p>
            <p className="text-white/10 text-[10px] uppercase tracking-wider">
              Powered by {BRAND.platformName}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

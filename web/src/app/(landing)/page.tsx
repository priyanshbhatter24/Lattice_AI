"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export default function LandingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  // Check auth status
  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setIsLoaded(true);
    });
  }, []);

  // Parallax effect on hero
  useEffect(() => {
    const handleScroll = () => {
      if (heroRef.current) {
        const scroll = window.scrollY;
        heroRef.current.style.transform = `translateY(${scroll * 0.3}px)`;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Intersection observer for feature animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("feature-visible");
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -100px 0px" }
    );

    const features = featuresRef.current?.querySelectorAll(".feature-card");
    features?.forEach((feature) => observer.observe(feature));

    return () => observer.disconnect();
  }, []);

  const ctaHref = isAuthenticated ? "/projects" : "/login";
  const ctaText = isAuthenticated ? "Go to Dashboard" : "Get Started";

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="nav-content">
          <div className="nav-logo">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <span className="logo-text">Location Scout</span>
          </div>
          <div className="nav-links">
            {isLoaded && (
              isAuthenticated ? (
                <Link href="/projects" className="nav-cta">Dashboard</Link>
              ) : (
                <>
                  <Link href="/login" className="nav-link">Sign In</Link>
                  <Link href="/signup" className="nav-cta">Get Started</Link>
                </>
              )
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-background" ref={heroRef}>
          <div className="hero-gradient" />
          <div className="hero-grain" />
          <div className="hero-vignette" />
        </div>

        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-dot" />
            AI-Powered Film Production
          </div>

          <h1 className="hero-title">
            <span className="title-line">Find the perfect</span>
            <span className="title-line title-accent">filming location</span>
            <span className="title-line">in minutes, not weeks</span>
          </h1>

          <p className="hero-subtitle">
            Upload your screenplay. Our AI analyzes every scene, discovers real venues,
            and negotiates availability—all before your coffee gets cold.
          </p>

          <div className="hero-cta-group">
            <Link href={ctaHref} className="cta-primary">
              {ctaText}
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
            <a href="#features" className="cta-secondary">
              See How It Works
            </a>
          </div>

          <div className="hero-stats">
            <div className="stat">
              <span className="stat-value">Agentic</span>
              <span className="stat-label">Workflow</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-value">AI</span>
              <span className="stat-label">Voice Calls</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-value">Real</span>
              <span className="stat-label">Venues</span>
            </div>
          </div>
        </div>

        {/* Decorative film elements */}
        <div className="hero-film-strip left" />
        <div className="hero-film-strip right" />
      </section>

      {/* Features Section */}
      <section id="features" className="features-section" ref={featuresRef}>
        <div className="features-header">
          <span className="section-tag">The Pipeline</span>
          <h2 className="section-title">From script to location in three acts</h2>
          <p className="section-subtitle">
            A complete workflow designed for production professionals who need results, not busywork.
          </p>
        </div>

        <div className="features-grid">
          {/* Feature 1: Script Analysis */}
          <div className="feature-card">
            <div className="feature-number">01</div>
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="feature-title">Script Analysis</h3>
            <p className="feature-description">
              Upload your screenplay PDF. Our AI extracts every scene, identifies unique locations,
              analyzes mood and requirements, and generates detailed scouting briefs.
            </p>
            <ul className="feature-list">
              <li>Automatic scene extraction</li>
              <li>Location deduplication</li>
              <li>Vibe & constraint analysis</li>
              <li>Shoot duration estimates</li>
            </ul>
          </div>

          {/* Feature 2: Location Discovery */}
          <div className="feature-card">
            <div className="feature-number">02</div>
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="feature-title">Location Discovery</h3>
            <p className="feature-description">
              Google Places API finds real venues matching each scene&apos;s requirements.
              Visual AI scores aesthetic match. Get photos, ratings, and contact info instantly.
            </p>
            <ul className="feature-list">
              <li>Google Places integration</li>
              <li>Visual vibe scoring</li>
              <li>Distance & logistics</li>
              <li>Photo galleries</li>
            </ul>
          </div>

          {/* Feature 3: AI Voice Outreach */}
          <div className="feature-card">
            <div className="feature-number">03</div>
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="feature-title">AI Voice Outreach</h3>
            <p className="feature-description">
              Our AI assistant calls venues on your behalf. It confirms availability,
              negotiates pricing, and collects manager contacts—complete with transcripts.
            </p>
            <ul className="feature-list">
              <li>Natural conversation AI</li>
              <li>Availability checking</li>
              <li>Price negotiation</li>
              <li>Call recordings & transcripts</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-card">
          <div className="cta-content">
            <h2 className="cta-title">Ready to scout smarter?</h2>
            <p className="cta-subtitle">
              Join production teams using AI to find their perfect locations.
            </p>
            <Link href={ctaHref} className="cta-button">
              {ctaText}
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
          <div className="cta-decoration">
            <div className="decoration-ring ring-1" />
            <div className="decoration-ring ring-2" />
            <div className="decoration-ring ring-3" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-logo">
            <div className="logo-icon small">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <span>Location Scout</span>
          </div>
          <p className="footer-tagline">AI-powered location scouting for film production.</p>
        </div>
      </footer>

      <style jsx>{`
        /* ═══════════════════════════════════════════════════════
           Landing Page Styles - Cinematic Editorial Aesthetic
           ═══════════════════════════════════════════════════════ */

        .landing-page {
          min-height: 100vh;
          background: #0a0908;
          color: #f5f0e8;
          overflow-x: hidden;
        }

        /* Navigation */
        .landing-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 1.25rem 2rem;
          background: linear-gradient(180deg, rgba(10, 9, 8, 0.95) 0%, rgba(10, 9, 8, 0) 100%);
        }

        .nav-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .nav-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .logo-icon {
          width: 2.25rem;
          height: 2.25rem;
          color: #c9a227;
        }

        .logo-icon.small {
          width: 1.5rem;
          height: 1.5rem;
        }

        .logo-text {
          font-family: var(--font-display), Georgia, serif;
          font-size: 1.25rem;
          font-weight: 600;
          letter-spacing: -0.02em;
        }

        .nav-links {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .nav-link {
          font-size: 0.9rem;
          color: rgba(245, 240, 232, 0.7);
          text-decoration: none;
          transition: color 0.2s;
        }

        .nav-link:hover {
          color: #f5f0e8;
        }

        .nav-cta {
          padding: 0.625rem 1.25rem;
          background: #c9a227;
          color: #0a0908;
          font-size: 0.875rem;
          font-weight: 600;
          text-decoration: none;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .nav-cta:hover {
          background: #d4af37;
          transform: translateY(-1px);
        }

        /* Hero Section */
        .hero-section {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8rem 2rem 6rem;
          overflow: hidden;
        }

        .hero-background {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        .hero-gradient {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 50% 40%, rgba(139, 58, 58, 0.15) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 70% 60%, rgba(201, 162, 39, 0.1) 0%, transparent 50%),
            linear-gradient(180deg, #0a0908 0%, #1a1612 50%, #0a0908 100%);
        }

        .hero-grain {
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          opacity: 0.04;
          pointer-events: none;
        }

        .hero-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, transparent 0%, rgba(10, 9, 8, 0.6) 100%);
        }

        .hero-film-strip {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 48px;
          background:
            repeating-linear-gradient(
              180deg,
              transparent 0px,
              transparent 16px,
              rgba(201, 162, 39, 0.1) 16px,
              rgba(201, 162, 39, 0.1) 32px
            );
          opacity: 0.5;
        }

        .hero-film-strip.left {
          left: 2rem;
          border-right: 2px solid rgba(201, 162, 39, 0.15);
        }

        .hero-film-strip.right {
          right: 2rem;
          border-left: 2px solid rgba(201, 162, 39, 0.15);
        }

        .hero-content {
          position: relative;
          z-index: 1;
          max-width: 800px;
          text-align: center;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          margin-bottom: 2rem;
          background: rgba(201, 162, 39, 0.1);
          border: 1px solid rgba(201, 162, 39, 0.3);
          border-radius: 100px;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #c9a227;
          animation: fadeInUp 0.8s ease-out;
        }

        .badge-dot {
          width: 6px;
          height: 6px;
          background: #c9a227;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        .hero-title {
          font-family: var(--font-display), Georgia, serif;
          font-size: clamp(2.5rem, 6vw, 4.5rem);
          font-weight: 500;
          line-height: 1.1;
          letter-spacing: -0.03em;
          margin-bottom: 1.5rem;
        }

        .title-line {
          display: block;
          animation: fadeInUp 0.8s ease-out backwards;
        }

        .title-line:nth-child(1) { animation-delay: 0.1s; }
        .title-line:nth-child(2) { animation-delay: 0.2s; }
        .title-line:nth-child(3) { animation-delay: 0.3s; }

        .title-accent {
          color: #c9a227;
          font-style: italic;
        }

        .hero-subtitle {
          font-size: 1.125rem;
          line-height: 1.7;
          color: rgba(245, 240, 232, 0.7);
          max-width: 600px;
          margin: 0 auto 2.5rem;
          animation: fadeInUp 0.8s ease-out 0.4s backwards;
        }

        .hero-cta-group {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
          animation: fadeInUp 0.8s ease-out 0.5s backwards;
        }

        .cta-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem 1.75rem;
          background: #c9a227;
          color: #0a0908;
          font-size: 1rem;
          font-weight: 600;
          text-decoration: none;
          border-radius: 4px;
          transition: all 0.3s;
        }

        .cta-primary :global(svg) {
          width: 1.25rem;
          height: 1.25rem;
          flex-shrink: 0;
          transition: transform 0.3s;
        }

        .cta-primary:hover {
          background: #d4af37;
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(201, 162, 39, 0.3);
        }

        .cta-primary:hover :global(svg) {
          transform: translateX(4px);
        }

        .cta-secondary {
          display: inline-flex;
          align-items: center;
          padding: 1rem 2rem;
          color: rgba(245, 240, 232, 0.8);
          font-size: 1rem;
          font-weight: 500;
          text-decoration: none;
          border: 1px solid rgba(245, 240, 232, 0.2);
          border-radius: 4px;
          transition: all 0.3s;
        }

        .cta-secondary:hover {
          border-color: rgba(245, 240, 232, 0.4);
          background: rgba(245, 240, 232, 0.05);
        }

        .hero-stats {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 2rem;
          margin-top: 4rem;
          padding-top: 2rem;
          border-top: 1px solid rgba(245, 240, 232, 0.1);
          animation: fadeInUp 0.8s ease-out 0.6s backwards;
        }

        .stat {
          text-align: center;
        }

        .stat-value {
          display: block;
          font-family: var(--font-display), Georgia, serif;
          font-size: 1.25rem;
          font-weight: 600;
          color: #c9a227;
          white-space: nowrap;
        }

        .stat-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(245, 240, 232, 0.5);
        }

        .stat-divider {
          width: 1px;
          height: 40px;
          background: rgba(245, 240, 232, 0.1);
        }

        /* Features Section */
        .features-section {
          position: relative;
          padding: 8rem 2rem;
          background: linear-gradient(180deg, #0a0908 0%, #12100d 50%, #0a0908 100%);
        }

        .features-header {
          max-width: 600px;
          margin: 0 auto 5rem;
          text-align: center;
        }

        .section-tag {
          display: inline-block;
          padding: 0.375rem 0.875rem;
          margin-bottom: 1rem;
          background: rgba(139, 58, 58, 0.2);
          border: 1px solid rgba(139, 58, 58, 0.3);
          border-radius: 100px;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #8B3A3A;
        }

        .section-title {
          font-family: var(--font-display), Georgia, serif;
          font-size: clamp(1.75rem, 4vw, 2.75rem);
          font-weight: 500;
          letter-spacing: -0.02em;
          margin-bottom: 1rem;
        }

        .section-subtitle {
          font-size: 1.0625rem;
          line-height: 1.7;
          color: rgba(245, 240, 232, 0.6);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .feature-card {
          position: relative;
          padding: 2.5rem;
          background: rgba(245, 240, 232, 0.02);
          border: 1px solid rgba(245, 240, 232, 0.08);
          border-radius: 8px;
          transition: all 0.4s ease;
          opacity: 0;
          transform: translateY(30px);
        }

        .feature-card.feature-visible {
          opacity: 1;
          transform: translateY(0);
        }

        .feature-card:hover {
          background: rgba(245, 240, 232, 0.04);
          border-color: rgba(201, 162, 39, 0.2);
          transform: translateY(-4px);
        }

        .feature-number {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          font-family: var(--font-display), Georgia, serif;
          font-size: 3rem;
          font-weight: 700;
          color: rgba(245, 240, 232, 0.05);
          line-height: 1;
        }

        .feature-icon {
          width: 3rem;
          height: 3rem;
          margin-bottom: 1.5rem;
          color: #c9a227;
        }

        .feature-icon svg {
          width: 100%;
          height: 100%;
        }

        .feature-title {
          font-family: var(--font-display), Georgia, serif;
          font-size: 1.375rem;
          font-weight: 500;
          margin-bottom: 0.75rem;
          letter-spacing: -0.01em;
        }

        .feature-description {
          font-size: 0.9375rem;
          line-height: 1.7;
          color: rgba(245, 240, 232, 0.7);
          margin-bottom: 1.5rem;
        }

        .feature-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .feature-list li {
          position: relative;
          padding-left: 1.25rem;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          color: rgba(245, 240, 232, 0.6);
        }

        .feature-list li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0.5rem;
          width: 6px;
          height: 6px;
          background: #8B3A3A;
          border-radius: 50%;
        }

        /* CTA Section */
        .cta-section {
          padding: 6rem 2rem 8rem;
          background: #0a0908;
        }

        .cta-card {
          position: relative;
          max-width: 800px;
          margin: 0 auto;
          padding: 4rem;
          background: linear-gradient(135deg, rgba(139, 58, 58, 0.15) 0%, rgba(201, 162, 39, 0.1) 100%);
          border: 1px solid rgba(201, 162, 39, 0.2);
          border-radius: 12px;
          text-align: center;
          overflow: hidden;
        }

        .cta-content {
          position: relative;
          z-index: 1;
        }

        .cta-title {
          font-family: var(--font-display), Georgia, serif;
          font-size: clamp(1.5rem, 4vw, 2.25rem);
          font-weight: 500;
          margin-bottom: 0.75rem;
        }

        .cta-subtitle {
          font-size: 1.0625rem;
          color: rgba(245, 240, 232, 0.7);
          margin-bottom: 2rem;
        }

        .cta-button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem 2rem;
          background: #c9a227;
          color: #0a0908;
          font-size: 1rem;
          font-weight: 600;
          text-decoration: none;
          border-radius: 4px;
          transition: all 0.3s;
        }

        .cta-button :global(svg) {
          width: 1.25rem;
          height: 1.25rem;
          flex-shrink: 0;
          transition: transform 0.3s;
        }

        .cta-button:hover {
          background: #d4af37;
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(201, 162, 39, 0.3);
        }

        .cta-button:hover :global(svg) {
          transform: translateX(4px);
        }

        .cta-decoration {
          position: absolute;
          top: 50%;
          right: -100px;
          transform: translateY(-50%);
        }

        .decoration-ring {
          position: absolute;
          border: 1px solid rgba(201, 162, 39, 0.15);
          border-radius: 50%;
        }

        .ring-1 {
          width: 200px;
          height: 200px;
          top: -100px;
          left: -100px;
        }

        .ring-2 {
          width: 300px;
          height: 300px;
          top: -150px;
          left: -150px;
        }

        .ring-3 {
          width: 400px;
          height: 400px;
          top: -200px;
          left: -200px;
        }

        /* Footer */
        .landing-footer {
          padding: 3rem 2rem;
          border-top: 1px solid rgba(245, 240, 232, 0.08);
          background: #0a0908;
        }

        .footer-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
        }

        .footer-logo {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(245, 240, 232, 0.6);
          font-family: var(--font-display), Georgia, serif;
          font-size: 1rem;
        }

        .footer-tagline {
          font-size: 0.8125rem;
          color: rgba(245, 240, 232, 0.4);
        }

        /* Animations */
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Responsive */
        @media (max-width: 768px) {
          .landing-nav {
            padding: 1rem;
          }

          .hero-section {
            padding: 6rem 1.5rem 4rem;
          }

          .hero-film-strip {
            display: none;
          }

          .hero-stats {
            flex-direction: column;
            gap: 1.5rem;
          }

          .stat-divider {
            width: 40px;
            height: 1px;
          }

          .features-section {
            padding: 4rem 1.5rem;
          }

          .feature-card {
            padding: 2rem;
          }

          .cta-card {
            padding: 2.5rem 1.5rem;
          }

          .cta-decoration {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

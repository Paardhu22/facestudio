import { FeaturesSection, FinalCta, HeroSection, LandingNav, SiteFooter, WorkflowSection } from '@/features/landing';

export default function LandingPage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface-elevated focus:px-3 focus:py-2 focus:text-fg"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="main" tabIndex={-1} className="studio-landing">
        <HeroSection />
        <FeaturesSection />
        <WorkflowSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

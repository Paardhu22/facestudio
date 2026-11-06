import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export function LandingNav() {
  return (
    <header className="studio-nav">
      <nav aria-label="Main" className="studio-container">
        <Link href="/" aria-label="FaceStudio home" className="studio-logo-link">
          <Logo />
        </Link>
        <div className="studio-nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <span className="nav-desktop-note">Built for your next batch.</span>
        </div>
        <Button asChild size="lg">
          <Link href="/editor">
            Get Started
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </nav>
    </header>
  );
}

import Link from 'next/link';
import { ArrowDown, ArrowUpRight, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { AppPreview } from './app-preview';

export function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="studio-hero">
      <div className="studio-container">
        <div className="hero-copy">
          <p className="hero-intro">
            <span /> A little precision. A lot of possibility.
          </p>
          <h1 id="hero-title" className="studio-display">
            Precision Cropping.
            <br />
            <span>Powerful Batch Editing.</span>
          </h1>
          <p className="hero-description">
            Detect faces, perfect every crop, adjust your images, and process thousands of photos in one streamlined
            workspace.
          </p>
          <div className="hero-actions">
            <Button asChild size="xl">
              <Link href="/editor">
                Get Started
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
            <a href="#features" className="studio-text-link">
              Explore Features
              <ArrowDown aria-hidden="true" className="size-4" />
            </a>
          </div>
          <div className="hero-reassurance">
            <span>
              <Check aria-hidden="true" /> No account required
            </span>
            <span>
              <Check aria-hidden="true" /> Your originals stay untouched
            </span>
          </div>
        </div>
        <div className="hero-preview-wrap">
          <div className="preview-caption">
            <span>
              <span className="status-light" /> YOUR ENTIRE SHOOT. ONE WORKSPACE.
            </span>
            <span>THE FACESTUDIO EDITOR</span>
          </div>
          <AppPreview />
          <div className="preview-footnote">
            <span>Less repetitive work. More room for your eye.</span>
            <span>Made for people who work with portraits.</span>
          </div>
        </div>
      </div>
      <div className="studio-container audience-strip">
        <span>A better frame for every face.</span>
        <div>
          <span>Studio headshots</span>
          <span>Team portraits</span>
          <span>School photography</span>
          <span>Creative projects</span>
        </div>
      </div>
    </section>
  );
}

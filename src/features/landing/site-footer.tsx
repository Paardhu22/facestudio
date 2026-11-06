import Link from 'next/link';

import { Logo } from '@/components/brand/logo';

export function SiteFooter() {
  return (
    <footer className="studio-footer">
      <div className="studio-container">
        <div>
          <Logo />
          <p>A considered workspace for every face.</p>
        </div>
        <nav aria-label="Footer">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <Link href="/editor">Open editor ↗</Link>
        </nav>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} FaceStudio</span>
          <span>Face detection. Never face recognition.</span>
          <span>Made for the details.</span>
        </div>
      </div>
    </footer>
  );
}

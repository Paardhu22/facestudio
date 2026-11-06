import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { LogoMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="studio-final-cta studio-container">
      <div className="cta-frame">
        <i />
        <i />
        <i />
        <i />
        <LogoMark className="size-10" />
        <p className="studio-section-label">Give your photos the attention they deserve.</p>
        <h2 id="cta-title">
          Your eye.
          <br />
          <span>Your next great batch.</span>
        </h2>
        <p>Bring your portraits. Find your frame. Make it yours.</p>
        <Button asChild size="xl">
          <Link href="/editor">
            Launch the editor
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
        <span className="cta-note">No account required. Just your photos.</span>
      </div>
    </section>
  );
}

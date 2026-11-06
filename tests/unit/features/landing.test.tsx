import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LandingPage from '@/app/page';

describe('Landing page', () => {
  it('renders the prescribed hero headline and copy', () => {
    render(<LandingPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Precision Cropping.');
    expect(h1).toHaveTextContent('Powerful Batch Editing.');
    expect(
      screen.getByText(
        'Detect faces, perfect every crop, adjust your images, and process thousands of photos in one streamlined workspace.',
      ),
    ).toBeInTheDocument();
  });

  it('routes every "Get Started" CTA to /editor', () => {
    render(<LandingPage />);
    const ctas = screen.getAllByRole('link', { name: /get started/i });
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    for (const cta of ctas) expect(cta).toHaveAttribute('href', '/editor');
  });

  it('points "Explore Features" at the features section', () => {
    render(<LandingPage />);
    expect(screen.getByRole('link', { name: 'Explore Features' })).toHaveAttribute('href', '#features');
    expect(document.getElementById('features')).not.toBeNull();
    expect(document.getElementById('how-it-works')).not.toBeNull();
  });

  it('has nav links for Features and How It Works', () => {
    render(<LandingPage />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Features' })).toHaveAttribute('href', '#features');
    expect(within(nav).getByRole('link', { name: 'How It Works' })).toHaveAttribute('href', '#how-it-works');
  });

  it('covers every required feature and the five workflow steps', () => {
    render(<LandingPage />);
    for (const title of [
      'Intelligent face detection',
      'Three ways to crop',
      'Professional image adjustments',
      'Edit one image, a selection, or the whole batch',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
    for (const mode of ['Portrait / Headshot', 'Face-only', 'Custom bounding box']) {
      expect(screen.getByRole('button', { name: mode })).toBeInTheDocument();
    }
    for (const step of ['Upload', 'Detect', 'Crop', 'Adjust', 'Export']) {
      expect(screen.getByRole('heading', { level: 3, name: step })).toBeInTheDocument();
    }
  });

  it('exposes the app preview as a single labelled image, not interactive controls', () => {
    render(<LandingPage />);
    const preview = screen.getByRole('img', { name: /illustration of the facestudio editor/i });
    expect(within(preview).queryAllByRole('button')).toHaveLength(0);
    expect(within(preview).queryAllByRole('link')).toHaveLength(0);
  });

  it('makes no unverified numeric scale claims (SKILLS.md §E-1 claims rule)', () => {
    render(<LandingPage />);
    expect(document.body.textContent).not.toMatch(/3,?000/);
  });
});

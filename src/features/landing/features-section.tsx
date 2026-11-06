import Image from 'next/image';
import { Check, Crop, Layers, ScanFace, SlidersHorizontal } from 'lucide-react';

import { CropExplorer } from './crop-explorer';

export function FeaturesSection() {
  return (
    <section id="features" aria-labelledby="features-title" className="studio-features studio-container">
      <div className="features-heading">
        <div>
          <p className="studio-section-label">A considered toolkit</p>
          <h2 id="features-title">
            Every crop, exactly <br />
            <span>where it belongs.</span>
          </h2>
        </div>
        <p>
          From the first portrait to the last.
          <br />A focused workspace that keeps your eye on the image and the details in your control.
        </p>
      </div>
      <div className="feature-crop-layout">
        <CropExplorer />
        <div className="feature-crop-copy">
          <span className="feature-icon">
            <Crop />
          </span>
          <h3>Three ways to crop</h3>
          <p>
            Some portraits need breathing room. Others need a closer look. Find the frame that fits, then make it yours.
          </p>
          <ul>
            <li>
              <Check /> Consistent framing across your portraits
            </li>
            <li>
              <Check /> Exact dimensions, down to the pixel
            </li>
            <li>
              <Check /> Room for your own adjustments
            </li>
          </ul>
          <a href="/editor" className="studio-text-link">
            Find your frame <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      <div className="feature-pair">
        <article className="feature-detection">
          <div className="detection-photo">
            <Image
              src="/images/studio/portrait-02.webp"
              alt="Sample portrait showing a face-detection frame"
              fill
              sizes="(max-width: 768px) 90vw, 500px"
            />
            <div className="detection-box">
              <span>
                <ScanFace /> Face located
              </span>
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="detection-photo-label">
              <span>SEE THE FACE. FIND THE FRAME.</span>
              <span>01 / 01</span>
            </div>
          </div>
          <div className="feature-card-copy">
            <ScanFace />
            <h3>Intelligent face detection</h3>
            <p>Start with the face, then refine the composition. Detection locates faces without identifying people.</p>
          </div>
        </article>
        <article className="feature-adjustments">
          <div className="feature-card-copy">
            <SlidersHorizontal />
            <h3>Professional image adjustments</h3>
            <p>A little warmer. A touch brighter. Dial in the look with five precise controls and a live preview.</p>
          </div>
          <div className="feature-slider-demo">
            {[
              { label: 'Exposure', value: '+0.35 EV', position: 62 },
              { label: 'Temperature', value: '+12', position: 57 },
              { label: 'Tint', value: '−4', position: 46 },
              { label: 'Saturation', value: '+8', position: 58 },
              { label: 'Brightness', value: '+5', position: 55 },
            ].map((s) => (
              <div className="feature-slider" key={s.label}>
                <div>
                  <span>{s.label}</span>
                  <span>{s.value}</span>
                </div>
                <div
                  className={`mock-track ${s.label === 'Temperature' ? 'temperature' : s.label === 'Tint' ? 'tint' : ''}`}
                >
                  <span style={{ left: `${s.position}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="feature-adjustment-note">Live preview. Exact values. One-step undo.</p>
        </article>
      </div>
      <article className="batch-feature">
        <div className="batch-copy">
          <Layers className="size-6 text-fg-secondary" />
          <h3>
            Edit one image, a selection, <br />
            or the whole batch
          </h3>
          <p>
            Find the right look once. Apply your adjustments to the images you choose, with a single undo step if you
            change your mind.
          </p>
          <div className="batch-scope" aria-label="Illustration of batch editing scope">
            <span>Current</span>
            <span>
              Selected <b>4</b>
            </span>
            <span>All images</span>
          </div>
        </div>
        <div className="batch-contact-sheet" aria-hidden="true">
          {[3, 4, 5, 6].map((n, i) => (
            <div className="batch-photo" key={n}>
              <Image src={`/images/studio/portrait-0${n}.webp`} alt="" fill sizes="180px" />
              <span>
                <Check />
              </span>
              <p>Portrait_0{n}.jpg</p>
              <i>{String(i + 1).padStart(2, '0')}</i>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

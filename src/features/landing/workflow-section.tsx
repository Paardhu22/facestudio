import { ArrowDown, Crop, Download, ScanFace, SlidersHorizontal, Upload } from 'lucide-react';

const STEPS = [
  {
    icon: Upload,
    title: 'Upload',
    body: 'Drop in your photos or bring the whole folder. JPEG, PNG, and WebP.',
    status: '',
  },
  { icon: ScanFace, title: 'Detect', body: 'Locate faces automatically, then choose where to focus.', status: '' },
  { icon: Crop, title: 'Crop', body: 'Choose a frame. Refine the details. Keep the set consistent.', status: '' },
  {
    icon: SlidersHorizontal,
    title: 'Adjust',
    body: 'Make light and color feel right, across one image or a selection.',
    status: '',
  },
  {
    icon: Download,
    title: 'Export',
    body: 'Render full-resolution files from your originals and download the finished batch as one ZIP.',
    status: '',
  },
] as const;

export function WorkflowSection() {
  return (
    <section id="how-it-works" aria-labelledby="workflow-title" className="studio-workflow">
      <div className="studio-container">
        <div className="workflow-heading">
          <div>
            <p className="studio-section-label">Less back and forth</p>
            <h2 id="workflow-title">
              A whole shoot.
              <br />
              <span>A clear path.</span>
            </h2>
          </div>
          <p>
            Everything has its place.
            <br />
            Move from a folder of portraits to a look that feels like you.
          </p>
          <ArrowDown aria-hidden="true" className="size-8 text-fg-muted" />
        </div>
        <ol className="workflow-steps">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <div className="workflow-step-top">
                <span>0{i + 1}</span>
                <step.icon aria-hidden="true" />
              </div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              {step.status && <span className="roadmap-label">{step.status}</span>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

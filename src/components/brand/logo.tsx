import { cn } from '@/lib/utils';

type LogoMarkProps = { className?: string; title?: string };

/** FaceStudio mark: two crop corners framing a head-and-shoulders silhouette. Original artwork. */
export function LogoMark({ className, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('size-6 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d="M3 9V5.5A2.5 2.5 0 0 1 5.5 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="10" r="3.25" fill="var(--fs-accent)" />
      <path
        d="M6.75 18.25c.9-2.75 2.9-4.25 5.25-4.25s4.35 1.5 5.25 4.25"
        stroke="var(--fs-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

type LogoProps = { className?: string; markClassName?: string };

/** Mark + wordmark lockup. */
export function Logo({ className, markClassName }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-fg', className)}>
      <LogoMark className={markClassName} />
      <span className="text-[15px] font-semibold tracking-tight">
        Face<span className="font-normal text-fg-secondary">Studio</span>
      </span>
    </span>
  );
}

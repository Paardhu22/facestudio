'use client';

import { Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { isNeutralAdjustments } from '@/lib/image-processing/adjustment-spec';
import { DEFAULT_EDIT, useEditStore } from '@/stores/edit-store';
import type { ImageId } from '@/types/domain';

/**
 * Hold to see the original (SKILLS.md §E-5). Appears only for edited images, so it is never a dead control.
 * Pointer: press and hold. Keyboard: hold Space or Enter. The `\` key does the same from anywhere in the editor.
 */
export function CompareButton({ id }: { id: ImageId }) {
  const edited = useEditStore((s) => {
    const edit = s.edits[id] ?? DEFAULT_EDIT;
    return !isNeutralAdjustments(edit.adjustments) || edit.crop !== null;
  });
  const comparing = useEditStore((s) => s.comparing);
  const setComparing = useEditStore((s) => s.setComparing);
  if (!edited) return null;

  const stop = () => setComparing(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={comparing}
      title="Hold to see the original (\)"
      data-testid="compare-button"
      onPointerDown={() => setComparing(true)}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          setComparing(true);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') stop();
      }}
    >
      <Eye />
      {comparing ? 'Original' : 'Hold to compare'}
    </Button>
  );
}

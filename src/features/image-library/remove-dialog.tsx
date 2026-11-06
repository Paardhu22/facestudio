'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { deleteImages } from '@/lib/api/images-api';
import { pluralize } from '@/lib/format';
import { useDetectionStore } from '@/stores/detection-store';
import { useEditStore } from '@/stores/edit-store';
import { useLibraryStore } from '@/stores/library-store';
import type { ImageId } from '@/types/domain';

type RemoveDialogProps = { ids: readonly ImageId[]; open: boolean; onOpenChange: (open: boolean) => void };

/** Destructive confirmation (SKILLS.md §B.14): removes the images and their stored files from the server. */
export function RemoveDialog({ ids, open, onOpenChange }: RemoveDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteImages(ids);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    useLibraryStore.getState().removeImages(result.value.deleted);
    useEditStore.getState().pruneImages(result.value.deleted);
    useDetectionStore.getState().forget(result.value.deleted);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return; // do not dismiss mid-request
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {pluralize(ids.length, 'image')}?</DialogTitle>
          <DialogDescription>
            {ids.length === 1 ? 'This image and its stored copy' : 'These images and their stored copies'} will be
            deleted from FaceStudio. Files on your computer are not affected.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-ui text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} loading={busy} data-testid="confirm-remove">
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

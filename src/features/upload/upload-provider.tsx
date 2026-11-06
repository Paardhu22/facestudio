'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';

import { candidatesFromFiles, collectDroppedFiles } from './collect-files';
import { enqueueFiles } from './upload-manager';

type UploadActions = {
  /** Open the system file picker (multiple images). */
  openFilePicker: () => void;
  /** Open the system folder picker. */
  openFolderPicker: () => void;
};

const UploadContext = createContext<UploadActions | null>(null);

export function useUploadActions(): UploadActions {
  const actions = useContext(UploadContext);
  if (!actions) throw new Error('useUploadActions must be used inside <UploadProvider>');
  return actions;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');

/**
 * Owns the hidden file inputs and the window-level drag-and-drop zone, and exposes picker actions to any
 * descendant. Mount once, around the whole editor.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const setFolderInput = useCallback((node: HTMLInputElement | null) => {
    folderInput.current = node;
    // `webkitdirectory` is not in React's typings; set it as an attribute instead.
    node?.setAttribute('webkitdirectory', '');
  }, []);

  useEffect(() => {
    let depth = 0;

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault(); // required to allow a drop
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault(); // otherwise the browser navigates to the dropped file
      depth = 0;
      setDragging(false);
      if (event.dataTransfer) void collectDroppedFiles(event.dataTransfer).then(enqueueFiles);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []); // copy first: resetting `value` empties the live FileList
    input.value = ''; // allow choosing the same files again
    enqueueFiles(candidatesFromFiles(files));
  }, []);

  const actions = useMemo<UploadActions>(
    () => ({
      openFilePicker: () => filesInput.current?.click(),
      openFolderPicker: () => folderInput.current?.click(),
    }),
    [],
  );

  return (
    <UploadContext.Provider value={actions}>
      {children}
      <input
        ref={filesInput}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        data-testid="file-input"
        onChange={handleChange}
      />
      <input
        ref={setFolderInput}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        aria-hidden="true"
        data-testid="folder-input"
        onChange={handleChange}
      />
      {dragging ? (
        <div
          aria-hidden="true"
          data-testid="drop-overlay"
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-scrim p-6"
        >
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-brand bg-surface-panel px-12 py-10 text-center shadow-elev-3">
            <ImagePlus className="size-8 text-brand" />
            <p className="text-ui-lg font-medium text-fg">Drop images or folders to add them</p>
            <p className="text-ui text-fg-muted">JPEG, PNG, and WebP</p>
          </div>
        </div>
      ) : null}
    </UploadContext.Provider>
  );
}

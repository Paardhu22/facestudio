'use client';

import Link from 'next/link';
import { FolderOpen, Redo2, Undo2 } from 'lucide-react';

import { LogoMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ExportControl } from '@/features/export';
import { useEditStore } from '@/stores/edit-store';

function HistoryButton({
  label,
  shortcut,
  disabled,
  onClick,
  testId,
  children,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events, so the tooltip wraps a span that always receives them. */}
        <span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            data-testid={testId}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {label} <span className="text-fg-muted">{shortcut}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Top toolbar (SKILLS.md §B.11). Only controls that work in the current build are rendered (§B.9): undo/redo now;
 * processing status and export appear with their features (Phases 5-6).
 */
export function EditorToolbar({ batchName }: { batchName: string }) {
  const undoLabel = useEditStore((s) => s.undoStack[s.undoStack.length - 1]?.label ?? null);
  const redoLabel = useEditStore((s) => s.redoStack[s.redoStack.length - 1]?.label ?? null);
  const undo = useEditStore((s) => s.undo);
  const redo = useEditStore((s) => s.redo);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface-app px-3">
      <Link
        href="/"
        aria-label="FaceStudio home"
        className="grid size-8 place-items-center rounded-md text-fg outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="editor-brand">
          <LogoMark className="size-5" />
          <span>FaceStudio</span>
        </span>
      </Link>
      <div aria-hidden="true" className="h-5 w-px bg-line" />
      <p className="editor-batch-label truncate text-ui font-medium" title={batchName}>
        <FolderOpen aria-hidden="true" className="size-3.5" />
        <span className="sr-only">Current batch: </span>
        {batchName}
      </p>
      <div className="ml-2 flex items-center gap-0.5">
        <HistoryButton
          label={undoLabel ? `Undo ${undoLabel.toLowerCase()}` : 'Undo'}
          shortcut="Ctrl+Z"
          disabled={undoLabel === null}
          onClick={undo}
          testId="undo"
        >
          <Undo2 />
        </HistoryButton>
        <HistoryButton
          label={redoLabel ? `Redo ${redoLabel.toLowerCase()}` : 'Redo'}
          shortcut="Ctrl+Shift+Z"
          disabled={redoLabel === null}
          onClick={redo}
          testId="redo"
        >
          <Redo2 />
        </HistoryButton>
      </div>
      <p className="editor-toolbar-note">
        <span /> Originals preserved
      </p>
      <ExportControl />
    </header>
  );
}

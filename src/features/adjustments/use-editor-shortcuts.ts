'use client';

import { useEffect } from 'react';

import { useEditStore } from '@/stores/edit-store';

const isEditable = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};

/**
 * Editor-wide shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, and hold `\` to compare with the original.
 * Undo/redo defer to the browser inside text fields, so editing a number keeps its own text undo.
 */
export function useEditorShortcuts(): void {
  useEffect(() => {
    const store = () => useEditStore.getState();

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) store().redo();
        else store().undo();
      } else if (mod && key === 'y') {
        event.preventDefault();
        store().redo();
      } else if (event.key === '\\' && !mod && !event.repeat) {
        store().setComparing(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === '\\') store().setComparing(false);
    };
    const onBlur = () => store().setComparing(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}

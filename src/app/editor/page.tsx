import type { Metadata } from 'next';

import { EditorShell } from '@/features/editor-shell';

export const metadata: Metadata = {
  title: 'Editor',
};

export default function EditorPage() {
  return <EditorShell />;
}

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditorShell } from '@/features/editor-shell';
import { DEFAULT_LIMITS } from '@/lib/config/limits';
import { useLibraryStore } from '@/stores/library-store';
import { resetUploadStore } from '@/stores/upload-store';

function stubLibraryResponse(images: unknown[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ images, nextCursor: null, limits: DEFAULT_LIMITS })),
  );
}

beforeEach(() => {
  resetUploadStore();
  useLibraryStore.getState().beginLoad();
  stubLibraryResponse();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EditorShell', () => {
  it('renders toolbar, three labelled regions, and a status region', () => {
    render(<EditorShell />);
    expect(screen.getByRole('link', { name: 'FaceStudio home' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Untitled batch')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Canvas' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ready');
  });

  it('renders resizable separators with accessible labels once mounted', () => {
    render(<EditorShell />);
    expect(screen.getByRole('separator', { name: 'Resize library panel' })).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Resize controls panel' })).toBeInTheDocument();
  });

  it('loads the library on mount and then offers import in both the library and the canvas', async () => {
    render(<EditorShell />);
    expect(screen.getByText('Loading your library…')).toBeInTheDocument();

    expect(await screen.findByText('No images yet')).toBeInTheDocument();
    expect(screen.getByText('Add photos to get started')).toBeInTheDocument();
    // One pair of import actions in the library header, one in the canvas call to action.
    expect(screen.getAllByRole('button', { name: 'Add images' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Add folder' })).toHaveLength(2);
    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
  });

  it('has hidden file and folder inputs that accept only supported image types', async () => {
    render(<EditorShell />);
    await screen.findByText('No images yet');
    const files = screen.getByTestId('file-input') as HTMLInputElement;
    const folder = screen.getByTestId('folder-input') as HTMLInputElement;
    expect(files.multiple).toBe(true);
    expect(files.accept).toContain('image/jpeg');
    expect(files.accept).toContain('.webp');
    expect(folder.hasAttribute('webkitdirectory')).toBe(true);
  });

  it('shows an error with a retry when the library cannot be loaded, and recovers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: { code: 'internal_error', message: 'Boom' } }, { status: 500 })),
    );
    render(<EditorShell />);
    expect(await screen.findByText('Could not load your library')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();

    stubLibraryResponse();
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(await screen.findByText('No images yet')).toBeInTheDocument();
  });

  it('includes a small-screen notice linking home', () => {
    render(<EditorShell />);
    expect(screen.getByRole('heading', { name: 'The editor needs a larger screen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });
});

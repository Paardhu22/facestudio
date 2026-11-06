import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Without explicit font-size groups, tailwind-merge treats text-ui-sm as a text
// color and silently drops it when text-fg follows it. Register our token scale.
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['ui-xs', 'ui-sm', 'ui', 'ui-lg', 'display-sm', 'display', 'display-lg'] }],
    },
  },
});

/** Merge conditional Tailwind classes; later classes win on conflicts (SKILLS.md §D.4). */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}

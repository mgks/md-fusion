export interface Note {
  title: string;
  content: string; // HTML content
  tags: string[];
  created?: string; // ISO Date
  updated?: string; // ISO Date
  // Frontmatter extras
  slug?: string;
  status?: string;
  [key: string]: any;
}

// Anything import that bypasses our sanitiser. Marked may emit HTML we don't
// want landing in ENEX files; the sanitiser in fromMarkdown() keeps an
// allow-list (see ALLOWED_TAGS).
export const __allow_untyped_frontmatter = true;
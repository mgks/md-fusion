import TurndownService from 'turndown';
import { marked } from 'marked';
import yaml from 'js-yaml';
import { Note } from './types.js';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// ---------------------------------------------------------------------------
// Tiny eval-free frontmatter helpers (replaces gray-matter)
// ---------------------------------------------------------------------------

/** Parse a Markdown string that may begin with a YAML frontmatter block. */
function parseFrontmatter(md: string): { data: Record<string, any>; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!match) return { data: {}, content: md };
  try {
    const data = (yaml.load(match[1] ?? '') as Record<string, any>) ?? {};
    return { data, content: match[2] ?? '' };
  } catch {
    return { data: {}, content: md };
  }
}

/** Serialise a Markdown body + metadata object back to a frontmatter string. */
function stringifyFrontmatter(body: string, data: Record<string, any>): string {
  // Drop undefined values so the YAML block stays clean
  const clean = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );
  const yamlStr = yaml.dump(clean, { lineWidth: -1 });
  return `---\n${yamlStr}---\n${body}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a Note object (HTML content) into a Markdown string with YAML Frontmatter.
 */
export function toMarkdown(note: Note): string {
  // 1. Convert HTML content to Markdown
  const markdownBody = turndownService.turndown(note.content || '');

  // 2. Separate 'content' from the rest of the metadata
  const { content, ...frontmatter } = note;

  // 3. Combine using our eval-free stringify helper
  return stringifyFrontmatter(markdownBody, frontmatter);
}

/**
 * Convert a Markdown string (with optional Frontmatter) into a Note object.
 * `created` and `updated` are `undefined` when absent from the Frontmatter —
 * callers should apply their own date fallback (e.g. file.lastModified).
 */
export function fromMarkdown(mdContent: string): Note {
  // 1. Parse Frontmatter
  const { data, content: mdBody } = parseFrontmatter(mdContent);

  // 2. Convert Markdown body to HTML
  const htmlContent = marked.parse(mdBody) as string;

  return {
    title: data.title || 'Untitled',
    content: htmlContent,
    tags: data.tags || [],
    created: data.created,
    updated: data.updated,
    ...data // Include any extra fields found in YAML
  };
}
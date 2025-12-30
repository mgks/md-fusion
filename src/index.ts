import TurndownService from 'turndown';
import { marked } from 'marked';
import matter from 'gray-matter';
import { Note } from './types.js';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

/**
 * Convert a Note object (HTML content) into a Markdown string with YAML Frontmatter.
 */
export function toMarkdown(note: Note): string {
  // 1. Convert HTML content to Markdown
  const markdownBody = turndownService.turndown(note.content || '');

  // 2. Separate 'content' from the rest of the metadata
  // This solves both errors:
  // - No duplicate keys (we aren't defining object literals manually)
  // - No 'delete' operator needed (we just exclude it from the new object)
  const { content, ...frontmatter } = note;

  // 3. Combine using gray-matter stringify
  return matter.stringify(markdownBody, frontmatter);
}

/**
 * Convert a Markdown string (with Frontmatter) into a Note object (HTML content).
 */
export function fromMarkdown(mdContent: string): Note {
  // 1. Parse Frontmatter
  const parsed = matter(mdContent);
  const data = parsed.data as any;

  // 2. Convert Markdown body to HTML
  // Ensure we await/handle marked properly if using async version, 
  // but standard 'marked.parse' is synchronous in v11+ with default settings.
  const htmlContent = marked.parse(parsed.content) as string;

  return {
    title: data.title || 'Untitled',
    content: htmlContent,
    tags: data.tags || [],
    created: data.created || new Date().toISOString(),
    updated: data.updated || new Date().toISOString(),
    ...data // Include any extra fields found in YAML
  };
}
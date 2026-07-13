import TurndownService from 'turndown';
import { marked } from 'marked';
import yaml from 'js-yaml';
import { Note } from './types.js';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  // Turndown escapes < and > by default. That's fine for round-tripping
  // back into HTML, but in a Markdown file we want literal angle brackets
  // inside fenced code blocks to stay readable.
  emDelimiter: '*'
});

// ---------------------------------------------------------------------------
// YAML frontmatter helpers (kept eval-free — no gray-matter)
// ---------------------------------------------------------------------------

// Match a leading YAML frontmatter block delimited by `---` lines.
// `---` is special so we anchor to the start of the input; the body is
// everything after the closing fence.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

// Parse a Markdown string with an optional YAML frontmatter block.
// Returns the parsed data and the body that follows the closing fence.
function parseFrontmatter(md: string): { data: Record<string, any>; content: string } {
  const match = FRONTMATTER_RE.exec(md);
  if (!match) return { data: {}, content: md };
  const yamlText = match[1] ?? '';
  let data: Record<string, any> = {};
  try {
    const parsed = yaml.load(yamlText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, any>;
    }
  } catch {
    // YAML parse failed — treat as if there were no frontmatter. The body
    // still gets used.
  }
  return { data, content: match[2] ?? '' };
}

// Serialise a body + metadata object back to a frontmatter string.
// Drops undefined values (those represent "absent"). Nulls, dates, and
// objects pass through; js-yaml is configured to be safe for them.
function stringifyFrontmatter(body: string, data: Record<string, any>): string {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) clean[k] = v;
  }
  const yamlStr = yaml.dump(clean, { lineWidth: -1, noRefs: true });
  return `---\n${yamlStr}---\n${body}`;
}

// ---------------------------------------------------------------------------
// Asset extraction
// ---------------------------------------------------------------------------

// When the caller wants <img src="..."> rewritten into local relative paths,
// they pass an Assets instance into `toMarkdown`. We populate `assets` with
// the original src -> extracted asset path mapping as we go.
export interface Assets {
  assets: Map<string, string>;
}

// Tiny slug from a URL for default asset filenames. Strips query and hash.
// Keeps the file extension if present so the caller sees `pic.png` rather
// than `pic`. Falls back to `fallback` when the cleaned result would have
// no usable characters (e.g. all-CJK or whitespace input).
export function assetFilename(src: string, fallback = 'asset'): string {
  const qIdx = src.indexOf('?');
  const hIdx = src.indexOf('#');
  let end = src.length;
  if (qIdx !== -1 && qIdx < end) end = qIdx;
  if (hIdx !== -1 && hIdx < end) end = hIdx;
  const clean = src.slice(0, end);
  const lastSlash = clean.lastIndexOf('/');
  let base = lastSlash === -1 ? clean : clean.slice(lastSlash + 1);
  const slug = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return slug || fallback;
}

// ---------------------------------------------------------------------------
// HTML sanitisation (defence-in-depth for fromMarkdown -> ENEX/Apple Notes)
// ---------------------------------------------------------------------------

// Tag allow-list for HTML that came from a Markdown body. Anything outside
// the allow-list is stripped, including its contents when paired with a
// "danger" pattern (e.g. <script>...</script>). This is deliberately
// conservative because md-fusion's output is frequently re-emitted into
// ENEX files that Apple Notes imports verbatim.
const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'en-media', 'en-note',
  'en-todo', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li',
  'ol', 'p', 'pre', 'span', 'strong', 'u', 'ul'
]);
const SCRIPT_LIKE = /(script|style|iframe|object|embed|link)/i;
const SCRIPT_LIKE_PAIR = /<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const SCRIPT_LIKE_SELF = /<(script|style|iframe|object|embed|link)\b[^>]*\/?>/gi;
const ON_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URI = /\b(href|src|action|formaction|xlink:href)\s*=\s*("|')\s*javascript:[^"'>\s]*\2/gi;

// Strip dangerous HTML. Content of <script>/<style>/<iframe>/<object>/<embed>
// goes away entirely; on* attributes vanish; javascript: URIs become "#".
function sanitizeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(SCRIPT_LIKE_PAIR, '')
    .replace(SCRIPT_LIKE_SELF, '')
    .replace(ON_ATTR, '')
    .replace(JS_URI, '$1="#"')
    // Drop any remaining tags not in the allowlist (preserving their text).
    // Allow hyphens in tag names so ENEX-specific tags like <en-todo> and
    // <en-media> survive when they are on the allow-list.
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g, (m, tag: string) => {
      if (ALLOWED_TAGS.has(tag.toLowerCase())) return m;
      // Drop the tag but keep nothing inside for known dangerous ones;
      // keep text inside for any others.
      if (SCRIPT_LIKE.test(tag)) return '';
      return '';
    });
}

// Coerce a YAML-loaded scalar to an ISO-8601 string when possible.
// js-yaml returns !!timestamp scalars as Date instances which would not
// stringify the same way downstream consumers expect.
function toIsoString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return undefined;
}

// Convert HTML content to Markdown and prepend a YAML frontmatter block
// with all the Note's metadata fields except content itself.
//
// Pass `assets` to rewrite <img src="..."> URLs into local asset paths and
// capture the mapping in `assets.assets`. When `assets` is omitted the
// src passes through unchanged (legacy behaviour).
export function toMarkdown(note: Note, opts: { assets?: Assets } = {}): string {
  let html = note.content || '';

  // Asset rewrite happens on the HTML *before* turndown sees it. Turndown
  // would already convert <img> tags to markdown image syntax; we want
  // to swap the src first so the rewritten filename survives the trip.
  if (opts.assets && html) {
    html = html.replace(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi,
      (match, dq, sq, bare) => {
        const src = dq || sq || bare;
        if (!src || src.startsWith('data:')) return match;
        if (!opts.assets!.assets.has(src)) {
          opts.assets!.assets.set(src, assetFilename(src));
        }
        const local = opts.assets!.assets.get(src)!;
        return match.replace(dq || sq || bare, local);
      });
  }

  const markdownBody = turndownService.turndown(html);
  const { content: _content, ...frontmatter } = note;
  return stringifyFrontmatter(markdownBody, frontmatter);
}

// Convert a Markdown string (with optional frontmatter) back into a Note.
// The HTML is sanitised first to keep ENEX/Apple Notes safe from
// any <script>/onclick/javscript: injection that the caller might have
// embedded in the markdown source.
export function fromMarkdown(mdContent: string): Note {
  const { data, content: mdBody } = parseFrontmatter(mdContent);
  const safeBody = sanitizeHtml(marked.parse(mdBody) as string);

  // Spread first so all frontmatter keys propagate (slug, status, custom),
  // then normalise the typed ones so downstream ENEX exporters see strings.
  const note: Note = {
    ...data,
    title: typeof data.title === 'string' && data.title ? data.title : 'Untitled',
    content: safeBody,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : []
  };
  const created = toIsoString(data.created);
  const updated = toIsoString(data.updated);
  if (created !== undefined) note.created = created;
  if (updated !== undefined) note.updated = updated;
  return note;
}

// Convenience: produce a filesystem-safe filename for a note title. Appends
// `-<n>` when the desired name already exists in the `existing` set so
// successive notes don't overwrite each other.
export function safeFilename(
  title: string,
  existing: Set<string> = new Set(),
  ext = 'md'
): string {
  const base = (title || 'untitled')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'untitled';

  let candidate = `${base}.${ext}`;
  if (!existing.has(candidate)) {
    existing.add(candidate);
    return candidate;
  }
  let n = 2;
  while (existing.has(`${base}-${n}.${ext}`)) n++;
  const final = `${base}-${n}.${ext}`;
  existing.add(final);
  return final;
}

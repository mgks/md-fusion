// Pure-API tests for fromMarkdown: HTML sanitisation front and centre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromMarkdown } from '../dist/index.js';

const SAMPLE_MD = `---
title: Plan
tags: [work, ideas]
created: 2026-05-01T00:00:00Z
---

# Header

Body paragraph with [a link](https://example.com).`;

test('fromMarkdown: parses the frontmatter and body', () => {
  const note = fromMarkdown(SAMPLE_MD);
  assert.equal(note.title, 'Plan');
  assert.deepEqual(note.tags, ['work', 'ideas']);
  // The loader treats `created: 2026-05-01T00:00:00Z` (unquoted) as a YAML
  // !!timestamp scalar, which becomes a Date. Our fromMarkdown normalises
  // that to .toISOString(), which always has 3 millis digits.
  assert.equal(note.created, '2026-05-01T00:00:00.000Z');
  assert.match(note.content, /<h1>Header<\/h1>/);
  assert.match(note.content, /<p>Body paragraph/);
});

test('fromMarkdown: quoted frontmatter date string stays a string round-trip', () => {
  const md = `---
title: T
created: "2026-05-01T00:00:00Z"
---
body`;
  const note = fromMarkdown(md);
  assert.equal(note.created, '2026-05-01T00:00:00Z');
});

test('fromMarkdown: missing frontmatter -> empty defaults', () => {
  const note = fromMarkdown('# Hello\nworld');
  assert.equal(note.title, 'Untitled');
  assert.deepEqual(note.tags, []);
  assert.equal(note.created, undefined);
});

test('fromMarkdown: strips <script> bodies entirely', () => {
  const md = `# Title\n<script>alert(1)</script>\n<p>safe</p>`;
  const note = fromMarkdown(md);
  assert.doesNotMatch(note.content, /<script/);
  assert.doesNotMatch(note.content, /alert\(1\)/);
  assert.match(note.content, /safe/);
});

test('fromMarkdown: strips on* event attributes from allowed tags', () => {
  const md = `<img src="x.png" onerror="alert(1)">`;
  const note = fromMarkdown(md);
  assert.doesNotMatch(note.content, /onerror/);
  // The <img> itself survives because it's on the allow-list.
  assert.match(note.content, /<img[^>]*src="x\.png"/);
});

test('fromMarkdown: rewrites javascript: URIs to "#"', () => {
  const md = `[click](javascript:alert(1))`;
  const note = fromMarkdown(md);
  assert.doesNotMatch(note.content, /javascript:/);
  assert.match(note.content, /href="#"/);
});

test('fromMarkdown: malformed frontmatter is treated as no frontmatter', () => {
  const md = `---\nthis: is: not: yaml\n---\n\nbody`;
  const note = fromMarkdown(md);
  // Body still parsed; title stays at the default, no crash.
  assert.match(note.content, /body/);
  assert.equal(note.title, 'Untitled');
});

test('fromMarkdown: frontmatter keys flow through to the note', () => {
  const md = `---
title: T
slug: a-slug
status: draft
custom: hello
---
body`;
  const note = fromMarkdown(md);
  assert.equal(note.title, 'T');
  assert.equal(note.slug, 'a-slug');
  assert.equal(note.status, 'draft');
  assert.equal(note.custom, 'hello');
});

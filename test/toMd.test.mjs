// Pure-API tests for toMarkdown + new asset/filename helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown, safeFilename, assetFilename } from '../dist/index.js';

test('toMarkdown: frontmatter + body round-trip for a plain note', () => {
  const md = toMarkdown({
    title: 'Plain',
    content: '<p>Hello <strong>world</strong>.</p>',
    tags: ['x', 'y'],
    created: '2026-01-01T00:00:00Z'
  });
  assert.match(md, /^---\n/);
  assert.match(md, /title: Plain/);
  assert.match(md, /tags:/);
  // js-yaml quotes ISO-8601 strings defensively, so the line may be
  // `created: '2026-01-01T00:00:00Z'` or unquoted; assert the value present.
  assert.match(md, /2026-01-01T00:00:00Z/);
  assert.match(md, /Hello/);
});

test('toMarkdown: optional created/updated are dropped from frontmatter when undefined', () => {
  const md = toMarkdown({
    title: 'T',
    content: '<p>x</p>',
    tags: [],
    created: undefined,
    updated: undefined
  });
  assert.doesNotMatch(md, /created:/);
  assert.doesNotMatch(md, /updated:/);
});

test('toMarkdown: passes <img src> through when no assets are requested', () => {
  const note = {
    title: 'T',
    content: '<p>photo</p><img src="https://example.com/a.png">'
  };
  const md = toMarkdown(note);
  assert.match(md, /https:\/\/example\.com\/a\.png/);
});

test('toMarkdown: asset extraction rewrites src and records the mapping', () => {
  const assets = { assets: new Map() };
  const md = toMarkdown(
    {
      title: 'T',
      content: '<p>photo</p><img src="https://example.com/pic.png"><img src="https://example.com/dup.png"><img src="https://example.com/dup.png">'
    },
    { assets }
  );
  // Exactly two src -> local entries, the second <img> was deduped.
  assert.equal(assets.assets.size, 2);
  assert.equal(assets.assets.get('https://example.com/pic.png'), 'pic.png');
  assert.equal(assets.assets.get('https://example.com/dup.png'), 'dup.png');
  // Body references the local paths, not the original URLs.
  assert.match(md, /pic\.png/);
  assert.match(md, /dup\.png/);
  assert.doesNotMatch(md, /https:\/\//);
});

test('toMarkdown: asset extraction skips data: URIs (no file to extract)', () => {
  const assets = { assets: new Map() };
  const md = toMarkdown(
    { title: 'T', content: '<img src="data:image/png;base64,iVBORw0KGgo=">' },
    { assets }
  );
  assert.equal(assets.assets.size, 0);
  // Data URI stays unchanged.
  assert.match(md, /data:image\/png/);
});

test('assetFilename: strips query/hash, lowercases, replaces unsafe chars', () => {
  assert.equal(assetFilename('https://x.com/Pic.PNG?v=1'), 'pic.png');
  assert.equal(assetFilename('https://x.com/a/b/Photo Of Me.jpg'), 'photo_of_me.jpg');
  assert.equal(assetFilename('日本語'), 'asset');          // all-CJK -> fallback
  assert.equal(assetFilename('   '), 'asset');            // whitespace-only -> fallback
  assert.equal(assetFilename('foo'), 'foo');              // already safe
});

test('safeFilename: dedupes collisions via -<n> suffix', () => {
  const taken = new Set();
  assert.equal(safeFilename('Shopping', taken), 'shopping.md');
  assert.equal(safeFilename('Shopping', taken), 'shopping-2.md');
  assert.equal(safeFilename('Shopping', taken), 'shopping-3.md');
  assert.equal(safeFilename('Different', taken), 'different.md');
});

test('safeFilename: normalises and trims; empty becomes "untitled"', () => {
  const taken = new Set();
  assert.equal(safeFilename('!!!', new Set()), 'untitled.md');
  assert.equal(safeFilename('My Note!', taken), 'my_note.md');
  // Long titles get sliced at 80 chars.
  const long = 'a'.repeat(200);
  const name = safeFilename(long, new Set());
  assert.ok(name.length <= 84, `expected len<=84 (80 + .md), got ${name.length}`);
});

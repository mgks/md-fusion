// CLI smoke test: writes JSON notes / Markdown files to test/tmp/<random>/,
// runs the CLI as a child process, and asserts the output.
//
// Each test uses its own randomised tmp dir so they can run in parallel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const cliJs = join(root, '..', 'dist', 'cli.js');

function freshTmp() {
  const dir = join(root, 'tmp', Math.random().toString(36).slice(2, 10));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runCli(cwd, args) {
  return spawnSync('node', [cliJs, ...args], { encoding: 'utf-8', cwd });
}

test('cli: to-md writes one .md per note + dedupes titles via -<n>', () => {
  const dir = freshTmp();
  const input = join(dir, 'notes.json');
  const outDir = join(dir, 'out');
  // Two notes share the same title -> second becomes "shopping-2.md".
  const notes = [
    { title: 'Shopping', content: '<p>milk</p>', tags: ['e'], created: '2026-01-01' },
    { title: 'Shopping', content: '<p>bread</p>', tags: [], created: '2026-01-02' },
    { title: 'Different', content: '<p>x</p>', tags: [] }
  ];
  writeFileSync(input, JSON.stringify(notes));

  const r = runCli(dir, ['to-md', input, '-o', outDir]);
  assert.equal(r.status, 0, `cli failed: ${r.stderr}`);
  assert.ok(existsSync(join(outDir, 'shopping.md')));
  assert.ok(existsSync(join(outDir, 'shopping-2.md')));
  assert.ok(existsSync(join(outDir, 'different.md')));
  // Different content written to each.
  assert.match(readFileSync(join(outDir, 'shopping.md'), 'utf-8'), /milk/);
  assert.match(readFileSync(join(outDir, 'shopping-2.md'), 'utf-8'), /bread/);
});

test('cli: to-md --assets-dir rewrites <img src> and writes the asset map', () => {
  const dir = freshTmp();
  const input = join(dir, 'notes.json');
  const outDir = join(dir, 'out');
  const notes = [
    { title: 'Photo', content: '<p>pic</p><img src="https://example.com/x.png">', tags: [] }
  ];
  writeFileSync(input, JSON.stringify(notes));

  const r = runCli(dir, ['to-md', input, '-o', outDir, '--assets-dir', 'assets']);
  assert.equal(r.status, 0, `cli failed: ${r.stderr}`);
  const md = readFileSync(join(outDir, 'photo.md'), 'utf-8');
  assert.match(md, /x\.png/);
  assert.doesNotMatch(md, /https:\/\/example\.com/);
  // Asset map sidecar.
  assert.ok(existsSync(join(outDir, '_asset_map.jsonl')));
  const mapLine = readFileSync(join(outDir, '_asset_map.jsonl'), 'utf-8').trim();
  assert.match(mapLine, /"src":"https:\/\/example\.com\/x\.png"/);
  assert.match(mapLine, /"local":"assets\/x\.png"/);
});

test('cli: from-md reads a single .md file and emits JSON', () => {
  const dir = freshTmp();
  const mdPath = join(dir, 'note.md');
  const jsonPath = join(dir, 'note.json');
  writeFileSync(mdPath, `---
title: Hello
tags: [a]
created: 2026-02-02T00:00:00Z
---

# Heading

Body.`);

  const r = runCli(dir, ['from-md', mdPath, '-o', jsonPath]);
  assert.equal(r.status, 0, `cli failed: ${r.stderr}`);
  const out = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  assert.equal(out.title, 'Hello');
  assert.deepEqual(out.tags, ['a']);
  assert.match(out.content, /<h1>Heading<\/h1>/);
});

test('cli: from-md on a directory parses every .md/.markdown/.mdx file', () => {
  const dir = freshTmp();
  const subDir = join(dir, 'vault');
  mkdirSync(subDir, { recursive: true });
  writeFileSync(join(subDir, 'a.md'), `---
title: A
---
a body`);
  writeFileSync(join(subDir, 'b.markdown'), `---\ntitle: B\n---\nb body`);
  writeFileSync(join(subDir, 'c.mdx'), `---\ntitle: C\n---\nc body`);
  writeFileSync(join(subDir, 'ignored.txt'), 'not markdown');

  const jsonOut = join(dir, 'all.json');
  const r = runCli(dir, ['from-md', subDir, '-o', jsonOut]);
  assert.equal(r.status, 0, `cli failed: ${r.stderr}`);
  const all = JSON.parse(readFileSync(jsonOut, 'utf-8'));
  const titles = all.map(n => n.title).sort();
  assert.deepEqual(titles, ['A', 'B', 'C']);
});

test('cli: from-md --many writes one .json per file (filename, not title)', () => {
  const dir = freshTmp();
  const subDir = join(dir, 'vault');
  mkdirSync(subDir, { recursive: true });
  // Same title on both — the CLI keys by source filename, so dedup is by stem.
  writeFileSync(join(subDir, 'a.md'), `---
title: A
---
a`);
  writeFileSync(join(subDir, 'a copy.md'), `---
title: A
---
a copy`);

  const jsonDir = join(dir, 'json');
  const r = runCli(dir, ['from-md', subDir, '--many', '--output-dir', jsonDir]);
  assert.equal(r.status, 0, `cli failed: ${r.stderr}`);
  assert.ok(existsSync(join(jsonDir, 'a.json')));
  // Source filename normalises to "a_copy" — slug falls into the dedupe set.
  assert.ok(existsSync(join(jsonDir, 'a_copy.json')));
});

test('cli: missing input exits non-zero with a clear message', () => {
  const dir = freshTmp();
  const r = runCli(dir, ['to-md', join(dir, 'does-not-exist.json')]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not found/i);
});

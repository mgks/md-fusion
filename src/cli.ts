#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { toMarkdown, fromMarkdown, safeFilename, Assets } from './index.js';
import { Note } from './types.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('md-fusion')
  .description(pkg.description)
  .version(pkg.version, '-v, --version')
  .helpOption('-h, --help', 'Display help');

const MD_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);

program
  .command('to-md')
  .description('Convert a JSON array of notes into individual Markdown files (for Obsidian/Notion)')
  .argument('<input>', 'Input JSON file path')
  .option('-o, --output-dir <dir>', 'Output directory for *.md files', 'markdown-output')
  .option('--assets-dir <dir>', 'When set, <img src="..."> in the HTML is rewritten to a local path under this directory (next to the .md files)')
  .action((input, options) => {
    try {
      if (!fs.existsSync(input)) throw new Error(`Input not found: ${input}`);

      const json = fs.readFileSync(input, 'utf-8');
      const notes: Note[] = JSON.parse(json);
      if (!Array.isArray(notes)) throw new Error('Input JSON must be an array of note objects');

      const outDir = options.outputDir;
      const assetsDir = options.assetsDir;
      const fullOut = assetsDir ? path.join(outDir, assetsDir) : null;
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      if (fullOut && !fs.existsSync(fullOut)) fs.mkdirSync(fullOut, { recursive: true });

      console.log(`⏳ Converting ${notes.length} note(s) -> ${outDir}/`);

      const takenNames = new Set<string>();
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (!note) continue;
        const assets: Assets | undefined = fullOut
          ? { assets: new Map<string, string>() }
          : undefined;
        const md = toMarkdown(note, assets ? { assets } : {});
        const filename = safeFilename(note.title ?? '', takenNames);
        const mdPath = path.join(outDir, filename);
        fs.writeFileSync(mdPath, md);

        if (assets) {
          for (const [src, localName] of assets.assets) {
            const target = path.join(fullOut!, localName);
            // We don't fetch the URL — callers populate the assets dir
            // out-of-band (curl, wget, NotesMigrator's worker). We just
            // document the mapping as a sidecar json next to the markdown.
            fs.appendFileSync(path.join(outDir, '_asset_map.jsonl'),
              JSON.stringify({ note: filename, src, local: path.posix.join(assetsDir!, localName) }) + '\n');
          }
        }
      }

      console.log(`✅ Saved ${notes.length} file(s) to ${outDir}/`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`❌ Error: ${msg}`);
      process.exit(1);
    }
  });

program
  .command('from-md')
  .description('Parse a single Markdown file (or every *.md/*markdown/*.mdx in a directory) into JSON')
  .argument('<input>', 'Input .md file or directory containing Markdown files')
  .option('-o, --output <file>', 'Output JSON path (single file mode, or "-o -" for stdout)')
  .option('--many', 'When the input is a directory, write one .json per note under --output-dir (default: alongside the input)')
  .option('--output-dir <dir>', 'Directory to write per-note JSON files when --many is set')
  .action((input, options) => {
    try {
      if (!fs.existsSync(input)) throw new Error(`Input not found: ${input}`);
      const stat = fs.lstatSync(input);

      // Single-file mode: parse one note and write JSON.
      if (stat.isFile()) {
        const content = fs.readFileSync(input, 'utf-8');
        const note = fromMarkdown(content);
        const out = options.output === '-'
          ? process.stdout
          : fs.createWriteStream(options.output || input.replace(/\.(md|markdown|mdx)$/i, '.json'), 'utf-8');
        out.write(JSON.stringify(note, null, 2));
        if (out !== process.stdout) out.end();
        console.error(`✅ Parsed ${input}`);
        return;
      }

      // Directory mode.
      if (!stat.isDirectory()) throw new Error(`Not a file or directory: ${input}`);
      const files = fs.readdirSync(input)
        .filter(f => MD_EXTENSIONS.has(path.extname(f).toLowerCase()))
        .map(f => path.join(input, f));
      if (files.length === 0) throw new Error('No Markdown files (.md/.markdown/.mdx) found in this directory.');

      const writeDir = options.outputDir || (options.many ? path.join(input, '_json') : null);
      if (writeDir && !fs.existsSync(writeDir)) fs.mkdirSync(writeDir, { recursive: true });

      const taken = new Set<string>();
      const all: Note[] = [];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const note = fromMarkdown(content);
        if (writeDir) {
          const outName = safeFilename(path.basename(file, path.extname(file)), taken, 'json');
          fs.writeFileSync(path.join(writeDir, outName), JSON.stringify(note, null, 2));
        } else {
          all.push(note);
        }
      }

      if (!writeDir) {
        // Batch to one combined JSON.
        const out = options.output === '-'
          ? process.stdout
          : fs.createWriteStream(options.output || path.join(input, 'notes.json'), 'utf-8');
        out.write(JSON.stringify(all, null, 2));
        if (out !== process.stdout) out.end();
      }
      console.error(`✅ Parsed ${files.length} note(s) from ${input}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`❌ Error: ${msg}`);
      process.exit(1);
    }
  });

program.addHelpText('after', `
Examples:
  $ md-fusion to-md notes.json -o ./vault
  $ md-fusion to-md notes.json -o ./vault --assets-dir assets
  $ md-fusion from-md ./vault -o all.json
  $ md-fusion from-md ./vault --many --output-dir ./json
`);

program.parse();

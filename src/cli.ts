#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { toMarkdown, fromMarkdown } from './index.js';
import { Note } from './types.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('md-fusion')
  .description(pkg.description)
  .version(pkg.version, '-v, --version')
  .helpOption('-h, --help', 'Display help');

// --- JSON Notes -> Markdown Files ---
program
  .command('to-md')
  .description('Convert a JSON array of notes into individual Markdown files (for Obsidian/Notion)')
  .argument('<input>', 'Input JSON file')
  .option('-o, --output-dir <dir>', 'Output directory', 'markdown-output')
  .action((input, options) => {
    try {
      if (!fs.existsSync(input)) throw new Error(`Input not found: ${input}`);
      
      const json = fs.readFileSync(input, 'utf-8');
      const notes: Note[] = JSON.parse(json);
      
      if (!fs.existsSync(options.outputDir)) fs.mkdirSync(options.outputDir, { recursive: true });

      console.log(`⏳ Converting ${notes.length} notes to Markdown...`);

      notes.forEach((note, i) => {
        const md = toMarkdown(note);
        // Sanitize filename
        const filename = (note.title || `note-${i}`).replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.md';
        fs.writeFileSync(path.join(options.outputDir, filename), md);
      });

      console.log(`✅ Success! Files saved to ${options.outputDir}/`);
    } catch (e: any) {
      console.error(`❌ Error: ${e.message}`);
      process.exit(1);
    }
  });

// --- Markdown File -> JSON Note ---
program
  .command('from-md')
  .description('Parse a single Markdown file into a JSON note object')
  .argument('<input>', 'Input .md file')
  .action((input) => {
    try {
      if (!fs.existsSync(input)) throw new Error(`Input not found: ${input}`);
      
      const content = fs.readFileSync(input, 'utf-8');
      const note = fromMarkdown(content);
      
      console.log(JSON.stringify(note, null, 2));
    } catch (e: any) {
      console.error(`❌ Error: ${e.message}`);
      process.exit(1);
    }
  });

program.parse();
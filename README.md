# md-fusion

**Convert notes between HTML/JSON and Markdown with YAML Frontmatter.**

<p>
  <img src="https://img.shields.io/npm/v/md-fusion.svg?style=flat-square&color=d25353" alt="npm version">
  <img src="https://img.shields.io/bundlephobia/minzip/md-fusion?style=flat-square&color=38bd24" alt="size">
  <img src="https://img.shields.io/npm/dt/md-fusion.svg?style=flat-square&color=38bd24" alt="npm downloads">
  <img src="https://img.shields.io/github/license/mgks/md-fusion.svg?style=flat-square&color=blue" alt="license">
</p>

A lightweight Node.js library and CLI tool to bridge the gap between structured note data (JSON) and static Markdown files. It handles **YAML Frontmatter** bidirectionally, making it ideal for migrating content to **Obsidian**, **Notion**, or **Jekyll / Hugo** sites.

## What's New in v0.2.0

*   **Optional date fields:** `created` and `updated` in the `Note` type are now optional (`?`). `fromMarkdown()` returns `undefined` for these fields when they are absent from the Frontmatter instead of defaulting to today's date. Consumer apps can apply their own fallbacks (e.g. file last-modified), giving you full control over timestamps.

## Installation

```bash
# Global install (CLI)
npm install -g md-fusion

# Project dependency
npm install md-fusion
```

## Usage

### CLI

```bash
# Convert a JSON notes file to individual Markdown files
md-fusion to-md notes.json -o ./my-vault

# Parse a single Markdown file to JSON
md-fusion from-md ./my-vault/daily-note.md
```

### API

```javascript
import { toMarkdown, fromMarkdown } from 'md-fusion';

const myNote = {
  title: "Project Idea",
  content: "<h1>Big Plans</h1><p>Do the thing.</p>",
  tags: ["ideas", "work"],
  created: "2023-10-27T10:00:00Z"
};

// Convert a Note object → Markdown string with YAML Frontmatter
const md = toMarkdown(myNote);
console.log(md);
/*
---
title: Project Idea
tags:
  - ideas
  - work
created: 2023-10-27T10:00:00Z
---
# Big Plans

Do the thing.
*/

// Parse Markdown → Note object
const noteObj = fromMarkdown(md);
console.log(noteObj.title);   // "Project Idea"
console.log(noteObj.created); // "2023-10-27T10:00:00Z"  (or undefined if absent)
```

### Handling Missing Dates

`fromMarkdown()` returns `undefined` for `created` / `updated` when the Frontmatter does not include them. Apply your own fallback:

```javascript
const note = fromMarkdown(mdContent);
const fileDate = new Date(file.lastModified).toISOString();

note.created = note.created ?? fileDate;
note.updated = note.updated ?? fileDate;
```

### Type Definition

```typescript
interface Note {
  title: string;
  content: string;   // HTML
  tags: string[];
  created?: string;  // ISO 8601, undefined when absent from Frontmatter
  updated?: string;  // ISO 8601, undefined when absent from Frontmatter
  slug?: string;
  status?: string;
  [key: string]: any; // Extra YAML keys are preserved round-trip
}
```

## License

MIT

> **{ github.com/mgks }**
> 
> ![Website Badge](https://img.shields.io/badge/Visit-mgks.dev-blue?style=flat&link=https%3A%2F%2Fmgks.dev) ![Sponsor Badge](https://img.shields.io/badge/%20%20Become%20a%20Sponsor%20%20-red?style=flat&logo=github&link=https%3A%2F%2Fgithub.com%2Fsponsors%2Fmgks)

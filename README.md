# md-fusion

**Convert notes between HTML/JSON and Markdown with YAML Frontmatter.**

<p>
  <img src="https://img.shields.io/npm/v/md-fusion.svg?style=flat-square&color=d25353" alt="npm version">
  <img src="https://img.shields.io/bundlephobia/minzip/md-fusion?style=flat-square&color=38bd24" alt="size">
  <img src="https://img.shields.io/npm/dt/md-fusion.svg?style=flat-square&color=success&color=38bd24" alt="npm downloads">
  <img src="https://img.shields.io/github/license/mgks/md-fusion.svg?style=flat-square&color=blue" alt="license">
</p>

A lightweight Node.js library and CLI tool to bridge the gap between structured note data (JSON) and static file systems (Markdown). It seamlessly handles **YAML Frontmatter**, making it perfect for migrating content to **Obsidian**, **Notion**, or **Jekyll/Hugo** sites.

## Installation

```bash
# Global Install (CLI)
npm install -g md-fusion

# Project Install (Library)
npm install md-fusion
```

## Usage
### CLI Usage

**Convert JSON Notes to Markdown Files**
Perfect for importing into Obsidian or Dendron.
```bash
md-fusion to-md notes.json -o ./my-vault
# Creates: ./my-vault/note_title.md, ./my-vault/another_note.md
```

**Parse Markdown to JSON**
Useful for processing existing Markdown files.
```bash
md-fusion from-md ./my-vault/daily-note.md
# Output: JSON object to console
```

### API Usage

```javascript
import { toMarkdown, fromMarkdown } from 'md-fusion';

const myNote = {
  title: "Project Idea",
  content: "<h1>Big Plans</h1><p>Do the thing.</p>",
  tags: ["ideas", "work"],
  created: "2023-10-27T10:00:00Z"
};

// 1. Convert Object to Markdown string with Frontmatter
const md = toMarkdown(myNote);
console.log(md);
/* Output:
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

// 2. Parse Markdown string back to Object
const noteObj = fromMarkdown(md);
console.log(noteObj.title); // "Project Idea"
```

### Input/Output Format

Expects (or produces) a standard JSON Note object:

```typescript
interface Note {
  title: string;
  content: string; // HTML
  tags: string[];
  created: string; // ISO 8601
  updated?: string; 
  [key: string]: any; // Any extra JSON keys become YAML Frontmatter
}
```

## License

MIT

> **{ github.com/mgks }**
> 
> ![Website Badge](https://img.shields.io/badge/Visit-mgks.dev-blue?style=flat&link=https%3A%2F%2Fmgks.dev) ![Sponsor Badge](https://img.shields.io/badge/%20%20Become%20a%20Sponsor%20%20-red?style=flat&logo=github&link=https%3A%2F%2Fgithub.com%2Fsponsors%2Fmgks)

export interface Note {
  title: string;
  content: string; // HTML content
  tags: string[];
  created: string; // ISO Date
  updated: string; // ISO Date
  // Frontmatter extras
  slug?: string;
  status?: string;
  [key: string]: any; 
}
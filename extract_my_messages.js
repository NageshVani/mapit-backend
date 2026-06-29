#!/usr/bin/env node
// Extract your user-authored messages from Claude Code conversation history.
// Usage: node extract_my_messages.js [output_file]

const fs = require('fs');
const path = require('path');
const os = require('os');

const OUTPUT = process.argv[2] || 'my_claude_messages.md';
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

function findJsonlFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findJsonlFiles(full));
    else if (entry.name.endsWith('.jsonl')) results.push(full);
  }
  return results;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block && block.type === 'text')
      .map((block) => block.text || '')
      .join(' ');
  }
  return '';
}

const files = findJsonlFiles(PROJECTS_DIR).sort();
let out = `# My Claude Code Messages\nGenerated: ${new Date().toString()}\n\n`;

for (const file of files) {
  const project = path.basename(path.dirname(file));
  out += `## Project: ${project}\n\n`;

  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    // Only genuine user turns: skip system-injected meta entries (e.g. /clear caveats)
    if (entry.type !== 'user' || entry.isMeta) continue;
    const message = entry.message;
    if (!message || message.role !== 'user') continue;

    const text = extractText(message.content).trim();
    if (!text) continue;

    if (entry.timestamp) out += `**[${entry.timestamp}]**\n`;
    out += text.slice(0, 2000) + '\n\n';
  }

  out += '---\n\n';
}

fs.writeFileSync(OUTPUT, out);
console.log(`Done! Saved to: ${OUTPUT}`);

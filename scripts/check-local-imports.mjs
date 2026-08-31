import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const root = resolve(process.cwd(), 'pdv');
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (/\.(?:js|mjs)$/.test(name)) files.push(full);
  }
}

function candidates(path) {
  if (extname(path)) return [path];
  return [path, `${path}.js`, `${path}.mjs`, `${path}.json`, join(path, 'index.js')];
}

walk(root);
const missing = [];
const importPattern = /(?:from\s*|import\s*\(|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    const target = resolve(dirname(file), specifier);
    if (!candidates(target).some(existsSync)) {
      missing.push(`${file.replace(process.cwd() + '/', '')} -> ${specifier}`);
    }
  }
}

if (missing.length) {
  console.error('Importações locais ausentes:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Importações locais válidas em ${files.length} módulos do PDV.`);

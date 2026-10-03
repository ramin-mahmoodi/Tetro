const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

console.log('[BUILD] Generating production static distribution bundle...');

// Remove existing dist
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Client files and folders to include in distribution
const includeItems = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css',
  'js',
  'assets',
  'data'
];

for (const item of includeItems) {
  const srcPath = path.join(rootDir, item);
  const destPath = path.join(distDir, item);
  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, destPath);
    console.log(`  ✓ Copied: ${item}`);
  } else {
    console.warn(`  ⚠ Warning: Missing ${item}`);
  }
}

console.log(`[BUILD] Production distribution ready at: ${distDir}`);

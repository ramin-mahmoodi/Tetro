const fs = require('fs');
const path = require('path');

async function run() {
  const root = path.join(__dirname, '..');
  const fontDir = path.join(root, 'assets', 'fonts');
  if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir, { recursive: true });

  const fontRes = await fetch('https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/regular/Phosphor.woff2');
  const fontBuf = Buffer.from(await fontRes.arrayBuffer());
  fs.writeFileSync(path.join(fontDir, 'Phosphor.woff2'), fontBuf);
  console.log('Saved Phosphor.woff2:', fontBuf.length, 'bytes');

  const cssRes = await fetch('https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/regular/style.css');
  let cssText = await cssRes.text();
  cssText = cssText.replace(/src:\s*[\s\S]*?;\s*font-weight:/, "src: url('../assets/fonts/Phosphor.woff2') format('woff2');\n  font-weight:");
  fs.writeFileSync(path.join(root, 'css', 'phosphor.css'), cssText, 'utf8');
  console.log('Saved css/phosphor.css');
}

run().catch(console.error);

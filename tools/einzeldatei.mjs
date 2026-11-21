// Baut aus dem Repo eine einzige, offline spielbare HTML-Datei:
// Three.js, Code, CSS, alle Modelle aus models/ und Bilder aus bilder/ (als Base64) stecken darin – kein Internet, kein Server nötig.
// Einmalig:  cd tools && npm i --no-save esbuild@0.24.0 three@0.170.0
// Aufruf:    node tools/einzeldatei.mjs            (schreibt Aschenblatt.html ins Repo, wird nicht committet)
//            node tools/einzeldatei.mjs <repo> <ziel.html>
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = process.argv[2] || path.join(here, '..');
const out = process.argv[3] || path.join(repo, 'Aschenblatt.html');
const tmp = fs.mkdtempSync(path.join(here, 'src-'));
fs.cpSync(path.join(repo, 'src'), tmp, { recursive: true });

// Modelle einbetten: src/modelle.js hat die Zeile `export const EINGEBETTET = {};`
const mdir = path.join(repo, 'models');
const map = {};
if (fs.existsSync(mdir)) for (const f of fs.readdirSync(mdir)) if (f.endsWith('.glb')) map['models/' + f] = fs.readFileSync(path.join(mdir, f)).toString('base64');
const mp = path.join(tmp, 'modelle.js');
let mj = fs.readFileSync(mp, 'utf8');
if (!mj.includes('export const EINGEBETTET = {};')) throw new Error('EINGEBETTET-Zeile fehlt in src/modelle.js');
mj = mj.replace('export const EINGEBETTET = {};', 'export const EINGEBETTET = ' + JSON.stringify(map) + ';');
// Bilder (bilder/*.jpg|png|webp) als data-URL: `export const BILDER = {};`
const bdir = path.join(repo, 'bilder'), bmap = {}, MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
if (fs.existsSync(bdir)) for (const f of fs.readdirSync(bdir)) {
  const ext = f.split('.').pop().toLowerCase();
  if (MIME[ext]) bmap['bilder/' + f] = 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(path.join(bdir, f)).toString('base64');
}
if (!mj.includes('export const BILDER = {};')) throw new Error('BILDER-Zeile fehlt in src/modelle.js');
mj = mj.replace('export const BILDER = {};', 'export const BILDER = ' + JSON.stringify(bmap) + ';');
fs.writeFileSync(mp, mj);

const res = await build({
  entryPoints: [path.join(tmp, 'main.js')], bundle: true, format: 'iife', minify: true, write: false,
  target: ['es2020', 'safari15'], nodePaths: [path.join(here, 'node_modules')], legalComments: 'none',
});
fs.rmSync(tmp, { recursive: true, force: true });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(repo, 'styles.css'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="styles.css">/, () => '<style>\n' + css + '</style>');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
html = html.replace(/<script type="module" src="src\/main.js"><\/script>/, () => '<script>\n' + js + '</script>');
if (/src\/main\.js|styles\.css|importmap/.test(html)) throw new Error('Ersetzen unvollständig');
fs.writeFileSync(out, html);
console.log(out, (fs.statSync(out).size / 1e6).toFixed(2) + ' MB', Object.keys(map).length + ' Modell(e)', Object.keys(bmap).length + ' Bild(er)');

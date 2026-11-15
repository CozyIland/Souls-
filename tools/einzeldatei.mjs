// Baut aus dem Repo eine einzige, offline spielbare HTML-Datei (zum Antippen am Handy):
// Three.js, Code, CSS und das Heldin-Modell stecken alle darin.
// Einmalig:  cd tools && npm i --no-save esbuild@0.24.0 three@0.170.0
// Aufruf:    node tools/einzeldatei.mjs            (schreibt Der-Lernende.html ins Repo, wird nicht committet)
//            node tools/einzeldatei.mjs <repo> <ziel.html>
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const repo = process.argv[2] || path.join(here, '..');
const out = process.argv[3] || path.join(repo, 'Der-Lernende.html');
const tmp = fs.mkdtempSync(path.join(here, 'src-'));
fs.cpSync(path.join(repo, 'src'), tmp, { recursive: true });
// Modell als data:-Adresse einbetten
const glb = fs.readFileSync(path.join(repo, 'models/heldin.glb')).toString('base64');
const pv = path.join(tmp, 'render/player3d.js');
let pj = fs.readFileSync(pv, 'utf8');
if (!pj.includes("'models/heldin.glb'")) throw new Error('MODEL_URL nicht gefunden');
// Ohne fetch laden: manche Handy-Vorschauen sperren Ladeanfragen (auch data:-Adressen)
if (!pj.includes('loader.load(MODEL_URL,')) throw new Error('loader.load(MODEL_URL, nicht gefunden');
pj = pj.replace('loader.load(MODEL_URL,', 'ladeEingebettet(loader,');
pj += `
const HELDIN_B64 = '${glb}';
function ladeEingebettet(loader, onLoad, onProgress, onError) {
  try {
    const bin = atob(HELDIN_B64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    loader.parse(buf.buffer, '', onLoad, onError);
  } catch (e) { if (onError) onError(e); }
}
`;
fs.writeFileSync(pv, pj);
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
console.log(out, (fs.statSync(out).size / 1e6).toFixed(2) + ' MB');

# Verkleinert die FORM einer Meshy-GLB (ein Mesh, ein Material mit Texturen) auf eine Ziel-Dreieckszahl, ohne dass das Bild
# auf der Oberfläche kaputtgeht: MeshLab-Vereinfachung „mit Textur“ (Nähte der Bildkoordinaten bleiben erhalten).
# Vorher die Texturen mit glb_klein.py verkleinern, dann:
#   python3 tools/glb_lod.py quelle_klein.glb ziel.glb 15000 [ohnebild|form]
# ohnebild = ohne eigene Bilder (z. B. zweite Detailstufe, die die Bilder der ersten mitbenutzt)
# form     = nur die Form, ohne Bild und Bildkoordinaten (ferne Teile im Dunst) – lässt sich beliebig klein machen
# Braucht: pip install pymeshlab  (und unter Linux das Paket libopengl0)
import json, struct, sys, os, tempfile
import numpy as np
import pymeshlab

src, dst, target = sys.argv[1], sys.argv[2], int(sys.argv[3])
noimg = len(sys.argv) > 4 and sys.argv[4] in ('ohnebild', 'form')
form = len(sys.argv) > 4 and sys.argv[4] == 'form'   # nur die Form (ohne Bildkoordinaten) – für ferne Teile im Dunst, geht viel kleiner
d = open(src, 'rb').read()
clen = struct.unpack_from('<I', d, 12)[0]
j = json.loads(d[20:20 + clen])
binb = d[28 + clen:28 + clen + struct.unpack_from('<I', d, 20 + clen)[0]]

def acc(i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
    stride = v.get('byteStride', 0)
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    if stride and stride != n * np.dtype(dt).itemsize:
        raw = np.frombuffer(binb, dtype=np.uint8, count=stride * a['count'], offset=off).reshape(-1, stride)
        return raw[:, :n * np.dtype(dt).itemsize].copy().view(dt).reshape(-1, n)
    return np.frombuffer(binb, dtype=dt, count=a['count'] * n, offset=off).reshape(-1, n) if n > 1 else np.frombuffer(binb, dtype=dt, count=a['count'], offset=off)

prim = j['meshes'][0]['primitives'][0]
pos = acc(prim['attributes']['POSITION']).astype(np.float64)
uv = acc(prim['attributes']['TEXCOORD_0']).astype(np.float64)
idx = acc(prim['indices']).astype(np.int64).reshape(-1, 3)
print('vorher', len(pos), 'Ecken,', len(idx), 'Dreiecke')

# gleiche Lagen zusammenlegen (an den Bild-Nähten sind Ecken doppelt) → zusammenhängende Form, Bildkoordinaten je Dreiecks-Ecke
uniq, inv = np.unique(np.round(pos, 6), axis=0, return_inverse=True)
inv = inv.reshape(-1)
tmp = tempfile.mkdtemp()
fin, fout = os.path.join(tmp, 'ein.obj'), os.path.join(tmp, 'aus.obj')
with open(fin, 'w') as f:
    f.write(''.join(f'v {p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n' for p in uniq))
    if form: f.write(''.join(f'f {inv[a]+1} {inv[b]+1} {inv[c]+1}\n' for a, b, c in idx))
    else:
        f.write(''.join(f'vt {t[0]:.6f} {t[1]:.6f}\n' for t in uv))
        f.write(''.join(f'f {inv[a]+1}/{a+1} {inv[b]+1}/{b+1} {inv[c]+1}/{c+1}\n' for a, b, c in idx))

ms = pymeshlab.MeshSet()
ms.load_new_mesh(fin)
ms.meshing_remove_unreferenced_vertices()
if form:
    ms.meshing_decimation_quadric_edge_collapse(targetfacenum=target, qualitythr=0.3, preserveboundary=True, optimalplacement=True,
                                                preservenormal=True, planarquadric=True)
    ms.save_current_mesh(fout, save_vertex_normal=False)
else:
    ms.meshing_decimation_quadric_edge_collapse_with_texture(targetfacenum=target, qualitythr=0.4, extratcoordw=1.0,
                                                              preserveboundary=True, boundaryweight=1.0, optimalplacement=True,
                                                              preservenormal=True, planarquadric=True)
    ms.save_current_mesh(fout, save_wedge_texcoord=True, save_vertex_normal=False)

# OBJ zurücklesen → glTF-Ecken = (Lage, Bildkoordinate)-Paare; Normalen weich über gleiche Lagen
V, T, F = [], [], []
for line in open(fout):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '): T.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('f '):
        F.append([tuple((int(x) - 1 for x in c.split('/')[:2])) if '/' in c else (int(c) - 1, 0) for c in line.split()[1:4]])
if not T: T = [[0.0, 0.0]]
V, T = np.array(V), np.array(T)
key, verts = {}, []
tri = np.zeros((len(F), 3), dtype=np.uint32)
for i, f in enumerate(F):
    for k, c in enumerate(f):
        if c not in key: key[c] = len(verts); verts.append(c)
        tri[i, k] = key[c]
vp = np.array([V[a] for a, _ in verts], dtype=np.float32)
vt = np.array([T[b] for _, b in verts], dtype=np.float32)
fn = np.cross(V[[f[1][0] for f in F]] - V[[f[0][0] for f in F]], V[[f[2][0] for f in F]] - V[[f[0][0] for f in F]])
pn = np.zeros_like(V)
for k in range(3): np.add.at(pn, [f[k][0] for f in F], fn)
pn /= np.maximum(np.linalg.norm(pn, axis=1, keepdims=True), 1e-12)
vn = np.array([pn[a] for a, _ in verts], dtype=np.float32)
print('nachher', len(vp), 'Ecken,', len(tri), 'Dreiecke')

# neue GLB: Geometrie neu, Material und Bilder aus der Quelle übernehmen
images = [binb[j['bufferViews'][im['bufferView']].get('byteOffset', 0):][:j['bufferViews'][im['bufferView']]['byteLength']] for im in j['images']]
out = bytearray(); views = []
def add(data, target=None):
    while len(out) % 4: out.append(0)
    v = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
    if target: v['target'] = target
    out.extend(data); views.append(v); return len(views) - 1
small = len(vp) < 65536
iv = add((tri.astype(np.uint16) if small else tri).tobytes(), 34963)
pv = add(vp.tobytes(), 34962); nv = add(vn.tobytes(), 34962); tv = None if form else add(vt.tobytes(), 34962)
img_views = [] if noimg else [add(bytes(b)) for b in images]
accs = [
    {'bufferView': iv, 'componentType': 5123 if small else 5125, 'count': int(tri.size), 'type': 'SCALAR'},
    {'bufferView': pv, 'componentType': 5126, 'count': len(vp), 'type': 'VEC3', 'min': vp.min(0).tolist(), 'max': vp.max(0).tolist()},
    {'bufferView': nv, 'componentType': 5126, 'count': len(vp), 'type': 'VEC3'},
] + ([] if form else [{'bufferView': tv, 'componentType': 5126, 'count': len(vp), 'type': 'VEC2'}])
g = {
    'asset': {'version': '2.0', 'generator': 'Souls glb_lod.py (MeshLab-Vereinfachung mit Textur)'},
    'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': j['nodes'][0].get('name', 'modell')}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': 1, 'NORMAL': 2, **({} if form else {'TEXCOORD_0': 3})}, 'indices': 0, 'material': 0}]}],
    'materials': j['materials'][:1], 'textures': j['textures'], 'samplers': j.get('samplers', [{}]),
    'images': [] if noimg else [{'bufferView': img_views[i], 'mimeType': im.get('mimeType', 'image/jpeg')} for i, im in enumerate(j['images'])],
    'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(out)}],
}
if noimg:
    m = g['materials'][0]; m.pop('normalTexture', None); m.pop('emissiveTexture', None); m.pop('occlusionTexture', None)
    m.get('pbrMetallicRoughness', {}).pop('baseColorTexture', None); m.get('pbrMetallicRoughness', {}).pop('metallicRoughnessTexture', None)
    for k in ('textures', 'images', 'samplers'): g.pop(k, None)
elif 'samplers' not in j:
    for t in g['textures']: t.pop('sampler', None)
    g.pop('samplers')
js = json.dumps(g, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
while len(out) % 4: out.append(0)
total = 12 + 8 + len(js) + 8 + len(out)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
print('fertig', dst, round(total / 1e6, 2), 'MB')

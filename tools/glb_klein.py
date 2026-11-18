# Verkleinert eine Meshy-GLB fürs Handy: Texturen als JPEG (Farbe/Normal 1024, Rauheit 512), Metall aus.
# Aufruf: python3 tools/glb_klein.py models/quelle/heldin-meshy.glb models/heldin.glb   (braucht Pillow)
import json, struct, sys, io
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read()
clen = struct.unpack_from('<I', d, 12)[0]
j = json.loads(d[20:20 + clen])
blen = struct.unpack_from('<I', d, 20 + clen)[0]
binb = d[28 + clen:28 + clen + blen]
views = [binb[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
mat = j['materials'][0]
pbr = mat['pbrMetallicRoughness']
tex_role = {}
tex_role[j['textures'][pbr['baseColorTexture']['index']]['source']] = ('farbe', 1024, 88)
tex_role[j['textures'][mat['normalTexture']['index']]['source']] = ('normal', 1024, 92)
tex_role[j['textures'][pbr['metallicRoughnessTexture']['index']]['source']] = ('rauheit', 512, 85)
for i, im in enumerate(j['images']):
    name, size, q = tex_role[i]
    img = Image.open(io.BytesIO(views[im['bufferView']])).convert('RGB').resize((size, size), Image.LANCZOS)
    out = io.BytesIO(); img.save(out, 'JPEG', quality=q, optimize=True)
    views[im['bufferView']] = out.getvalue(); im['mimeType'] = 'image/jpeg'; im['name'] = name
    print(name, size, len(out.getvalue()) // 1024, 'KB')
pbr['metallicFactor'] = 0.0
pbr['roughnessFactor'] = 1.0
mat['name'] = 'Heldin'
j['asset']['generator'] = 'Souls glb_klein.py (aus Meshy/Blender)'
nb = bytearray()
for v, data in zip(j['bufferViews'], views):
    while len(nb) % 4: nb.append(0)
    v['byteOffset'] = len(nb); v['byteLength'] = len(data); nb += data
while len(nb) % 4: nb.append(0)
j['buffers'] = [{'byteLength': len(nb)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
total = 12 + 8 + len(js) + 8 + len(nb)
o = struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(nb), b'BIN\x00') + bytes(nb)
open(dst, 'wb').write(o)
print('fertig', len(d) // 1024, 'KB ->', len(o) // 1024, 'KB')

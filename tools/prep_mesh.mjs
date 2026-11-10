// Normalize a generated character mesh for auto-rigging:
// rotate about Y so it faces +Z, put feet at y=0, center on XZ, scale to a target height.
// usage: node prep_mesh.mjs in.glb out.glb <yawDegrees> <heightMeters>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { transformMesh, getBounds } from '@gltf-transform/functions';

const [inp, out, yawDeg = '-90', height = '1.78'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot();
const scene = root.listScenes()[0];

const yaw = (parseFloat(yawDeg) * Math.PI) / 180;
const c = Math.cos(yaw), s = Math.sin(yaw);
// column-major rotation about Y
const rot = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
for (const mesh of root.listMeshes()) transformMesh(mesh, rot);
for (const node of root.listNodes()) { node.setTranslation([0, 0, 0]); node.setRotation([0, 0, 0, 1]); node.setScale([1, 1, 1]); }

let b = getBounds(scene);
const h = b.max[1] - b.min[1];
const k = parseFloat(height) / h;
const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
const m = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -cx * k, -b.min[1] * k, -cz * k, 1];
for (const mesh of root.listMeshes()) transformMesh(mesh, m);
b = getBounds(scene);
console.log('bounds', b.min.map(n => n.toFixed(3)), b.max.map(n => n.toFixed(3)));
let tris = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
console.log('triangles', tris, '| textures', root.listTextures().map(t => t.getSize()?.join('x')).join(', '));
await io.write(out, doc);

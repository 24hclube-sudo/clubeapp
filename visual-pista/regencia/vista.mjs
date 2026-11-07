// Vista de olho: transforma a foto do painel (1032x5676) no que a pessoa de pé vê, com os olhos a 1,60 m olhando para a parede do DJ. A foto do painel deitado engana.
// Uso: node vista.mjs <painel.png> <saida.jpg> [grausParaCima=24] [fov=78]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const FF = 'C:/Program Files (x86)/Nova Star/ViPlex Express/Bin/VideoConverter/ffmpeg.exe';
const [ent, sai, gr = '24', fv = '78'] = process.argv.slice(2);
const W = 900, H = 1120, HT = 0.7532, ZF = 4.39, PASSO = 1.92 / 1032, DOBRA = 4988;
const inc = +gr * Math.PI / 180, f = (H / 2) / Math.tan(+fv / 2 * Math.PI / 180);
const c = Math.cos(inc), s = Math.sin(inc);
const xs = Buffer.alloc(W * H * 2), ys = Buffer.alloc(W * H * 2);
const pgm = (buf, nome) => { const a = path.join(os.tmpdir(), nome); fs.writeFileSync(a, Buffer.concat([Buffer.from(`P5\n${W} ${H}\n65535\n`), buf])); return a; };
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const dx = (i - W / 2) / f, dy = (H / 2 - j) / f;
  const vy = dy * c + s, vz = c - dy * s, vx = dx;
  let px = 65535, py = 65535;
  if (vz > 0) {
    const yW = vy / vz * ZF, xW = vx / vz * ZF;
    if (yW <= HT && yW >= HT - 1.28 && Math.abs(xW) <= 0.96) { px = (xW / 1.92 + 0.5) * 1032; py = DOBRA + (HT - yW) / PASSO; }
  }
  if (px === 65535 && vy > 0) {
    const t = HT / vy, xW = vx * t, zW = vz * t;
    const z0 = ZF - DOBRA * PASSO;
    if (Math.abs(xW) <= 0.96 && zW >= z0 && zW <= ZF) { px = (xW / 1.92 + 0.5) * 1032; py = (zW - z0) / PASSO; }
  }
  xs.writeUInt16BE(Math.min(65535, Math.round(px)), (j * W + i) * 2);
  ys.writeUInt16BE(Math.min(65535, Math.round(py)), (j * W + i) * 2);
}
const a = pgm(xs, 'vista-x.pgm'), b = pgm(ys, 'vista-y.pgm');
const r = spawnSync(FF, ['-y', '-v', 'error', '-i', ent, '-i', a, '-i', b, '-lavfi', '[0:v]format=gbrp[p];[p][1:v][2:v]remap', '-q:v', '3', sai], { encoding: 'utf8' });
if (r.status) console.log(r.stderr);

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const imageDir = path.join(root, 'public', 'images');
const audioDir = path.join(root, 'public', 'audio');

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const font = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
};

function color(hex, alpha = 255) {
  const normalized = hex.replace('#', '');
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
    alpha,
  ];
}

function canvas(width, height, fill = [0, 0, 0, 0]) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { data, height, width };
}

function setPixel(img, x, y, rgba) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data.set(rgba, (y * img.width + x) * 4);
}

function fillRect(img, x, y, width, height, rgba) {
  for (let yy = Math.floor(y); yy < Math.floor(y + height); yy++) {
    for (let xx = Math.floor(x); xx < Math.floor(x + width); xx++) setPixel(img, xx, yy, rgba);
  }
}

function rect(img, x, y, width, height, rgba, thickness = 1) {
  for (let i = 0; i < thickness; i++) {
    fillRect(img, x + i, y + i, width - i * 2, 1, rgba);
    fillRect(img, x + i, y + height - 1 - i, width - i * 2, 1, rgba);
    fillRect(img, x + i, y + i, 1, height - i * 2, rgba);
    fillRect(img, x + width - 1 - i, y + i, 1, height - i * 2, rgba);
  }
}

function line(img, x0, y0, x1, y1, rgba, thickness = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (x1 - x0) * (i / steps);
    const y = y0 + (y1 - y0) * (i / steps);
    fillRect(img, x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, rgba);
  }
}

function ellipse(img, cx, cy, rx, ry, rgba) {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) setPixel(img, cx + x, cy + y, rgba);
    }
  }
}

function triangle(img, ax, ay, bx, by, cx, cy, rgba) {
  const minX = Math.floor(Math.min(ax, bx, cx));
  const maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      const w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
      const w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
      if (area < 0 ? w0 <= 0 && w1 <= 0 && w2 <= 0 : w0 >= 0 && w1 >= 0 && w2 >= 0) setPixel(img, x, y, rgba);
    }
  }
}

function textWidth(text, scale) {
  return [...text].reduce((sum, char) => sum + ((font[char] ? 6 : 3) * scale), 0);
}

function drawText(img, text, x, y, scale, rgba) {
  let cursor = x;
  for (const char of text.toUpperCase()) {
    const glyph = font[char] || font[' '];
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === '1') fillRect(img, cursor + col * scale, y + row * scale, scale, scale, rgba);
      }
    }
    cursor += 6 * scale;
  }
}

function drawCenteredText(img, text, y, scale, rgba) {
  drawText(img, text, Math.floor((img.width - textWidth(text, scale)) / 2), y, scale, rgba);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crcBuffer = Buffer.concat([typeBuffer, data]);
  let crc = 0xffffffff;
  for (const byte of crcBuffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

async function writePng(filePath, img) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.width, 0);
  header.writeUInt32BE(img.height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    rows.push(Buffer.from([0]));
    rows.push(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4));
  }
  await writeFile(filePath, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

function drawCloud(img, x, y) {
  const white = color('#e7fbff');
  const shade = color('#b9e5f0');
  ellipse(img, x + 24, y + 15, 23, 11, shade);
  ellipse(img, x + 8, y + 20, 18, 8, white);
  ellipse(img, x + 28, y + 13, 24, 14, white);
  ellipse(img, x + 50, y + 20, 20, 8, white);
}

function drawTree(img, x, y, scale = 1) {
  const bark = color('#704116');
  const dark = color('#2a7b22');
  const leaf = color('#76c934');
  fillRect(img, x, y, 14 * scale, 120 * scale, bark);
  line(img, x + 8 * scale, y + 50 * scale, x - 38 * scale, y + 10 * scale, bark, 8 * scale);
  line(img, x + 10 * scale, y + 65 * scale, x + 48 * scale, y + 20 * scale, bark, 8 * scale);
  for (const [lx, ly, rx, ry] of [[-45, -3, 33, 25], [-8, -56, 40, 31], [36, -12, 35, 24], [2, 18, 34, 24]]) {
    ellipse(img, x + lx * scale, y + ly * scale, rx * scale, ry * scale, dark);
    ellipse(img, x + (lx + 4) * scale, y + (ly - 3) * scale, (rx - 5) * scale, (ry - 5) * scale, leaf);
  }
}

function drawReeds(img, yBase, alpha = 255) {
  const dark = color('#174b28', alpha);
  const light = color('#91d94d', alpha);
  const seed = color('#7a4d20', alpha);
  for (let x = 0; x < img.width; x += 7) {
    const h = 28 + ((x * 13) % 33);
    line(img, x, yBase, x + ((x % 17) - 8), yBase - h, x % 3 ? dark : light, 2);
    if (x % 11 === 0) ellipse(img, x + ((x % 17) - 8), yBase - h - 5, 3, 9, seed);
  }
}

function drawHud(img) {
  const green = color('#49d62f');
  const cyan = color('#45cfff');
  rect(img, 56, 608, 76, 72, green, 3);
  rect(img, 190, 608, 316, 72, green, 3);
  rect(img, 538, 608, 190, 72, green, 3);
  drawText(img, 'SHOT', 68, 654, 3, cyan);
  drawText(img, 'HIT', 202, 621, 4, green);
  fillRect(img, 71, 666, 47, 5, cyan);
  fillRect(img, 200, 662, 294, 11, cyan);
}

function background() {
  const img = canvas(768, 721, color('#63c6ef'));
  drawCloud(img, 72, 48);
  drawCloud(img, 540, 72);
  drawTree(img, 95, 282, 1);
  drawTree(img, 650, 334, 0.72);
  fillRect(img, 0, 392, 768, 92, color('#88d840'));
  drawReeds(img, 466);
  fillRect(img, 0, 484, 768, 237, color('#7b6508'));
  fillRect(img, 0, 476, 768, 14, color('#332508'));
  for (let x = 0; x < 768; x += 18) fillRect(img, x, 488 + ((x * 7) % 18), 5, 4, color('#1c1707'));
  drawHud(img);
  return img;
}

function grassOverlay() {
  const img = canvas(768, 721);
  fillRect(img, 0, 394, 768, 90, color('#8cdb3d', 235));
  drawReeds(img, 466, 255);
  fillRect(img, 0, 477, 768, 244, color('#796308', 255));
  fillRect(img, 0, 469, 768, 13, color('#2f2707', 255));
  drawHud(img);
  return img;
}

function logo() {
  const img = canvas(550, 275);
  drawCenteredText(img, 'POND', 25, 16, color('#1ce1d8'));
  fillRect(img, 70, 145, 410, 8, color('#ff9f35'));
  drawCenteredText(img, 'PATROL', 172, 12, color('#1ce1d8'));
  return img;
}

function button(width, height) {
  const img = canvas(width, height);
  fillRect(img, 6, 6, width - 12, height - 12, color('#050505'));
  rect(img, 6, 6, width - 12, height - 12, color('#ffffff'), 3);
  rect(img, 10, 10, width - 20, height - 20, color('#2d7ee8'), 2);
  return img;
}

function drawBirdFrame(img, ox, oy, tint, wing) {
  const outline = color('#10202b');
  const body = color(tint);
  const belly = color('#f6edd3');
  const beak = color('#f0a13a');
  ellipse(img, ox + 19, oy + 17, 12, 8, outline);
  ellipse(img, ox + 18, oy + 16, 10, 7, body);
  ellipse(img, ox + 24, oy + 18, 4, 3, belly);
  ellipse(img, ox + 29, oy + 13, 5, 5, outline);
  ellipse(img, ox + 29, oy + 13, 4, 4, body);
  fillRect(img, ox + 31, oy + 11, 2, 2, color('#ffffff'));
  fillRect(img, ox + 32, oy + 12, 1, 1, color('#000000'));
  triangle(img, ox + 34, oy + 13, ox + 41, oy + 10, ox + 36, oy + 17, beak);
  triangle(img, ox + 7, oy + 17, ox - 2, oy + 12, ox + 2, oy + 22, body);
  if (wing === 0) triangle(img, ox + 18, oy + 13, ox + 4, oy - 4, ox + 25, oy + 11, outline);
  if (wing === 1) triangle(img, ox + 18, oy + 13, ox + 5, oy + 19, ox + 25, oy + 20, outline);
  if (wing === 2) triangle(img, ox + 18, oy + 18, ox + 10, oy + 33, ox + 28, oy + 21, outline);
  fillRect(img, ox + 17, oy + 24, 3, 5, color('#d4792f'));
  fillRect(img, ox + 25, oy + 23, 3, 5, color('#d4792f'));
}

function birds(falling = false) {
  const img = canvas(111, 99);
  const tints = ['#2aa96b', '#d65344', '#2d79d6'];
  for (let row = 0; row < 3; row++) {
    for (let frame = 0; frame < 3; frame++) {
      const ox = frame * 37;
      const oy = row * 33;
      if (falling) {
        drawBirdFrame(img, ox, oy, tints[row], 1);
        line(img, ox + 9 + frame * 2, oy + 4, ox + 28 - frame * 2, oy + 28, color('#10202b'), 2);
      } else {
        drawBirdFrame(img, ox, oy, tints[row], frame);
      }
    }
  }
  return img;
}

function drawDogFrame(img, ox, oy, pose = 0) {
  const outline = color('#1a140f');
  const body = color('#c78a45');
  const dark = color('#5d3822');
  const cream = color('#f3dfbf');
  const nose = color('#0d0c0b');
  fillRect(img, ox + 8, oy + 24, 32, 15, outline);
  fillRect(img, ox + 10, oy + 22, 29, 14, body);
  ellipse(img, ox + 38, oy + 22, 12, 10, outline);
  ellipse(img, ox + 37, oy + 21, 10, 8, cream);
  ellipse(img, ox + 31, oy + 18, 7, 11, dark);
  fillRect(img, ox + 45, oy + 21, 5, 4, nose);
  fillRect(img, ox + 39, oy + 18, 2, 2, color('#000000'));
  line(img, ox + 10, oy + 26, ox + 1, oy + 14 - pose * 2, outline, 4);
  fillRect(img, ox + 12 + pose, oy + 36, 5, 13, dark);
  fillRect(img, ox + 30 - pose, oy + 36, 5, 13, dark);
}

function dogSheet() {
  const img = canvas(317, 109);
  drawDogFrame(img, 0, 0, -1);
  drawDogFrame(img, 57, 0, 0);
  drawDogFrame(img, 114, 0, 1);
  drawDogFrame(img, 171, 0, -1);
  drawDogFrame(img, 228, 0, 1);
  drawDogFrame(img, 57, 54, 0);
  line(img, 87, 92, 101, 70, color('#c78a45'), 5);
  drawDogFrame(img, 139, 54, 0);
  drawBirdFrame(img, 170, 62, '#2aa96b', 1);
  drawDogFrame(img, 198, 54, 0);
  drawBirdFrame(img, 229, 62, '#d65344', 1);
  drawBirdFrame(img, 215, 68, '#2d79d6', 1);
  drawDogFrame(img, 252, 54, 0);
  fillRect(img, 284, 77, 12, 7, color('#0d0c0b'));
  drawDogFrame(img, 282, 54, 1);
  fillRect(img, 313, 78, 4, 5, color('#0d0c0b'));
  return img;
}

function shotIcon() {
  const img = canvas(12, 21);
  fillRect(img, 4, 1, 4, 12, color('#f4d35e'));
  rect(img, 3, 0, 6, 14, color('#4f3214'), 1);
  fillRect(img, 2, 14, 8, 6, color('#2f88cc'));
  return img;
}

function subroundIcon(hit) {
  const img = canvas(21, 21);
  const main = hit ? color('#53d660') : color('#f4f4f4');
  const outline = hit ? color('#183f21') : color('#2b2b2b');
  ellipse(img, 10, 10, 7, 5, outline);
  ellipse(img, 10, 10, 5, 4, main);
  triangle(img, 4, 10, 0, 7, 1, 13, outline);
  triangle(img, 15, 10, 21, 8, 17, 14, outline);
  fillRect(img, 13, 6, 3, 3, main);
  return img;
}

function favicon() {
  const img = canvas(32, 32, color('#63c6ef'));
  drawBirdFrame(img, 0, 2, '#2aa96b', 0);
  return img;
}

function drawAssets() {
  return {
    'big_button.png': button(147, 99),
    'dog.png': dogSheet(),
    'duck_fall.png': birds(true),
    'duck_fly_up.png': birds(false),
    'favicon.ico': favicon(),
    'game_board.png': background(),
    'game_board_grass.png': grassOverlay(),
    'logo.png': logo(),
    'shot.png': shotIcon(),
    'small_button.png': button(219, 51),
    'subround_duck_red.png': subroundIcon(true),
    'subround_duck_white.png': subroundIcon(false),
  };
}

function synth(duration, fn, sampleRate = 44100) {
  const samples = Math.floor(duration * sampleRate);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    out[i] = Math.max(-1, Math.min(1, fn(t, i / samples)));
  }
  return { out, sampleRate };
}

function tone(freq, t, type = 'sine') {
  const phase = 2 * Math.PI * freq * t;
  if (type === 'square') return Math.sign(Math.sin(phase));
  if (type === 'saw') return 2 * (freq * t - Math.floor(freq * t + 0.5));
  return Math.sin(phase);
}

function envelope(p, attack = 0.04, release = 0.2) {
  return Math.min(1, p / attack) * Math.min(1, (1 - p) / release);
}

function writeWavBuffer({ out, sampleRate }) {
  const dataSize = out.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < out.length; i++) buffer.writeInt16LE(Math.round(out[i] * 32767), 44 + i * 2);
  return buffer;
}

function audioAssets() {
  const noise = i => (((i * 1103515245 + 12345) >>> 16) & 0x7fff) / 0x3fff - 1;
  return {
    'bird-caught.wav': synth(0.45, t => 0.22 * (tone(720, t) + tone(960, t)) * envelope(t / 0.45)),
    'bird-drop.wav': synth(0.25, (t, p) => 0.38 * tone(90 - 45 * p, t, 'sine') * envelope(p, 0.01, 0.55)),
    'bird-falling.wav': synth(0.75, (t, p) => 0.3 * tone(900 - 620 * p, t, 'saw') * envelope(p, 0.02, 0.1)),
    'bird-flapping.wav': synth(0.32, (t, p) => 0.13 * tone(55, t, 'square') + 0.12 * noise(Math.floor(t * 44100)) * envelope(p, 0.01, 0.08)),
    'game-over.wav': synth(1.1, (t, p) => 0.25 * tone(260 - 120 * p, t, 'saw') * envelope(p, 0.03, 0.35)),
    'guide-laugh.wav': synth(0.95, (t, p) => 0.22 * tone(p < 0.5 ? 290 : 340, t, 'square') * envelope((p * 2) % 1, 0.03, 0.25)),
    'intro.wav': synth(1.8, t => {
      const notes = [392, 523, 659, 784, 659, 523, 440, 587];
      const note = notes[Math.floor(t * 5) % notes.length];
      return 0.2 * (tone(note, t, 'square') + 0.35 * tone(note * 2, t)) * envelope((t * 5) % 1, 0.03, 0.18);
    }),
    'perfect.wav': synth(1.25, t => {
      const notes = [523, 659, 784, 1046];
      const note = notes[Math.min(3, Math.floor(t * 4))];
      return 0.22 * (tone(note, t, 'square') + tone(note * 1.5, t) * 0.3) * envelope((t * 4) % 1, 0.02, 0.24);
    }),
    'pop-shot.wav': synth(0.18, (t, p) => 0.48 * (tone(120 - 70 * p, t) + noise(Math.floor(t * 44100)) * 0.5) * envelope(p, 0.005, 0.5)),
    'start.wav': synth(1.1, t => {
      const notes = [262, 330, 392, 523];
      const note = notes[Math.floor(t * 4) % notes.length];
      return 0.18 * tone(note, t, 'square') * envelope((t * 4) % 1, 0.04, 0.3);
    }),
  };
}

await mkdir(imageDir, { recursive: true });
await mkdir(audioDir, { recursive: true });

for (const [name, img] of Object.entries(drawAssets())) {
  await writePng(path.join(imageDir, name), img);
}

await rm(audioDir, { recursive: true, force: true });
await mkdir(audioDir, { recursive: true });
for (const [name, asset] of Object.entries(audioAssets())) {
  await writeFile(path.join(audioDir, name), writeWavBuffer(asset));
}

console.log(`Generated original art in ${imageDir}`);
console.log(`Generated original audio in ${audioDir}`);

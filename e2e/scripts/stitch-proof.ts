import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

// Concatenates every recorded test video from the last run into one mp4 a
// reviewer can watch end to end. Playwright's own ffmpeg is a minimal build
// without the concat demuxer, hence ffmpeg-static.
const root = path.resolve(__dirname, '..');
const resultsDir = path.join(root, 'test-results');
const outDir = path.join(root, 'playwright-report');
const out = path.join(outDir, 'proof.mp4');

function findVideos(): string[] {
  if (!fs.existsSync(resultsDir)) return [];
  return fs
    .readdirSync(resultsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const dir = path.join(resultsDir, d.name);
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.webm'))
        .map((f) => path.join(dir, f));
    })
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
}

const videos = findVideos();
if (videos.length === 0) {
  console.log('No videos under test-results; nothing to stitch.');
  process.exit(0);
}
if (!ffmpeg) throw new Error('ffmpeg-static has no binary for this platform');

fs.mkdirSync(outDir, { recursive: true });
const list = path.join(outDir, 'proof-list.txt');
fs.writeFileSync(
  list,
  videos.map((v) => `file '${v.replace(/'/g, "'\\''")}'`).join('\n') + '\n'
);
const result = spawnSync(
  ffmpeg,
  [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-movflags',
    '+faststart',
    out,
  ],
  { stdio: 'inherit' }
);
fs.unlinkSync(list);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  `Stitched ${videos.length} video(s) into ${path.relative(root, out)}`
);

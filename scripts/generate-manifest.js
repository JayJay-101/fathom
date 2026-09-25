// scripts/generate-manifest.js
//
// Build-time asset discovery: probes the real media files in public/ with
// ffprobe and writes their exact durations into src/data/generated-manifest.json,
// which the React app imports statically. Runs automatically via the
// "predev" / "prebuild" hooks in package.json.
//
// Graceful degradation (both cases keep the committed manifest untouched, so
// CI machines without media files or ffprobe still build):
//   - public/ missing or empty  -> skip
//   - ffprobe not installed     -> skip
//
// Media files are optional in this repo (see public/README.md): with none
// present the committed manifest supplies each pattern's session length.
import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const OUTPUT_FILE = path.resolve(process.cwd(), 'src/data/generated-manifest.json');

function hasFfprobe() {
  try {
    execSync('ffprobe -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getDurationSec(filePath) {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]).toString().trim();
    const sec = parseFloat(output);
    return Number.isFinite(sec) ? sec : 0;
  } catch {
    console.error(`⚠️  ffprobe failed for ${filePath}`);
    return 0;
  }
}

function scanDir(dir, extension) {
  if (!fs.existsSync(dir)) return {};
  const entries = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(extension)).sort()) {
    const full = path.join(dir, file);
    const durationSec = getDurationSec(full);
    entries[file] = {
      durationSec,
      durationMs: Math.round(durationSec * 1000),
      sizeBytes: fs.statSync(full).size,
    };
  }
  return entries;
}

function generateManifest() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.log('ℹ️  public/ not found — keeping existing generated-manifest.json');
    return;
  }
  if (!hasFfprobe()) {
    console.log('ℹ️  ffprobe not available — keeping existing generated-manifest.json');
    return;
  }

  const audio = scanDir(path.join(PUBLIC_DIR, 'audio'), '.opus');
  const video = scanDir(path.join(PUBLIC_DIR, 'video'), '.webm');

  if (Object.keys(audio).length === 0 && Object.keys(video).length === 0) {
    console.log('ℹ️  No media files in public/ — keeping existing generated-manifest.json');
    return;
  }

  // Derive each pattern's session length from its bed track:
  // prana_<pattern>_<length>_<binaural|isochronic>.opus
  const patterns = {};
  for (const [file, meta] of Object.entries(audio)) {
    const match = file.match(/^prana_([a-z0-9-]+)_\d+min_(binaural|isochronic)\.opus$/);
    if (!match) continue;
    const patternId = match[1];
    const existing = patterns[patternId];
    if (existing && existing.totalDurationMs !== meta.durationMs) {
      console.warn(
        `⚠️  ${patternId}: bed tracks disagree on duration (${existing.totalDurationMs}ms vs ${meta.durationMs}ms from ${file})`
      );
    }
    patterns[patternId] = { totalDurationMs: meta.durationMs, totalDurationSec: meta.durationSec };
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    patterns,
    audio,
    video,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `✅ Asset manifest generated: ${Object.keys(patterns).length} patterns, ` +
      `${Object.keys(audio).length} audio, ${Object.keys(video).length} video → ${path.relative(process.cwd(), OUTPUT_FILE)}`
  );
}

generateManifest();

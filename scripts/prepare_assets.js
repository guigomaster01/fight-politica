const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const brainDir = '/Users/rfr/.gemini/antigravity-ide/brain/56e0640b-7d79-4dff-850c-48e797b73c6c';
const outputDir = path.join(__dirname, '../public/assets/images');

fs.mkdirSync(outputDir, { recursive: true });

function removeWhiteBgFloodFill(data, width, height, extraSeeds = []) {
  const visited = new Uint8Array(width * height);
  const queue = [];

  function enqueue(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;

    const p = idx * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];

    // Check if background pixel (close to white: r>235, g>235, b>235)
    if (r > 235 && g > 235 && b > 235) {
      data[p + 3] = 0; // Transparent
      queue.push(x, y);
    }
  }

  // Border seeds
  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  // Extra seeds for between legs / arm gaps
  for (const [sx, sy] of extraSeeds) {
    enqueue(sx, sy);
  }

  let head = 0;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];

    enqueue(cx + 1, cy);
    enqueue(cx - 1, cy);
    enqueue(cx, cy + 1);
    enqueue(cx, cy - 1);
  }
}

async function processAssets() {
  // 1. Arena Background
  await sharp(path.join(brainDir, 'arena_clean_background_1792016200718.jpg'))
    .resize(1280, 720, { fit: 'cover' })
    .jpeg({ quality: 92 })
    .toFile(path.join(outputDir, 'arena.jpg'));
  console.log('✓ arena.jpg created');

  // 2. Title Logo
  await sharp(path.join(brainDir, 'title_screen_logo_1792016228132.jpg'))
    .resize(1024, 576, { fit: 'cover' })
    .jpeg({ quality: 92 })
    .toFile(path.join(outputDir, 'title.jpg'));
  console.log('✓ title.jpg created');

  // 3. Fighter 13
  const f13Raw = await sharp(path.join(brainDir, 'fighter_13_white_bg_1792016867821.jpg'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: d13, info: info13 } = f13Raw;
  // Seed between legs around x=500, y=700 and under right arm x=650, y=300
  removeWhiteBgFloodFill(d13, info13.width, info13.height, [
    [480, 750],
    [520, 800],
    [640, 480],
    [320, 480]
  ]);

  await sharp(d13, {
    raw: {
      width: info13.width,
      height: info13.height,
      channels: 4
    }
  })
    .trim({ threshold: 5 })
    .png()
    .toFile(path.join(outputDir, 'char13.png'));
  console.log('✓ char13.png created');

  // 4. Fighter 22
  const f22Raw = await sharp(path.join(brainDir, 'fighter_22_sprite_1792016160249.jpg'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: d22, info: info22 } = f22Raw;
  removeWhiteBgFloodFill(d22, info22.width, info22.height, [
    [500, 700],
    [520, 750],
    [360, 480]
  ]);

  await sharp(d22, {
    raw: {
      width: info22.width,
      height: info22.height,
      channels: 4
    }
  })
    .trim({ threshold: 5 })
    .flop() // Rotate 180 degrees horizontally to face opponent
    .png()
    .toFile(path.join(outputDir, 'char22.png'));
  console.log('✓ char22.png created');

  // 5. Create Avatars (bust / head close-up for character cards)
  await sharp(path.join(outputDir, 'char13.png'))
    .extract({ left: 100, top: 0, width: 400, height: 400 })
    .resize(300, 300)
    .png()
    .toFile(path.join(outputDir, 'char13_avatar.png'))
    .catch(async () => {
      // Fallback if bounds differ
      await sharp(path.join(outputDir, 'char13.png'))
        .resize(300, 300, { fit: 'contain' })
        .png()
        .toFile(path.join(outputDir, 'char13_avatar.png'));
    });

  await sharp(path.join(outputDir, 'char22.png'))
    .extract({ left: 100, top: 0, width: 400, height: 400 })
    .resize(300, 300)
    .png()
    .toFile(path.join(outputDir, 'char22_avatar.png'))
    .catch(async () => {
      await sharp(path.join(outputDir, 'char22.png'))
        .resize(300, 300, { fit: 'contain' })
        .png()
        .toFile(path.join(outputDir, 'char22_avatar.png'));
    });

  console.log('✓ Avatars created successfully');
}

processAssets().catch(err => {
  console.error('Error processing assets:', err);
  process.exit(1);
});

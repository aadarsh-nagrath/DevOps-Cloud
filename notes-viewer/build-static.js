const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const STATIC_NOTES_DIR = path.resolve(PUBLIC_DIR, 'static-notes');

// Exclude these directories and files
const EXCLUDE_DIRS = ['.git', 'node_modules', 'notes-viewer', '.DS_Store'];

// Helper to recursively copy directories/files and list markdown notes
function buildStaticData(srcDir, destDir, fileList = []) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const items = fs.readdirSync(srcDir);

  items.forEach(item => {
    const srcPath = path.join(srcDir, item);
    const destPath = path.join(destDir, item);
    let stat;

    try {
      stat = fs.statSync(srcPath);
    } catch (e) {
      return; // Skip broken links/errors
    }

    if (EXCLUDE_DIRS.includes(item)) {
      return;
    }

    if (stat.isDirectory()) {
      buildStaticData(srcPath, destPath, fileList);
    } else if (stat.isFile()) {
      // Copy file
      fs.copyFileSync(srcPath, destPath);

      if (item.toLowerCase().endsWith('.md')) {
        const relativePath = path.relative(REPO_ROOT, srcPath);
        fileList.push({
          name: item,
          path: relativePath,
          size: stat.size,
          mtime: stat.mtime
        });
      }
    }
  });

  return fileList;
}

console.log('Starting static notes compiler...');
// Clean target directory
if (fs.existsSync(STATIC_NOTES_DIR)) {
  fs.rmSync(STATIC_NOTES_DIR, { recursive: true, force: true });
}

try {
  const noteList = buildStaticData(REPO_ROOT, STATIC_NOTES_DIR);

  // Write index.json
  fs.writeFileSync(
    path.join(STATIC_NOTES_DIR, 'index.json'),
    JSON.stringify(noteList, null, 2),
    'utf-8'
  );

  console.log(`Static build complete successfully! Copied ${noteList.length} notes and assets to public/static-notes/`);
} catch (error) {
  console.error('Static build failed:', error);
  process.exit(1);
}

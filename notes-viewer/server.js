const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const REPO_ROOT = path.resolve(__dirname, '..');

// Exclude these directories and files
const EXCLUDE_DIRS = ['.git', 'node_modules', 'notes-viewer', '.DS_Store'];

// Helper to recursively find markdown files
function scanDirectory(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (e) {
      return; // Skip broken symlinks or unreadable files
    }
    
    // Ignore excluded items
    if (EXCLUDE_DIRS.includes(file)) {
      return;
    }
    
    if (stat.isDirectory()) {
      scanDirectory(filePath, fileList);
    } else if (stat.isFile() && file.toLowerCase().endsWith('.md')) {
      const relativePath = path.relative(REPO_ROOT, filePath);
      fileList.push({
        name: file,
        path: relativePath,
        size: stat.size,
        mtime: stat.mtime
      });
    }
  });
  
  return fileList;
}

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// Serve repository assets (images, guides) statically
app.use('/repo-assets', express.static(REPO_ROOT));

// API to list all markdown notes
app.get('/api/notes', (req, res) => {
  try {
    const notes = scanDirectory(REPO_ROOT);
    res.json(notes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to scan notes directory' });
  }
});

// API to get content of a single note
app.get('/api/notes/content', (req, res) => {
  const notePath = req.query.path;
  if (!notePath) {
    return res.status(400).json({ error: 'Path parameter is required' });
  }

  // Resolve target file path and verify it stays inside REPO_ROOT to prevent directory traversal
  const targetPath = path.resolve(REPO_ROOT, notePath);
  if (!targetPath.startsWith(REPO_ROOT)) {
    return res.status(403).json({ error: 'Access denied: Out of workspace bounds' });
  }

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const content = fs.readFileSync(targetPath, 'utf-8');
    res.send(content);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

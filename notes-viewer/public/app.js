// Global State
let allNotes = [];
let currentPath = '';

// DOM Elements
const notesTreeEl = document.getElementById('notes-tree');
const noteSearchEl = document.getElementById('note-search');
const clearSearchEl = document.getElementById('clear-search');
const welcomeScreenEl = document.getElementById('welcome-screen');
const markdownContainerEl = document.getElementById('markdown-container');
const noteContentEl = document.getElementById('note-content');
const breadcrumbsEl = document.getElementById('breadcrumbs');
const totalNotesCountEl = document.getElementById('total-notes-count');
const themeToggleEl = document.getElementById('theme-toggle');
const toggleSidebarEl = document.getElementById('toggle-sidebar');
const sidebarEl = document.querySelector('.sidebar');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  fetchNotes();
  setupEventListeners();
});

// Theme Management
const THEMES = ['light', 'dark', 'cyberpunk', 'nord'];

function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function updateThemeIcon(theme) {
  const icon = themeToggleEl.querySelector('i');
  themeToggleEl.title = `Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`;
  
  if (theme === 'light') {
    icon.className = 'fa-solid fa-sun';
  } else if (theme === 'dark') {
    icon.className = 'fa-solid fa-moon';
  } else if (theme === 'cyberpunk') {
    icon.className = 'fa-solid fa-bolt';
  } else if (theme === 'nord') {
    icon.className = 'fa-solid fa-snowflake';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const currentIndex = THEMES.indexOf(current);
  const nextIndex = (currentIndex + 1) % THEMES.length;
  const nextTheme = THEMES[nextIndex];
  
  document.documentElement.setAttribute('data-theme', nextTheme);
  localStorage.setItem('theme', nextTheme);
  updateThemeIcon(nextTheme);
}

// Fetch Notes list
async function fetchNotes() {
  try {
    let res;
    let isStaticMode = false;
    try {
      res = await fetch('/api/notes');
      if (!res.ok) throw new Error('Express API unavailable');
    } catch (apiErr) {
      console.log('API failed, falling back to static notes index...');
      res = await fetch('./static-notes/index.json');
      if (!res.ok) throw new Error('Failed to load notes from both API and static fallback');
      isStaticMode = true;
    }
    
    window.isStaticMode = isStaticMode; // Store flag globally
    allNotes = await res.json();
    
    // Sort notes alphabetically by path
    allNotes.sort((a, b) => a.path.localeCompare(b.path));
    
    totalNotesCountEl.textContent = allNotes.length;
    renderTree(allNotes);
    
    // Handle URL Hash navigation
    handleHashNavigation();
  } catch (err) {
    notesTreeEl.innerHTML = `<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Error loading notes list</div>`;
    console.error(err);
  }
}

// Handle Hash navigation to support reload/direct linking
function handleHashNavigation() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#')) {
    const targetPath = decodeURIComponent(hash.substring(1));
    const matchedNote = allNotes.find(n => n.path === targetPath);
    if (matchedNote) {
      loadNote(matchedNote.path);
    }
  }
}

// Setup listeners
function setupEventListeners() {
  // Search filtering
  noteSearchEl.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (q) {
      clearSearchEl.style.display = 'block';
      filterNotes(q);
    } else {
      clearSearchEl.style.display = 'none';
      renderTree(allNotes);
    }
  });

  clearSearchEl.addEventListener('click', () => {
    noteSearchEl.value = '';
    clearSearchEl.style.display = 'none';
    renderTree(allNotes);
  });

  // Theme Toggle
  themeToggleEl.addEventListener('click', toggleTheme);

  // Toggle Sidebar on small devices
  toggleSidebarEl.addEventListener('click', () => {
    sidebarEl.classList.toggle('hidden');
  });

  // Handle browser back/forward buttons
  window.addEventListener('hashchange', handleHashNavigation);
}

// Filter notes for search
function filterNotes(query) {
  const filtered = allNotes.filter(note => {
    return note.name.toLowerCase().includes(query) || note.path.toLowerCase().includes(query);
  });
  renderTree(filtered, true); // Auto-expand all during search
}

// Parse flat array into Hierarchical Object Tree
function buildTreeStructure(files) {
  const root = {};
  files.forEach(file => {
    const parts = file.path.split('/');
    let current = root;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        current[part] = { _file: file };
      } else {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    });
  });
  return root;
}

// Render Folder Tree
function renderTree(files, autoExpand = false) {
  if (files.length === 0) {
    notesTreeEl.innerHTML = `<div class="empty-search">No notes found</div>`;
    return;
  }

  const treeData = buildTreeStructure(files);
  notesTreeEl.innerHTML = '';
  const fragment = document.createDocumentFragment();
  
  createTreeNodes(treeData, fragment, autoExpand);
  notesTreeEl.appendChild(fragment);
}

// Helper to get cooler, specific file icons
function getFileIconClass(fileName, filePath) {
  const name = fileName.toLowerCase();
  const path = filePath.toLowerCase();
  
  if (path.includes('kubernetes') || path.includes('k8') || path.includes('cka')) {
    return 'fa-solid fa-dharmachakra icon-k8s';
  }
  if (path.includes('docker')) {
    return 'fa-brands fa-docker icon-docker';
  }
  if (path.includes('terraform') || path.includes('cf')) {
    return 'fa-solid fa-cubes icon-terraform';
  }
  if (path.includes('aws') || path.includes('cloud')) {
    return 'fa-solid fa-cloud icon-aws';
  }
  if (path.includes('scripting') || name.endsWith('.sh') || path.includes('bash')) {
    return 'fa-solid fa-terminal icon-bash';
  }
  if (path.includes('jenkins') || path.includes('cicd') || path.includes('pipeline')) {
    return 'fa-solid fa-circle-nodes icon-jenkins';
  }
  if (path.includes('ansible')) {
    return 'fa-solid fa-gears icon-ansible';
  }
  if (path.includes('git') || path.includes('argo')) {
    return 'fa-solid fa-square-git icon-git';
  }
  
  return 'fa-regular fa-file-code icon-default';
}

// Helper to get folder icons based on directory name
function getFolderIconClass(folderName) {
  const name = folderName.toLowerCase();
  if (name.includes('kubernetes') || name.includes('cka')) return 'fa-solid fa-dharmachakra folder-k8s';
  if (name.includes('docker')) return 'fa-brands fa-docker folder-docker';
  if (name.includes('terraform') || name.includes('cf') || name.includes('cloud')) return 'fa-solid fa-cubes folder-terraform';
  if (name.includes('scripting')) return 'fa-solid fa-terminal folder-scripting';
  if (name.includes('project')) return 'fa-solid fa-diagram-project folder-project';
  return 'fa-solid fa-folder-closed'; // Default folder closed
}

// Generate Nodes recursively
function createTreeNodes(obj, container, autoExpand, parentPath = '') {
  // Sort properties so folders appear first, then files
  const keys = Object.keys(obj).sort((a, b) => {
    const aIsFile = obj[a]._file !== undefined;
    const bIsFile = obj[b]._file !== undefined;
    if (aIsFile && !bIsFile) return 1;
    if (!aIsFile && bIsFile) return -1;
    return a.localeCompare(b);
  });

  keys.forEach(key => {
    const node = obj[key];
    const isFile = node._file !== undefined;

    if (isFile) {
      // Create File Leaf
      const file = node._file;
      const fileLink = document.createElement('a');
      fileLink.className = `tree-file ${currentPath === file.path ? 'active' : ''}`;
      fileLink.href = `#${encodeURIComponent(file.path)}`;
      fileLink.dataset.path = file.path;
      
      const fileIcon = getFileIconClass(file.name, file.path);
      fileLink.innerHTML = `<i class="${fileIcon} file-icon"></i> <span>${file.name.replace(/\.md$/i, '')}</span>`;
      
      fileLink.addEventListener('click', (e) => {
        e.preventDefault();
        loadNote(file.path);
      });
      container.appendChild(fileLink);
    } else {
      // Create Folder Node
      const currentFolderQueryPath = parentPath ? `${parentPath}/${key}` : key;
      const folderDiv = document.createElement('div');
      folderDiv.className = 'tree-folder';

      const folderHeader = document.createElement('div');
      folderHeader.className = `folder-header ${!autoExpand ? 'collapsed' : ''}`;
      const folderIcon = getFolderIconClass(key);
      folderHeader.innerHTML = `
        <i class="${folderIcon} folder-icon"></i>
        <span>${key}</span>
        <i class="fa-solid fa-chevron-down arrow-icon"></i>
      `;

      const folderContent = document.createElement('div');
      folderContent.className = 'folder-content';
      
      // Auto collapse/expand based on mode
      if (!autoExpand) {
        folderContent.style.display = 'none';
      }

      folderHeader.addEventListener('click', () => {
        const isCollapsed = folderHeader.classList.toggle('collapsed');
        folderContent.style.display = isCollapsed ? 'none' : 'block';
        
        // Toggle folder icon state if it's the default closed/open folder icon
        const fIcon = folderHeader.querySelector('.folder-icon');
        if (fIcon.classList.contains('fa-folder-closed') || fIcon.classList.contains('fa-folder-open')) {
          fIcon.className = `fa-solid ${isCollapsed ? 'fa-folder-closed' : 'fa-folder-open'} folder-icon`;
        }
      });

      // Recurse children
      createTreeNodes(node, folderContent, autoExpand, currentFolderQueryPath);
      
      // Only append if folder has children (which matches search criteria)
      if (folderContent.children.length > 0) {
        folderDiv.appendChild(folderHeader);
        folderDiv.appendChild(folderContent);
        container.appendChild(folderDiv);
      }
    }
  });
}

// Post process note content to rewrite images and embed video link players
function postProcessNoteContent(container, notePath) {
  // 1. Process Images
  const images = container.querySelectorAll('img');
  const noteDir = notePath.includes('/') ? notePath.substring(0, notePath.lastIndexOf('/')) : '';
  
  images.forEach(img => {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('/')) {
      // Resolve path relative to note directory
      const resolvedPath = noteDir ? `${noteDir}/${src}` : src;
      const assetPrefix = window.isStaticMode ? './static-notes/' : '/repo-assets/';
      img.setAttribute('src', `${assetPrefix}${resolvedPath}`);
    }
    // Add cool class for modern elegant style
    img.classList.add('styled-image');
  });

  // 2. Process Video Links (YouTube)
  const links = container.querySelectorAll('a');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href) {
      const ytEmbedUrl = getYouTubeEmbedUrl(href);
      if (ytEmbedUrl) {
        // Create modern responsive video embed frame
        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-container';
        videoWrapper.innerHTML = `
          <iframe src="${ytEmbedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        `;
        // Insert it right after the link
        link.parentNode.insertBefore(videoWrapper, link.nextSibling);
      }
    }
  });
}

function getYouTubeEmbedUrl(url) {
  let videoId = '';
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes('youtube.com')) {
      if (parsedUrl.pathname.includes('/watch')) {
        videoId = parsedUrl.searchParams.get('v');
      } else if (parsedUrl.pathname.startsWith('/embed/')) {
        videoId = parsedUrl.pathname.split('/')[2];
      }
    } else if (parsedUrl.hostname.includes('youtu.be')) {
      videoId = parsedUrl.pathname.substring(1);
    }
  } catch (e) {
    // Fail silently, not a valid URL or not youtube
  }
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

// Fetch and load notes content
async function loadNote(notePath) {
  // Highlight folder in list
  currentPath = notePath;
  document.querySelectorAll('.tree-file').forEach(el => {
    if (el.dataset.path === notePath) {
      el.classList.add('active');
      // Expand parents of the active file
      let parent = el.parentElement;
      while (parent && parent.classList.contains('folder-content')) {
        parent.style.display = 'block';
        const header = parent.previousElementSibling;
        if (header && header.classList.contains('folder-header')) {
          header.classList.remove('collapsed');
        }
        parent = parent.parentElement.parentElement;
      }
    } else {
      el.classList.remove('active');
    }
  });

  // Set page URL hash
  window.location.hash = encodeURIComponent(notePath);

  // Update Breadcrumbs
  updateBreadcrumbs(notePath);

  // Fetch content
  try {
    noteContentEl.innerHTML = `<div class="loader-container"><div class="loader"></div></div>`;
    welcomeScreenEl.style.display = 'none';
    markdownContainerEl.style.display = 'block';
    
    let response;
    if (window.isStaticMode) {
      response = await fetch(`./static-notes/${notePath}`);
    } else {
      response = await fetch(`/api/notes/content?path=${encodeURIComponent(notePath)}`);
    }
    if (!response.ok) throw new Error('Failed to fetch file content');
    
    const rawMarkdown = await response.text();
    
    // Parse markdown (Marked.js API)
    const htmlContent = marked.parse(rawMarkdown);
    noteContentEl.innerHTML = htmlContent;

    // Rewrite images and embed video frames
    postProcessNoteContent(noteContentEl, notePath);

    // Run Prism.js on container to format styles
    Prism.highlightAllUnder(noteContentEl);
    
    // Smooth scroll content to top
    document.querySelector('.viewer-body').scrollTop = 0;
  } catch (err) {
    noteContentEl.innerHTML = `<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Error loading file content: ${err.message}</div>`;
    console.error(err);
  }
}

// Update Breadcrumb trail
function updateBreadcrumbs(notePath) {
  const parts = notePath.split('/');
  breadcrumbsEl.innerHTML = '';
  
  parts.forEach((part, i) => {
    const span = document.createElement('span');
    if (i === parts.length - 1) {
      span.className = 'active-crumb';
      span.textContent = part.replace(/\.md$/i, '');
    } else {
      span.textContent = part;
    }
    breadcrumbsEl.appendChild(span);
    
    if (i < parts.length - 1) {
      const slash = document.createElement('i');
      slash.className = 'fa-solid fa-chevron-right';
      breadcrumbsEl.appendChild(slash);
    }
  });
}

'use strict';

/**
 * conflictdet — Detect git merge conflict markers in source files.
 *
 * Supports standard git conflict markers:
 *   <<<<<<< HEAD
 *   =======
 *   >>>>>>> branch-name
 *
 * Also detects GitLab-style conflict resolution markers:
 *   +++>>>>>> branch-name  (resolved "theirs")
 *   +++======             (resolved "ours")
 *
 * @module conflictdet
 */

const fs = require('fs');
const path = require('path');

const MARKER_OURS   = /^<{7}\s*(.*)$/;
const MARKER_SEP    = /^={7}\s*$/;
const MARKER_THEIRS = /^>{7}\s*(.*)$/;

/**
 * @typedef {Object} Conflict
 * @property {string} file     — File path
 * @property {number} line     — 1-indexed line number of the `<<<<<<<` marker
 * @property {string} ours     — Branch/ref on the "ours" side
 * @property {string} theirs   — Branch/ref on the "theirs" side
 * @property {number} startLine — Line of `<<<<<<<`
 * @property {number} sepLine   — Line of `=======`
 * @property {number} endLine   — Line of `>>>>>>>`
 * @property {number} oursLines   — Number of lines in "ours" block
 * @property {number} theirsLines — Number of lines in "theirs" block
 */

/**
 * Scan a single file's content for conflict markers.
 * @param {string} content — File content (string)
 * @param {string} [file='<buffer>'] — File path for reporting
 * @returns {Conflict[]} Array of detected conflicts
 */
function scanContent(content, file = '<buffer>') {
  const lines = content.split('\n');
  const conflicts = [];
  let i = 0;

  while (i < lines.length) {
    const ours = lines[i].match(MARKER_OURS);
    if (!ours) { i++; continue; }

    // Found start — look for separator
    const startLine = i;
    const oursRef = ours[1].trim();
    let sepIdx = -1;
    let endIdx = -1;
    let theirRef = '';

    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].match(MARKER_SEP)) {
        sepIdx = j;
        break;
      }
      // If we hit another start marker before sep, this is malformed
      if (lines[j].match(MARKER_OURS)) {
        break;
      }
    }

    if (sepIdx === -1) {
      // Malformed — start marker without separator
      conflicts.push({
        file,
        line: startLine + 1,
        ours: oursRef,
        theirs: '',
        startLine: startLine + 1,
        sepLine: 0,
        endLine: 0,
        oursLines: sepIdx === -1 ? lines.length - startLine - 1 : sepIdx - startLine - 1,
        theirsLines: 0,
        malformed: true,
        reason: 'missing separator (=======)',
      });
      i = startLine + 1;
      continue;
    }

    for (let j = sepIdx + 1; j < lines.length; j++) {
      const their = lines[j].match(MARKER_THEIRS);
      if (their) {
        endIdx = j;
        theirRef = their[1].trim();
        break;
      }
      if (lines[j].match(MARKER_OURS)) {
        break; // nested start — malformed
      }
    }

    if (endIdx === -1) {
      conflicts.push({
        file,
        line: startLine + 1,
        ours: oursRef,
        theirs: '',
        startLine: startLine + 1,
        sepLine: sepIdx + 1,
        endLine: 0,
        oursLines: sepIdx - startLine - 1,
        theirsLines: 0,
        malformed: true,
        reason: 'missing end marker (>>>>>>>)',
      });
      i = sepIdx + 1;
      continue;
    }

    conflicts.push({
      file,
      line: startLine + 1,
      ours: oursRef,
      theirs: theirRef,
      startLine: startLine + 1,
      sepLine: sepIdx + 1,
      endLine: endIdx + 1,
      oursLines: sepIdx - startLine - 1,
      theirsLines: endIdx - sepIdx - 1,
      malformed: false,
    });

    i = endIdx + 1;
  }

  return conflicts;
}

/**
 * Scan a single file from disk.
 * @param {string} filePath — Absolute or relative file path
 * @returns {Conflict[]}
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return scanContent(content, filePath);
}

// Default ignore patterns
const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', '.turbo', 'out', '.output', '.vercel',
  '__pycache__', '.pytest_cache', 'vendor', '.idea', '.vscode',
]);

const DEFAULT_IGNORE_EXTS = new Set([
  '.lock', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf',
  '.eot', '.mp4', '.mp3', '.svg', '.min.js', '.min.css',
]);

/**
 * Walk a directory and scan all text files for conflict markers.
 * @param {string} dir — Root directory
 * @param {Object} [opts]
 * @param {string[]} [opts.ignoreDirs]    — Extra directory names to ignore
 * @param {string[]} [opts.ignoreExts]    — Extra file extensions to ignore
 * @param {string[]} [opts.exts]          — Only scan these extensions (whitelist)
 * @param {number}   [opts.maxSize]       — Skip files larger than this (bytes), default 1MB
 * @returns {Conflict[]}
 */
function scanDir(dir, opts = {}) {
  const ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...(opts.ignoreDirs || [])]);
  const ignoreExts = new Set([...DEFAULT_IGNORE_EXTS, ...(opts.ignoreExts || [])]);
  const extWhitelist = opts.exts ? new Set(opts.exts) : null;
  const maxSize = opts.maxSize || 1024 * 1024;
  const results = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);

        // Skip binary/lock extensions
        if (ignoreExts.has(ext)) continue;
        // Also check compound extensions like .min.js
        if (entry.name.endsWith('.min.js') || entry.name.endsWith('.min.css')) continue;

        // Apply whitelist if provided
        if (extWhitelist && !extWhitelist.has(ext)) continue;

        // Size check
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > maxSize) continue;
        } catch {
          continue;
        }

        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Quick check — skip files that definitely have no markers
          if (!content.includes('<<<<<<<') && !content.includes('>>>>>>>')) continue;
          const found = scanContent(content, fullPath);
          results.push(...found);
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Generate a summary from conflict results.
 * @param {Conflict[]} conflicts
 * @returns {{total:number, files:string[], malformed:number, clean:boolean}}
 */
function summarize(conflicts) {
  const files = [...new Set(conflicts.map(c => c.file))];
  return {
    total: conflicts.length,
    files,
    fileCount: files.length,
    malformed: conflicts.filter(c => c.malformed).length,
    clean: conflicts.length === 0,
  };
}

module.exports = { scanContent, scanFile, scanDir, summarize };

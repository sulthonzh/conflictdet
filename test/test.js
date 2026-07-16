'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scanContent, scanFile, scanDir, summarize } = require('../src/index.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

// === scanContent ===

test('detects a simple conflict', () => {
  const content = `line1
<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> feature/branch
line6`;
  const conflicts = scanContent(content, 'test.js');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].ours, 'HEAD');
  assert.equal(conflicts[0].theirs, 'feature/branch');
  assert.equal(conflicts[0].startLine, 2);
  assert.equal(conflicts[0].sepLine, 4);
  assert.equal(conflicts[0].endLine, 6);
  assert.equal(conflicts[0].oursLines, 1);
  assert.equal(conflicts[0].theirsLines, 1);
  assert.equal(conflicts[0].malformed, false);
});

test('detects multi-line conflict blocks', () => {
  const content = `<<<<<<< HEAD
line a
line b
line c
=======
line x
line y
>>>>>>> develop`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].oursLines, 3);
  assert.equal(conflicts[0].theirsLines, 2);
});

test('detects multiple conflicts in same file', () => {
  const content = `<<<<<<< HEAD
a
=======
b
>>>>>>> branch1
some code
<<<<<<< HEAD
c
=======
d
>>>>>>> branch2`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 2);
  assert.equal(conflicts[0].theirs, 'branch1');
  assert.equal(conflicts[1].theirs, 'branch2');
});

test('detects conflict with empty ours section', () => {
  const content = `<<<<<<< HEAD
=======
const x = 1;
>>>>>>> branch`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].oursLines, 0);
  assert.equal(conflicts[0].theirsLines, 1);
});

test('detects conflict with empty theirs section', () => {
  const content = `<<<<<<< HEAD
const x = 1;
=======
>>>>>>> branch`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].oursLines, 1);
  assert.equal(conflicts[0].theirsLines, 0);
});

test('handles empty ref names', () => {
  const content = `<<<<<<<
a
=======
b
>>>>>>>`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].ours, '');
  assert.equal(conflicts[0].theirs, '');
});

test('detects malformed conflict (missing separator)', () => {
  const content = `<<<<<<< HEAD
const x = 1;
const y = 2;
>>>>>>> branch`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].malformed, true);
  assert.match(conflicts[0].reason, /separator/);
});

test('detects malformed conflict (missing end marker)', () => {
  const content = `<<<<<<< HEAD
const x = 1;
=======
const y = 2;
end of file`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].malformed, true);
  assert.match(conflicts[0].reason, /end marker/);
});

test('returns empty array for clean content', () => {
  const content = `const a = 1;
const b = 2;
// no conflicts here`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 0);
});

test('does not false-positive on code with similar characters', () => {
  const content = `const a = <<<< 0;
const b = >> 1;
const sep = "=======";`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 0);
});

test('handles content with no trailing newline', () => {
  const content = `<<<<<<< HEAD
x
=======
y
>>>>>>> branch`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].endLine, 5);
});

test('reports correct line numbers for conflict at end of file', () => {
  const content = `line1\nline2\nline3\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch`;
  const conflicts = scanContent(content);
  assert.equal(conflicts[0].startLine, 4);
  assert.equal(conflicts[0].endLine, 8);
});

// === scanFile ===

test('scanFile reads and scans a file', () => {
  const tmp = path.join(os.tmpdir(), `conflictdet-test-${Date.now()}.js`);
  fs.writeFileSync(tmp, `<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n`);
  const conflicts = scanFile(tmp);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].file, tmp);
  fs.unlinkSync(tmp);
});

// === scanDir ===

test('scanDir finds conflicts across files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflictdet-'));
  fs.writeFileSync(path.join(tmpDir, 'a.js'), `<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n`);
  fs.writeFileSync(path.join(tmpDir, 'b.js'), `const x = 1;\n`);
  fs.mkdirSync(path.join(tmpDir, 'sub'));
  fs.writeFileSync(path.join(tmpDir, 'sub', 'c.js'), `<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> dev\n`);

  const conflicts = scanDir(tmpDir);
  assert.equal(conflicts.length, 2);
  assert.ok(conflicts.some(c => c.file.endsWith('a.js')));
  assert.ok(conflicts.some(c => c.file.endsWith('c.js')));

  fs.rmSync(tmpDir, { recursive: true });
});

test('scanDir ignores node_modules and common dirs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflictdet-'));
  fs.mkdirSync(path.join(tmpDir, 'node_modules'));
  fs.writeFileSync(path.join(tmpDir, 'node_modules', 'dep.js'), `<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n`);
  fs.mkdirSync(path.join(tmpDir, '.git'));
  fs.writeFileSync(path.join(tmpDir, '.git', 'merge.js'), `<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n`);
  fs.writeFileSync(path.join(tmpDir, 'clean.js'), `const x = 1;\n`);

  const conflicts = scanDir(tmpDir);
  assert.equal(conflicts.length, 0);
  fs.rmSync(tmpDir, { recursive: true });
});

test('scanDir respects exts whitelist', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflictdet-'));
  fs.writeFileSync(path.join(tmpDir, 'a.js'), `<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n`);
  fs.writeFileSync(path.join(tmpDir, 'b.py'), `<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> branch\n`);

  const conflicts = scanDir(tmpDir, { exts: ['.py'] });
  assert.equal(conflicts.length, 1);
  assert.ok(conflicts[0].file.endsWith('.py'));
  fs.rmSync(tmpDir, { recursive: true });
});

test('scanDir skips large files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflictdet-'));
  const big = 'x'.repeat(2048);
  fs.writeFileSync(path.join(tmpDir, 'big.js'), `<<<<<<< HEAD\n${big}\n=======\n${big}\n>>>>>>> branch\n`);
  const conflicts = scanDir(tmpDir, { maxSize: 100 });
  assert.equal(conflicts.length, 0);
  fs.rmSync(tmpDir, { recursive: true });
});

test('scanDir skips binary file extensions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflictdet-'));
  fs.writeFileSync(path.join(tmpDir, 'img.png'), `<<<<<<< HEAD\ndata\n=======\ndata\n>>>>>>> branch\n`);
  fs.writeFileSync(path.join(tmpDir, 'app.js'), `<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n`);
  const conflicts = scanDir(tmpDir);
  assert.equal(conflicts.length, 1);
  assert.ok(conflicts[0].file.endsWith('.js'));
  fs.rmSync(tmpDir, { recursive: true });
});

// === summarize ===

test('summarize returns clean for no conflicts', () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.equal(s.clean, true);
  assert.equal(s.fileCount, 0);
});

test('summarize counts files and conflicts correctly', () => {
  const conflicts = [
    { file: 'a.js', malformed: false },
    { file: 'a.js', malformed: false },
    { file: 'b.js', malformed: false },
    { file: 'c.js', malformed: true },
  ];
  const s = summarize(conflicts);
  assert.equal(s.total, 4);
  assert.equal(s.fileCount, 3);
  assert.equal(s.malformed, 1);
  assert.equal(s.clean, false);
});

test('summarize deduplicates files', () => {
  const conflicts = [
    { file: 'a.js', malformed: false },
    { file: 'a.js', malformed: false },
  ];
  const s = summarize(conflicts);
  assert.deepEqual(s.files, ['a.js']);
});

// === Edge cases ===

test('handles nested-looking markers (not actually nested)', () => {
  const content = `<<<<<<< HEAD
<<<<<<< inner
a
=======
b
>>>>>>> branch`;
  const conflicts = scanContent(content);
  // Outer <<<<<<< HEAD breaks (another start found before separator) → malformed
  // Inner <<<<<<< inner completes normally → 2 total
  assert.equal(conflicts.length, 2);
  assert.ok(conflicts.some(c => c.malformed));
  assert.ok(conflicts.some(c => !c.malformed && c.ours === 'inner'));
});

test('handles markers with trailing whitespace', () => {
  const content = `<<<<<<< HEAD   \na\n=======\nb\n>>>>>>> branch   \n`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].ours, 'HEAD');
  assert.equal(conflicts[0].theirs, 'branch');
});

// === Branch coverage: malformed paths after separator ===

test('detects malformed conflict (nested start after separator)', () => {
  // After separator is found, another <<<<<<< appears before >>>>>>> → malformed
  const content = `<<<<<<< HEAD
a
=======
<<<<<<< inner
b
>>>>>>> branch`;
  const conflicts = scanContent(content);
  assert.equal(conflicts.length, 2);
  // First: had separator but found another start before end → malformed
  const first = conflicts.find(c => c.ours === 'HEAD');
  assert.ok(first);
  assert.equal(first.malformed, true);
  assert.match(first.reason, /end marker/);
  assert.equal(first.sepLine, 3); // separator was found
  // Second: inner <<<<<<< has no separator → also malformed
  const second = conflicts.find(c => c.ours === 'inner');
  assert.ok(second);
  assert.equal(second.malformed, true);
  assert.match(second.reason, /separator/);
});

// === Branch coverage: scanDir error paths ===

test('scanDir handles unreadable directory gracefully', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflictdet-'));
  const restricted = path.join(tmpDir, 'restricted');
  fs.mkdirSync(restricted, { recursive: true });
  fs.writeFileSync(path.join(restricted, 'a.js'), `<<<<<<< HEAD\na\n=======\nb\>>>>>>> branch\n`);

  // Remove read permission on subdirectory
  fs.chmodSync(restricted, 0o000);
  const conflicts = scanDir(tmpDir);
  // Should not throw, should return empty (or only files from readable dirs)
  assert.equal(conflicts.length, 0);
  fs.chmodSync(restricted, 0o755);
  fs.rmSync(tmpDir, { recursive: true });
});

test('scanDir handles file stat errors gracefully', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflictdet-'));
  // Create a broken symlink that will fail on statSync
  fs.symlinkSync('/nonexistent/path/file.js', path.join(tmpDir, 'broken.js'));

  // Should not throw
  const conflicts = scanDir(tmpDir);
  assert.equal(conflicts.length, 0);
  fs.rmSync(tmpDir, { recursive: true });
});

test('scanDir handles unreadable file gracefully', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflictdet-'));
  const unreadable = path.join(tmpDir, 'unreadable.js');
  fs.writeFileSync(unreadable, `<<<<<<< HEAD\na\n=======\nb\>>>>>>> branch\n`);
  fs.chmodSync(unreadable, 0o000);

  // Should not throw, should skip the file
  const conflicts = scanDir(tmpDir);
  assert.equal(conflicts.length, 0);
  fs.chmodSync(unreadable, 0o644);
  fs.rmSync(tmpDir, { recursive: true });
});

test('scanDir skips .min.js and .min.css compound extensions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflictdet-'));
  fs.writeFileSync(path.join(tmpDir, 'bundle.min.js'), `<<<<<<< HEAD\na\n=======\nb\>>>>>>> branch\n`);
  fs.writeFileSync(path.join(tmpDir, 'styles.min.css'), `<<<<<<< HEAD\na\n=======\nb\>>>>>>> branch\n`);
  fs.writeFileSync(path.join(tmpDir, 'app.js'), `<<<<<<< HEAD\na\n=======\nb\>>>>>>> branch\n`);

  const conflicts = scanDir(tmpDir);
  assert.equal(conflicts.length, 1);
  assert.ok(conflicts[0].file.endsWith('app.js'));
  fs.rmSync(tmpDir, { recursive: true });
});

test('scanDir custom ignoreDirs are merged with defaults', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflictdet-'));
  fs.mkdirSync(path.join(tmpDir, 'custom-exclude'));
  fs.writeFileSync(path.join(tmpDir, 'custom-exclude', 'a.js'), `<<<<<<< HEAD\na\n=======\nb\>>>>>>> branch\n`);
  fs.writeFileSync(path.join(tmpDir, 'b.js'), `<<<<<<< HEAD\nc\n=======\nd\>>>>>>> branch\n`);

  const conflicts = scanDir(tmpDir, { ignoreDirs: ['custom-exclude'] });
  assert.equal(conflicts.length, 1);
  assert.ok(conflicts[0].file.endsWith('b.js'));
  fs.rmSync(tmpDir, { recursive: true });
});

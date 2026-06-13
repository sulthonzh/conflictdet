#!/usr/bin/env node
'use strict';

/**
 * conflictdet CLI — Detect git merge conflict markers.
 *
 * Usage:
 *   conflictdet [path]            Scan file or directory
 *   conflictdet --json            Output JSON
 *   conflictdet --ci              Exit 1 if conflicts found
 *   conflictdet --exts .js,.ts    Only scan these extensions
 */

const { scanFile, scanDir, summarize } = require('./index.js');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { paths: [], json: false, ci: false, exts: null, compact: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--ci') args.ci = true;
    else if (a === '--compact') args.compact = true;
    else if (a === '--exts') { args.exts = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean); }
    else if (a === '-h' || a === '--help') args.help = true;
    else if (!a.startsWith('--')) args.paths.push(a);
  }
  return args;
}

function help() {
  console.log(`conflictdet — Detect git merge conflict markers

Usage:
  conflictdet [path...] [options]

Options:
  --json          Output results as JSON
  --ci            Exit code 1 if conflicts found (for CI/CD)
  --compact       Compact output (one line per conflict)
  --exts <list>   Only scan these extensions (comma-sep, e.g. .js,.ts)
  -h, --help      Show this help

Examples:
  conflictdet src/
  conflictdet --ci .
  conflictdet --json src/ test/
  conflictdet --exts .js,.ts,.css .
`);
}

function formatConflict(c, compact) {
  if (compact) {
    const tag = c.malformed ? ' [MALFORMED]' : '';
    return `${c.file}:${c.line} <<<<<<< ${c.ours} vs ${c.theirs || '?'}${tag}`;
  }
  const lines = [];
  lines.push(`  ${c.file}:${c.line}`);
  lines.push(`    ours:   ${c.ours || '(empty)'} (${c.oursLines} lines)`);
  lines.push(`    theirs: ${c.theirs || '(empty)'} (${c.theirsLines} lines)`);
  if (c.malformed) lines.push(`    ⚠ ${c.reason}`);
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { help(); process.exit(0); }

  const targets = args.paths.length ? args.paths : ['.'];
  const opts = args.exts ? { exts: args.exts } : {};
  const allConflicts = [];

  for (const target of targets) {
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) {
      process.stderr.write(`conflictdet: path not found: ${resolved}\n`);
      continue;
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      allConflicts.push(...scanDir(resolved, opts));
    } else {
      allConflicts.push(...scanFile(resolved));
    }
  }

  if (args.json) {
    const summary = summarize(allConflicts);
    console.log(JSON.stringify({ ...summary, conflicts: allConflicts }, null, 2));
  } else {
    if (allConflicts.length === 0) {
      console.log('No conflict markers found ✅');
    } else {
      const summary = summarize(allConflicts);
      console.log(`Found ${summary.total} conflict(s) in ${summary.fileCount} file(s)`);
      if (summary.malformed > 0) {
        console.log(`⚠ ${summary.malformed} malformed conflict(s)`);
      }
      console.log('');
      for (const c of allConflicts) {
        console.log(formatConflict(c, args.compact));
      }
    }
  }

  if (args.ci && allConflicts.length > 0) process.exit(1);
}

main();

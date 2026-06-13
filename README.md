# conflictdet

**Detect git merge conflict markers in your source files.**

Because shipping code with `<<<<<<< HEAD` in it is embarrassing. Runs in CI to catch unresolved conflicts before they land on main.

## Install

```bash
npm install -g conflictdet
```

## Why

Git conflict markers are easy to miss — especially in large PRs, generated files, or when merging across long-lived branches. This tool catches them before they reach production.

## Usage

### Scan a directory

```bash
conflictdet src/
```

Output:
```
Found 2 conflict(s) in 2 file(s)

  src/auth.js:15
    ours:   HEAD (5 lines)
    theirs: feature/login-refactor (8 lines)

  src/utils.js:42
    ours:   HEAD (3 lines)
    theirs: hotfix/bug-123 (2 lines)
```

### CI mode (exit 1 on conflicts)

```bash
conflictdet --ci .
```

Perfect for GitHub Actions:

```yaml
- name: Check for conflict markers
  run: conflictdet --ci src/
```

### JSON output

```bash
conflictdet --json src/ | jq '.conflicts[].file'
```

### Filter by extension

```bash
conflictdet --exts .js,.ts,.css src/
```

### Compact mode

```bash
conflictdet --compact .
# src/auth.js:15 <<<<<<< HEAD vs feature/login-refactor
```

## API

```js
const { scanFile, scanDir, scanContent, summarize } = require('conflictdet');

// Scan a string
const conflicts = scanContent(`<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> feature/branch`, 'example.js');

// Scan a file
const found = scanFile('./src/index.js');

// Scan a directory
const all = scanDir('./src', { exts: ['.js', '.ts'] });

// Get summary
const summary = summarize(all);
console.log(summary.clean); // true if no conflicts
```

## Features

- **Smart detection** — finds `<<<<<<<`, `=======`, `>>>>>>>` markers with ref names
- **Malformed detection** — catches missing separators or end markers
- **Fast scanning** — skips binary files, respects common ignore dirs
- **CI mode** — exit code 1 when conflicts found
- **Zero dependencies** — just Node.js

## License

MIT

# conflictdet

**Zero-dependency merge conflict detector. 23 tests, 100% pass rate. Catch conflicts before they ship.**

Because shipping code with `<<<<<<< HEAD` in it is embarrassing. Runs in CI to catch unresolved conflicts before they land on main.

## Install

```bash
npm install -g conflictdet
```

## Quick Start

```bash
# Scan current directory
conflictdet .

# Check a specific directory and exit with code 1 if conflicts found
conflictdet --ci src/

# Output as JSON for integration
conflictdet --json src/ | jq '.conflicts[].file'
```

## Why conflictdet?

Git conflict markers are easy to miss — especially in large PRs, generated files, or when merging across long-lived branches. This tool catches them before they reach production.

**vs alternatives:**

| Feature | conflictdet | git grep | conflict-marker |
|---------|------------|----------|-----------------|
| Zero dependencies | ✅ | ✅ | ❌ (shell) |
| CI exit codes | ✅ | ❌ | ✅ |
| JSON output | ✅ | ❌ | ❌ |
| Extension filtering | ✅ | ❌ | ❌ |
| Malformed detection | ✅ | ❌ | ❌ |
| Binary file skip | ✅ | ❌ | ❌ |
| Bundle size | ~6KB | N/A | N/A |

## Real-World Examples

### 1. Pre-commit Hook (Husky)

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "conflictdet --ci src/"
    }
  }
}
```

### 2. CI/CD Gate (GitHub Actions)

```yaml
# .github/workflows/ci.yml
- name: Check for conflict markers
  run: conflictdet --ci src/
```

### 3. PR Automation (GitHub Action)

```yaml
# .github/workflows/pr-check.yml
name: PR Conflict Check
on:
  pull_request:
    branches: [main]

jobs:
  check-conflicts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: conflictdet --json src/ > conflicts.json
      - uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const data = JSON.parse(fs.readFileSync('conflicts.json', 'utf8'));
            if (data.total > 0) {
              core.setFailed(`Found ${data.total} conflict(s) in ${data.fileCount} file(s)`);
            }
```

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

### Show version

```bash
conflictdet --version
# 1.1.0

conflictdet -V
# 1.1.0
```

## API

```js
const { scanFile, scanDir, scanContent, summarize, VERSION } = require('conflictdet');

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

// Get version
console.log(VERSION); // '1.1.0'
```

## Features

- **Smart detection** — finds `<<<<<<<`, `=======`, `>>>>>>>` markers with ref names
- **Malformed detection** — catches missing separators or end markers
- **Fast scanning** — O(n) line-by-line parsing, skips binary files
- **CI mode** — exit code 1 when conflicts found
- **JSON output** — perfect for automation and reporting
- **Extension filtering** — whitelist specific file types
- **Compact mode** — one-line output per conflict
- **Zero dependencies** — just Node.js, minimal attack surface
- **Node 18+** — modern runtime support

## Security

- Zero dependencies — no supply chain attack surface
- Input validation on file paths and extensions
- Proper error handling for unreadable files
- Binary file detection prevents false positives

## Performance

- O(n) file scanning (line-by-line, no nested loops)
- Quick pre-check for marker presence before full parsing
- Efficient Set-based lookups for ignore patterns
- ~6KB unminified, ~2KB gzipped

## License

MIT
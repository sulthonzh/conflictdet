# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-17

### Added
- Initial release
- Smart detection of `<<<<<<<`, `=======`, `>>>>>>>` markers with ref names
- Malformed conflict detection (missing separators or end markers)
- Fast directory scanning with extension filtering
- Binary file skipping (images, PDFs, archives, etc.)
- Common directory ignoring (node_modules, .git, dist, etc.)
- CI mode with exit code 1 on conflicts
- JSON output for integration
- Compact mode for one-line-per-conflict output
- Custom extension whitelist support
- File size limiting (default 1MB)
- CLI with --json, --ci, --compact, --exts flags
- Programmatic API: scanContent, scanFile, scanDir, summarize
- 23 comprehensive tests covering all functionality

### Security
- Zero dependencies — reduces supply chain attack surface
- Input validation on file paths and extensions
- Proper error handling for unreadable files

### Performance
- O(n) file scanning (line-by-line, no nested loops)
- Quick pre-check for marker presence before full parsing
- Efficient Set-based lookups for ignore patterns

## [Unreleased]

### Planned
- Add --version/-V CLI flags
- Add VERSION export constant
- Improve test coverage reporting
- Add comparison table vs alternative tools
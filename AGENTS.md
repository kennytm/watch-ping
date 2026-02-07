# Repository Guidelines

## Project Structure & Module Organization
Core extension code lives in `watch-ping@example.com/`:
- `extension.js`: panel indicator, ping monitor, and runtime logic.
- `prefs.js`: preferences UI for host and interval settings.
- `schemas/org.gnome.shell.extensions.watch-ping.gschema.xml`: GSettings schema.
- `metadata.json`: extension UUID, version, and shell compatibility.

Build artifacts are written to `dist/` as installable zip bundles. Automation scripts are in `scripts/` (notably `scripts/build-extension.sh`).

## Build, Test, and Development Commands
- The extension is built and tested on a remote machine. The testing and deployment commands (`gnome-extensions` etc.) are generally not available in the local development environment, so you can focus on code changes without needing to build or install the extension locally.
- No need to run `./scripts/build-extension.sh`.

## Coding Style & Naming Conventions
Use modern GJS (ES modules) with 4-space indentation and semicolons. Prefer `const`/`let`, camelCase for variables/functions, and UPPER_SNAKE_CASE for constants (for example, `DEFAULT_INTERVAL_SECONDS`). Keep UI strings in preferences wrapped with gettext (`_()`), and keep files focused (`extension.js` for runtime, `prefs.js` for settings UI).

## Testing Guidelines
Testing is manual/integration-based. Validate:
- indicator updates in the top bar,
- host and interval preference changes apply immediately,
- error states (`?`, `ping err`) appear when expected.

## Commit & Pull Request Guidelines
Commit messages in this repo are short, imperative, and capitalized (for example, `Add ping preference UI`, `Refactor WatchPing monitor`). Keep subject lines concise and scoped to one change.

Automated PRs are NOT accepted at the moment.

#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release.sh [patch|minor|major|x.y.z]
# Bumps version in package.json + openclaw.plugin.json, commits, and tags.

BUMP="${1:-patch}"
ROOT="$(git rev-parse --show-toplevel)"

# Resolve new version
if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$BUMP"
else
  CURRENT=$(node -p "require('$ROOT/package.json').version")
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$BUMP" in
    patch) NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))" ;;
    minor) NEW_VERSION="$MAJOR.$((MINOR + 1)).0" ;;
    major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
    *) echo "Usage: $0 [patch|minor|major|x.y.z]"; exit 1 ;;
  esac
fi

# Ensure clean working tree
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

# Ensure on main
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on main (currently on $BRANCH)"
  exit 1
fi

echo "Bumping to $NEW_VERSION"

# Update package.json
node -e "
const fs = require('fs');
const path = '$ROOT/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"

# Update openclaw.plugin.json
node -e "
const fs = require('fs');
const path = '$ROOT/openclaw.plugin.json';
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
manifest.version = '$NEW_VERSION';
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
"

# Update VERSION constant in src/version.ts
sed -i '' "s/const VERSION = \".*\"/const VERSION = \"$NEW_VERSION\"/" "$ROOT/src/version.ts"

npx prettier --write package.json openclaw.plugin.json src/version.ts
git add package.json openclaw.plugin.json src/version.ts
git commit -m "$NEW_VERSION"
git tag "v$NEW_VERSION"

echo "Done: v$NEW_VERSION"
echo "Run 'git push && git push --tags && npm publish' to release."

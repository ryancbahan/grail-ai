#!/bin/bash
set -e

# Usage: ./scripts/release.sh [major|minor|patch]
# Default: patch

BUMP_TYPE="${1:-patch}"

if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
  echo "Usage: ./scripts/release.sh [major|minor|patch]"
  exit 1
fi

# Get current version from core package
CURRENT=$(node -p "require('./packages/core/package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
BRANCH="release/$NEW_VERSION"

echo "Current version: $CURRENT"
echo "New version:     $NEW_VERSION"
echo "Branch:          $BRANCH"
echo ""

# Ensure we're on main and up to date
echo "Checking out main..."
git checkout main
git pull

# Check for clean working tree
if [[ -n $(git status --porcelain) ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

# Create release branch
echo "Creating branch $BRANCH..."
git checkout -b "$BRANCH"

# Update all package versions
echo "Bumping versions to $NEW_VERSION..."
for pkg in packages/*/package.json; do
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$pkg', 'utf-8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('$pkg', JSON.stringify(pkg, null, 2) + '\n');
  "
done

# Commit and push
git add packages/*/package.json
git commit -m "release: $NEW_VERSION"
git push -u origin "$BRANCH"

echo ""
echo "Done. Next steps:"
echo "  1. Open PR:  https://github.com/ryancbahan/grail-ai/compare/main...$BRANCH"
echo "  2. Merge the PR"
echo "  3. Then run: ./scripts/tag-release.sh $NEW_VERSION"

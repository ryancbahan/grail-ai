#!/bin/bash
set -e

# Usage: ./scripts/tag-release.sh <version>
# Run this AFTER the release PR has been merged to main.

VERSION="$1"

if [[ -z "$VERSION" ]]; then
  echo "Usage: ./scripts/tag-release.sh <version>"
  echo "Example: ./scripts/tag-release.sh 0.1.1"
  exit 1
fi

TAG="v$VERSION"

# Ensure we're on main and up to date
echo "Checking out main..."
git checkout main
git pull

# Verify the version matches what's in package.json
ACTUAL=$(node -p "require('./packages/core/package.json').version")
if [[ "$ACTUAL" != "$VERSION" ]]; then
  echo "Error: packages/core/package.json has version $ACTUAL, expected $VERSION"
  echo "Has the release PR been merged?"
  exit 1
fi

# Tag and push
echo "Tagging $TAG..."
git tag "$TAG"
git push --tags

# Create GitHub release (triggers publish workflow)
echo "Creating GitHub release..."
gh release create "$TAG" --title "$VERSION" --generate-notes

echo ""
echo "Done. Release created: https://github.com/ryancbahan/grail-ai/releases/tag/$TAG"

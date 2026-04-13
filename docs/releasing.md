# Releasing

## Prerequisites

- Push access to `main`
- `NPM_TOKEN` secret configured in GitHub repo settings

## Steps

### 1. Create release branch and bump versions

```bash
./scripts/release.sh patch   # 0.1.0 → 0.1.1
./scripts/release.sh minor   # 0.1.0 → 0.2.0
./scripts/release.sh major   # 0.1.0 → 1.0.0
```

This checks out `main`, creates `release/X.Y.Z`, bumps all package versions, commits, and pushes.

### 2. Open and merge the PR

Open the PR link printed by the script. Review, let CI pass, merge to `main`.

### 3. Tag the release

After the PR is merged:

```bash
./scripts/tag-release.sh 0.1.1
```

This checks out `main`, verifies the version matches, tags, and pushes the tag.

### 4. Create GitHub Release

Click the link printed by the script, or go to GitHub → Releases → Create new release. Select the tag, add release notes, publish.

The publish workflow runs automatically — builds, tests, uploads tarball, publishes all packages to npm.

## Branch Naming

- `main` — development, always releasable
- `release/X.Y.Z` — version prep branches, persist as version references

## Package Publish Order

1. `@grail-ai/core`
2. `@grail-ai/lang-javascript`
3. `grail` (CLI)
4. `@grail-ai/web`
5. `@grail-ai/mcp`

## Troubleshooting

- **npm 403**: Check that `NPM_TOKEN` is valid and has Automation permissions
- **Package name taken**: Verify package names are available on npmjs.com before first publish
- **Build failure**: Nothing publishes if tests fail
- **Version mismatch in tag script**: The release PR hasn't been merged yet

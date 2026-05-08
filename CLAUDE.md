# aight-utils

OpenClaw gateway plugin for the Aight app.

## Release

Use the release script — do NOT manually bump versions:

```bash
./scripts/release.sh          # patch bump (default)
./scripts/release.sh minor    # minor bump
./scripts/release.sh major    # major bump
./scripts/release.sh 1.2.3    # exact version
```

Then push and publish:

```bash
git push && git push --tags && npm publish
```

## Tests

```bash
npm test          # vitest run
npx tsc --noEmit  # typecheck
```

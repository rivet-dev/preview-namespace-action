# CLAUDE.md

## Releasing

This action follows the standard GitHub Actions versioning pattern:

**Specific version tags:** `v1.0.0`, `v1.1.0`, `v1.2.3`
- Immutable, point to a specific commit
- Used for pinning to exact versions

**Major version tag:** `v1`
- Mutable, updated to point to the latest `v1.x.x` release
- Allows users to get bug fixes/improvements automatically
- Moved forward with each minor/patch release

### Release workflow

```bash
# Release a new version (e.g., v1.1.0)
git tag v1.1.0
git tag -f v1
git push origin v1.1.0
git push origin v1 -f
```

### README

Always reference `@v1` in the README examples, not `@main` or specific versions.

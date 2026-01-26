# Rivet Vercel Preview Action

Automatically create Rivet namespaces for Vercel preview deployments.

## Usage

Add this workflow to your repository at `.github/workflows/rivet-preview.yml`:

```yaml
name: Rivet Preview

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

concurrency:
  group: rivet-preview-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  rivet-preview:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: rivet-dev/vercel-preview-action@v1
        with:
          rivet-token: ${{ secrets.RIVET_CLOUD_TOKEN }}
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
```

## Setup

1. Get your Rivet Cloud token from [Rivet Hub](https://dashboard.rivet.dev) → Settings → Advanced → Manual Client Configuration
2. Get your Vercel token from [Vercel Account Settings](https://vercel.com/account/tokens)
3. Add both as repository secrets:
   ```bash
   gh secret set RIVET_CLOUD_TOKEN
   gh secret set VERCEL_TOKEN
   ```

## Inputs

| Input | Required | Default | Description |
|:------|:---------|:--------|:------------|
| `rivet-token` | Yes | - | Rivet Cloud API token |
| `vercel-token` | Yes | - | Vercel API token |
| `rivet-endpoint` | No | `https://api.rivet.dev` | Rivet Engine API endpoint |
| `github-token` | No | `${{ github.token }}` | GitHub token for PR comments |

## What it does

1. Creates a Rivet namespace for each PR (or reuses existing)
2. Sets Vercel environment variables for the preview branch
3. Configures Rivet serverless runner to point to Vercel preview URL
4. Comments on PR with namespace status and dashboard link

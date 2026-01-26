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

1. Get your Rivet Cloud token from [Rivet Dashboard](https://dashboard.rivet.dev) → Settings → Advanced → Manual Client Configuration
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
| `main-branch` | No | `main` | Main branch name for production deployments |
| `runner-config` | No | `{}` | JSON object to override runner configuration |

## Runner Configuration

The `runner-config` input accepts a JSON object with the following options:

| Option | Default | Description |
|:-------|:--------|:------------|
| `max_runners` | `100000` | Maximum concurrent runners |
| `min_runners` | `0` | Minimum runners to keep warm |
| `request_lifespan` | `270` | Request timeout in seconds |
| `slots_per_runner` | `1` | Slots per runner instance |
| `runners_margin` | `0` | Runner margin for scaling |
| `headers` | `{}` | Custom headers for Vercel requests |

### Example: Custom Runner Limits

```yaml
- uses: rivet-dev/vercel-preview-action@v1
  with:
    rivet-token: ${{ secrets.RIVET_CLOUD_TOKEN }}
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    runner-config: '{"max_runners": 1000, "min_runners": 1}'
```

## Private Vercel Deployments

If your Vercel preview deployments require authentication (e.g., Vercel Authentication is enabled), you need to configure a bypass secret so Rivet can reach your serverless endpoint.

### Step 1: Create a Bypass Secret in Vercel

1. Go to your Vercel project settings
2. Navigate to **Deployment Protection** → **Protection Bypass for Automation**
3. Create a new bypass secret and copy it

### Step 2: Add the Secret to GitHub

```bash
gh secret set VERCEL_AUTOMATION_BYPASS_SECRET
```

### Step 3: Configure the Action

```yaml
- uses: rivet-dev/vercel-preview-action@v1
  with:
    rivet-token: ${{ secrets.RIVET_CLOUD_TOKEN }}
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    runner-config: '{"headers": {"x-vercel-protection-bypass": "${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}"}}'
```

This adds the `x-vercel-protection-bypass` header to all requests from Rivet to your Vercel deployment, allowing authenticated access.

## Custom Main Branch

If your main branch is not named `main`, configure it:

```yaml
- uses: rivet-dev/vercel-preview-action@v1
  with:
    rivet-token: ${{ secrets.RIVET_CLOUD_TOKEN }}
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    main-branch: master
```

## What It Does

1. Creates a Rivet namespace for each PR (`pr-{number}`) or production (`production`)
2. Sets Vercel environment variables for the preview/production branch
3. Configures Rivet serverless runners for all regions to point to Vercel
4. Comments on PR with namespace status and dashboard link

## Environment Variables Set on Vercel

The action automatically sets these environment variables on your Vercel project:

- `RIVET_ENDPOINT` - Rivet Engine API endpoint
- `RIVET_NAMESPACE` - Rivet namespace identifier
- `RIVET_RUNNER_TOKEN` - Secret token for the serverless runner
- `RIVET_PUBLISHABLE_TOKEN` - Publishable token for client-side use

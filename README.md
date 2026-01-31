# Rivet Preview Namespace Action

Creates Rivet namespaces for preview deployments.

## Inputs

| Input | Required | Default | Description |
|:------|:---------|:--------|:------------|
| `platform` | Yes | - | Deployment platform (currently only `vercel`) |
| `rivet-token` | Yes | - | Rivet Cloud API token |
| `vercel-token` | No | - | Vercel API token (required when platform is `vercel`) |
| `rivet-endpoint` | No | `https://api.rivet.dev` | Rivet Engine API endpoint |
| `github-token` | No | `${{ github.token }}` | GitHub token for PR comments |
| `main-branch` | No | `main` | Main branch name for production deployments |
| `runner-config` | No | `{}` | JSON object to override runner configuration |

## Providers

### Vercel

1. Get your Rivet token from [Rivet Dashboard](https://dashboard.rivet.dev) > Settings > Advanced > Manual Client Configuration

2. Get your Vercel token from [Vercel Account Settings](https://vercel.com/account/tokens)

3. Add secrets to your repository:
   ```bash
   gh secret set RIVET_CLOUD_TOKEN
   gh secret set VERCEL_TOKEN
   ```

4. Create `.github/workflows/rivet-preview.yml`:
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
         - uses: rivet-dev/preview-namespace-action@v1
           with:
             platform: vercel
             rivet-token: ${{ secrets.RIVET_CLOUD_TOKEN }}
             vercel-token: ${{ secrets.VERCEL_TOKEN }}
   ```

Deployment protection is automatically bypassed by generating a token via the Vercel API.

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
       types: [opened, synchronize, reopened, closed]
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

## How It Works

When a PR is opened or updated:

1. The action creates a Rivet namespace for the PR (or reuses an existing one)
2. Environment variables (`RIVET_ENDPOINT`, `RIVET_PUBLIC_ENDPOINT`) are set on Vercel for the branch
3. The action cancels the in-progress Vercel deployment and triggers a redeploy with the new environment variables
4. Once the redeploy is complete, Rivet runners are configured to connect to the deployment

This redeploy step is necessary because Vercel starts building immediately when a commit is pushed, before the action has a chance to set the required environment variables. The action automatically handles this by triggering a fresh deployment after configuration is complete.

Deployment protection is automatically bypassed by generating a token via the Vercel API.

When a PR is closed, the action archives the corresponding Rivet namespace to keep your project tidy.

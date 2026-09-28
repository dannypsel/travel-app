# Future changes runbook — travel app

How to ship a change after the initial deploy. Pick the section that matches
what you changed. The shortcut for "I changed code": `./deploy/deploy.sh`
does everything below in one go (see its header for the env vars it needs).

## 30-second architecture recap

- **Backend:** the FastAPI app in `api/` is packed into a Docker image
  (ARM64), pushed to ECR, and runs on AWS Lambda as function `travel-api`.
  Browsers reach it through an **API Gateway HTTP API** named `travel-api`
  (`$default` stage). (Why not a Lambda Function URL: Function URLs return
  403 on every call in this AWS account — broken account-wide, verified
  2026-09-27.)
- **Frontend:** the Vite + React SPA in `web/` builds to static files, synced
  to S3 and served worldwide by CloudFront. The three `VITE_*` values are
  **baked in at build time** — changing one means rebuilding.
- **Database + auth:** Supabase Cloud project `dara-suite`
  (`https://xyxcwpzksmhlnuhkzonx.supabase.co`), shared with the budget app.

Concrete names for this repo:

| Piece | Value |
|---|---|
| AWS region / account | `us-east-1` / `656192943270` |
| ECR image | `656192943270.dkr.ecr.us-east-1.amazonaws.com/travel-api:latest` |
| Lambda function | `travel-api` |
| API Gateway (HTTP API) | named `travel-api`, `$default` stage → `https://sxj1rkmxzl.execute-api.us-east-1.amazonaws.com` |
| S3 bucket | `dara-travel-web-2026` |
| CloudFront | `E2D0OEYUQ0FOA5` → `https://d31yizdca0ixa8.cloudfront.net` |
| Backend dir (Docker build context) | `api` |
| Migrations dir | `supabase/migrations/` |

All `aws` commands below assume your AWS key is configured
(`aws configure` or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars).

## I changed only the backend (`api/`)

The image must be built on your Mac (ARM64) — there is no Docker in the
cloud workspace. Then point Lambda at it:

```bash
cd api

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 656192943270.dkr.ecr.us-east-1.amazonaws.com

docker buildx build --platform linux/arm64 --provenance=false \
  -t 656192943270.dkr.ecr.us-east-1.amazonaws.com/travel-api:latest \
  --push .

aws lambda update-function-code --region us-east-1 \
  --function-name travel-api \
  --image-uri 656192943270.dkr.ecr.us-east-1.amazonaws.com/travel-api:latest

aws lambda wait function-updated --region us-east-1 --function-name travel-api

curl -s https://sxj1rkmxzl.execute-api.us-east-1.amazonaws.com/health   # expect {"status":"ok"}
```

No frontend rebuild needed. (`--provenance=false` matters: without it the
image manifest can confuse Lambda.)

## I changed only the frontend (`web/`)

```bash
cd web

VITE_BACKEND_URL="https://sxj1rkmxzl.execute-api.us-east-1.amazonaws.com" \
VITE_SUPABASE_URL="https://xyxcwpzksmhlnuhkzonx.supabase.co" \
VITE_SUPABASE_PUBLISHABLE_KEY="<sb_publishable_... from Supabase dashboard → Project Settings → API>" \
npm run build

aws s3 sync dist/ s3://dara-travel-web-2026 --delete --region us-east-1

aws cloudfront create-invalidation --distribution-id E2D0OEYUQ0FOA5 --paths "/*"
```

Wait ~1 minute, then hard-refresh the site. No Docker, no Lambda.
(Never put the **secret** key in a `VITE_*` variable; it would ship to every
browser.)

## I changed both

Backend first (section above), then frontend.

## I only changed an env var or rotated a secret

No rebuild, no redeploy — one command:

```bash
aws lambda update-function-configuration --region us-east-1 \
  --function-name travel-api \
  --environment "Variables={SUPABASE_URL=https://xyxcwpzksmhlnuhkzonx.supabase.co,SUPABASE_SECRET_KEY=sb_secret_...,WEB_ORIGINS=https://d31yizdca0ixa8.cloudfront.net}"
```

⚠️ AWS **replaces the entire variable set**, so include *every* variable, not
just the changed one. To see the current set first:

```bash
aws lambda get-function-configuration --region us-east-1 \
  --function-name travel-api --query Environment.Variables
```

Current variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `WEB_ORIGINS`
(`https://d31yizdca0ixa8.cloudfront.net`). Takes effect in ~1 minute.

## I changed the database schema

1. Add a new migration file in `supabase/migrations/`, named
   `YYYYMMDDHHMMSS_description.sql` with a timestamp **later** than the
   latest existing file (files apply in filename order).
2. Apply it to Supabase: paste the SQL into the Supabase dashboard SQL
   editor, or run it through the Management API `database/query` endpoint.
3. Keep changes additive. The `dara-suite` project is **shared with the
   budget app** — don't touch its tables.

## I forgot the backend URL

```bash
API_ID=$(aws apigatewayv2 get-apis --region us-east-1 \
  --query "Items[?Name=='travel-api'].ApiId" --output text)
echo "https://${API_ID}.execute-api.us-east-1.amazonaws.com"
```

Or: AWS console → API Gateway → APIs → `travel-api` → `$default` stage →
Invoke URL.

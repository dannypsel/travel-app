# One-time AWS setup

Do these steps once, in order, before running `deploy.sh` for the first time.
After setup, every deploy is just:

```bash
S3_BUCKET=<your bucket> CLOUDFRONT_DIST_ID=<your distribution id> \
VITE_SUPABASE_URL=https://<your-project>.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key> \
./deploy/deploy.sh
```

**Prerequisites on your machine:** an AWS account, AWS CLI v2 installed and
configured (`aws configure` — needs an access key, or use `aws configure sso`),
Docker with buildx (`docker buildx version` should print a version), and
Node.js 20+ (`node --version`). Run `npm install` inside `web/` once.

**Prerequisites elsewhere:** a Supabase project (free tier) — the same project
the budget app uses (the travel app's tables all live under the `travel_`
prefix). You'll need three values from it — where to find them is in step 8.

Costs: everything here sits in AWS free-tier territory for personal use —
Lambda's free tier is 1M requests + 400,000 GB-seconds of compute per month,
ECR stores one small image, S3/CloudFront serve a few MB. Expect ~$0/month.
There is no scheduler and no background worker — the API only runs when you
(or the web app) call it.

---

## 1. Create the ECR container-image repository

ECR (Elastic Container Registry) is AWS's private Docker image storage. The
deploy script pushes the backend image here, and Lambda pulls it from here.

```bash
aws ecr create-repository --repository-name travel-api --region us-east-1
```

(Console alternative: ECR → Repositories → Create repository, name
`travel-api`, leave the rest default.)

## 2. Create the Lambda function from the container image

Lambda runs the FastAPI backend. We use a **container image** (not a zip file)
because a container image ships Python dependencies deterministically and the
Lambda python base image pairs with the Mangum adapter.

1. Go to **Lambda → Functions → Create function**.
2. Select **Container image** (not "Author from scratch").
3. Function name: `travel-api`.
4. Container image URI: click **Browse images**, pick the `travel-api`
   repository and the `latest` image. No image exists yet on first setup, so
   push one first: after step 1, run `deploy.sh` — it will fail at the
   "updating Lambda" step because the function doesn't exist yet, which is
   fine and expected. Come back here, create the function from the image you
   just pushed, then finish steps 3–8 and re-run `deploy.sh` end to end.
5. **Architecture: arm64.** This is AWS Graviton (ARM chips) — about 20%
   cheaper per GB-second than x86_64, and the deploy script builds the image
   for `linux/arm64`. The image architecture **must match** the function
   architecture or the function won't start.
6. Create the function.
7. Go to **Configuration → General configuration → Edit**:
   - **Timeout: 5 min 0 sec.** The endpoints are simple CRUD plus a
     lightweight email parser; nothing runs long. A generous-but-bounded
     timeout keeps a bad request from burning compute.
   - **Memory: 512 MB.** Plenty for a barebones FastAPI app; Lambda bills
     per GB-second, and 512 MB × short-lived personal-use requests is far
     below the 400,000 GB-second monthly free tier.
   - Save.

## 3. Attach the Lambda environment variables

Lambda → Functions → `travel-api` → **Configuration → Environment variables →
Edit**. Add each of these.

| Variable | Value / how to get it |
|---|---|
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL (e.g. `https://xyz.supabase.co`) |
| `SUPABASE_SECRET_KEY` | Same page → **secret** key (`sb_secret_...` — never put this in the frontend) |
| `WEB_ORIGINS` | Comma-separated list of origins allowed to call the API from a browser. **Must include your CloudFront origin** (e.g. `https://d1234abcdef.cloudfront.net`) — that's where the web app lives. Add `http://localhost:5174` too if you want local `vite dev` to keep working. |

There is no Plaid section, no scheduler secret, and no email-digest SMTP in
this app — it has none of those integrations. In-app import runs on demand
via `POST /refresh`.

## 4. Create the Function URL (Auth type NONE)

> **Account note (2026-09-27):** Lambda Function URLs are currently broken in
> this AWS account — every invocation returns `403 AccessDeniedException`
> even with the correct `lambda:InvokeFunctionUrl` resource policy (verified
> in `us-east-1` and `us-west-2` with trivial test functions). The backend is
> therefore exposed through an **API Gateway HTTP API** instead (API id
> `sxj1rkmxzl`, `$default` stage → `https://sxj1rkmxzl.execute-api.us-east-1.amazonaws.com`).
> `VITE_BACKEND_URL` points at the API Gateway URL. If Function URLs start
> working again, the steps below still apply.

The Function URL is the public HTTPS address of the backend. The frontend is
built with this URL baked in (`VITE_BACKEND_URL`).

1. Lambda → Functions → `travel-api` → **Configuration → Function URL →
   Create function URL**.
2. **Auth type: NONE.** Then Create, and copy the URL (looks like
   `https://<random>.lambda-url.us-east-1.on.aws/`).

**Why Auth type NONE is safe — the app has its own auth.** "Auth type NONE"
only means *AWS* doesn't check credentials; the app checks them itself:

- Every endpoint that touches data requires the user's **Supabase JWT** in the
  `Authorization: Bearer …` header, verified against Supabase Auth on every
  call (`supabase.auth.get_user(token)`). No valid token → `401`. Your travel
  data is not reachable without being signed in.
- The only public endpoint is `GET /health`, which returns only
  `{"status":"ok"}`.

AWS_IAM auth would break the browser app (browsers can't sign AWS requests),
so NONE is the correct choice here.

## 5. Create the S3 bucket for the frontend

S3 stores the built static files (`index.html`, JS, CSS). The bucket stays
**private** — CloudFront reads it through an Origin Access Control (OAC), so
nobody accesses S3 directly.

```bash
aws s3api create-bucket --bucket <your-unique-bucket-name> --region us-east-1
```

- Bucket names are globally unique; pick something like
  `dara-travel-web-2026` (any name works — set `S3_BUCKET` to it at deploy time).
- Leave **Block all public access ON** (the default). Do **not** enable
  "Static website hosting" — CloudFront + OAC replaces it.
- (Console alternative: S3 → Create bucket, keep defaults.)

## 6. Create the CloudFront distribution

CloudFront is AWS's CDN: it serves the web app over HTTPS (required for the
PWA/installable app) from edge locations worldwide.

1. Go to **CloudFront → Create distribution**.
2. **Origin domain:** select your S3 bucket from the list. When prompted,
   choose **Origin access control (OAC)** and let it update the bucket policy
   ("Yes, update the bucket policy"). This is what lets CloudFront read the
   private bucket.
3. **Default root object:** `index.html`.
4. **Viewer protocol policy:** Redirect HTTP to HTTPS.
5. **Custom error responses** (this is the SPA fallback — without it,
   refreshing on a deep link or sharing one gives an error page):
   - Add: HTTP error code **403** → Customize error response: Yes →
     Response page path: `/index.html` → HTTP response code: **200**.
   - Add the same for **404** → `/index.html` → **200**.
   (S3 returns 403 for missing "folders" when accessed via OAC, hence both.)
6. **Caching:** the default cache behavior should **not** cache aggressively —
   use the `CachingDisabled` managed policy (or a short TTL) so `index.html`
   is never stale after a deploy. Then add a second cache behavior:
   - Path pattern: `/assets/*`, cache policy `CachingOptimized`. Vite emits
     hashed filenames (`assets/index-a1b2c3.js`), so these are safe to cache
     for a year; a new deploy produces new filenames.
7. Create the distribution and note its **domain name**
   (`d1234abcdef.cloudfront.net`). That's the value that must be in the
   Lambda `WEB_ORIGINS` (step 3) and the URL you'll open in the browser.
   (Deployment takes a few minutes; status changes from "In Progress" to
   "Deployed".)

## 7. IAM permissions for deploys

The deploy script needs AWS permissions. Create a **dedicated IAM user**
(e.g. `travel-deploy`) used only for this — not your root credentials.

1. **IAM → Users → Create user**, name `travel-deploy`.
2. Attach an inline policy (**Permissions → Add permissions → Create inline
   policy → JSON**) with the JSON below, replacing `YOUR-BUCKET`,
   `YOUR-ACCOUNT-ID`, and `YOUR-DIST-ID`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": ["ecr:*"],
      "Resource": "arn:aws:ecr:us-east-1:YOUR-ACCOUNT-ID:repository/travel-api"
    },
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Sid": "LambdaDeploy",
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:GetFunctionUrlConfig",
        "lambda:WaitFunctionUpdated"
      ],
      "Resource": "arn:aws:lambda:us-east-1:YOUR-ACCOUNT-ID:function:travel-api"
    },
    {
      "Sid": "S3WebBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET"
    },
    {
      "Sid": "S3WebObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET/*"
    },
    {
      "Sid": "CloudFrontInvalidation",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation"
      ],
      "Resource": "arn:aws:cloudfront::YOUR-ACCOUNT-ID:distribution/YOUR-DIST-ID"
    }
  ]
}
```

3. Create an **access key** for the user (Security credentials → Create access
   key → "Command Line Interface (CLI)") and configure it locally:
   `aws configure` (or store under a named profile and add
   `AWS_PROFILE=...` when running the script). The deploy script needs no
   other permissions.

## 8. Supabase: keys and migrations

1. **Keys** — Supabase dashboard → your project (the shared project with the
   budget app) → **Project Settings → API**:
   - **Project URL** → `SUPABASE_URL` (Lambda env, step 3) and
     `VITE_SUPABASE_URL` (deploy-time env for `deploy.sh`).
   - **publishable key** (`sb_publishable_...`) → `VITE_SUPABASE_PUBLISHABLE_KEY` (deploy-time env). Safe
     for the browser — it's gated by Row Level Security and the frontend
     only uses it to sign in and get a JWT.
   - **secret key** (`sb_secret_...`) → `SUPABASE_SECRET_KEY` (Lambda env
     only — full database access, never in the frontend).
2. **Migrations** — the travel app's migrations live in `supabase/` at the
   **repo root**, and every table is prefixed `travel_` so it shares the
   project with the budget app. Link the project once and push from the
   repo root:
   ```bash
   cd ~/workspace/travel-app
   supabase link --project-ref <your-project-ref>   # ref is in the Project URL: https://<ref>.supabase.co
   supabase db push
   ```
   (`db push` needs the database password — Project Settings → Database →
   you set it at project creation; reset it there if lost.)

## 9. First deploy

```bash
S3_BUCKET=<bucket from step 5> \
CLOUDFRONT_DIST_ID=<id from step 6> \
VITE_SUPABASE_URL=https://<ref>.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key> \
./deploy/deploy.sh
```

Then open the CloudFront domain (`https://d1234abcdef.cloudfront.net`) and
sign in. If the API calls fail, the usual culprit is `WEB_ORIGINS` missing
the CloudFront origin (browser blocks the call — check the console for CORS
errors).

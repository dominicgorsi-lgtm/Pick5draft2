# Deploy Five Wide on Render

The reported `failed to read dockerfile: open Dockerfile: no such file or directory` means Render is using the Docker runtime without a Dockerfile in the selected build directory. The screenshot shows the initial repository commit (`48fddfa`); deploy the latest `main` commit, which includes the app and the new Dockerfile.

## Fix the existing service

In the Render service dashboard:

1. Under Settings, use repository `dominicgorsi-lgtm/Pick5draft2`, branch `main`, Dockerfile Path `./Dockerfile`, and Docker Build Context `.`. Leave Root Directory and Docker Command blank so Render uses the repository root and the image's default command.
2. Under Environment, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ characters), `POOL_INVITE_CODE`, and `ODDS_API_KEY`. Keep these values in Render, not GitHub. Docker defaults already set `HOST=0.0.0.0`, `DATABASE_PATH=/var/data/pool.sqlite`, and `COOKIE_SECURE=true`; remove any conflicting environment overrides. Render supplies `PORT`, which the server reads.
3. Attach a persistent disk at `/var/data` before entering real pool data. Render persistent disks require a paid instance. Without it, accounts, entries, and rollover records can disappear when the container is replaced. Keep a single service instance for this SQLite app. Adding a disk later does not automatically migrate data from an ephemeral filesystem.
4. Choose **Manual Deploy → Deploy latest commit**, rather than retrying the failed initial commit. If Render is configured to deploy a specific commit, select the latest `main` commit.
5. Wait for Live, open the Render HTTPS URL, and sign in with your configured commissioner credentials. Create a week and sync spreads to verify API access.

The Docker image uses Node 24 and only copies the required application files. No `npm install` or separate build command is needed. Environment files, databases, and Git metadata are excluded from the build context. The app listens on all container interfaces and respects Render's assigned port.

## New service using a Blueprint

The optional `render.yaml` describes a Docker web service with a paid Starter instance and a 1 GB persistent disk. Review those resources before applying it. Creating a Blueprint is a separate action; adding this file does not reconfigure an existing manually created service.

The Blueprint prompts for your commissioner email and Odds API key. It generates an administrator password and invite code; retrieve those values privately in Render's Environment settings. An existing administrator's password is stored in the database and is not reset by changing the environment variable.

Deploy `main`. The `interview-vulnerabilities` branch is a separate localhost-only exercise and has no production deployment configuration.

## Verification boundary

The missing Dockerfile and configuration have been corrected in source. The Docker daemon socket is blocked by this workspace's sandbox, so the image build and Render deployment have not been executed here. Confirm the new deployment in Render; the prior failed deployment remains a historical result.

## Hosted presentation links

Deploy the latest `main` commit to add `/demo/presentation`, `/demo/slides`, and `/demo/` on your existing service. No new environment variables are needed for demo accounts. The simulated pool uses separate in-memory records and a separate cookie. See [HOSTED-DEMO.md](HOSTED-DEMO.md). With Render auto-deploy enabled, pushing `main` starts a deploy; otherwise choose Manual Deploy → Deploy latest commit. The GitHub update does not verify that Render has deployed successfully.

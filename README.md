# teamcollab

A way for teams with ambitions to collaborate.

- **Accounts**: sign up with a username, email and password. Sign-up and every login
  are confirmed with a 6-digit code emailed to you (via [Resend](https://resend.com)).
- **Teams**: create a team and become its owner. Choose the license that applies to
  every file in the team project, whether the team is public or private, and whether
  to start with a README.
- **Joining**: request to join any public team, or accept an invite from any team.
  Owners and admins review requests and send invites.
- **Files**: members upload, download and delete files (up to 10 MB each) and edit
  the README, which is rendered on the team page. Each file can be opened by
  everyone who can see the team (the default), by team members only, or by the owner
  and admins only. Restricted files stay listed with a lock, but can't be opened,
  replaced or deleted by people outside their level.

## Roles

| Action | Owner | Admin | Member | Outsider |
| --- | :-: | :-: | :-: | :-: |
| See a public team and download its files | ✓ | ✓ | ✓ | ✓ |
| See a private team's page | ✓ | ✓ | ✓ | if invited |
| Download a private team's files | ✓ | ✓ | ✓ | – |
| Upload files, edit the README | ✓ | ✓ | ✓ | – |
| Delete any file (members: only their own) | ✓ | ✓ | own | – |
| Restrict a file to team members or to the owner & admins | ✓ | ✓ | own files; not "Owner & admins" | – |
| Invite people, approve/reject join requests, edit description | ✓ | ✓ | – | – |
| Remove members | ✓ | members only | – | – |
| Promote/demote admins, change name/license/visibility, delete team | ✓ | – | – | – |
| Request to join | – | – | – | public teams |

The rules live in [`src/lib/permissions.ts`](src/lib/permissions.ts) and are enforced in
every server action and route handler.

## Stack

Next.js 16 (App Router, Cache Components, Server Actions), Auth.js v5, Prisma 6 with
PostgreSQL, Tailwind CSS 4, Resend for email. Files are stored in a private
[Vercel Blob](https://vercel.com/docs/vercel-blob) store in production, or on local
disk under `storage/` when no Blob token is set. Deployed on Vercel.

## Getting started

Requires Node.js 22.12+ (22 or 24 LTS). Next.js alone runs on 20.9+, but the test runner (Vitest 5) needs 22.12+.

```bash
npm install
cp .env.example .env.local  # then set AUTH_SECRET (npx auth secret) and the Resend settings
npm run db:local -- --detach  # local Postgres; paste the postgres:// URL it prints into
                              # DATABASE_URL and DATABASE_URL_UNPOOLED in .env.local
npm run db:migrate            # create the tables
npm run dev                   # http://localhost:3000
```

`npm run db:local` uses [`prisma dev`](https://www.prisma.io/docs/postgres/database/local-development),
a local Postgres that needs no install or account. It's built on an embedded
engine that handles only one connection well: under many simultaneous requests you
may see `portal "" does not exist` errors. If that gets in your way, use a real
Postgres instead, such as Docker (`docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17`)
or a free Neon branch, and put its URL in both variables. Without
`BLOB_READ_WRITE_TOKEN`, uploads are kept on local disk.

All local configuration lives in `.env.local` (git-ignored). Next.js reads it
automatically; the Prisma CLI does not, so use the `npm run db:*` scripts rather than
calling `npx prisma` directly.

### Email codes (Resend)

1. Create an API key at <https://resend.com/api-keys> and set `RESEND_API_KEY`.
2. Set `EMAIL_FROM` to a sender on a domain you have verified in Resend, e.g.
   `teamcollab <login@yourdomain.com>`. For a quick test you can use
   `teamcollab <onboarding@resend.dev>`, but Resend only delivers that to the email
   address of your own Resend account.

Without `RESEND_API_KEY`, `npm run dev` prints each email (including the code) to the
terminal instead, so you can work offline. `EMAIL_TRANSPORT=console` forces that
behaviour; in a production build, sending without a key is an error rather than a
silent fallback.

## How sign-in works

1. The login form checks the username and password (or the sign-up form validates
   the new account) and emails a 6-digit code. Nothing is signed in yet; for sign-ups
   the account isn't even created yet.
2. The code is entered on `/verify`. Only then does Auth.js issue a session, and for
   sign-ups the account is created with a verified email.

Codes expire after 10 minutes. A code can be resent every 30 seconds; each resend
gives a fresh 10 minutes, up to 30 minutes per sign-in attempt. Limits, all stored in
the database ([`src/lib/rate-limit.ts`](src/lib/rate-limit.ts)):

| Limit | Value |
| --- | --- |
| Wrong codes per sign-in attempt | 5, then start over |
| Codes per sign-in attempt | 5 (the first + 4 resends), then start over |
| Wrong login codes per account (across attempts) | 10 per 24 h, then no new login codes until the window ends |
| Wrong sign-up codes per address | 10 per 24 h (kept separate, so it can't block the owner's logins) |
| Code emails per mailbox | 5 per 15 min (first sends and resends; `a+tag@` and Gmail dot variants count as one mailbox) |
| Code emails per client IP | 20 per hour |
| Code emails for the whole app | `EMAIL_HOURLY_LIMIT` per hour (default 300): 70% reserved for logins, 30% for sign-ups |
| Login submissions and valid sign-up submissions per client IP | 30 per 15 min |

Per-IP limits use the right-most `X-Forwarded-For` entry, so the proxy closest to the
app must append the client address (nginx:
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`; Vercel does this
automatically). Without that, clients can spoof the value, or every client shares the
proxy's address and therefore one per-IP bucket.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (permissions, validation, codes, redirects) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:local` | Start a local Postgres (`prisma dev`) |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:studio` | Browse the database |

## Project layout

```
prisma/schema.prisma          data model (users, email challenges, rate limits, teams,
                              memberships, requests, invites, files)
src/auth.ts                   Auth.js config (one credentials provider that redeems a verified code)
src/lib/challenges.ts         emailed-code challenges: start, verify, resend, redeem
src/lib/otp.ts                code generation and hashing
src/lib/email.ts              Resend client and the code email
src/lib/rate-limit.ts         database-backed rate limits
src/app/actions/              server actions (auth, teams)
src/app/verify/               the "enter your code" page
src/app/api/                  route handlers: auth, file upload (+ Blob upload tokens), file download
src/lib/storage.ts            file storage: private Vercel Blob, or local disk in development
src/lib/upload-paths.ts       allowed pathnames for browser-to-Blob uploads
src/app/t/[slug]/             team page, README editor, settings
src/lib/                      permissions, validation, storage, data access
tests/                        unit tests
```

## Deploying to Vercel

GitHub Pages can't host this app (it only serves static files); it needs Vercel or
another Node host.

1. **Import the repo** at <https://vercel.com/new> (framework: Next.js). `vercel.json`
   already sets the build command to `prisma migrate deploy && next build`, so every
   deploy applies pending migrations.
2. **Database:** in the project's **Storage** tab, add **Neon** (Postgres) and connect
   it to the project. It sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`
   (direct, used for migrations). If the variable names differ, rename them to these.
   Turn on Neon's "preview branches" option so preview deployments migrate their own
   database branch, not production.
3. **Files:** in **Storage**, create a **Blob** store with access set to **Private**
   (it can't be changed later). Connect it to Production, Preview and Development
   with no custom variable prefix, so that `BLOB_READ_WRITE_TOKEN` is set everywhere.
   On Vercel the app refuses to run without it rather than falling back to the
   read-only disk.
4. **Environment variables** (Settings → Environment Variables):
   - `AUTH_SECRET`: a new secret from `npx auth secret`; don't reuse your local one.
   - `RESEND_API_KEY` and `EMAIL_FROM`: a sender on a domain verified in Resend.
     Nobody can sign in without working email.
   - Optional: `EMAIL_HOURLY_LIMIT`.
   - `AUTH_URL` isn't needed on Vercel (Auth.js detects it); set it if you add a
     custom domain and sign-in redirects go to the wrong host.
5. **Deploy**, then sign up on the production URL to check that the code email arrives.

How files work on Vercel, where functions are limited to 4.5 MB per request or
response:

- **Uploads** go straight from the browser to Blob, after the server issues a
  two-minute token for that one path.
- **Downloads** go through the access checks first. Files up to 4 MB are streamed
  as a download under their real name; larger ones redirect to a one-minute
  presigned download URL.
- **Namespaces:** every blob path starts with the environment name (`VERCEL_ENV`:
  production, preview, development), and blobs are only ever deleted inside the
  current environment. Preview deployments run on a copy of the production
  database, so they can show production files, but deleting or replacing one there
  never touches the production blob. `BLOB_NAMESPACE` overrides the name.
- Vercel sets `X-Forwarded-For` itself, so per-IP limits work without extra setup.

## Production notes (other hosts)

- Set `RESEND_API_KEY` and an `EMAIL_FROM` on a verified domain.
- Serve the site over HTTPS and set `AUTH_URL` to its URL (or `AUTH_TRUST_HOST=true`
  behind a trusted proxy).
- Point `DATABASE_URL` / `DATABASE_URL_UNPOOLED` at Postgres and run `npm run db:deploy`.
- Without `BLOB_READ_WRITE_TOKEN`, files go to `STORAGE_DIR` on local disk, which
  must be a persistent volume.

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
SQLite, Tailwind CSS 4, Resend for email. Uploaded files are stored on local disk under `storage/`.

## Getting started

Requires Node.js 22.12+ (22 or 24 LTS). Next.js alone runs on 20.9+, but the test runner (Vitest 5) needs 22.12+.

```bash
npm install
cp .env.example .env.local  # then set AUTH_SECRET (npx auth secret) and the Resend settings
npm run db:migrate          # creates prisma/dev.db
npm run dev                 # http://localhost:3000
```

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
src/app/api/                  route handlers: auth, file upload, file download
src/app/t/[slug]/             team page, README editor, settings
src/lib/                      permissions, validation, storage, data access
tests/                        unit tests
```

## Production notes

- Set `RESEND_API_KEY` and an `EMAIL_FROM` on a verified domain — nobody can sign in
  without working email.
- Serve the site over HTTPS and set `AUTH_URL` to its URL (or `AUTH_TRUST_HOST=true`
  behind a trusted proxy).
- To use Postgres, switch the Prisma `provider` to `postgresql`, point `DATABASE_URL`
  at your database, delete `prisma/migrations/` (the committed migrations are
  SQLite-specific) and run `npm run db:migrate -- --name init` once to create a
  Postgres baseline; deploy with `npm run db:deploy` from then on.
- `storage/` is local disk; on serverless hosts, replace `src/lib/storage.ts` with an
  object store (e.g. S3) — it is the only module that touches file contents.

# Deployment — and how to leave any of it

The point of this layout is that no piece owns the others. The app host runs
code and holds nothing; the database and the bucket each live somewhere you can
move independently, behind one connection string and four variables.

| Piece | Today | To move |
|---|---|---|
| App (Next.js) | Railway | Any Node host — it keeps no state |
| Database | Supabase Postgres | `DATABASE_URL` |
| Photos / voice notes | Cloudflare R2 | Four `S3_*` variables |
| Domain | GoDaddy → app host | One CNAME |

---

## 1. Database — Supabase

The schema needs the `vector` extension (`prisma/schema.prisma` declares it).
Supabase ships it; so do Neon and AWS RDS, which is why this is portable.

1. **New project** at supabase.com. Pick a region near your users
   (`ap-south-1` / Mumbai for India). Save the database password — it goes in
   the connection string and is not recoverable.
2. **Enable pgvector**: SQL Editor → `create extension if not exists vector;`
3. **Copy the connection string**: Project Settings → Database → Connection
   string → URI. Use the **Session pooler** (port `5432`), not the direct
   connection. A container host opens and drops connections on every deploy,
   and the direct endpoint runs out of slots long before the pooler does.
4. **Set it on the app host** as `DATABASE_URL`.
5. **Create the tables**: `npx prisma migrate deploy` — this already runs on
   every boot via the `start` script, so a deploy does it for you.

### Moving existing data off Railway first

Do this **before** pointing `DATABASE_URL` at Supabase, or the new database
starts empty and the old rows stay stranded on Railway.

```bash
pg_dump "$OLD_RAILWAY_DATABASE_URL" --no-owner --no-privileges -Fc -f bandhantak.dump
pg_restore -d "$NEW_SUPABASE_DATABASE_URL" --no-owner --no-privileges bandhantak.dump
```

Then swap the variable and redeploy. Keep the Railway database around for a few
days — it costs little and it is the only copy of anything the restore missed.

### Leaving Supabase later

Change `DATABASE_URL`. Nothing in the app knows which Postgres it is talking
to; there is no Supabase client, no Supabase auth, no Supabase storage in the
codebase. That is on purpose.

---

## 2. Photos and voice notes — Cloudflare R2

**This is required in production.** Without it, uploads go to the container
filesystem and are erased by the next deploy. The app logs a warning at boot
saying exactly that (`lib/services/storage/objectStore.ts`).

R2 because reads dominate writes here — a profile photo is uploaded once and
displayed thousands of times — and R2 charges nothing for egress. The code is
plain S3, so AWS S3, Supabase Storage, B2, Spaces and MinIO all work unchanged.

1. **Create a bucket** in the Cloudflare dashboard → R2. Name it e.g.
   `bandhantak-media`.
2. **Create an API token**: R2 → Manage API Tokens → Object Read & Write,
   scoped to that bucket. Copy the Access Key ID and Secret.
3. **Expose reads for photos only.** Settings → Public Access → connect a custom
   domain such as `cdn.bandhantak.com`, or enable the `r2.dev` subdomain.
4. **Set the variables:**

   ```
   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=bandhantak-media
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_PUBLIC_URL=https://cdn.bandhantak.com
   ```

   `S3_PUBLIC_URL` is where an `<img>` fetches from; `S3_ENDPOINT` is the API.
   They are different hosts on R2 and confusing them produces photos that
   upload fine and never display.

### The one thing to get right

Two prefixes, two rules:

- **`photos/`** — may be publicly readable. Profile photos are already withheld
  at the data layer for locked profiles (`reelData.ts` returns no URL rather
  than a blurred image), so the URL itself is the gate.
- **`media/`** — must **not** be publicly readable. Voice notes and blurred
  derivatives are served only through `GET /api/media/[id]`, which re-checks
  permission on every request. A world-readable `media/` prefix hands out
  every voice note to anyone who guesses a key.

### Existing photos

Anything uploaded before the bucket existed is on the old container and is
probably already gone. `ProfilePhoto.fileUrl` stores an absolute URL per row,
so old rows keep pointing where they pointed and new uploads go to R2 — no
migration, no broken mixed state. Users re-upload what is missing.

---

## 3. Domain — bandhantak.com

### Why the apex needs a DNS provider that flattens CNAMEs

Railway serves custom domains behind a hostname, never a fixed IP, so the only
record it will accept is a CNAME:

| Type | Name | Value |
|---|---|---|
| CNAME | `@` | `hs3xtygd.up.railway.app` |
| TXT | `_railway-verify` | `railway-verify=151d47eb96d4f36ff0f8759a9432c19d68c436fbd562ec4d85d0f54caa88e839` |

(Re-read these any time with `railway domain status bandhantak.com --service app`
— the verify token is per-domain and is reissued if the domain is removed and
re-added.)

A CNAME on the apex is not legal DNS, and GoDaddy — where this domain's
nameservers pointed until now (`ns73/ns74.domaincontrol.com`) — offers no
ALIAS/ANAME or CNAME flattening to work around it. Its "forwarding" feature is
not a substitute: it answers the apex with GoDaddy's own A records
(`3.33.251.168`, `15.197.225.128`) and serves an HTTP redirect from GoDaddy's
servers, so Railway never sees the request, never validates ownership, and
never issues a certificate. That is exactly the state the domain sat in — added
to Railway on 2026-08-24, `Verified: no`, certificate stuck on
`VALIDATING_OWNERSHIP`, apex returning GoDaddy's 404 page.

So DNS moves to Cloudflare, whose free tier flattens a CNAME at the apex into
the A records it resolves to. The alternative — making `www.bandhantak.com` the
real domain and forwarding the apex to it — keeps DNS at GoDaddy but changes
every canonical URL the app emits, so it is the fallback, not the plan.

### Moving the nameservers without breaking email

Cloudflare imports existing records when you add the zone, but **verify these
by hand before switching nameservers** — the domain's email runs on GoDaddy's
mail service and lives entirely in DNS. Losing any of them silently stops mail:

| Type | Name | Value |
|---|---|---|
| MX (0) | `@` | `smtp.secureserver.net` |
| MX (10) | `@` | `mailstore1.secureserver.net` |
| TXT | `@` | `v=spf1 include:secureserver.net -all` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;` |
| CNAME | `email` | `email.secureserver.net` |

Steps:

1. Add `bandhantak.com` to Cloudflare, let it scan, then check every row above
   is present. Add anything missing.
2. Add the two Railway records from the first table. Set the `@` CNAME to
   **DNS only** (grey cloud), not proxied — Railway terminates TLS itself, and
   an orange-cloud proxy in front of a certificate Railway has not issued yet
   is the usual cause of a redirect loop during setup.
3. Delete the stale `www` CNAME pointing at `rj3a93we.up.railway.app`. That
   host no longer exists, which is why `www.bandhantak.com` refuses connections
   outright rather than 404ing. Either drop `www` or point it at the same
   Railway target and add it with `railway domain www.bandhantak.com`.
4. Change the nameservers at GoDaddy to the pair Cloudflare gives you.
5. Wait for `railway domain status bandhantak.com --service app` to report
   `Verified: yes` and a certificate that is no longer validating.

### After the domain answers

6. Set `APP_URL` and `NEXT_PUBLIC_APP_URL` to `https://bandhantak.com`. Neither
   is set today. Payment callbacks, invite links and push notifications build
   absolute URLs from them and fall back to a hardcoded `https://bandhantak.com`
   — right by luck now, wrong the moment the canonical host changes.
7. Update the Razorpay webhook URL to the new domain.

If you use `cdn.bandhantak.com` for R2, add that CNAME too, pointing at the
value Cloudflare gives you.

TLS is issued by Railway once DNS resolves. Allow up to an hour; propagation
can take longer.

---

## 4. Deploying

GitHub pushes do **not** auto-deploy. A deploy is two steps:

```bash
git push
railway up --ci
```

`railway up` uploads the working tree and builds remotely, so what deploys is
what is on disk — not what is on the branch. Commit first, or you will deploy
something you cannot reproduce.

---

## 5. Scheduled jobs

Three POST endpoints, all guarded by `CRON_SECRET`. Point any scheduler at them
— Railway cron, GitHub Actions, cron-job.org, a crontab on a box you already
have. Each refuses to run if the secret is unset rather than defaulting to open.

```bash
curl -X POST https://bandhantak.com/api/cron/ops              -H "Authorization: Bearer $CRON_SECRET"
curl -X POST https://bandhantak.com/api/cron/lifecycle        -H "Authorization: Bearer $CRON_SECRET"
curl -X POST https://bandhantak.com/api/cron/partner-outreach -H "Authorization: Bearer $CRON_SECRET"
```

| Job | Cadence | What breaks without it |
|---|---|---|
| `ops` | **hourly** | Refunds and payouts wait for somebody to open a page; nobody is warned before a deadline; safety cases sit unmarked |
| `lifecycle` | twice a day (10am, 6pm IST) | Nudges stop. Nothing breaks, nobody is owed anything |
| `partner-outreach` | daily | Partner nudges stop. Same — a feature pauses, no promise is broken |

`ops` is the one that is not optional. It carries deadlines the product has
already promised in writing: a booking the partner never accepted refunds
automatically, a delivered booking releases the partner's money when the refund
window closes, and both sides get warned before either happens. Those
transitions also settle lazily whenever somebody reads the booking — so nothing
is *lost* while the cron is down — but "when the buyer happens to open the page"
is not a deadline, and the buyer who gave up on us is exactly the one who never
opens it.

Hourly is deliberate: a "6 hours left" warning on a daily schedule lands
somewhere between 6 and 30 hours out. Running it more often is harmless and
pointless — every step is guarded by a stored timestamp, so a double run sends
nothing twice.

`POST /api/cron/ops?dryRun=1` reports what the booking sweep would do and writes
nothing. It deliberately skips the two member-facing steps entirely, so a
preview can never message anybody.

---

## 6. Backups, and actually getting data back

Supabase takes daily backups on paid plans; on the free tier there are none, and
"the database is managed" is not a backup. Whatever the plan, the restore is the
thing worth owning:

```bash
# Take one. Safe to run against production — pg_dump does not lock writers.
pg_dump "$DATABASE_URL" --no-owner --no-privileges -Fc -f bandhantak-$(date +%F).dump

# Put one back, into a NEW database first. Never restore over a live one to
# "check if it works".
createdb bandhantak_restore_test
pg_restore -d "$RESTORE_TEST_URL" --no-owner --no-privileges bandhantak-2026-09-02.dump
```

Two things a restore does not bring back, and both matter more than the rows:

- **`SECRETS_ENCRYPTION_KEY`.** Partner bank details and stored API keys are
  encrypted with it. A restored database without the key that encrypted it is a
  database of unreadable secrets. Back the key up separately from the dump.
- **Objects in the bucket.** Photos and voice notes are in R2, not Postgres. A
  database restored to Tuesday alongside a bucket that is still on Friday will
  have rows pointing at objects that exist and objects nothing points at. R2
  versioning, or a periodic `rclone sync` to a second bucket, is the other half.

Test the restore before you need it. An untested backup is a belief.

---

## 7. When a payment webhook goes wrong

`/api/webhooks/payments` is the only place a subscription, item, booking or
verification is ever fulfilled. It is built to be replayed:

- A capture is applied once. The handler moves the payment out of `CREATED`
  inside the same transaction that grants the thing, so a redelivered event
  finds nothing to do and returns 200.
- It returns **500 only when our side failed after the money moved** — the one
  case where a gateway retry genuinely helps. An unrecognised order returns 200
  with a note, because retrying an order we will never recognise is a loop.
- Signature verification failure is a 401 and is logged. If those appear in
  bulk, the webhook secret on the gateway and `RAZORPAY_WEBHOOK_SECRET` here
  have diverged — rotate both together, never one.

To replay a missed event: find it in the gateway dashboard (Razorpay →
Settings → Webhooks → recent deliveries) and resend it. That is safer than
touching rows by hand, because the handler does the whole fulfilment — the
ledger row, the milestones, the notice — and a hand-written UPDATE does one
third of it.

Before a launch, read the audit log across the three things that cost money or
consent together — `/admin/audit-logs` covers consent events, admin money
actions and verification decisions in one place — and confirm every entry has a
name against it.

---

## Variables that must be set in production

Beyond the database and bucket above:

- `SECRETS_ENCRYPTION_KEY` — **losing this makes every stored API key and
  partner bank detail permanently unreadable.** It is not derivable. Back it up
  somewhere that is not this repo and not only the host.
- `JWT_SECRET` — rotating it logs everybody out.
- `APP_URL`, `NEXT_PUBLIC_APP_URL` — see the domain section.
- `NEXT_PUBLIC_DATA_MODE=api` — `mock` serves fixtures.
- `CRON_SECRET` — without it every scheduled job refuses to run, including the
  hourly one that settles refunds and payouts. See section 5.

`.env.example` documents the rest, including which are genuinely optional.

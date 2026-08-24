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

## 3. Domain — GoDaddy → bandhantak.com

1. On the app host, add the custom domain (`railway domain` or the dashboard).
   It gives you a target hostname.
2. In GoDaddy → DNS:

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `www` | the host's target |
   | A / ALIAS | `@` | as the host instructs — GoDaddy cannot CNAME the apex, so use its forwarding or the host's A record |

   If you use `cdn.bandhantak.com` for R2, add that CNAME too, pointing at the
   value Cloudflare gives you.
3. Set `APP_URL` and `NEXT_PUBLIC_APP_URL` to `https://bandhantak.com`. Several
   things build absolute links from these — payment callbacks, invite links,
   push notifications — and they are wrong until this is set.
4. Update the Razorpay webhook URL to the new domain.

TLS is issued by the host once DNS resolves. Allow up to an hour.

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

## Variables that must be set in production

Beyond the database and bucket above:

- `SECRETS_ENCRYPTION_KEY` — **losing this makes every stored API key and
  partner bank detail permanently unreadable.** It is not derivable. Back it up
  somewhere that is not this repo and not only the host.
- `JWT_SECRET` — rotating it logs everybody out.
- `APP_URL`, `NEXT_PUBLIC_APP_URL` — see the domain section.
- `NEXT_PUBLIC_DATA_MODE=api` — `mock` serves fixtures.

`.env.example` documents the rest, including which are genuinely optional.

# Skoolio — New Instance Setup Guide

This is a **Model A SaaS** (one isolated instance per school): each customer gets
their own Git repo deployment + their own Supabase database + their own Vercel
project. This guide stands up a brand-new, independent instance from this
codebase. Following it does **not** touch any existing customer.

Estimated time for an experienced operator: **45–90 minutes** (most of it is
collecting third-party API keys).

---

## 0. Accounts you need

| Purpose | Provider | Needed for |
|---|---|---|
| Code hosting | **GitHub** | the instance repo |
| Database + auth + functions | **Supabase** | one project per school |
| Web hosting | **Vercel** | the deployed app |
| SMS | **BulkSMSNigeria** (BSNG) and/or **Termii** | parent/staff SMS |
| WhatsApp | **Termii** | WhatsApp messages |
| Online payments | **Flutterwave** | card/transfer fee collection |
| Email | **Brevo** (Sendinblue) | bulk email |
| AI helpers (optional) | **Anthropic** | calendar parsing, etc. |
| Google Drive vault (optional) | **Google Cloud** OAuth | document/photo backup |

A school can launch with just Supabase + Vercel + one SMS provider. The rest are
optional and can be added later.

---

## 1. Create the instance repo

Option A — GitHub "Use this template" / fork, then clone your copy.

Option B — clone and re-point the remote:

```bash
git clone https://github.com/Engrdeyinka/tunmiseapp.git skoolio-<school-slug>
cd skoolio-<school-slug>
git remote set-url origin https://github.com/<you>/skoolio-<school-slug>.git
git push -u origin main
```

---

## 2. Rebrand the instance (5 minutes)

Edit **`src/config/brand.js`** — this is the single source of truth:

```js
export const BRAND = {
  appName: "Skoolio",                          // product name (keep or customise)
  platformName: "Skoolio School Management Platform",
  schoolName: "<School Display Name>",         // fallback name (Settings overrides at runtime)
  shortCode: "<SHORT>",                         // SMS signature, login codes, payment refs
  smsSenderId: "<RegisteredSenderId>",          // fallback SMS sender ID
};
```

Notes:
- The **live** school name, logo, address, principal, etc. are entered in-app at
  **Settings > General > School Info** and stored in `school_settings`. `brand.js`
  only supplies fallbacks and instance-level identifiers.
- `smsSenderId` must be **registered with the SMS provider/telco** for that school.
- `shortCode` appears in SMS signatures, student login codes (`<SHORT>@…`) and
  payment reference prefixes.

(Optional) replace the favicon / PWA icons in `public/` and the app title in
`index.html`.

---

## 3. Create the Supabase project + load the schema

1. Create a new project at supabase.com. Note the **Project URL**, **anon key**,
   and **service_role key** (Settings > API).
2. Install the CLI: `npm i -g supabase` (or use `npx supabase`).
3. From the repo root, link and push the schema:

```bash
supabase login
supabase link --project-ref <new-project-ref>
supabase db push        # applies everything in supabase/migrations/
```

> Reliability tip: if you'd rather clone the *exact current* schema from a known-good
> instance, run `supabase db dump --schema public -f schema.sql` against that
> project and apply `schema.sql` to the new one with `supabase db push` /
> `psql`. This captures any change not yet in a migration file.

4. Create the first **super-admin** account (see step 7).

---

## 4. Edge functions — set secrets, then deploy

The functions live in `supabase/functions/`. Set their secrets, then deploy.

### Secrets (Project > Edge Functions > Secrets, or CLI)

| Secret | Used by | What it is |
|---|---|---|
| `SUPABASE_URL` | most functions | usually auto-populated by Supabase |
| `SUPABASE_ANON_KEY` | functions | auto-populated |
| `SUPABASE_SERVICE_ROLE_KEY` / `SERVICE_ROLE_KEY` | admin functions, OAuth | service_role key |
| `BSNG_API_TOKEN`, `BSNG_SENDER_ID` | `sendSMS`, `sendDailyBirthdaySMS` | BulkSMSNigeria token + sender ID |
| `TERMII_API_KEY`, `TERMII_WA_FROM` | `sendWhatsApp` (and SMS) | Termii API key + WhatsApp sender |
| `FLUTTERWAVE_SECRET_KEY` | `flutterwave-*`, `record-flw-payment` | Flutterwave secret key |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | `sendBulkEmail` | Brevo email sending |
| `ANTHROPIC_API_KEY` | `parse-school-calendar` | Anthropic API key (optional) |
| `GOOGLE_CLIENT_SECRET` | `googleDriveOAuth*` | Google OAuth client secret (optional) |
| `APP_ORIGIN` | OAuth callback | the instance's frontend URL (e.g. https://<app>.vercel.app) |
| `SCHOOL_NAME` | SMS/email templates | the school's display name |

Set with the CLI, e.g.:

```bash
supabase secrets set BSNG_API_TOKEN=xxx BSNG_SENDER_ID=YourSchool \
  FLUTTERWAVE_SECRET_KEY=xxx APP_ORIGIN=https://<app>.vercel.app SCHOOL_NAME="<School Name>"
```

### Deploy

```bash
supabase functions deploy        # deploys all functions
# or one at a time: supabase functions deploy sendSMS
```

> Google Drive: also create an OAuth client in Google Cloud Console, add the
> instance origin + the `googleDriveOAuthCallback` URL as authorised redirect
> URIs, and enter the **Client ID** in-app at Settings > School Info (Connect Drive).

---

## 5. Frontend environment

Copy `.env.example` to `.env` and fill in (see that file for details):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_ANTHROPIC_API_KEY=        # optional
VITE_BBB_SALT=<long-random-unique-string>
```

Test locally: `npm install && npm run dev`.

---

## 6. Deploy to Vercel

1. New Vercel project → import the instance repo.
2. Framework preset: **Vite**. Build command and output are already set in
   `vercel.json` (includes the memory flag to avoid OOM builds).
3. Add the four `VITE_*` env vars from step 5 (Production + Preview).
4. Deploy. Add the school's custom domain/subdomain if desired.
5. Put the final URL into the `APP_ORIGIN` secret (step 4) so Drive OAuth redirects work.

---

## 7. First run (hand-off to the school)

1. Visit the deployed URL → **Login** → create the first account; in Supabase
   `profiles`, set that user's `school_role` to `super_admin` (or use the
   onboarding flow if enabled).
2. Settings > General > **School Info**: enter name, logo, address, principal
   signature/stamp, SMS sender ID, current term/year.
3. Settings > **Fee Structure**, classes/subjects, calendar (term start/end).
4. (Optional) Connect **Google Drive** for the vault/gallery.
5. Import students/teachers and go live.

---

## Per-instance quick checklist

- [ ] Repo cloned & pushed to new GitHub remote
- [ ] `src/config/brand.js` updated (name, shortCode, smsSenderId)
- [ ] Supabase project created; `supabase db push` run
- [ ] Edge-function secrets set; `supabase functions deploy` run
- [ ] `.env` / Vercel env vars set (4 × `VITE_*`)
- [ ] Vercel deployed; custom domain added
- [ ] `APP_ORIGIN` secret = deployed URL
- [ ] Super-admin created; School Info, fees, calendar entered

# Activate the free shared backend

The front end is published at https://avutr.github.io/civicsignal/. Until a Supabase project is connected, it explicitly runs in browser-local demo mode. The backend implementation and SQL are complete; an unconfigured project is not a deployed database.

## 1. Create a free Supabase project

Create a project in a **Free** organization at https://supabase.com/dashboard. Pick a nearby region and a strong database password. No paid plan is needed for this pilot. Keep the database password and any secret/service-role key private.

The free plan currently includes a 500 MB database and 50,000 monthly active auth users, subject to provider limits. Free projects may pause after inactivity. Check [current pricing](https://supabase.com/pricing) before increasing usage; do not upgrade automatically.

## 2. Apply the database migration

In the project's SQL editor, run the entire file:

`supabase/migrations/202609300001_civic_reports.sql`

Run it **once in a new project**. The migration is transactional and intentionally does not overwrite existing tables. It creates private tables and public RPC functions. Reports are public; account IDs and emails are not exposed through report APIs. It does not insert fake sample reports into the shared database.

The Supabase integration can apply this migration directly after you connect your account. Alternatively use the Supabase CLI's migration workflow with the included file.

## 3. Configure authentication

In **Authentication → URL Configuration**:

- Site URL: `https://avutr.github.io/civicsignal/`
- Allowed redirect URL: `https://avutr.github.io/civicsignal/`
- For development only, optionally allow `http://127.0.0.1:4175/`.

Enable email/password authentication and set minimum password length to 8. Keep email confirmation enabled for public signups.

**Email delivery matters:** Supabase's default email sender is restricted to organization team members and has a very low quota. For public signup confirmations and password recovery, configure custom SMTP. See [Supabase's SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp). A free backend does not include unrestricted public email delivery.

For an initial private pilot without SMTP, create confirmed test users through Supabase's **Authentication → Users** administration screen, then have those testers sign in with their assigned email and password. The sign-in and reporting workflows work without sending email; self-service signup confirmation and recovery still need SMTP. Do not represent those email flows as available until tested with your provider.

## 4. Assign a reviewer

After the operator has an Auth account, use the SQL editor to assign that account. Replace the example email with the exact account email:

```sql
insert into private.reviewers(user_id)
select id from auth.users where email = 'operator@example.com'
on conflict do nothing;
```

Confirm one row exists for the intended account. Only database administrators can assign reviewers. Signing up never grants review rights. A reviewer can update statuses with public notes and remove inappropriate reports. Authors can delete their own reports but cannot approve them or change their status.

## 5. Connect the deployed frontend

Copy the project URL and **publishable key** from Supabase's Connect/API settings. A legacy `anon` key is also supported. These are intended to be public; security is enforced in the database. Never use a secret or `service_role` key in browser code or GitHub variables.

Add these **repository variables** in GitHub → Settings → Secrets and variables → Actions → Variables:

- `SUPABASE_URL`: your `https://PROJECT.supabase.co` URL
- `SUPABASE_PUBLISHABLE_KEY`: your `sb_publishable_...` key (or legacy anon key)

Then run **Test and deploy CivicSignal** from the GitHub Actions tab. The build validates the configuration and embeds it in `dist/config.js`. Both values must be present; an incomplete setup fails the build rather than silently publishing a broken service.

For local development, put the same public values in `config.js`, then run `npm run dev`. Do not commit private credentials. The default checked-in file has empty values so tests and unconfigured clones remain a local demo.

## 6. Verify the real deployment

1. Open the live site: it should say **Community pilot**, show **Sign in**, and start with zero shared reports.
2. Sign in as a normal user and submit a report with a map pin.
3. Open a separate incognito browser: the report should appear after refresh without signing in.
4. Confirm the normal user cannot change review status; their own report can be deleted.
5. Sign in as the reviewer, add a review note, and change status.
6. Refresh the other browser and confirm the status and history updated.
7. Verify signup confirmation and password recovery with your SMTP provider before advertising public registration.

Refresh runs every 60 seconds while the page is visible and no dialog is open; the **Refresh** button updates immediately. This keeps free-tier load small without needing paid realtime infrastructure.

## Security and operating limits

- All three report/account/history tables and the quota table are in a private schema with RLS enabled and no browser table access. Only explicit functions are granted to API roles.
- Reports can be read anonymously. Creation requires a valid Supabase Auth session. Validation, timestamps, ownership, status, quotas, and reviewer authorization are enforced inside Postgres.
- Submissions are limited to 10 per account per rolling 24 hours. Deleting a report does not reset that quota. Quota timestamps older than 24 hours are pruned when the account next submits; inactive accounts retain timestamps until then or account deletion.
- Repeated submission retries use the same ID. Review/deletion requests check a revision number, preventing stale edits from silently overwriting newer work.
- Public reports contain precise locations. Do not include personal information. Deleting a report also deletes its public history. Account deletion through Supabase Auth cascades to owned reports and quota records.
- Review notes are public; reviewer account IDs are not. The database retains actor IDs for administrators until account deletion.
- There is no automatic connection to government departments, verification of civic claims, file uploads, messaging, or attachments.
- The current pilot fetches up to 10,000 reports with cursor pagination. For larger deployments, implement server-side search, map bounds, aggregation, and page-based loading before increasing that limit.
- Before an unrestricted launch, configure Auth bot protection and a UI challenge integration, monitor misuse, choose a retention policy, and configure an appropriate map tile provider. Per-account quotas alone cannot stop someone creating many accounts.

## Tests and their scope

`npm test` executes the actual migration in PGlite (a local Postgres engine), using separate anonymous, authenticated, and reviewer contexts. It checks direct-table denial, forged fields, ownership, rate limits, status authorization, stale writes, and cascading deletion.

`npm run test:e2e` exercises the real bundled Supabase browser SDK against a deterministic HTTP fixture, plus the local-demo workflow. This checks browser integration; it does not prove that your hosted Supabase project, email sender, or credentials have been configured. Complete the real deployment checks above after connecting the project.

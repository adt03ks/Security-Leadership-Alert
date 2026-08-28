# Security Dispatch Incident Alert Form

A responsive, conditional incident-reporting form designed for a security dispatch workstation. The front end can be hosted on GitHub Pages. A Supabase Edge Function records the incident and sends supervisor alerts by email (Resend) and SMS (Twilio).

## Included incident workflows

- Code Green: date, time, location, patient information, responding officer(s)
- Taser Pull: date, time, location, deploying officer, Taser number
- CTW: date, time, location, trespass subject, reported damages, responding law-enforcement agency, CTW form completed checkbox
- Officer Injury: date, time, location, incident-report-completed checkbox, officer name
- Insufficient Staffing: total officers on duty

The form also adds a required **Dispatch Officer / Submitted By** field and optional dispatch desk and additional-notes fields for auditability.

## Important privacy / production note

This template intentionally keeps patient information and detailed narrative data OUT of SMS and email alerts. Notifications contain only the incident category, occurrence time, location, submitting dispatch officer, and incident reference.

If the database may contain PHI or other regulated information, deploy only to an organization-approved environment with the appropriate security controls, contractual requirements/BAA where applicable, access controls, retention rules, and audit logging. GitHub Pages is public by default and should not be treated as an access-control layer.

## 1. Preview the form locally

The project ships in DEMO MODE. No notification will be sent.

From the project folder:

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## 2. Create the database table

In Supabase SQL Editor, run:

`supabase/schema.sql`

RLS is enabled and no anonymous table policy is created. The Edge Function writes with the service-role key.

## 3. Create and deploy the Edge Function

Copy the function in:

`supabase/functions/submit-security-incident/index.ts`

into your Supabase project, then deploy it.

Typical CLI flow:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy submit-security-incident
```

## 4. Add server-side secrets

Configure these secrets in Supabase. Never put these in GitHub front-end files.

```text
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
SUPERVISOR_PHONES=+1XXXXXXXXXX,+1YYYYYYYYYY
RESEND_API_KEY=...
ALERT_FROM_EMAIL=alerts@your-approved-domain.com
SUPERVISOR_EMAILS=supervisor1@example.com,supervisor2@example.com
ALLOWED_ORIGINS=https://YOUR_GITHUB_USERNAME.github.io,http://localhost:8080
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available to hosted Supabase Edge Functions.

## 5. Configure the front end

Edit `config.js`:

```js
window.SECURITY_ALERT_CONFIG = {
  DEMO_MODE: false,
  SUPABASE_FUNCTION_URL: "https://YOUR_PROJECT_REF.supabase.co/functions/v1/submit-security-incident",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY"
};
```

Never use the service-role key in `config.js`.

## 6. Upload to GitHub

Upload these front-end files to the repository root:

```text
index.html
styles.css
app.js
config.js
assets/security-leadership-alert.png
```

Do not publish the `supabase/` folder if you do not want backend source visible. Backend secrets are not in the source code, but keeping deployment code separate is cleaner.

Enable GitHub Pages under repository **Settings → Pages** and publish from the branch/folder you choose.

## 7. Test before live use

Test every incident type and confirm:

1. Conditional fields are correct.
2. Required validation works.
3. A database row is created.
4. Email arrives.
5. SMS arrives.
6. Patient/subject narrative does not appear in SMS/email.
7. A failed email/SMS path displays a warning and staff know the approved backup notification procedure.

## Recommended production hardening

- Put the application behind organization-approved authentication/SSO rather than relying on GitHub Pages alone.
- Use least-privilege access for incident-review dashboards.
- Add audit logs for record viewing and edits.
- Establish retention/deletion policy.
- Use approved enterprise email/SMS channels for regulated information.
- Add rate limiting and monitoring to the Edge Function.
- Consider a supervisor dashboard that reads the same incident table with authenticated access.

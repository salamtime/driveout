## Tenant Automation Setup

The zero-touch tenant provisioning flow uses server-side environment variables only.
Do not expose these values to the browser.

Required secrets:

- `SUPABASE_MANAGEMENT_TOKEN`
- `VERCEL_ACCESS_TOKEN`
- `CRON_SECRET`

Required project/domain config:

- `SUPABASE_ORGANIZATION_SLUG` (optional if the token only has one organization)
- `SUPABASE_PROJECT_REGION`
- `SUPABASE_PROJECT_INSTANCE_SIZE`
- `VERCEL_TEAM_SLUG`
- `VERCEL_PROJECT_NAME`
- `TENANT_ROOT_DOMAIN`

Lifecycle config:

- `TENANT_SIGNUP_MODE`
- `TENANT_AUTO_PROVISIONING_ENABLED`
- `TENANT_TRIAL_DAYS`
- `TENANT_DELETION_RETENTION_DAYS`

Recommended values for the current rollout:

```env
TENANT_SIGNUP_MODE=automatic
TENANT_AUTO_PROVISIONING_ENABLED=true
TENANT_TRIAL_DAYS=30
TENANT_DELETION_RETENTION_DAYS=90
TENANT_ROOT_DOMAIN=driveout.io
SUPABASE_PROJECT_REGION=us-east-1
SUPABASE_PROJECT_INSTANCE_SIZE=micro
VERCEL_PROJECT_NAME=rental-system-frontend
VERCEL_TEAM_SLUG=saharaxs-projects
```

Notes:

- `TENANT_SIGNUP_MODE=automatic` means approved signup should not wait for manual owner intervention.
- `TENANT_DELETION_RETENTION_DAYS=90` implements the agreed post-trial retention window.
- Wildcard subdomains are expected to be handled by the existing `*.driveout.io` Vercel configuration.
- `SUPABASE_ORGANIZATION_SLUG` can be omitted if the provisioning token belongs to only one organization. If multiple organizations are visible, set it explicitly.
- `CRON_SECRET` should be configured in Vercel so the daily `/api/tenants?resource=lifecycle` cron runs with a bearer token instead of leaving the lifecycle endpoint public.

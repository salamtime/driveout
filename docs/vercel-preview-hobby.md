# Hobby Preview Deploy

Use this command when the linked Vercel scope cannot accept the repo's cron configuration for a normal preview deploy:

```bash
npm run deploy:preview:hobby
```

What it does:

- copies the repo into a temporary workspace
- removes the `crons` block from the temporary `vercel.json`
- runs `vercel deploy -y` from that temporary copy
- deletes the temporary workspace after the deploy finishes

Notes:

- this keeps the real repo configuration unchanged
- the preview omits cron scheduling only; the application code is otherwise the same
- set `KEEP_PREVIEW_WORKDIR=1` if you want to inspect the generated temporary copy after the deploy

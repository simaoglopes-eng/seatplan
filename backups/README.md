# Backups

Copies of the SeatPlan database, in case something goes wrong.

- `backup.py` reads every table and writes `dumps/seatplan-<UTC time>.json`.
  It only reads; the database is not changed.
- `restore.py` puts a dump back into an **empty** database. It only inserts,
  refuses any table that already has rows, and runs in one transaction.
- `dumps/` is never committed (`.gitignore`): the dumps hold guest names and
  emails, and this repository is public. Keep them on your own disk or a
  private drive.

## Make a backup

From the repository root. The Vercel variables are Sensitive, so `vercel env
pull` only returns placeholders. The scripts read `SECRET_KEY` from the local,
untracked `.env.seatplan-secrets.local` and ask for the Neon connection string
without showing it (Vercel > Storage > the database > Show secret):

```bash
.venv/bin/python backups/backup.py
```

Expected: one `<table>: N rows` line per table, then `Saved backups/dumps/...json`.
Make one before every release that changes the tables (`app.seed.migrate`).

## Restore

1. Create a new, empty Postgres database (for example a new Neon branch).
2. Create the tables there: `cd backend && DATABASE_URL='...' SECRET_KEY='...' ../.venv/bin/python -m app.seed.migrate`
3. From the repository root: `DATABASE_URL='<the NEW database URL>' .venv/bin/python backups/restore.py backups/dumps/<file>.json`
4. Point `DATABASE_URL` on Vercel at the new database and redeploy.

The old database is left as it was, so you can always go back to it.

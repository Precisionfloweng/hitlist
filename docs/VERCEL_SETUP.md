# Putting the website on Vercel

1. **vercel.com → Add New → Project → Import** `Precisionfloweng/hitlist`.
   - **Root Directory: `web`** (important). Framework is detected as Next.js.
   - Don't deploy yet if it offers; set the variables first (or deploy, then redeploy after step 3).
2. **Storage → Create → Blob → Access: Private** and connect it to this project.
3. **Settings → Environment Variables** (Production):
   | Name | Value |
   | --- | --- |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | the whole service-account `.json` file contents |
   | `HITLIST_SHEET_ID` | the PFE Hitlist Data sheet ID |
   | `GMAIL_ADDRESS` / `GMAIL_APP_PASSWORD` | same as the mini PC |
   | `SESSION_SECRET` | a long random string |
   | `WORKER_SECRET` | a long random string; put the same value in the mini PC `.env` |
4. **Deployments → Redeploy.**
5. On the mini PC, add to `.env`: `APP_URL=https://<your-site>.vercel.app` and the same `WORKER_SECRET`,
   then restart the `Hitlist worker` task.

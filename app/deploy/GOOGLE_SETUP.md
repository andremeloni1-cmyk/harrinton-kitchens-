# Connecting Google (Calendar, Drive, Gmail)

JoineryFlow uses a single Google account — yours — to add calendar events, file
PDFs in Drive and send client emails. This is a one-time setup.

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and create a project (e.g. *JoineryFlow*).
2. **APIs & Services → Library** — enable all three:
   - Google Calendar API
   - Google Drive API
   - Gmail API

## 2. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (or *Internal* if you use Google Workspace).
3. Fill in the app name and your email.
4. **Scopes** — you don't have to add them here; the app requests them at sign-in.
5. **Test users** — add your own Google email. (While the app is in *Testing*
   mode only test users can connect, which is fine for a single-user tool. You
   can leave it in Testing indefinitely.)

## 3. Create OAuth credentials

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorised redirect URIs** — add exactly (no trailing slash):
   - Local: `http://localhost:3000/api/auth/google/callback`
   - Production: `https://jobs.yourdomain.com/api/auth/google/callback`
4. Create, then copy the **Client ID** and **Client secret**.

## 4. Add them to the app

In `app/.env`:

```env
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
APP_URL="https://jobs.yourdomain.com"   # must match the redirect URI host
```

Restart the app (`pm2 reload joineryflow` in production).

## 5. Connect

Open **Settings → Connect Google account** and approve access. You'll be sent
back with *Connected ✓*. From then on:

- Accepting a job adds it to your Google Calendar.
- *Find in email* pulls job PDFs into a **JoineryFlow Jobs** folder in Drive.
- Accept / move / cancel emails are sent from your Gmail.

To revoke, use **Disconnect** in Settings (or remove access at
<https://myaccount.google.com/permissions>).

### Notes
- The first connection requests *offline* access so the app gets a refresh token
  and keeps working without re-logging in. If you ever see auth errors, click
  Disconnect then Connect again.
- Drive files saved by the app are made link-viewable so they open from the
  calendar event without a second login. Remove that in `src/lib/google/drive.ts`
  if your org policy disallows it.

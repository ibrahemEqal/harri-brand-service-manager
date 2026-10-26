# Harri Group Creator

Local QA tool for an existing approved SSO test Brand. Enter the Brand ID, view automatically generated Group data, and click **Export to Harri** to submit the Group once. There is no Service catalog or Service activation flow.

## Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`. Mock Mode is the default. Enter mock Brand ID `18619889`, then **Simulate Export**; it does not contact Harri. The Group name is automatically generated with a UUID fragment. The example values supplied for this specific test are filled server-side: US, Asia/Dubai, SAT, 08:00–20:00, one-hour extension, and the supplied Auto Assign, break, overtime and payment settings. This is one captured example, not a general Group schema. Review “View complete generated data” to see every field.

**No locations are selected**: `brands: []` is sent because the provided request contained no selected locations. This does not mean the Group is associated with all locations. Selecting locations is not supported because its request format was not provided.

## Live test setup

The application does not automatically verify that a Brand has SSO. Use only the approved SSO test Brand. Group writes are disabled by default even when live Brand reads are enabled. After explicit authorization for the test Brand, configure `.env` on your machine and restart:

```dotenv
HARRI_MODE=live
HARRI_ALLOW_REAL_REQUESTS=true
HARRI_AUTH_HEADER_NAME=Authorization
HARRI_AUTH_HEADER_VALUE="<full approved Authorization value>"
HARRI_COOKIE=
HARRI_ALLOW_GROUP_CREATION=true
HARRI_GROUP_ALLOWED_BRAND_ID=18606124
PORT=3001
```

Use the actual authentication scheme and optional cookie required by the approved session. Never commit `.env` or send its contents to anyone. The configured allowed Brand ID is an explicit server-side allowlist, not an automatic SSO check. The Group defaults must be reviewed for suitability in that test environment before exporting.

Clicking **Export to Harri** posts the generated data to the confirmed Group endpoint. This button is the user’s action to create the Group. In Mock Mode it is labeled **Simulate Export**. On a successful acknowledged request, a local JSON report can be downloaded. The known response does not include a Group ID, and no independent read-back contract has been confirmed, so verify the new Group in BAM manually. If the request times out or returns an unexpected response, the outcome is uncertain; check BAM before preparing another Group. Requests are never automatically retried.

A generated preview is valid for five minutes. Repeating the same preview ID cannot send a second request in the same process; concurrent writes for the same Brand/name are blocked. This in-memory protection does not survive restart and is not durable idempotency. The generator creates a new name for each new preview, so check an uncertain prior attempt before trying again.

## Routes and security

- `GET /api/status` and `GET /api/brand?brandId=...`.
- `POST /api/groups/preview` generates data locally; it never contacts Harri.
- `POST /api/groups/execute` sends at most one POST for a preview when live creation is enabled and the Brand matches the configured ID.
- Other write methods/routes are rejected. Browser POSTs require an allowed local Origin. The server binds to loopback, does not expose auth headers, does not follow redirects, and never logs credentials.

## Verification

```bash
npm run build
npm test
npx playwright install chromium --only-shell
npm run test:e2e
```

Unit and backend tests inject fake Harri responses; they do not make real requests. Browser tests start a dedicated mock-only server that ignores the user's `.env`, so they cannot create real Groups. Browser installation is required for the UI tests. No real Group creation was executed while developing this version.

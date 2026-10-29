# Harri Group Creator

Local QA tool for an existing approved SSO test Brand. Enter the Brand ID, edit the automatically generated Group data, and click **Export to Harri** to submit the Group once. There is no Service catalog or Service activation flow.

## Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`. Mock Mode is the default. Enter mock Brand ID `18619889`, then **Simulate Export**; it does not contact Harri. The Group name is automatically generated with a UUID fragment. The example values supplied for this specific test are filled server-side: US, Asia/Dubai, SAT, 08:00–20:00, one-hour extension, and the supplied Auto Assign, break, overtime and payment settings. This is one captured example, not a general Group schema. Edit the main fields directly or expand “Edit all generated data (JSON)” for other fields; the server validates the observed structure before creating a new preview.

**No locations are selected**: `brands: []` is sent because the provided request contained no selected locations. This does not mean the Group is associated with all locations. Selecting locations is not supported because its request format was not provided. The supplied `GET /settings/groups/7869` response represents assignments on one existing Group; it does not establish the complete Location tree or the creation payload for selected locations. Non-empty `brands` is blocked until the contract is confirmed.

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

### SSO Group Creator

Choose **SSO Group** in the navigation. Enter an existing Brand ID with SSO configured as `MULTIPLE`, load its application level, providers, locations and existing groups, then choose a name, provider and one or more locations. Create group sends the observed SSO request with `allow_employees_sso_login: false`; it then reads groups to verify the selected name, provider and locations. Acknowledged or uncertain outcomes require checking Harri before retrying. Mock mode uses demo data and does not contact Harri. Scheduling Group remains available on its own page; its payload and endpoint are different.

For a live test, configure `.env` with `HARRI_MODE=live`, `HARRI_ALLOW_REAL_REQUESTS=true`, your server-side `HARRI_AUTH_HEADER_NAME` and `HARRI_AUTH_HEADER_VALUE`, `HARRI_ALLOW_GROUP_CREATION=true`, and `HARRI_GROUP_ALLOWED_BRAND_ID` set to the specific authorized test Brand. Restart the backend after changing `.env`. Never share credentials. Only the configured Brand can be used for live writes. The creation response does not include a group ID; verification uses the returned group list.

For SSO batch creation, load the Brand, select a count (1–20), and click **Generate groups**. Drafts receive random providers and locations from the loaded data and unique generated names. Edit each draft before **Confirm and export**; generation sends no write requests. Export sends individual requests sequentially and stops at the first unverified or unsuccessful result. Review the displayed outcome in BAM before retrying; earlier successful groups remain created.

An SSO location may be assigned to only one group. Generation uses distinct locations that are not in existing groups; it is limited by the number of available locations. Existing or selected locations cannot be reused in another draft, and the backend checks the current group list before every creation. A pending or uncertain live request reserves its locations in the running backend; check BAM before trying again.

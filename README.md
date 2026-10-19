# Harri Brand Service Manager v0.1

A local, **strictly read-only** Harri BAM QA dashboard. React, TypeScript, Vite, Tailwind CSS, Node.js/Express and Playwright APIRequestContext.

Enter a Brand ID to load that Brand's details and the complete global service catalog through the backend. Services stay collapsed in a searchable dropdown. Open it to search names/codes/descriptions, filter platform and mode, sort alphabetically and inspect nested dependency/exclusion/group details. Keyboard users can use the search field with Arrow keys, Enter and Escape. Main text and inputs use a larger readable type scale.

## Run locally

Requires Node.js 22+ and npm. From the repository root:

```bash
npm ci
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:5173**. Backend binds to **127.0.0.1:3001**. With default Mock Mode, enter **18619889** and click **Load Services**. The UI displays the supplied `sds` Brand snapshot and all **166 services** from the attached JSON (102 HARRI, 64 TEAM). Other IDs return an explicit mock 404; the tool never relabels the same snapshot as another Brand.

The Brand fixture is based on the response supplied during implementation. Email and business identifier were omitted. Every mock result is clearly labeled **MOCK SNAPSHOT — NOT LIVE**. The catalog fixture is the full, unchanged attached JSON. It is read by the backend, not hardcoded into the frontend.

### Production build, still local

```bash
npm run build
npm start
```

Open **http://127.0.0.1:3001**. Vite's development proxy assumes port 3001; if changing PORT, update `vite.config.ts` too. Do not expose this single-user local prototype as a public multi-user app.

## Confirmed Harri GET endpoints

| Purpose                | Endpoint                                                                         |
| ---------------------- | -------------------------------------------------------------------------------- |
| Brand details          | `https://gateway.harriprep.com/account-management/api/v1/admin/brands/{brandId}` |
| Global service catalog | `https://gateway.harriprep.com/account-management/api/v1/admin/service`          |

The Brand path and response were supplied for ID 18619889. The adapter reads the supplied `{data: {...}}` structure and also supports the direct Brand object shown alongside it. It validates that the returned ID matches the requested ID before displaying anything. Core Brand fields and supported nested currency/time-zone/HEC fields are validated; only validated display fields are forwarded. Arbitrary upstream properties and the business identifier are not forwarded.

The catalog parser reads `data.services` and validates every service, nullable description, prerequisite, mutual exclusion, implicit dependency and prerequisite group. Missing/malformed required fields reject the response rather than silently returning a partial catalog. New non-empty platform or mode values can appear dynamically in the filters. Nested groups are shown without inventing AND/OR semantics.

**Assigned/activated Brand services are not implemented:** no read endpoint or response contract has been supplied for them. A Brand's `status: ACTIVE` describes the Brand, not its services. The global catalog never labels a service active or inactive for the selected Brand.

## Live Mode — ready for authorized local testing

**No authenticated Harri requests were executed during development.** Mock and stub tests do not establish that an actual session has permission to read these endpoints. Brand integration is implemented, but successful live retrieval remains unverified until an explicitly approved authenticated test.

After obtaining explicit approval to perform the read-only requests, configure the server's local `.env`:

```dotenv
HARRI_MODE=live
HARRI_ALLOW_REAL_REQUESTS=true
HARRI_AUTH_HEADER_NAME=Authorization
HARRI_AUTH_HEADER_VALUE=<full approved header value>
# Optional, only when required by your approved session:
HARRI_COOKIE=
PORT=3001
```

`Authorization` is an example header name. Configure the actual header name and **complete value** used by your approved Harri session; the tool does not assume or prefix Bearer. For cookie-only authentication, set `HARRI_AUTH_HEADER_NAME=Cookie` and place the full approved cookie value in `HARRI_AUTH_HEADER_VALUE`; leave `HARRI_COOKIE` empty. Optional `HARRI_COOKIE` is for combining a named authentication header with a session cookie when confirmed necessary. Restart the backend after changes. Never send credentials into React, paste them into screenshots, use `VITE_` variables for secrets or commit them. `.env` and variants are gitignored.

Only clicking **Load Services** initiates the two Harri GET requests in Live Mode. The status endpoint does not contact Harri. Requests use Playwright APIRequestContext, a 15-second timeout, normal TLS certificate checks, zero redirects, no automatic retries and disposed request contexts. The Brand ID is validated before interpolation; users cannot submit arbitrary upstream URLs or payloads.

Errors distinguish invalid IDs (400), rejected authentication (401), access denied (403), Brand not found/not visible (404), invalid responses (502), and connectivity/timeouts (502). Redirect responses are reported separately as UPSTREAM_REDIRECT with their exact HTTP status; redirects are never followed. HTTP 401 is reported separately as rejected authentication. For a catalog-only HTTP 404, the backend returns the full provided snapshot with source `attached-fixture-fallback` and an explicit warning. Brand data never falls back to a different source, and authentication/permission failures do not trigger catalog fallback. Independent Brand/catalog results remain separately labeled when one request fails.

## Read-only boundaries

Application-owned endpoints (not additional Harri endpoints):

- `GET /api/status`: mode and capabilities, with no authentication values.
- `GET /api/brand?brandId=...`: Brand lookup using the confirmed path above.
- `GET /api/services`: complete global catalog.

All mutation methods are rejected with 405 before routing, including the previous `/api/preview` and `/api/execute` paths. There are no activation, create-Brand, edit, delete or authentication-write routes. Local HEAD requests provide metadata without performing Harri requests. Backend outbound transport only exposes GET. No sensitive headers or raw upstream responses are logged or returned in errors. Loopback binding, Host/Origin validation and same-origin access limit this local tool. Responses use `Cache-Control: no-store`.

## Verify

```bash
npm test
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
```

Unit and backend tests cover full fixture preservation, malformed responses, nullable descriptions, nested groups, search/filter/sort, ID validation/matching, mock Brand identity, HTTP 401/403/404, configurable authentication, real-request gates, timeout handling, cleanup and denial of write methods. Live transport tests inject response stubs; they never call Harri. Browser tests cover desktop and mobile Brand/catalog workflow, filters, drawer, empty/error states and only-GET browser traffic. Stop any existing dev server before browser tests.

## Project structure

- `src/components/`: reusable searchable service picker, Brand overview and accessible native-dialog details drawer.
- `src/api.ts`: frontend GET client and safe error handling.
- `shared/`: TypeScript contracts, runtime response validation and search/filter functions.
- `server/`: configuration, read-only Playwright adapter and local Express routes.
- `fixtures/`: supplied service response and sanitized Brand snapshot.
- `tests/`: parser/filter, transport, HTTP and browser tests.

## Next integration: assigned services

In Chrome DevTools → Network → Fetch/XHR, clear the request list and open an existing Brand's Services view in Harri BAM. Find the **GET** request whose response enumerates that specific Brand's assigned services. Provide its URL, method and sanitized response, with Authorization/Cookie/session values removed. Until that contract is confirmed, service activation status remains **unavailable**. Do not infer assignments from catalog prerequisites, Brand status or service mode.

## Troubleshooting live authentication

The server reads `.env` next to the project `package.json`, independently of the current shell directory. Settings present in that file take precedence over inherited HARRI settings and PORT. Missing keys can still come from the process environment. Restart the backend after editing `.env`; changing that file alone does not restart the running process.

Startup prints the configuration source, authentication header **name**, whether a cookie is configured, and (for Bearer Authorization) a format-valid boolean. It never prints credential values, token fragments or fingerprints. A false format check is a diagnostic hint, not a claim that the token itself is valid or invalid. Cookie-only auth must not be configured twice: leave HARRI_COOKIE empty when HARRI_AUTH_HEADER_NAME=Cookie.

If authentication fails, the UI now distinguishes `HTTP 401`, `HTTP 403`, and redirect statuses such as `HTTP 302`. Do not infer that a redirect is necessarily a login redirect; its destination is not returned to the UI. The raw response body and Location/Set-Cookie headers stay private. A working browser session alone does not prove the server is sending an equivalent authenticated request. Share only the new HTTP status, the safe startup summary, and the required header names when diagnosing. Never share the values. No extra authentication scheme or undocumented headers are guessed.

## Service selection and Add preview

The searchable dropdown supports multiple selections and shows all catalog entries. Selected services appear in a summary with Details and Remove actions. The `إضافة الخدمات (Preview)` button is enabled only with a loaded Brand and at least one selection. Clicking it displays a local preview and explicitly states that nothing was sent to Harri. It does not call an activation API, simulate a success, or change any Brand.

A catalog HTTP 404 no longer hides the service selector: the backend loads the complete supplied 166-service fixture, labeled as a snapshot fallback. This keeps selection usable without asserting that the live catalog request succeeded. The underlying live 404 still requires investigation; no alternative endpoint is invented.

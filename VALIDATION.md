# Validation — Brand/catalog and Group MVP

- Dependencies installed with `npm ci`.
- `npm run build`: passed, TypeScript and Vite production build.
- `npm test`: **30 passed**, covering catalog parsing/filtering, Brand response parsing/identity, read-only live adapter stubs, status/error handling and local HTTP routes.
- Frontend/backend smoke check: passed using Playwright APIRequestContext against loopback only. Started Vite and Express in one process, fetched the HTML and compiled React module, then used the Vite proxy to verify mock mode, Brand 18619889/name `sds`, all 166 catalog services, invalid-ID 400 and unknown-mock-ID 404.
- Browser E2E specs are supplied for desktop and mobile, including Brand loading, nested details, search/filter/sort and empty/authentication/failure states. They were **not run successfully**: Chromium is unavailable and `npx playwright install chromium --only-shell` repeatedly downloaded an invalid/empty archive. Visual/browser verification remains outstanding.
- No real authenticated Harri request was executed. Live Brand and catalog adapters were tested with injected response stubs only.

## Integration state

The confirmed Brand GET path and both supplied Brand response wrappers are implemented. The returned Brand ID must match the requested ID. Live operation requires explicit approval, local server credentials and a successful live test before being called verified. Mock results are labeled snapshots and only ID 18619889 is available in the Brand fixture.

The service catalog is global, not a Brand's assignments. Assigned-service activation status remains unavailable because its read endpoint/response have not been confirmed. No service-activation write flow is present. Group creation is separately gated; see below.

## Authentication diagnostics update

Validated project `.env` precedence over inherited tool settings, safe metadata-only startup summaries, duplicate Cookie-source rejection and exact 401-versus-redirect reporting. No live Harri requests were executed. This change improves diagnosis; successful authentication is still unverified.

## Readability and compact service selection

Increased the UI type scale (main text/inputs 16px, small metadata 14px+) and strengthened muted text contrast. Replaced the full service grid with a collapsed searchable dropdown; platform/mode filters and sorting appear only inside the opened picker. Selection opens the existing details drawer; no activation operation was added. Browser specs were updated for dropdown keyboard selection, focus restoration and readable input text. Browser execution remains unavailable in this environment because Chromium is not installed.

## Catalog 404 and local Add preview

Added a tested catalog-only HTTP 404 fallback to the full provided snapshot, with explicit source/warning. Live Brand errors and authentication errors are not masked. Added multi-selection, a selected-service summary and a local-only Add preview button. Browser specs now cover selection and verify only GET traffic, but cannot be executed here due to the previously documented missing Chromium. Production build and 30 Node/backend tests pass. No real Harri activation or write request was made.

## Group Management update

The current build and 37 Node/backend tests passed. Tests use mocked transports and a loopback backend, including preview confirmation, empty locations, request shape, allowed Brand, blocked real execution, uncertain outcomes and concurrent attempts. No real Group was created or authenticated Harri request sent by the developer. Browser execution remains unverified in this environment. SSO is a manual prerequisite and no Location selection is implemented.

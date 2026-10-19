# Validation — read-only Brand/catalog MVP

- Dependencies installed with `npm ci`.
- `npm run build`: passed, TypeScript and Vite production build.
- `npm test`: **29 passed**, covering catalog parsing/filtering, Brand response parsing/identity, read-only live adapter stubs, status/error handling and local HTTP routes.
- Frontend/backend smoke check: passed using Playwright APIRequestContext against loopback only. Started Vite and Express in one process, fetched the HTML and compiled React module, then used the Vite proxy to verify mock mode, Brand 18619889/name `sds`, all 166 catalog services, invalid-ID 400 and unknown-mock-ID 404.
- Browser E2E specs are supplied for desktop and mobile, including Brand loading, nested details, search/filter/sort and empty/authentication/failure states. They were **not run successfully**: Chromium is unavailable and `npx playwright install chromium --only-shell` repeatedly downloaded an invalid/empty archive. Visual/browser verification remains outstanding.
- No real authenticated Harri request was executed. Live Brand and catalog adapters were tested with injected response stubs only.

## Integration state

The confirmed Brand GET path and both supplied Brand response wrappers are implemented. The returned Brand ID must match the requested ID. Live operation requires explicit approval, local server credentials and a successful live test before being called verified. Mock results are labeled snapshots and only ID 18619889 is available in the Brand fixture.

The service catalog is global, not a Brand's assignments. Assigned-service activation status remains unavailable because its read endpoint/response have not been confirmed. No activation or other write flow is present in this version.

## Authentication diagnostics update

Validated project `.env` precedence over inherited tool settings, safe metadata-only startup summaries, duplicate Cookie-source rejection and exact 401-versus-redirect reporting. No live Harri requests were executed. This change improves diagnosis; successful authentication is still unverified.

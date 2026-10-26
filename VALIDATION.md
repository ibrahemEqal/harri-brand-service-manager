# Validation

This version removes the service catalog/activation flow and automatically generates Group data from the provided example. Real creation is gated to an explicitly configured test Brand and initiated only when the user clicks Export.

- Build and 19 Node/backend tests passed. They cover payload generation, the exact Group URL, authentication, allowed Brand, mock operation, replay protection and uncertain outcomes using stubbed Harri responses.
- Browser tests start an explicit mock-only server that ignores `.env`, preventing writes to Harri even when a live session exists on the developer machine.
- No authenticated Harri request or real Group creation was performed during implementation. A successful upstream response is an acknowledgment, not independent verification. Manual check in Group Management is required.
- `brands: []` always means no selected locations in the provided example. SSO status and the example settings are not automatically validated for the Brand.

- `npm run test:e2e` could not launch its four desktop/mobile cases because Playwright Chromium was not installed in this environment. Visual verification remains outstanding.

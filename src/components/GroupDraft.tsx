import { useState } from "react";
import { RequestError, postJson } from "../api.ts";
import type { OperatingMode } from "../../shared/catalog.ts";
import type { buildObservedPayload } from "../../shared/group.ts";
type Preview = {
  id: string;
  brandId: string;
  mode: OperatingMode;
  payload: ReturnType<typeof buildObservedPayload>;
  expiresAt: number;
};
type Report = {
  status: "mock_success" | "acknowledged" | "rejected" | "uncertain";
  message: string;
};
export function GroupDraft({
  brandId,
  mode,
  creationAvailable,
}: {
  brandId: number;
  mode: OperatingMode;
  creationAvailable: boolean;
}) {
  const [name, setName] = useState(""),
    [country, setCountry] = useState("US"),
    [timezone, setTimezone] = useState("Asia/Dubai"),
    [day, setDay] = useState("SAT");
  const [open, setOpen] = useState("08:00"),
    [close, setClose] = useState("20:00"),
    [extension, setExtension] = useState("1");
  const [preview, setPreview] = useState<Preview | null>(null),
    [confirmation, setConfirmation] = useState(""),
    [ack, setAck] = useState(false),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false);
  function clear() {
    setPreview(null);
    setConfirmation("");
    setAck(false);
    setReport(null);
    setError("");
    setAttempted(false);
  }
  function seconds(value: string) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 3600 + minutes * 60;
  }
  async function prepare() {
    setBusy(true);
    setError("");
    setReport(null);
    setAttempted(false);
    try {
      setPreview(
        await postJson<Preview>("/api/groups/preview", {
          brandId: String(brandId),
          input: {
            name,
            countryCode: country,
            timeZoneName: timezone,
            startDayOfWeek: day,
            openTime: seconds(open),
            closeTime: seconds(close),
            closeTimeExtension: Number(extension) * 3600,
          },
        }),
      );
      setConfirmation("");
      setAck(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not prepare the preview.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function execute() {
    if (!preview || busy || attempted) return;
    setBusy(true);
    setAttempted(true);
    setError("");
    try {
      setReport(
        await postJson<Report>("/api/groups/execute", {
          previewId: preview.id,
          confirmation,
          acknowledgeNoLocations: ack,
        }),
      );
    } catch (e) {
      const detail =
        e instanceof RequestError ? e.message : "No response was received.";
      setError(
        `${detail} If the request was submitted, check Group Management before preparing another preview.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="group-draft panel" aria-labelledby="group-draft-title">
      <div className="section-kicker">TEAM SCHEDULING / GROUP MANAGEMENT</div>
      <h2 id="group-draft-title">Create a Group</h2>
      <p>
        Brand ID {brandId} ·{" "}
        {mode === "mock"
          ? "MOCK: no Harri changes"
          : "LIVE: designated test Brand only"}
        . The SSO condition must be checked manually.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void prepare();
        }}
      >
        <fieldset disabled={busy}>
          <div className="group-draft-fields">
            <label>
              Group name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clear();
                }}
              />
            </label>
            <label>
              Country code
              <input
                required
                pattern="[A-Z]{2}"
                maxLength={2}
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value.toUpperCase());
                  clear();
                }}
              />
            </label>
            <label>
              Time zone
              <input
                required
                maxLength={100}
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  clear();
                }}
              />
            </label>
            <label>
              Start day
              <select
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  clear();
                }}
              >
                {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Open time
              <input
                required
                type="time"
                value={open}
                onChange={(e) => {
                  setOpen(e.target.value);
                  clear();
                }}
              />
            </label>
            <label>
              Close time
              <input
                required
                type="time"
                value={close}
                onChange={(e) => {
                  setClose(e.target.value);
                  clear();
                }}
              />
            </label>
            <label>
              Hours extension
              <input
                required
                type="number"
                min="0"
                max="24"
                step="0.25"
                value={extension}
                onChange={(e) => {
                  setExtension(e.target.value);
                  clear();
                }}
              />
            </label>
          </div>
        </fieldset>
        <p>
          Example settings are prefilled from the supplied request. Review the
          entire payload before confirming. No locations are selected in this
          version.
        </p>
        <button className="primary" disabled={busy} type="submit">
          {busy ? "Working…" : "Preview Group"}
        </button>
      </form>
      {error && (
        <div className="brand-error" role="alert">
          {error}
        </div>
      )}
      {preview && (
        <div className="local-add-preview">
          <strong>
            Review {preview.mode.toUpperCase()} request · Brand{" "}
            {preview.brandId}
          </strong>
          <p>
            Example settings include Auto Assign, break, overtime and payment
            fields. Confirm these are appropriate for this Brand.
          </p>
          <pre>{JSON.stringify(preview.payload, null, 2)}</pre>
          <p>
            Preview expires after five minutes. No locations will be assigned.
          </p>
          <label className="group-confirm">
            Type Brand ID to confirm
            <input
              value={confirmation}
              disabled={busy || !!report || attempted}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <label className="group-ack">
            <input
              type="checkbox"
              checked={ack}
              disabled={busy || !!report || attempted}
              onChange={(e) => setAck(e.target.checked)}
            />{" "}
            I confirm that zero locations will be assigned.
          </label>
          {mode === "live" && !creationAvailable && (
            <p>
              Live Group creation is disabled in the local server configuration.
              You can review this preview.
            </p>
          )}
          <button
            type="button"
            className="primary"
            disabled={
              busy ||
              !creationAvailable ||
              attempted ||
              !!report ||
              confirmation !== String(brandId) ||
              !ack
            }
            onClick={() => void execute()}
          >
            {busy
              ? "Sending…"
              : mode === "mock"
                ? "Simulate group creation"
                : "Create Group in Harri"}
          </button>
          {report && (
            <div role="status" className="group-report">
              <strong>
                {report.status.replaceAll("_", " ").toUpperCase()}
              </strong>
              <p>{report.message}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

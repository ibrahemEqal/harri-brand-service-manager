import { useEffect, useState } from "react";
import { RequestError, postJson } from "../api.ts";
import type { OperatingMode } from "../../shared/brand.ts";
import type { buildObservedPayload } from "../../shared/group.ts";
type Preview = {
  id: string;
  brandId: string;
  mode: OperatingMode;
  payload: ReturnType<typeof buildObservedPayload>;
  expiresAt: number;
};
type Report = {
  brandId: string;
  name: string;
  mode: OperatingMode;
  status: "mock_success" | "acknowledged" | "rejected" | "uncertain";
  message: string;
  verification: "mock_only" | "not_supported";
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
  const [plan, setPlan] = useState<Preview | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [retryVerified, setRetryVerified] = useState(false),
    [generation, setGeneration] = useState(0);
  useEffect(() => {
    let current = true;
    setPlan(null);
    setReport(null);
    setError("");
    setLoading(true);
    setAttempted(false);
    setRetryVerified(false);
    postJson<Preview>("/api/groups/preview", { brandId: String(brandId) })
      .then((result) => {
        if (current) setPlan(result);
      })
      .catch((e) => {
        if (current)
          setError(
            e instanceof Error ? e.message : "Could not generate Group data.",
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [brandId, generation]);
  async function create() {
    if (!plan || busy || attempted || !creationAvailable) return;
    if (Date.now() > plan.expiresAt) {
      setError(
        "The generated Group expired. Generate new data before exporting.",
      );
      return;
    }
    setAttempted(true);
    setBusy(true);
    setError("");
    try {
      setReport(
        await postJson<Report>("/api/groups/execute", {
          previewId: plan.id,
          confirmation: String(brandId),
          acknowledgeNoLocations: true,
        }),
      );
    } catch (e) {
      const reason =
        e instanceof RequestError
          ? e.message
          : "The request could not be completed.";
      setError(
        `${reason} If the request was submitted, check Harri Group Management before another attempt.`,
      );
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!report || !plan) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            report,
            payload: plan.payload,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `group-${brandId}-${plan.id.slice(0, 8)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const needsCheck = attempted && (!report || report.status === "uncertain");
  return (
    <section className="group panel" aria-labelledby="group-title">
      <div className="group-heading">
        <div>
          <div className="eyebrow">02 · GROUP SETTINGS</div>
          <h2 id="group-title">Your Group is ready</h2>
          <p>Data is generated automatically from the provided example.</p>
        </div>
        <span className="step-icon">✦</span>
      </div>
      {loading ? (
        <p className="state" role="status">
          Generating Group data…
        </p>
      ) : error && !plan ? (
        <div className="alert" role="alert">
          {error}
          <button type="button" onClick={() => setGeneration((v) => v + 1)}>
            Try again
          </button>
        </div>
      ) : (
        plan && (
          <>
            <div className="group-data">
              <div>
                <span>GROUP NAME</span>
                <strong>{plan.payload.name}</strong>
              </div>
              <div>
                <span>COUNTRY</span>
                <strong>{plan.payload.settings.country_code}</strong>
              </div>
              <div>
                <span>TIME ZONE</span>
                <strong>{plan.payload.settings.time_zone_name}</strong>
              </div>
              <div>
                <span>START DAY</span>
                <strong>{plan.payload.settings.start_day_of_week}</strong>
              </div>
              <div>
                <span>HOURS</span>
                <strong>08:00–20:00</strong>
              </div>
              <div>
                <span>LOCATIONS</span>
                <strong>None selected</strong>
              </div>
            </div>
            <div className="notice">
              <strong>Example settings</strong>
              <p>
                US · Asia/Dubai · Saturday · 08:00–20:00 · 1-hour extension.
                Auto Assign, breaks and payment settings use the supplied
                example. No locations will be assigned.
              </p>
            </div>
            <details className="payload-details">
              <summary>View complete generated data</summary>
              <pre>{JSON.stringify(plan.payload, null, 2)}</pre>
            </details>
            {!creationAvailable && mode === "live" && (
              <p className="setup-note">
                Live Group creation is disabled. Enable it for your approved
                test Brand in the local .env file.
              </p>
            )}
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {report && (
              <div className={`report ${report.status}`} role="status">
                <strong>
                  {report.status === "mock_success"
                    ? "Simulation complete"
                    : report.status === "acknowledged"
                      ? "Harri acknowledged the request"
                      : report.status === "rejected"
                        ? "Request rejected"
                        : "Outcome unknown"}
                </strong>
                <p>{report.message}</p>
                {(report.status === "mock_success" ||
                  report.status === "acknowledged") && (
                  <button type="button" onClick={download}>
                    Download report
                  </button>
                )}
              </div>
            )}
            {needsCheck && (
              <label className="check-before-retry">
                <input
                  type="checkbox"
                  checked={retryVerified}
                  onChange={(event) => setRetryVerified(event.target.checked)}
                />{" "}
                I checked Group Management before preparing another Group.
              </label>
            )}
            <div className="group-actions">
              {attempted ? (
                <button
                  type="button"
                  disabled={busy || (needsCheck && !retryVerified)}
                  onClick={() => setGeneration((v) => v + 1)}
                >
                  Prepare another Group
                </button>
              ) : (
                <button
                  className="export-button"
                  type="button"
                  disabled={!creationAvailable || busy}
                  onClick={() => void create()}
                >
                  {busy
                    ? "Sending…"
                    : mode === "mock"
                      ? "Simulate Export"
                      : "Export to Harri"}{" "}
                  <span>↗</span>
                </button>
              )}
              <small>
                {mode === "mock"
                  ? "Mock mode: no Group will be created."
                  : "Export sends one request to Harri for this Brand."}
              </small>
            </div>
          </>
        )
      )}
    </section>
  );
}

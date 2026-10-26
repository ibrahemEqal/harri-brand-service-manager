import { useEffect, useState } from "react";
import { RequestError, postJson } from "../api.ts";
import type { OperatingMode } from "../../shared/brand.ts";
import type { buildObservedPayload } from "../../shared/group.ts";
type Payload = ReturnType<typeof buildObservedPayload>;
type Preview = {
  id: string;
  brandId: string;
  mode: OperatingMode;
  payload: Payload;
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
function parseDraft(text: string): Payload | null {
  try {
    const value = JSON.parse(text);
    return value &&
      typeof value === "object" &&
      typeof value.name === "string" &&
      Array.isArray(value.brands) &&
      value.settings &&
      typeof value.settings === "object" &&
      value.settings.business_day &&
      typeof value.settings.business_day === "object"
      ? (value as Payload)
      : null;
  } catch {
    return null;
  }
}
function timeText(value: unknown): string {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= 86400
  )
    return "";
  const h = Math.floor(value / 3600),
    m = Math.floor((value % 3600) / 60),
    s = value % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}
function timeSeconds(text: string): number {
  const parts = text.split(":").map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}
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
    [draftText, setDraftText] = useState(""),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [retryVerified, setRetryVerified] = useState(false),
    [generation, setGeneration] = useState(0);
  const draft = parseDraft(draftText);
  useEffect(() => {
    let current = true;
    setPlan(null);
    setDraftText("");
    setReport(null);
    setError("");
    setLoading(true);
    setAttempted(false);
    setRetryVerified(false);
    postJson<Preview>("/api/groups/preview", { brandId: String(brandId) })
      .then((result) => {
        if (current) {
          setPlan(result);
          setDraftText(JSON.stringify(result.payload, null, 2));
        }
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
  function patchDraft(mutator: (data: Payload) => void) {
    if (!draft) return;
    const next = structuredClone(draft);
    mutator(next);
    setDraftText(JSON.stringify(next, null, 2));
    setError("");
  }
  async function create() {
    if (!plan || busy || attempted || !creationAvailable || !draft) return;
    setBusy(true);
    setError("");
    let confirmed: Preview;
    try {
      confirmed = await postJson<Preview>("/api/groups/preview", {
        brandId: String(brandId),
        payload: draft,
      });
      setPlan(confirmed);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not validate Group data.",
      );
      setBusy(false);
      return;
    }
    setAttempted(true);
    try {
      setReport(
        await postJson<Report>("/api/groups/execute", {
          previewId: confirmed.id,
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
          <p>Data is generated automatically. Edit it before exporting.</p>
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
            {draft ? (
              <fieldset disabled={busy || attempted} className="group-fields">
                <div className="group-data editable">
                  <label>
                    GROUP NAME
                    <input
                      aria-label="Group name"
                      value={draft.name}
                      onChange={(e) =>
                        patchDraft((d) => {
                          d.name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    COUNTRY CODE
                    <input
                      aria-label="Country code"
                      value={
                        typeof draft.settings.country_code === "string"
                          ? draft.settings.country_code
                          : ""
                      }
                      onChange={(e) =>
                        patchDraft((d) => {
                          d.settings.country_code =
                            e.target.value.toUpperCase();
                        })
                      }
                    />
                  </label>
                  <label>
                    TIME ZONE
                    <input
                      aria-label="Time zone"
                      value={
                        typeof draft.settings.time_zone_name === "string"
                          ? draft.settings.time_zone_name
                          : ""
                      }
                      onChange={(e) =>
                        patchDraft((d) => {
                          d.settings.time_zone_name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    START DAY
                    <select
                      aria-label="Start day"
                      value={draft.settings.start_day_of_week}
                      onChange={(e) =>
                        patchDraft((d) => {
                          d.settings.start_day_of_week = e.target.value;
                        })
                      }
                    >
                      {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(
                        (day) => (
                          <option key={day}>{day}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    OPEN TIME
                    <input
                      aria-label="Open time"
                      type="time"
                      step="1"
                      value={timeText(draft.settings.business_day.open_time)}
                      onChange={(e) =>
                        patchDraft((d) => {
                          d.settings.business_day.open_time = timeSeconds(
                            e.target.value,
                          );
                        })
                      }
                    />
                  </label>
                  <label>
                    CLOSE TIME
                    <input
                      aria-label="Close time"
                      type="time"
                      step="1"
                      value={timeText(draft.settings.business_day.close_time)}
                      onChange={(e) =>
                        patchDraft((d) => {
                          d.settings.business_day.close_time = timeSeconds(
                            e.target.value,
                          );
                        })
                      }
                    />
                  </label>
                  <label>
                    HOURS EXTENSION
                    <input
                      aria-label="Hours extension"
                      type="number"
                      min="0"
                      max="24"
                      step="0.25"
                      value={
                        Number.isFinite(
                          draft.settings.business_day.close_time_extension,
                        )
                          ? draft.settings.business_day.close_time_extension /
                            3600
                          : ""
                      }
                      onChange={(e) =>
                        patchDraft((d) => {
                          d.settings.business_day.close_time_extension =
                            Number(e.target.value) * 3600;
                        })
                      }
                    />
                  </label>
                </div>
              </fieldset>
            ) : (
              <div className="alert" role="alert">
                JSON is invalid or missing required sections. Fix it below
                before exporting.
              </div>
            )}
            <div className="notice">
              <strong>Locations are not available yet</strong>
              <p>
                The Group details response shows existing assignments; the
                Location list and the creation format are not confirmed. No
                locations will be assigned.
              </p>
            </div>
            <details className="payload-details">
              <summary>Edit all generated data (JSON)</summary>
              <p>
                Other settings can be edited here. Keep the captured field
                structure and leave brands empty until Location selection is
                supported.
              </p>
              <label className="json-label" htmlFor="group-json">
                Generated Group payload
              </label>
              <textarea
                id="group-json"
                spellCheck={false}
                disabled={busy || attempted}
                value={draftText}
                onChange={(e) => {
                  setDraftText(e.target.value);
                  setError("");
                }}
              />
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
                  disabled={!draft || !creationAvailable || busy}
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

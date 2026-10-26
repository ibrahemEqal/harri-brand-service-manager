import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  hasRelationships,
  type CatalogResponse,
  type OperatingMode,
  type Service,
} from "../shared/catalog.ts";
import type { BrandResponse } from "../shared/brand.ts";
import { BrandOverview } from "./components/BrandOverview.tsx";
import { GroupDraft } from "./components/GroupDraft.tsx";
import { ServicePicker } from "./components/ServicePicker.tsx";
import { ServiceDetails } from "./components/ServiceDetails.tsx";
import { getJson, RequestError } from "./api.ts";
import "./style.css";
function App() {
  const [mode, setMode] = useState<OperatingMode | null>(null);
  const [groupCreationAvailable, setGroupCreationAvailable] = useState(false);
  const [brandId, setBrandId] = useState("");
  const [submittedId, setSubmittedId] = useState("");
  const [brandError, setBrandError] = useState("");
  const [brandResult, setBrandResult] = useState<BrandResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [error, setError] = useState<RequestError | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosenCodes, setChosenCodes] = useState<string[]>([]);
  const [addPreview, setAddPreview] = useState(false);
  const [selected, setSelected] = useState<Service | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const statusController = new AbortController();
    getJson<{
      mode: OperatingMode;
      capabilities?: { groupCreation?: boolean };
    }>("/api/status", statusController.signal)
      .then((status) => {
        setMode(status.mode);
        setGroupCreationAvailable(status.capabilities?.groupCreation === true);
      })
      .catch(() => {});
    return () => {
      statusController.abort();
      controller.current?.abort();
    };
  }, []);
  const services = catalog?.services ?? [];
  const validBrandId =
    /^[1-9]\d{0,15}$/.test(brandId) && Number.isSafeInteger(Number(brandId));
  async function load() {
    if (!validBrandId || loading) return;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    setLoading(true);
    setError(null);
    setCatalog(null);
    setSelected(null);
    setChosenCodes([]);
    setAddPreview(false);
    setSubmittedId(brandId);
    setBrandError("");
    setBrandResult(null);
    const [brand, result] = await Promise.allSettled([
      getJson<BrandResponse>(
        `/api/brand?brandId=${encodeURIComponent(brandId)}`,
        requestController.signal,
      ),
      getJson<CatalogResponse>("/api/services", requestController.signal),
    ]);
    if (requestController.signal.aborted) return;
    if (brand.status === "fulfilled") setBrandResult(brand.value);
    else
      setBrandError(
        brand.reason instanceof Error
          ? brand.reason.message
          : "Brand lookup could not be completed.",
      );
    if (result.status === "fulfilled") {
      setCatalog(result.value);
      setMode(result.value.mode);
    } else
      setError(
        result.reason instanceof RequestError
          ? result.reason
          : new RequestError("REQUEST_FAILED", "Could not load services."),
      );
    setLoading(false);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="#main" className="wordmark">
          harri<span>ENGINEERING</span>
        </a>
        <div className="workspace-label">QA WORKSPACE</div>
        <a className="nav-active" href="#catalog">
          <span>▦</span> Service catalog <span className="nav-dot" />
        </a>
        <div className="sidebar-context">
          <span className="tiny-dot" /> HARRI PREP<p>Local QA workspace</p>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">QA</div>
          <div>
            Internal tooling<small>Brand Service Manager · v0.1</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="muted">Workspace</span>
            <span className="slash">/</span>Brand Service Manager
          </div>
          <div className="header-badges">
            <span className="readonly">◉ Local QA tool</span>
            <span className={`mode-badge ${mode === "live" ? "live" : ""}`}>
              <i />
              {mode ? `${mode.toUpperCase()} MODE` : "CONNECTING"}
            </span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">DEVELOPER TOOLS / SERVICE EXPLORER</div>
              <h1>
                Understand your service catalog<span>v0.1</span>
              </h1>
              <p>
                Explore Harri services, prerequisites and dependencies in one
                place.
              </p>
            </div>
            <span className="environment-tag">
              <span className="tiny-dot" /> Harri Prep
            </span>
          </div>
          <div className="scope-banner">
            <span className="banner-icon">ⓘ</span>
            <div>
              <strong>
                {mode === "live"
                  ? catalog?.source === "attached-fixture-fallback"
                    ? "Live Brand · catalog snapshot"
                    : "Live connection · global catalog"
                  : "Mock catalog · full attached response"}
              </strong>
              <p>
                {mode === "live"
                  ? catalog?.source === "attached-fixture-fallback"
                    ? "The live catalog is unavailable; services below come from the provided snapshot. "
                    : "Brand details and catalog are requested from Harri Prep. "
                  : "Fixture data is served by the local backend. "}
                Brand details are loaded separately. Catalog entries do not
                indicate Brand activation.
              </p>
            </div>
          </div>
          <section
            className="brand-panel panel"
            aria-labelledby="brand-heading"
          >
            <div className="brand-intro">
              <div className="section-kicker">01 / BRAND CONTEXT</div>
              <h2 id="brand-heading">Brand overview</h2>
              <p>Retrieve Brand details and the complete global catalog.</p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void load();
              }}
            >
              <label htmlFor="brand-id">Brand ID</label>
              <div className="brand-input-row">
                <input
                  id="brand-id"
                  inputMode="numeric"
                  value={brandId}
                  placeholder="e.g. 18619889"
                  disabled={loading}
                  onChange={(event) => {
                    setBrandId(event.target.value);
                    setBrandResult(null);
                    setChosenCodes([]);
                    setAddPreview(false);
                    setBrandError("");
                    setSubmittedId("");
                  }}
                  aria-describedby="brand-help"
                />
                <button className="primary" disabled={!validBrandId || loading}>
                  {loading ? "Loading…" : "Load Services"}{" "}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
              <small id="brand-help">
                {mode === "mock"
                  ? "Mock snapshot: use Brand ID 18619889. No Harri requests."
                  : "Brand details are retrieved through the local backend. GET requests only."}
              </small>
            </form>
          </section>
          {brandResult && <BrandOverview result={brandResult} />}
          {brandResult && (
            <GroupDraft
              key={brandResult.brand.id}
              brandId={brandResult.brand.id}
              mode={brandResult.mode}
              creationAvailable={groupCreationAvailable}
            />
          )}
          {brandError && (
            <div className="brand-error" role="alert">
              <strong>
                Brand lookup failed{submittedId ? ` · ID ${submittedId}` : ""}
              </strong>
              <p>{brandError}</p>
              <p>
                No Brand data is displayed. The global catalog, if loaded, is
                independent of this lookup.
              </p>
            </div>
          )}
          {!brandResult && !brandError && !loading && (
            <div className="brand-placeholder">
              No Brand loaded. Enter an ID above.{" "}
              {mode === "mock"
                ? "Use 18619889 for the provided mock snapshot."
                : "Live requests require server-side authorization."}
            </div>
          )}
          <div className="assigned-status">
            <span className="pending-badge">
              Assigned services: unavailable
            </span>
            <p>
              No Brand-specific service-read endpoint has been confirmed. The
              catalog below does not mark services active or inactive.
            </p>
          </div>
          <div className="stats" aria-label="Catalog statistics">
            {[
              {
                label: "Total services",
                value: catalog ? services.length : "—",
                sub: "Across the global catalog",
                icon: "▦",
              },
              {
                label: "Harri platform",
                value: catalog
                  ? services.filter((s) => s.platform === "HARRI").length
                  : "—",
                sub: "HARRI services",
                icon: "H",
              },
              {
                label: "Team platform",
                value: catalog
                  ? services.filter((s) => s.platform === "TEAM").length
                  : "—",
                sub: "TEAM services",
                icon: "T",
              },
              {
                label: "With relationships",
                value: catalog ? services.filter(hasRelationships).length : "—",
                sub: "Dependencies or exclusions",
                icon: "⌘",
              },
            ].map((stat) => (
              <div className="stat panel" key={stat.label}>
                <div>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                  <small>{stat.sub}</small>
                </div>
                <span className="stat-icon">{stat.icon}</span>
              </div>
            ))}
          </div>
          <section
            id="catalog"
            className="catalog-section"
            aria-labelledby="catalog-heading"
          >
            <div className="catalog-title">
              <div>
                <div className="section-kicker">02 / GLOBAL CATALOG</div>
                <h2 id="catalog-heading">
                  Services{" "}
                  <span className="count-pill">
                    {catalog ? services.length : "—"}
                  </span>
                </h2>
              </div>
              {catalog && (
                <span className="updated">
                  Loaded {new Date(catalog.fetchedAt).toLocaleTimeString()} ·{" "}
                  {catalog.source === "harri-prep"
                    ? "Harri Prep API"
                    : "Provided catalog snapshot"}
                </span>
              )}
            </div>
            {error ? (
              <div className="empty-state error-state panel" role="alert">
                <span className="state-icon">!</span>
                <h3>
                  {error.code === "AUTHENTICATION_ERROR"
                    ? "Authentication required"
                    : error.code === "ACCESS_DENIED"
                      ? "Access denied"
                      : "Unable to load the catalog"}
                </h3>
                <p>{error.message}</p>
                <button onClick={() => void load()} disabled={!validBrandId}>
                  Try again
                </button>
              </div>
            ) : loading ? (
              <div aria-live="polite" aria-busy="true">
                <p className="result-count" role="status">
                  Loading catalog from{" "}
                  {mode === "live" ? "Harri Prep" : "the local fixture"}…
                </p>
                <div className="skeleton panel">
                  <div />
                  <div />
                </div>
              </div>
            ) : !catalog ? (
              <div className="empty-state panel">
                <span className="state-icon">▦</span>
                <h3>Your catalog, ready to explore</h3>
                <p>
                  Enter a Brand ID and choose Load Services.
                  <br />
                  The service dropdown will be available here.
                </p>
                <span className="empty-note">
                  Brand details + global catalog · Read-only GET requests
                </span>
              </div>
            ) : services.length ? (
              <>
                {catalog.warning && (
                  <div className="catalog-fallback" role="status">
                    {catalog.warning}
                  </div>
                )}
                <ServicePicker
                  services={services}
                  selectedCodes={chosenCodes}
                  onSelect={(service) => {
                    setAddPreview(false);
                    setChosenCodes((previous) =>
                      previous.includes(service.code)
                        ? previous.filter((code) => code !== service.code)
                        : [...previous, service.code],
                    );
                  }}
                />
                <section
                  className="selection-summary panel"
                  aria-label="Selected services"
                >
                  <h3>Selected services ({chosenCodes.length})</h3>
                  {chosenCodes.length === 0 ? (
                    <p>Choose services from the dropdown above.</p>
                  ) : (
                    <ul>
                      {chosenCodes.map((code) => {
                        const service = services.find(
                          (item) => item.code === code,
                        )!;
                        return (
                          <li key={code}>
                            <div>
                              <strong>{service.name}</strong>
                              <code>{service.code}</code>
                            </div>
                            <div className="selection-actions">
                              <button
                                type="button"
                                onClick={() => setSelected(service)}
                              >
                                Details
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove ${service.name}`}
                                onClick={() => {
                                  setChosenCodes((previous) =>
                                    previous.filter((item) => item !== code),
                                  );
                                  setAddPreview(false);
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="selection-add-row">
                    <p>
                      Brand: {brandResult?.brand.name ?? "Load a Brand first"}
                      {brandResult ? ` · ${brandResult.brand.id}` : ""}
                    </p>
                    <button
                      type="button"
                      className="primary"
                      disabled={!brandResult || !chosenCodes.length}
                      onClick={() => setAddPreview(true)}
                    >
                      إضافة الخدمات (Preview)
                    </button>
                  </div>
                  <small>
                    Preview only. No activation requests are sent to Harri.
                  </small>
                  {addPreview && (
                    <div className="local-add-preview" role="status">
                      <strong>
                        معاينة إضافة {chosenCodes.length} خدمة للبراند{" "}
                        {brandResult?.brand.id}
                      </strong>
                      <p>{chosenCodes.join(", ")}</p>
                      <p>واجهة فقط — لم تُرسل أي طلبات إضافة إلى Harri.</p>
                    </div>
                  )}
                </section>
              </>
            ) : (
              <div className="empty-state panel">
                <h3>The catalog is empty</h3>
                <p>The API returned an empty services array.</p>
              </div>
            )}
          </section>
          <footer>
            <span>
              Harri Brand Service Manager <b>v0.1</b>
            </span>
            <span>Internal QA tooling · Service activation is unavailable</span>
          </footer>
        </main>
      </div>
      {selected && (
        <ServiceDetails service={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

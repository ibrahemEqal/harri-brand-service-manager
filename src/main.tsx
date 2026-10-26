import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { GroupDraft } from "./components/GroupDraft.tsx";
import { getJson } from "./api.ts";
import type { BrandResponse, OperatingMode } from "../shared/brand.ts";
import "./style.css";
function App() {
  const [mode, setMode] = useState<OperatingMode | null>(null),
    [available, setAvailable] = useState(false),
    [brandId, setBrandId] = useState(""),
    [brand, setBrand] = useState<BrandResponse | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    getJson<{ mode: OperatingMode; capabilities: { groupCreation: boolean } }>(
      "/api/status",
      c.signal,
    )
      .then((status) => {
        setMode(status.mode);
        setAvailable(status.capabilities.groupCreation);
      })
      .catch(() => {});
    return () => {
      c.abort();
      controller.current?.abort();
    };
  }, []);
  const valid =
    /^[1-9]\d{0,15}$/.test(brandId) && Number.isSafeInteger(Number(brandId));
  async function load() {
    if (!valid || loading) return;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setLoading(true);
    setError("");
    setBrand(null);
    try {
      const data = await getJson<BrandResponse>(
        `/api/brand?brandId=${encodeURIComponent(brandId)}`,
        c.signal,
      );
      if (!c.signal.aborted) {
        setBrand(data);
        setMode(data.mode);
      }
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : "Could not load Brand.");
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          harri<small>QA WORKSPACE</small>
        </div>
        <div className="side-label">TOOLS</div>
        <div className="nav-item">
          ▦ <span>Group Creator</span>
        </div>
        <div className="side-footer">
          Harri Prep <span>·</span> Local tool
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div>
            Workspace <span>/</span> <strong>Group Creator</strong>
          </div>
          <span className={`mode ${mode === "live" ? "live" : ""}`}>
            <i />
            {mode ? `${mode.toUpperCase()} MODE` : "CONNECTING"}
          </span>
        </header>
        <main>
          <div className="heading">
            <div className="eyebrow">TEAM SCHEDULING / GROUP MANAGEMENT</div>
            <h1>Create a Group in one click</h1>
            <p>
              Enter your test Brand ID. We’ll prepare the Group data for you.
            </p>
          </div>
          <section className="brand panel">
            <div>
              <div className="eyebrow">01 · TARGET BRAND</div>
              <h2>Find your Brand</h2>
              <p>Use the approved SSO test Brand.</p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void load();
              }}
            >
              <label htmlFor="brandId">Brand ID</label>
              <div className="brand-form">
                <input
                  id="brandId"
                  inputMode="numeric"
                  placeholder="e.g. 18606124"
                  value={brandId}
                  disabled={loading}
                  onChange={(event) => {
                    controller.current?.abort();
                    setBrandId(event.target.value);
                    setBrand(null);
                    setError("");
                  }}
                />
                <button className="load-button" disabled={!valid || loading}>
                  {loading ? "Loading…" : "Load Brand"} <span>→</span>
                </button>
              </div>
            </form>
          </section>
          {error && (
            <div className="alert" role="alert">
              <strong>Brand lookup failed</strong>
              <p>{error}</p>
            </div>
          )}
          {brand && (
            <>
              <section className="brand-result panel">
                <span className="brand-avatar">
                  {brand.brand.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <small>SELECTED BRAND</small>
                  <h2>{brand.brand.name}</h2>
                  <p>
                    ID {brand.brand.id} ·{" "}
                    {brand.mode === "mock" ? "Mock snapshot" : "Harri Prep"}
                  </p>
                </div>
                <span className="status-pill">{brand.brand.status}</span>
              </section>
              <GroupDraft
                key={brand.brand.id}
                brandId={brand.brand.id}
                mode={brand.mode}
                creationAvailable={available}
              />
            </>
          )}
          {!brand && !loading && !error && (
            <div className="empty panel">
              <div>▤</div>
              <h2>Ready when you are</h2>
              <p>Load a Brand to automatically prepare a Group.</p>
            </div>
          )}
          <footer>
            Harri Group Creator · Test environment{" "}
            <span>SSO status must be verified manually.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

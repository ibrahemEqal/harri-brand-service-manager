import type { BrandResponse } from "../../shared/brand.ts";
export function BrandOverview({ result }: { result: BrandResponse }) {
  const brand = result.brand;
  const fields: [string, string | number | null | undefined][] = [
    ["Brand ID", brand.id],
    ["Type", brand.type],
    ["Status", brand.status],
    ["Group ID", brand.group_id],
    [
      "Currency",
      brand.currency ? `${brand.currency.name} (${brand.currency.code})` : null,
    ],
    ["Time zone", brand.general_settings?.time_zone?.name],
    ["Email", brand.email],
    ["Phone", brand.phone],
    ["Slug", brand.slug],
    [
      "Archived",
      brand.is_archived === undefined
        ? undefined
        : brand.is_archived
          ? "Yes"
          : "No",
    ],
    [
      "Billable",
      brand.general_settings?.is_billable === undefined
        ? undefined
        : brand.general_settings.is_billable
          ? "Yes"
          : "No",
    ],
    ["Start day of week", brand.general_settings?.start_day_of_week],
    ["Created (API value)", brand.created],
    ["Updated (API value)", brand.updated],
    ["Website (API value)", brand.url],
  ];
  return (
    <section
      className="loaded-brand panel"
      aria-labelledby="loaded-brand-heading"
    >
      <div className="brand-result-heading">
        <div>
          <div className="section-kicker">BRAND OVERVIEW</div>
          <h2 id="loaded-brand-heading">{brand.name}</h2>
        </div>
        <span className={`mode-badge ${result.mode === "live" ? "live" : ""}`}>
          {result.mode === "live"
            ? "LIVE BRAND RESPONSE"
            : "MOCK SNAPSHOT — NOT LIVE"}
        </span>
      </div>
      <p>{brand.description || "No Brand description supplied."}</p>
      <dl className="brand-metadata">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? "Not supplied"}</dd>
          </div>
        ))}
      </dl>
      {!!brand.hecs?.length && (
        <div className="brand-hecs">
          <strong>HECs</strong>
          {brand.hecs.map((item) => (
            <span key={item.id}>
              {item.name} · {item.code} · ID {item.id}
            </span>
          ))}
        </div>
      )}
      <div className="brand-result-footer">
        <span>
          {result.source === "provided-fixture"
            ? "Provided snapshot, with email and business identifier omitted."
            : "Retrieved from the confirmed Harri BAM Brand endpoint."}
        </span>
        <span>Loaded {new Date(result.fetchedAt).toLocaleTimeString()}</span>
      </div>
    </section>
  );
}

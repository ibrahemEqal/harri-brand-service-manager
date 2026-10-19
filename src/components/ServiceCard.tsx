import type { Service } from "../../shared/catalog.ts";
export function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className={`platform ${platform === "TEAM" ? "team" : "harri"}`}>
      {platform}
    </span>
  );
}
export function ServiceCard({
  service,
  onOpen,
}: {
  service: Service;
  onOpen: () => void;
}) {
  const relationships =
    service.prerequisites.length +
    service.mutual_exclusives.length +
    service.implicit_dependencies.length +
    service.prerequisite_groups.length;
  return (
    <button
      className="service-card"
      onClick={onOpen}
      aria-label={`View ${service.name} details`}
    >
      <div className="card-top">
        <span className="service-glyph">
          {service.name.slice(0, 2).toUpperCase()}
        </span>
        <PlatformBadge platform={service.platform} />
      </div>
      <h3>{service.name}</h3>
      <code>{service.code}</code>
      <p className="card-description">
        {service.description?.trim() || "No description supplied by the API."}
      </p>
      <div className="card-mode">{service.mode.replaceAll("_", " ")}</div>
      <div className="card-bottom">
        <span>
          {relationships
            ? `${relationships} relationship${relationships === 1 ? "" : "s"}`
            : "No relationships listed"}
        </span>
        <span>View details ↗</span>
      </div>
    </button>
  );
}

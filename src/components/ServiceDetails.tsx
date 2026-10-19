import { useEffect, useRef } from "react";
import type { Service, ServiceReference } from "../../shared/catalog.ts";
import { PlatformBadge } from "./ServiceCard.tsx";
function References({ items }: { items: ServiceReference[] }) {
  return items.length ? (
    <ul className="references">
      {items.map((item, index) => (
        <li key={`${item.id}-${index}`}>
          <div>
            <strong>{item.name}</strong>
            <PlatformBadge platform={item.platform} />
          </div>
          <code>{item.code}</code>
          <small>
            ID {item.id} · Apply to children: {item.apply_to_children_mode}
          </small>
        </li>
      ))}
    </ul>
  ) : (
    <p className="none">None listed in the response.</p>
  );
}
export function ServiceDetails({
  service,
  onClose,
}: {
  service: Service;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="details-drawer"
      aria-labelledby="detail-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="drawer-content">
        <div className="drawer-heading">
          <span className="eyebrow">SERVICE DETAILS</span>
          <button
            className="icon-button"
            aria-label="Close service details"
            autoFocus
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <PlatformBadge platform={service.platform} />
        <h2 id="detail-title">{service.name}</h2>
        <code className="detail-code">{service.code}</code>
        <p className="detail-description">
          {service.description?.trim() || "No description supplied by the API."}
        </p>
        <dl className="metadata">
          <div>
            <dt>Service ID</dt>
            <dd>{service.id}</dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd>{service.platform}</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>{service.mode}</dd>
          </div>
          <div>
            <dt>Apply-to-children mode</dt>
            <dd>{service.apply_to_children_mode}</dd>
          </div>
        </dl>
        <div className="status-notice">
          Brand activation status is unavailable. A Brand-specific read API has
          not been confirmed.
        </div>
        <section className="relationship">
          <h3>
            Prerequisites <span>{service.prerequisites.length}</span>
          </h3>
          <References
            items={service.prerequisites.map(
              (item) => item.prerequisite_service,
            )}
          />
        </section>
        <section className="relationship">
          <h3>
            Mutual exclusions <span>{service.mutual_exclusives.length}</span>
          </h3>
          <References
            items={service.mutual_exclusives.map(
              (item) => item.mutual_exclusive_service,
            )}
          />
        </section>
        <section className="relationship">
          <h3>
            Implicit dependencies{" "}
            <span>{service.implicit_dependencies.length}</span>
          </h3>
          <References
            items={service.implicit_dependencies.map(
              (item) => item.dependency_service,
            )}
          />
        </section>
        <section className="relationship">
          <h3>
            Prerequisite groups{" "}
            <span>{service.prerequisite_groups.length}</span>
          </h3>
          <p className="section-hint">
            Groups are shown as returned. No AND/OR or activation semantics are
            assumed.
          </p>
          {service.prerequisite_groups.length ? (
            service.prerequisite_groups.map((group, i) => (
              <div className="prerequisite-group" key={i}>
                <h4>Group {i + 1}</h4>
                <References
                  items={group.prerequisite_group_services.map(
                    (item) => item.service,
                  )}
                />
              </div>
            ))
          ) : (
            <p className="none">None listed in the response.</p>
          )}
        </section>
      </div>
    </dialog>
  );
}

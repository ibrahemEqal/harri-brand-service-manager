import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterServices, type Service } from "../../shared/catalog.ts";
import { PlatformBadge } from "./ServiceCard.tsx";
export function ServicePicker({
  services,
  onSelect,
}: {
  services: Service[];
  onSelect: (service: Service) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("");
  const [mode, setMode] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const options = useMemo(
    () => filterServices(services, { query, platform, mode, sort }),
    [services, query, platform, mode, sort],
  );
  const platforms = [
    ...new Set(services.map((service) => service.platform)),
  ].sort();
  const modes = [...new Set(services.map((service) => service.mode))].sort();
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  function choose(service: Service) {
    setOpen(false);
    trigger.current?.focus();
    onSelect(service);
  }
  return (
    <div
      className="service-picker panel"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <label id={`${id}-label`}>Choose a service</label>
      <p>
        Select a catalog service to inspect its details. Activation is not
        enabled.
      </p>
      <button
        ref={trigger}
        type="button"
        className="picker-trigger"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Search and select a service…</span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div id={`${id}-panel`} className="picker-panel">
          <input
            ref={search}
            role="combobox"
            aria-label="Search services"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${id}-options`}
            aria-activedescendant={
              options[active] ? `${id}-${active}` : undefined
            }
            value={query}
            placeholder="Search by name, code or description"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) =>
                  options.length
                    ? (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        options.length) %
                      options.length
                    : 0,
                );
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (options[active]) choose(options[active]);
              }
            }}
          />
          <div className="picker-filters">
            <select
              aria-label="Platform"
              value={platform}
              onChange={(event) => {
                setPlatform(event.target.value);
                setActive(0);
              }}
            >
              <option value="">All platforms</option>
              {platforms.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              aria-label="Service mode"
              value={mode}
              onChange={(event) => {
                setMode(event.target.value);
                setActive(0);
              }}
            >
              <option value="">All service modes</option>
              {modes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              aria-label="Sort services"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as "asc" | "desc");
                setActive(0);
              }}
            >
              <option value="asc">Name: A–Z</option>
              <option value="desc">Name: Z–A</option>
            </select>
          </div>
          <div className="picker-results-meta" role="status">
            {options.length} of {services.length} services
          </div>
          <div
            id={`${id}-options`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="picker-options"
          >
            {options.map((service, index) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={active === index}
                id={`${id}-${index}`}
                key={service.id}
                className="picker-option"
                onClick={() => choose(service)}
              >
                <span>
                  <strong>{service.name}</strong>
                  <code>{service.code}</code>
                </span>
                <PlatformBadge platform={service.platform} />
              </button>
            ))}
          </div>
          {!options.length && (
            <p className="picker-no-results">
              No matching services. Try another search or filter.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

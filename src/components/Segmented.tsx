import { useLayoutEffect, useRef, useState } from "react";

/**
 * One shared segmented control for all three tab/toggle rows in the app. The
 * active pill is a single absolutely-positioned div that slides and resizes
 * between buttons (measured via offsetLeft/offsetWidth) instead of each
 * button popping its own background in and out.
 */
export function Segmented({
  activeKey,
  options,
  onSelect,
  ariaLabel,
}: {
  activeKey: string;
  options: { key: string; label: string }[];
  onSelect: (key: string) => void;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const active = containerRef.current?.querySelector<HTMLButtonElement>("button.active");
      if (active) setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeKey, options]);

  return (
    <div className="segmented" role="group" aria-label={ariaLabel} ref={containerRef}>
      {indicator && (
        <div
          className="segmented-indicator"
          style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
          aria-hidden="true"
        />
      )}
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={opt.key === activeKey ? "active" : ""}
          aria-pressed={opt.key === activeKey}
          onClick={() => onSelect(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

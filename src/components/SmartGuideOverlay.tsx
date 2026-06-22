import type { SmartGuideLine } from "../utils/smartGuides";

interface SmartGuideOverlayProps {
  guides: SmartGuideLine[];
}

/** Renders transient sky-blue alignment guide lines over the canvas. */
export default function SmartGuideOverlay({ guides }: SmartGuideOverlayProps) {
  if (!guides.length) return null;
  return (
    <div className="smart-guide-overlay" data-no-export="true">
      {guides.map((guide) =>
        guide.orientation === "vertical" ? (
          <div
            key={guide.id}
            className="smart-guide-line vertical"
            style={{ left: guide.x, top: guide.y1, height: guide.y2 - guide.y1 }}
          />
        ) : (
          <div
            key={guide.id}
            className="smart-guide-line horizontal"
            style={{ left: guide.x1, top: guide.y, width: guide.x2 - guide.x1 }}
          />
        )
      )}
    </div>
  );
}

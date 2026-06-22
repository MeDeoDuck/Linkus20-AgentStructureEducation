import { useState } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import {
  AI_TYPE_LABELS,
  LOGO_SOURCES,
  clearbitUrl,
  simpleIconUrl,
  type LogoSource,
} from "../data/logoSources";

type Stage = "primary" | "fallback" | "badge";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 4)
      .toUpperCase() || name
  );
}

function LogoCard({ source, onPick }: { source: LogoSource; onPick: () => void }) {
  const [stage, setStage] = useState<Stage>("primary");

  let media: JSX.Element;
  if (stage === "badge") {
    media = <span className="logo-card__badge">{initials(source.name)}</span>;
  } else {
    const src = stage === "primary" ? simpleIconUrl(source.slug) : clearbitUrl(source.domain);
    media = (
      <img
        className="logo-card__img"
        src={src}
        alt={source.name}
        draggable={false}
        onError={() => setStage((s) => (s === "primary" ? "fallback" : "badge"))}
      />
    );
  }

  return (
    <button className="logo-card" onClick={onPick} title={source.name}>
      {media}
      <span className="logo-card__name">{source.name}</span>
    </button>
  );
}

export default function LogoPickerBottomSheet() {
  const blockId = useDiagramStore((s) => s.activeLogoPickerBlockId);
  const aiType = useDiagramStore((s) => s.activeLogoPickerAIType);
  const setSelectedLogo = useDiagramStore((s) => s.setSelectedLogo);
  const closeLogoPicker = useDiagramStore((s) => s.closeLogoPicker);

  // Nothing to show for empty target or the "custom" (direct-input) category.
  if (!blockId || !aiType || aiType === "custom") return null;

  const sources = LOGO_SOURCES[aiType] ?? [];

  return (
    <div className="logo-sheet" data-no-export="true">
      <div className="logo-sheet__head">
        <span className="logo-sheet__title">{AI_TYPE_LABELS[aiType]} — 로고 선택</span>
        <button className="logo-sheet__close" onClick={closeLogoPicker} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="logo-sheet__list">
        {sources.map((source) => (
          <LogoCard
            key={`${source.slug}-${source.name}`}
            source={source}
            onPick={() => {
              setSelectedLogo(blockId, {
                name: source.name,
                logoUrl: simpleIconUrl(source.slug),
              });
              closeLogoPicker();
            }}
          />
        ))}
      </div>
    </div>
  );
}

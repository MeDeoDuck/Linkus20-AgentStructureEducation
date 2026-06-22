import { useState } from "react";
import type { DiagramBlock, LogoItem } from "../types";

interface BlockLogoViewProps {
  logo: LogoItem;
  block: DiagramBlock;
}

/**
 * Renders the single selected logo centered in the block. Size is driven by CSS
 * (max-width/height % of the block) so it scales with the block. On image load
 * failure it falls back to a company-name text badge whose font size is clamped
 * to the block height.
 */
export default function BlockLogoView({ logo, block }: BlockLogoViewProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !logo.logoUrl) {
    // clamp(10px, 12% of block height, 20px)
    const fontSize = Math.max(10, Math.min(20, block.height * 0.12));
    return (
      <div className="block-logo-fallback" style={{ fontSize }} title={logo.name}>
        {logo.name}
      </div>
    );
  }

  return (
    <img
      className="block-logo"
      src={logo.logoUrl}
      alt={logo.name}
      title={logo.name}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

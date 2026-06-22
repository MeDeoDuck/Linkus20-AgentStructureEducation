import { useState } from "react";
import type { BlockLogo } from "../types";
import { clearbitUrl } from "../data/logoSources";

interface LogoGridProps {
  logos: BlockLogo[];
}

/** Map a known Simple Icons URL to the matching Clearbit domain for fallback. */
const SIMPLE_TO_DOMAIN: Record<string, string> = {
  openai: "openai.com",
  anthropic: "anthropic.com",
  googlegemini: "gemini.google.com",
  meta: "meta.com",
  mistralai: "mistral.ai",
  googlecloud: "cloud.google.com",
  microsoftazure: "azure.microsoft.com",
  amazonaws: "aws.amazon.com",
  deepgram: "deepgram.com",
  midjourney: "midjourney.com",
  stabilityai: "stability.ai",
  adobe: "adobe.com",
  leonardoai: "leonardo.ai",
  runway: "runwayml.com",
  pika: "pika.art",
  lumalabs: "lumalabs.ai",
  kling: "klingai.com",
  google: "deepmind.google",
};

type Stage = "primary" | "fallback" | "badge";

function deriveDomain(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/cdn\.simpleicons\.org\/([^/?]+)/);
  if (match) return SIMPLE_TO_DOMAIN[match[1]];
  return undefined;
}

function LogoChip({ logo }: { logo: BlockLogo }) {
  const [stage, setStage] = useState<Stage>("primary");

  const initials = logo.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();

  if (stage === "badge" || !logo.logoUrl) {
    return (
      <div className="logo-chip" title={logo.name}>
        <span className="logo-badge">{initials || logo.name}</span>
      </div>
    );
  }

  let src = logo.logoUrl;
  if (stage === "fallback") {
    const domain = deriveDomain(logo.logoUrl);
    if (domain) src = clearbitUrl(domain);
    else {
      // No fallback domain — show badge immediately.
      return (
        <div className="logo-chip" title={logo.name}>
          <span className="logo-badge">{initials || logo.name}</span>
        </div>
      );
    }
  }

  return (
    <div className="logo-chip" title={logo.name}>
      <img
        src={src}
        alt={logo.name}
        onError={() => setStage((s) => (s === "primary" ? "fallback" : "badge"))}
      />
    </div>
  );
}

export default function LogoGrid({ logos }: LogoGridProps) {
  return (
    <div className="logo-grid">
      {logos.map((logo, i) => (
        <LogoChip key={`${logo.name}-${i}`} logo={logo} />
      ))}
    </div>
  );
}

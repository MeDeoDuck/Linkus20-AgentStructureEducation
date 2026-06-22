import type { AIType } from "../types";

export interface LogoSource {
  name: string;
  slug: string; // Simple Icons slug
  domain: string; // Clearbit fallback domain
}

/**
 * Build the primary logo URL (Simple Icons CDN). If the slug does not exist,
 * the <img onError> handler in LogoGrid falls back to Clearbit, then to a text badge.
 */
export function simpleIconUrl(slug: string): string {
  return `https://cdn.simpleicons.org/${slug}`;
}

export function clearbitUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`;
}

export const LOGO_SOURCES: Record<Exclude<AIType, "custom">, LogoSource[]> = {
  generative: [
    { name: "OpenAI", slug: "openai", domain: "openai.com" },
    { name: "Anthropic", slug: "anthropic", domain: "anthropic.com" },
    { name: "Google Gemini", slug: "googlegemini", domain: "gemini.google.com" },
    { name: "Meta AI", slug: "meta", domain: "meta.com" },
    { name: "Mistral AI", slug: "mistralai", domain: "mistral.ai" },
  ],
  speechToText: [
    { name: "OpenAI Whisper", slug: "openai", domain: "openai.com" },
    { name: "Google Speech-to-Text", slug: "googlecloud", domain: "cloud.google.com" },
    { name: "Azure AI Speech", slug: "microsoftazure", domain: "azure.microsoft.com" },
    { name: "AWS Transcribe", slug: "amazonaws", domain: "aws.amazon.com" },
    { name: "Deepgram", slug: "deepgram", domain: "deepgram.com" },
  ],
  textToImage: [
    { name: "OpenAI DALL·E", slug: "openai", domain: "openai.com" },
    { name: "Midjourney", slug: "midjourney", domain: "midjourney.com" },
    { name: "Stability AI", slug: "stabilityai", domain: "stability.ai" },
    { name: "Adobe Firefly", slug: "adobe", domain: "adobe.com" },
    { name: "Leonardo AI", slug: "leonardoai", domain: "leonardo.ai" },
  ],
  imageOrTextToVideo: [
    { name: "Runway", slug: "runway", domain: "runwayml.com" },
    { name: "Pika", slug: "pika", domain: "pika.art" },
    { name: "Luma AI", slug: "lumalabs", domain: "lumalabs.ai" },
    { name: "Kling AI", slug: "kling", domain: "klingai.com" },
    { name: "Google Veo", slug: "google", domain: "deepmind.google" },
  ],
};

export const AI_TYPE_LABELS: Record<Exclude<AIType, "custom">, string> = {
  generative: "생성형 AI",
  speechToText: "음성 → 텍스트",
  textToImage: "텍스트 → 이미지",
  imageOrTextToVideo: "이미지·텍스트 → 영상",
};

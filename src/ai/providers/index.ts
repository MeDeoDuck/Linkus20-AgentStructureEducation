/**
 * Provider registry — 이번 버전은 GitHub Copilot 단일 경로(모델 선택 없음).
 *
 * USE_MOCK=true  → 백엔드 없이 mockProvider(규칙 기반)로 데모.
 * USE_MOCK=false → copilotProvider(백엔드 /api/ai/copilot → Copilot SDK).
 */
import type { AIProvider } from "../types";
import { mockProvider } from "./mockProvider";
import { copilotProvider } from "./copilotProvider";

/**
 * 백엔드 연동 전 데모용. 기본 true(데모), 프로덕션 빌드에서는 VITE_USE_MOCK=false 로 끈다.
 * (소스 상수 하드코딩 시 끄는 것을 깜빡할 위험 → env 로 관리)
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";

export function getProvider(): AIProvider {
  return USE_MOCK ? mockProvider : copilotProvider;
}

export { mockProvider, copilotProvider };

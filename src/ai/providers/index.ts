/**
 * Provider registry. 모델 선택 UI(AIModelId)와 실제 호출 로직을 분리한다.
 *
 * USE_MOCK=true 이면 어떤 모델을 골라도 mockProvider 가 응답한다(백엔드 없이 데모 가능).
 * 백엔드를 붙이면 USE_MOCK 을 false 로 바꾸기만 하면 모델별 실 provider 가 동작한다.
 */
import type { AIModelId, AIProvider } from "../types";
import { mockProvider } from "./mockProvider";
import { copilotProvider } from "./copilotProvider";
import { claudeProvider } from "./claudeProvider";
import { openaiProvider } from "./openaiProvider";
import { geminiProvider } from "./geminiProvider";
import { localProvider } from "./localProvider";

/** 초기 버전: 실제 AI API 미연동 → mock 사용. 백엔드 연동 시 false 로. */
export const USE_MOCK = true;

const REAL_PROVIDERS: Record<AIModelId, AIProvider> = {
  copilot: copilotProvider,
  claude: claudeProvider,
  gpt: openaiProvider,
  gemini: geminiProvider,
  local: localProvider,
};

export function getProvider(model: AIModelId): AIProvider {
  return USE_MOCK ? mockProvider : REAL_PROVIDERS[model];
}

export { mockProvider };

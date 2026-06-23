/** 로컬 모델 provider (백엔드 경유, 예: Ollama 프록시). 키 불필요하나 호출은 서버 경유. */
import { createBackendProvider } from "./backendProvider";

export const localProvider = createBackendProvider("Local Model", "/api/ai/local");

/** Google Gemini provider (백엔드 경유). 키는 서버가 보관. */
import { createBackendProvider } from "./backendProvider";

export const geminiProvider = createBackendProvider("Gemini", "/api/ai/gemini");

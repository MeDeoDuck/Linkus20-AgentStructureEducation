/** OpenAI GPT provider (백엔드 경유). 키는 서버가 보관. */
import { createBackendProvider } from "./backendProvider";

export const openaiProvider = createBackendProvider("GPT", "/api/ai/openai");

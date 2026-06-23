/** GitHub Copilot provider (백엔드 /api/ai/copilot 경유). 토큰/SDK 호출은 전부 백엔드. */
import type { AIProvider } from "../types";
import { callCopilot } from "../../api/copilotApi";

export const copilotProvider: AIProvider = {
  name: "GitHub Copilot",
  generateDiagramEdit: callCopilot,
};

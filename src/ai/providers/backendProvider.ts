/**
 * 실제 LLM provider 공통 구현.
 * 보안 원칙(요구사항 10): API Key 는 프론트에 두지 않는다. 프론트는 자체 백엔드
 * 엔드포인트(`/api/ai/<model>`)로만 요청하고, 키 보관·외부 API 호출은 백엔드가 한다.
 *
 * 백엔드가 아직 없으면 호출은 실패하며, 그 사실을 명확한 에러로 알린다(조용한 mock
 * 대체 금지 — 어떤 provider 가 동작 중인지 사용자가 혼동하지 않도록).
 */
import { systemPromptFor } from "../systemPrompt";
import type { AIProvider, DiagramAIRequest, DiagramAIResponse } from "../types";

export function createBackendProvider(name: string, endpoint: string): AIProvider {
  return {
    name,
    async generateDiagramEdit(input: DiagramAIRequest): Promise<DiagramAIResponse> {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPromptFor(input.model),
          prompt: input.prompt,
          diagram: input.diagram,
          availableNodeTypes: input.availableNodeTypes,
          selectedNodes: input.selectedNodes,
          model: input.model,
        }),
      });
      if (!res.ok) {
        throw new Error(`${name} 백엔드 응답 오류 (${res.status}). 아직 서버가 연결되지 않았습니다.`);
      }
      const data = (await res.json()) as DiagramAIResponse;
      if (!data || typeof data.message !== "string" || !Array.isArray(data.operations)) {
        throw new Error(`${name} 응답 형식이 올바르지 않습니다.`);
      }
      return data;
    },
  };
}

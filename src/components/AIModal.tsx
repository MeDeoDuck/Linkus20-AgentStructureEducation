import { useState } from "react";
import { createPortal } from "react-dom";
import type { AIType, DiagramBlock, NodeConfig, NodeRole } from "../types";
import { AI_TYPE_LABELS } from "../data/logoSources";

/** 저장 시 블록에 반영할 P1 실행 필드 patch. 모두 optional(하위호환). */
export interface NodeRolePatch {
  nodeRole?: NodeRole;
  config?: NodeConfig;
  prompt?: string;
}

interface AIModalProps {
  onClose: () => void;
  /** Open the bottom-sheet logo picker for the chosen category. */
  onPickCategory: (aiType: Exclude<AIType, "custom">) => void;
  onApplyText: (text: string) => void;
  /** 편집 대상 블록(노드 속성 폼 초기값). 없으면 속성 탭 비활성. */
  block?: DiagramBlock;
  /** 노드 속성(역할/설정/프롬프트) 저장 콜백. */
  onSaveNodeRole?: (patch: NodeRolePatch) => void;
}

const AI_BUTTONS: Exclude<AIType, "custom">[] = [
  "generative",
  "speechToText",
  "textToImage",
  "imageOrTextToVideo",
];

type View = "menu" | "custom" | "role";

const ROLE_OPTIONS: { value: NodeRole | ""; label: string }[] = [
  { value: "", label: "없음 (그림 전용)" },
  { value: "input", label: "input (입력)" },
  { value: "llm", label: "llm (모델 호출)" },
  { value: "tool", label: "tool (도구 호출)" },
  { value: "condition", label: "condition (조건 분기)" },
  { value: "output", label: "output (출력)" },
];

export default function AIModal({ onClose, onPickCategory, onApplyText, block, onSaveNodeRole }: AIModalProps) {
  const [view, setView] = useState<View>("menu");
  const [customText, setCustomText] = useState("");

  // --- 노드 속성 폼 상태(블록 현재값으로 초기화) ---
  const cfg = block?.config ?? {};
  const [role, setRole] = useState<NodeRole | "">(block?.nodeRole ?? "");
  const [prompt, setPrompt] = useState(block?.prompt ?? "");
  const [model, setModel] = useState(cfg.model ?? "");
  const [temperature, setTemperature] = useState(cfg.temperature != null ? String(cfg.temperature) : "");
  const [maxTokens, setMaxTokens] = useState(cfg.maxTokens != null ? String(cfg.maxTokens) : "");
  const [toolName, setToolName] = useState(cfg.toolName ?? "http_get");
  const [toolUrl, setToolUrl] = useState(
    cfg.toolArgs && typeof (cfg.toolArgs as Record<string, unknown>).url === "string"
      ? String((cfg.toolArgs as Record<string, unknown>).url)
      : "",
  );
  const [toolArgs, setToolArgs] = useState(cfg.toolArgs ? JSON.stringify(cfg.toolArgs, null, 2) : "");
  const [expression, setExpression] = useState(cfg.expression ?? "");
  const [inputType, setInputType] = useState<NonNullable<NodeConfig["inputType"]>>(cfg.inputType ?? "text");
  const [placeholder, setPlaceholder] = useState(cfg.placeholder ?? "");

  const handleCategory = (aiType: Exclude<AIType, "custom">) => {
    onPickCategory(aiType);
    onClose();
  };

  const handleCustomSubmit = () => {
    const text = customText.trim();
    if (!text) return;
    onApplyText(text);
    onClose();
  };

  const handleSaveRole = () => {
    if (!onSaveNodeRole) {
      onClose();
      return;
    }
    const patch: NodeRolePatch = {};
    // 역할: "없음"이면 undefined(그림 전용으로 되돌림).
    patch.nodeRole = role === "" ? undefined : role;

    let config: NodeConfig | undefined;
    if (role === "input") {
      config = { inputType, placeholder: placeholder.trim() || undefined };
    } else if (role === "llm") {
      const temp = parseFloat(temperature);
      const max = parseInt(maxTokens, 10);
      config = {
        model: model.trim() || undefined,
        temperature: Number.isFinite(temp) ? temp : undefined,
        maxTokens: Number.isFinite(max) ? max : undefined,
      };
      patch.prompt = prompt.trim() || undefined;
    } else if (role === "tool") {
      let parsedArgs: Record<string, unknown> | undefined;
      if (toolName === "http_get") {
        // http_get 은 url 필드를 주 인자로. ({{앞노드}} 변수참조도 허용 — 서버가 해석)
        const u = toolUrl.trim();
        parsedArgs = u ? { url: u } : undefined;
      } else {
        // 그 외(web_search 등)는 고급 JSON 인자를 그대로(파싱 실패 시 생략).
        const raw = toolArgs.trim();
        if (raw) {
          try {
            const j = JSON.parse(raw);
            if (j && typeof j === "object" && !Array.isArray(j)) parsedArgs = j as Record<string, unknown>;
          } catch {
            // 파싱 실패는 무시.
          }
        }
      }
      config = { toolName: toolName.trim() || undefined, toolArgs: parsedArgs };
    } else if (role === "condition") {
      config = { expression: expression.trim() || undefined };
    } else {
      // output / 없음 → 별도 설정 없음.
      config = undefined;
    }
    patch.config = config;

    onSaveNodeRole(patch);
    onClose();
  };

  const renderRoleFields = () => {
    switch (role) {
      case "input":
        return (
          <>
            <label className="modal__field-label">입력 타입</label>
            <select
              className="modal__input"
              value={inputType}
              onChange={(e) => setInputType(e.target.value as NonNullable<NodeConfig["inputType"]>)}
            >
              <option value="text">text</option>
              <option value="file">file</option>
              <option value="url">url</option>
            </select>
            <label className="modal__field-label">Placeholder</label>
            <input
              className="modal__input"
              value={placeholder}
              placeholder="입력 안내 문구"
              onChange={(e) => setPlaceholder(e.target.value)}
            />
          </>
        );
      case "llm":
        return (
          <>
            <label className="modal__field-label">프롬프트</label>
            <textarea
              className="modal__input"
              style={{ minHeight: 80 }}
              value={prompt}
              placeholder="시스템/사용자 프롬프트"
              onChange={(e) => setPrompt(e.target.value)}
            />
            <label className="modal__field-label">모델</label>
            <input
              className="modal__input"
              value={model}
              placeholder="예: gpt-4o, claude-3-5-sonnet"
              onChange={(e) => setModel(e.target.value)}
            />
            <label className="modal__field-label">Temperature</label>
            <input
              className="modal__input"
              type="number"
              step="0.1"
              value={temperature}
              placeholder="0.0 ~ 2.0"
              onChange={(e) => setTemperature(e.target.value)}
            />
            <label className="modal__field-label">Max Tokens</label>
            <input
              className="modal__input"
              type="number"
              value={maxTokens}
              placeholder="예: 1024"
              onChange={(e) => setMaxTokens(e.target.value)}
            />
          </>
        );
      case "tool":
        return (
          <>
            <label className="modal__field-label">도구</label>
            <select className="modal__input" value={toolName} onChange={(e) => setToolName(e.target.value)}>
              <option value="http_get">http_get (URL GET 요청)</option>
              <option value="web_search">web_search (검색 — 미구현 스텁)</option>
            </select>
            {toolName === "http_get" ? (
              <>
                <label className="modal__field-label">URL</label>
                <input
                  className="modal__input"
                  value={toolUrl}
                  placeholder="https://example.com/api  (또는 {{앞노드}})"
                  onChange={(e) => setToolUrl(e.target.value)}
                />
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  http/https 만 허용. 사설·내부 IP(localhost·10.·192.168.· 등)는 보안상 차단됩니다(SSRF 방지).
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: "#d97706", marginTop: 4 }}>
                  web_search 는 검색 API 키가 필요해 아직 미구현입니다. 지금은 http_get 을 사용하세요.
                </div>
                <label className="modal__field-label">고급 인자 (JSON, 선택)</label>
                <textarea
                  className="modal__input"
                  style={{ minHeight: 60, fontFamily: "monospace" }}
                  value={toolArgs}
                  placeholder='{ "query": "..." }'
                  onChange={(e) => setToolArgs(e.target.value)}
                />
              </>
            )}
          </>
        );
      case "condition":
        return (
          <>
            <label className="modal__field-label">조건식 (expression)</label>
            <input
              className="modal__input"
              value={expression}
              placeholder="예: {{분류}} contains '긍정'"
              onChange={(e) => setExpression(e.target.value)}
            />
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, lineHeight: 1.5 }}>
              지원: <code>{"{{ref}} contains '값'"}</code>, <code>{"{{ref}} == '값'"}</code>,{" "}
              <code>{"{{ref}} != '값'"}</code>, <code>{"{{ref}} includes '값'"}</code>, 또는 <code>{"{{ref}}"}</code> 단독(truthy).
              <br />
              결과(true/false)에 따라 분기됩니다. 나가는 화살표를 우클릭해 <b>true/false 가지</b>를 지정하세요.
            </div>
          </>
        );
      default:
        // output / 없음 → 추가 필드 없음.
        return null;
    }
  };

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose} data-no-export="true">
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        {view === "menu" && (
          <>
            <h3 className="modal__title">블록 유형 선택</h3>
            <div className="modal__list">
              {AI_BUTTONS.map((type) => (
                <button key={type} className="modal__btn" onClick={() => handleCategory(type)}>
                  {AI_TYPE_LABELS[type]}
                </button>
              ))}
              <button className="modal__btn" onClick={() => setView("custom")}>
                직접 입력
              </button>
              {block && onSaveNodeRole && (
                <button className="modal__btn" onClick={() => setView("role")}>
                  노드 속성 설정
                </button>
              )}
            </div>
            <button className="btn modal__close" onClick={onClose}>
              닫기
            </button>
          </>
        )}

        {view === "custom" && (
          <div className="modal__custom">
            <h3 className="modal__title">직접 입력</h3>
            <input
              className="modal__input"
              autoFocus
              value={customText}
              placeholder="블록에 표시할 텍스트"
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomSubmit();
              }}
            />
            <div className="modal__actions">
              <button className="btn" onClick={() => setView("menu")}>
                뒤로
              </button>
              <button className="btn btn--primary" onClick={handleCustomSubmit}>
                적용
              </button>
            </div>
          </div>
        )}

        {view === "role" && (
          <div className="modal__custom">
            <h3 className="modal__title">노드 속성</h3>
            <label className="modal__field-label">실행 역할</label>
            <select
              className="modal__input"
              value={role}
              onChange={(e) => setRole(e.target.value as NodeRole | "")}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value || "none"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {renderRoleFields()}
            <div className="modal__actions">
              <button className="btn" onClick={() => setView("menu")}>
                뒤로
              </button>
              <button className="btn btn--primary" onClick={handleSaveRole}>
                저장
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

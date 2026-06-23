import { useEffect, useRef } from "react";
import { useAIStore } from "../store/useAIStore";
import { summarizeOperation } from "../ai/diagramBridge";
import { AI_MODELS } from "../ai/types";

/** 우측 AI Assistant 패널 (Copilot Chat / Claude Code 사이드바 스타일). */
export default function AIAssistantPanel() {
  const collapsed = useAIStore((s) => s.collapsed);
  const model = useAIStore((s) => s.model);
  const input = useAIStore((s) => s.input);
  const status = useAIStore((s) => s.status);
  const error = useAIStore((s) => s.error);
  const messages = useAIStore((s) => s.messages);
  const pending = useAIStore((s) => s.pending);

  const toggleCollapsed = useAIStore((s) => s.toggleCollapsed);
  const setModel = useAIStore((s) => s.setModel);
  const setInput = useAIStore((s) => s.setInput);
  const run = useAIStore((s) => s.run);
  const applyPending = useAIStore((s) => s.applyPending);
  const cancelPending = useAIStore((s) => s.cancelPending);
  const clearChat = useAIStore((s) => s.clearChat);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, pending]);

  if (collapsed) {
    return (
      <div className="ai-panel ai-panel--collapsed">
        <button className="ai-collapse-btn" onClick={toggleCollapsed} title="AI 패널 펼치기">
          ◀
        </button>
        <span className="ai-panel__vlabel">AI</span>
      </div>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      run();
    }
  };

  const blocked = !!pending && pending.errors.length > 0;

  return (
    <aside className="ai-panel">
      <header className="ai-panel__header">
        <span className="ai-panel__title">✨ AI Assistant</span>
        <div className="ai-panel__header-actions">
          <button className="ai-icon-btn" onClick={clearChat} title="대화 비우기">🗑</button>
          <button className="ai-collapse-btn" onClick={toggleCollapsed} title="AI 패널 접기">▶</button>
        </div>
      </header>

      <div className="ai-panel__model">
        <label htmlFor="ai-model">모델</label>
        <select id="ai-model" value={model} onChange={(e) => setModel(e.target.value as typeof model)}>
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* 대화 기록 */}
      <div className="ai-panel__log" ref={logRef}>
        {messages.length === 0 && (
          <div className="ai-empty">
            <p>자연어로 다이어그램을 만들어 보세요.</p>
            <ul>
              <li>"로그인 플로우 만들어줘"</li>
              <li>"회원가입 흐름 그려줘"</li>
              <li>"성공/실패 조건 추가해줘"</li>
              <li>"전체 보기 좋게 정리해줘"</li>
              <li>"이 다이어그램 설명해줘"</li>
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`ai-msg ai-msg--${m.role}`}>
            <div className="ai-msg__role">
              {m.role === "user" ? "나" : m.role === "assistant" ? "AI" : "시스템"}
              {m.applied && <span className="ai-msg__applied"> · 적용됨</span>}
            </div>
            <div className="ai-msg__text">{m.text}</div>
          </div>
        ))}
        {status === "loading" && <div className="ai-msg ai-msg--assistant"><div className="ai-msg__text ai-typing">생성 중…</div></div>}
      </div>

      {/* 변경 제안 미리보기 */}
      {pending && (
        <div className="ai-preview">
          <div className="ai-preview__title">제안된 변경 ({pending.operations.length})</div>
          <ul className="ai-preview__list">
            {pending.operations.map((op, i) => (
              <li key={i}>{summarizeOperation(op)}</li>
            ))}
          </ul>
          {pending.warnings.length > 0 && (
            <div className="ai-preview__warn">⚠️ {pending.warnings.join(" / ")}</div>
          )}
          {pending.errors.length > 0 && (
            <div className="ai-preview__error">⛔ 적용할 수 없습니다:<br />{pending.errors.join("\n")}</div>
          )}
          <div className="ai-preview__actions">
            <button className="btn btn--primary" onClick={applyPending} disabled={blocked}>적용하기</button>
            <button className="btn" onClick={cancelPending}>취소하기</button>
          </div>
        </div>
      )}

      {error && !pending && <div className="ai-error">⚠️ {error}</div>}

      {/* 입력 */}
      <div className="ai-panel__input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="예: 회원가입 플로우 만들어줘  (Enter 전송, Shift+Enter 줄바꿈)"
          rows={3}
        />
        <button className="btn btn--primary ai-run-btn" onClick={run} disabled={status === "loading" || !input.trim()}>
          {status === "loading" ? "생성 중…" : "실행"}
        </button>
      </div>
    </aside>
  );
}

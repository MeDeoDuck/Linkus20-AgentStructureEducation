import { useEffect, useRef } from "react";
import { useAIStore } from "../store/useAIStore";
import { useAuthStore } from "../store/useAuthStore";
import { summarizeOperation } from "../ai/diagramBridge";
import LoginButton from "./LoginButton";

/** 우측 GitHub Copilot AI Assistant 패널 (Copilot Chat 사이드바 스타일, 단일 경로). */
export default function AIAssistantPanel() {
  const collapsed = useAIStore((s) => s.collapsed);
  const input = useAIStore((s) => s.input);
  const status = useAIStore((s) => s.status);
  const error = useAIStore((s) => s.error);
  const messages = useAIStore((s) => s.messages);
  const pending = useAIStore((s) => s.pending);

  const toggleCollapsed = useAIStore((s) => s.toggleCollapsed);
  const setInput = useAIStore((s) => s.setInput);
  const run = useAIStore((s) => s.run);
  const applyPending = useAIStore((s) => s.applyPending);
  const cancelPending = useAIStore((s) => s.cancelPending);
  const clearChat = useAIStore((s) => s.clearChat);

  const authStatus = useAuthStore((s) => s.status);
  const copilotAvailable = useAuthStore((s) => s.copilotAvailable);

  const canUse = authStatus === "authenticated" && copilotAvailable;

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, pending]);

  if (collapsed) {
    return (
      <div className="ai-panel ai-panel--collapsed">
        <button className="ai-collapse-btn" onClick={toggleCollapsed} title="AI 패널 펼치기">◀</button>
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
        <span className="ai-panel__title">✨ GitHub Models AI</span>
        <div className="ai-panel__header-actions">
          <button className="ai-icon-btn" onClick={clearChat} title="대화 비우기">🗑</button>
          <button className="ai-collapse-btn" onClick={toggleCollapsed} title="AI 패널 접기">▶</button>
        </div>
      </header>

      {/* 로그인 / 사용자 정보 / Copilot 상태 */}
      <div className="ai-panel__auth">
        <LoginButton />
      </div>

      {/* 대화 기록 */}
      <div className="ai-panel__log" ref={logRef}>
        {messages.length === 0 && (
          <div className="ai-empty">
            <p>자연어로 다이어그램을 만들어 보세요.</p>
            <ul>
              <li>"회원가입 플로우 만들어줘"</li>
              <li>"사용자에서 로그인 페이지로 연결해줘"</li>
              <li>"로그인 성공/실패 조건 추가해줘"</li>
              <li>"왼쪽에서 오른쪽 흐름으로 정리해줘"</li>
              <li>"이 다이어그램 흐름 설명해줘"</li>
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
        {status === "loading" && (
          <div className="ai-msg ai-msg--assistant"><div className="ai-msg__text ai-typing">생성 중…</div></div>
        )}
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
          {pending.warnings.length > 0 && <div className="ai-preview__warn">⚠️ {pending.warnings.join(" / ")}</div>}
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

      {/* 입력 — 비로그인/권한없음 시 비활성 + 안내 */}
      <div className="ai-panel__input">
        {!canUse && (
          <div className="ai-gate">
            {authStatus !== "authenticated"
              ? "GitHub로 로그인 후 AI 기능을 사용할 수 있습니다."
              : "현재 GitHub 계정에서 GitHub Models 사용 권한을 확인할 수 없습니다. 다시 로그인하거나 GitHub Models 사용 설정을 확인해 주세요."}
          </div>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={canUse ? "예: 회원가입 플로우 만들어줘  (Enter 전송, Shift+Enter 줄바꿈)" : "로그인 후 사용 가능"}
          rows={3}
          disabled={!canUse}
        />
        <button
          className="btn btn--primary ai-run-btn"
          onClick={run}
          disabled={!canUse || status === "loading" || !input.trim()}
        >
          {status === "loading" ? "생성 중…" : "실행"}
        </button>
      </div>
    </aside>
  );
}

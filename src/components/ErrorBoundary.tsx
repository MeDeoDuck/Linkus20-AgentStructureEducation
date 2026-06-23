import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * 렌더 중 예외가 나도 앱 전체가 백지(white screen)로 죽지 않게 잡아주는 경계.
 * 예: AI 응답 operations 형태가 예상과 달라 미리보기 렌더가 throw 하는 경우.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", color: "#1f2430" }}>
          <h2 style={{ margin: "0 0 8px" }}>⚠️ 화면 렌더 중 오류가 발생했습니다</h2>
          <p style={{ color: "#6b7280", margin: "0 0 16px" }}>
            작업 내용은 보존됩니다. 아래 버튼으로 화면을 새로고침하세요.
          </p>
          <pre
            style={{
              background: "#f7f8fa",
              border: "1px solid #e2e5ea",
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              overflow: "auto",
              maxWidth: 720,
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12,
              padding: "8px 14px",
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

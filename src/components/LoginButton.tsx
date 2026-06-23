import { useAuthStore } from "../store/useAuthStore";

const GitHubMark = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
  </svg>
);

/** GitHub 로그인 버튼 / 로그인된 사용자 정보 + Copilot 상태 + 로그아웃. */
export default function LoginButton() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const copilotAvailable = useAuthStore((s) => s.copilotAvailable);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);

  if (status === "loading") {
    return <div className="ai-auth ai-auth--muted">로그인 상태 확인 중…</div>;
  }

  if (status === "authenticated" && user) {
    return (
      <div className="ai-auth">
        <div className="ai-auth__user">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="ai-auth__avatar" />
          ) : (
            <span className="ai-auth__avatar ai-auth__avatar--ph">{user.login[0]?.toUpperCase()}</span>
          )}
          <div className="ai-auth__meta">
            <div className="ai-auth__name">{user.name || user.login}</div>
            <div className={`ai-auth__copilot ${copilotAvailable ? "ok" : "no"}`}>
              {copilotAvailable ? "● GitHub Models 연결됨" : "○ GitHub 계정으로 AI 사용"}
            </div>
          </div>
        </div>
        <button className="ai-icon-btn" onClick={logout} title="로그아웃">로그아웃</button>
      </div>
    );
  }

  // anonymous
  return (
    <button className="btn btn--primary ai-login-btn" onClick={login}>
      <GitHubMark /> GitHub로 로그인
    </button>
  );
}

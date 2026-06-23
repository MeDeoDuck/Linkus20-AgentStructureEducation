/**
 * 인증(GitHub OAuth) 상태. 프론트는 토큰을 다루지 않고 /api/auth/me 로 로그인 여부만 확인.
 * USE_MOCK(데모) 모드에서는 백엔드 없이 "로그인된 데모 학생"으로 동작해 mock AI 를 바로 써볼 수 있다.
 */
import { create } from "zustand";
import { fetchMe, startGitHubLogin, logout as apiLogout } from "../api/authApi";
import { USE_MOCK } from "../ai/providers";
import type { AuthStatus, GitHubUser } from "../ai/types";

interface AuthState {
  status: AuthStatus;
  user: GitHubUser | null;
  copilotAvailable: boolean;
  error: string | null;

  checkAuth: () => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
}

const MOCK_USER: GitHubUser = { login: "demo-student", name: "데모 학생(mock)" };

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  copilotAvailable: false,
  error: null,

  checkAuth: async () => {
    // 데모 모드: 백엔드 없이 로그인된 것처럼 동작(mock AI 체험용).
    if (USE_MOCK) {
      set({ status: "authenticated", user: MOCK_USER, copilotAvailable: true, error: null });
      return;
    }
    set({ status: "loading", error: null });
    try {
      const me = await fetchMe();
      if (me.authenticated && me.user) {
        set({ status: "authenticated", user: me.user, copilotAvailable: !!me.copilotAvailable, error: null });
      } else {
        set({ status: "anonymous", user: null, copilotAvailable: false, error: null });
      }
    } catch {
      // 백엔드 미가동/네트워크 오류 → 비로그인 취급(안전한 기본값).
      set({ status: "anonymous", user: null, copilotAvailable: false, error: null });
    }
  },

  login: () => startGitHubLogin(),

  logout: async () => {
    if (!USE_MOCK) {
      try {
        await apiLogout();
      } catch {
        /* 무시: 어차피 로컬 상태는 비운다 */
      }
    }
    set({ status: "anonymous", user: null, copilotAvailable: false, error: null });
  },
}));

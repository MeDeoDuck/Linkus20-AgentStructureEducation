/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 베이스 URL(예: http://localhost:8787). 미설정 시 same-origin. */
  readonly VITE_API_BASE?: string;
  /** "false" 면 mock 끄고 실제 Copilot 백엔드 사용. 기본(미설정)은 데모(mock). */
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

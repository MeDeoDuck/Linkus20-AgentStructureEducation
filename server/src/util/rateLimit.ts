/**
 * 간이 in-memory 레이트리미터(전역 per-라우터). 전면 인증(P-future) 전까지의 임시 안전장치 —
 * 무인증 + 운영자 키 비용 노출을 동시 실행·분당 호출 상한으로 제한한다.
 *
 * makeRateLimiter({concurrent, perMinute}) → Express 미들웨어.
 *   - 동시 실행: 응답이 끝날 때(res finish/close) 카운트 해제.
 *   - 분당 호출: 60초 슬라이딩(고정창) 카운터.
 *   - 초과 시 429 { error:"rate_limited", message }.
 *
 * 주의: 응답을 즉시 반환하고 백그라운드로 작업하는 라우트(/api/run 202)는 동시카운트가
 *       작업 수명을 반영하지 못하므로, 그쪽은 분당 한도(perMinute)가 실질 보호선이다.
 */
import type { Request, Response, NextFunction } from "express";

export function makeRateLimiter(opts: { concurrent: number; perMinute: number }) {
  let inFlight = 0;
  let windowStart = Date.now();
  let windowCount = 0;

  return function rateLimiter(_req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    if (now - windowStart >= 60_000) {
      windowStart = now;
      windowCount = 0;
    }
    if (inFlight >= opts.concurrent) {
      res.status(429).json({ error: "rate_limited", message: `동시 실행 한도(${opts.concurrent}) 초과 — 잠시 후 다시 시도하세요.` });
      return;
    }
    if (windowCount >= opts.perMinute) {
      res.status(429).json({ error: "rate_limited", message: `분당 호출 한도(${opts.perMinute}) 초과 — 잠시 후 다시 시도하세요.` });
      return;
    }
    windowCount += 1;
    inFlight += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inFlight -= 1;
    };
    res.on("finish", release);
    res.on("close", release);
    next();
  };
}

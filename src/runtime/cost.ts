/**
 * 토큰 → 대략 비용(USD) 추정. 과도 구현하지 않는다 — 모델별 단가 상수 맵으로 러프하게 계산하고,
 * 매칭되는 단가가 없으면 비용은 null(토큰만 표시). 단가는 어디까지나 추정치(정확 청구가 아님).
 */
import type { Run } from "../store/useRunStore";

/** 1K 토큰당 USD(추정). 모델명 부분일치로 매칭. 모르면 생략(비용 미표시). */
const PRICE_PER_1K: Array<{ match: string; in: number; out: number }> = [
  { match: "gpt-4.1-mini", in: 0.0004, out: 0.0016 },
  { match: "gpt-4.1", in: 0.002, out: 0.008 },
  { match: "gpt-4o-mini", in: 0.00015, out: 0.0006 },
  { match: "gpt-4o", in: 0.0025, out: 0.01 },
  { match: "gpt-3.5", in: 0.0005, out: 0.0015 },
  { match: "claude-3-5-haiku", in: 0.0008, out: 0.004 },
  { match: "claude-3-5-sonnet", in: 0.003, out: 0.015 },
  { match: "claude", in: 0.003, out: 0.015 },
];

function priceFor(model?: string): { in: number; out: number } | null {
  if (!model) return null;
  const m = model.toLowerCase();
  return PRICE_PER_1K.find((p) => m.includes(p.match)) ?? null;
}

/**
 * Run 의 노드별 토큰×단가 합. 단가를 아는 노드가 하나도 없으면 usd=null(토큰만).
 */
export function estimateRunCost(run: Run): { usd: number | null; tokens: number } {
  let usd = 0;
  let known = false;
  let tokens = 0;
  for (const nr of run.nodeRuns) {
    const ti = nr.tokensIn ?? 0;
    const to = nr.tokensOut ?? 0;
    tokens += ti + to;
    const price = priceFor(nr.model);
    if (price) {
      known = true;
      usd += (ti / 1000) * price.in + (to / 1000) * price.out;
    }
  }
  return { usd: known ? usd : null, tokens: tokens || run.totalTokens || 0 };
}

/** USD 를 보기 좋게(작은 값은 4자리). */
export function formatUSD(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

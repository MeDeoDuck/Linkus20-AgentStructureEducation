/**
 * 실행 패널. 세 모드:
 *  - 단일: input 노드 입력 → 1회 실행, 노드별 진행/결과.
 *  - 배치: 여러 입력 케이스(행) → 일괄 실행 → 케이스 비교 테이블(실패 강조).
 *  - 히스토리: 과거 Run 목록(시각/상태/토큰/비용/노드수) → 클릭 시 상세 재표시.
 * 빌드(다이어그램) 상태와 분리된 useRunStore 만 사용.
 */
import { useMemo, useState } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import { useRunStore, MAX_BATCH_CASES, type NodeStatus, type Run } from "../store/useRunStore";
import { estimateRunCost, formatUSD } from "../runtime/cost";

const STATUS_COLOR: Record<NodeStatus, string> = {
  pending: "#9ca3af",
  running: "#3b82f6",
  succeeded: "#22c55e",
  failed: "#ef4444",
  skipped: "#d1d5db",
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  pending: "대기",
  running: "실행 중",
  succeeded: "성공",
  failed: "실패",
  skipped: "건너뜀",
};

const RUN_STATUS_COLOR: Record<Run["status"], string> = {
  queued: "#9ca3af",
  running: "#3b82f6",
  succeeded: "#22c55e",
  failed: "#ef4444",
  canceled: "#9ca3af",
};

function stringifyOutput(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

const snippet = (v: unknown, n = 80): string => {
  const s = stringifyOutput(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
};

type Mode = "single" | "batch" | "history";

export default function RunPanel() {
  const panelOpen = useRunStore((s) => s.panelOpen);
  const closePanel = useRunStore((s) => s.closePanel);
  const status = useRunStore((s) => s.status);
  const current = useRunStore((s) => s.current);
  const error = useRunStore((s) => s.error);
  const startRun = useRunStore((s) => s.startRun);
  const startBatch = useRunStore((s) => s.startBatch);
  const batch = useRunStore((s) => s.batch);
  const history = useRunStore((s) => s.history);
  const viewRun = useRunStore((s) => s.viewRun);

  const blocks = useDiagramStore((s) => s.blocks);

  const inputNodes = useMemo(() => blocks.filter((b) => b.nodeRole === "input"), [blocks]);
  const execNodes = useMemo(() => blocks.filter((b) => b.nodeRole), [blocks]);
  const labelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blocks) m.set(b.id, b.text || b.id);
    return m;
  }, [blocks]);

  const [mode, setMode] = useState<Mode>("single");
  const [values, setValues] = useState<Record<string, string>>({});
  // 배치 입력 그리드(행=케이스). 기본 2행.
  const [rows, setRows] = useState<Record<string, string>[]>([{}, {}]);

  if (!panelOpen) return null;

  const running = status === "running";
  const wide = mode !== "single";

  const handleRun = () => {
    if (running) return;
    const inputs: Record<string, unknown> = {};
    for (const n of inputNodes) inputs[n.id] = values[n.id] ?? "";
    startRun(inputs);
  };

  const handleBatchRun = () => {
    if (running) return;
    const cases = rows.map((row) => {
      const inp: Record<string, unknown> = {};
      for (const n of inputNodes) inp[n.id] = row[n.id] ?? "";
      return inp;
    });
    startBatch(cases);
  };

  const addRow = () => setRows((r) => (r.length >= MAX_BATCH_CASES ? r : [...r, {}]));
  const removeRow = (i: number) => setRows((r) => (r.length <= 1 ? r : r.filter((_, idx) => idx !== i)));
  const setCell = (i: number, nodeId: string, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [nodeId]: v } : row)));

  return (
    <aside className="run-panel" style={{ ...runPanelStyle, width: wide ? 600 : 340 }}>
      <header style={headerStyle}>
        <strong>▶ 워크플로 실행</strong>
        <button className="tool-btn" onClick={closePanel} title="실행 패널 닫기">
          ✕
        </button>
      </header>

      {/* 모드 탭 */}
      <div style={tabBar}>
        {(["single", "batch", "history"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{ ...tabBtn, ...(mode === m ? tabBtnActive : {}) }}
          >
            {m === "single" ? "단일" : m === "batch" ? "배치" : `히스토리 (${history.length})`}
          </button>
        ))}
      </div>

      <div style={{ padding: 12, overflow: "auto", flex: 1 }}>
        {error && <div style={{ ...hintStyle, color: "#ef4444", marginBottom: 10 }}>⚠️ {error}</div>}

        {mode === "single" && (
          <SingleView
            inputNodes={inputNodes}
            values={values}
            setValues={setValues}
            running={running}
            onRun={handleRun}
            current={current}
            labelOf={labelOf}
          />
        )}

        {mode === "batch" && (
          <BatchView
            inputNodes={inputNodes}
            execNodes={execNodes}
            rows={rows}
            setCell={setCell}
            addRow={addRow}
            removeRow={removeRow}
            running={running}
            onRun={handleBatchRun}
            batch={batch}
          />
        )}

        {mode === "history" && (
          <HistoryView
            history={history}
            onView={(r) => {
              viewRun(r);
              setMode("single");
            }}
          />
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// 단일 모드
// ---------------------------------------------------------------------------
function SingleView(props: {
  inputNodes: { id: string; text: string; config?: { placeholder?: string } }[];
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  running: boolean;
  onRun: () => void;
  current: Run | null;
  labelOf: Map<string, string>;
}) {
  const { inputNodes, values, setValues, running, onRun, current, labelOf } = props;
  return (
    <>
      <section>
        <div style={sectionTitle}>입력 ({inputNodes.length})</div>
        {inputNodes.length === 0 ? (
          <div style={hintStyle}>
            input 역할 노드가 없습니다. 블록을 더블클릭 → "노드 속성 설정" → 역할을 input 으로 지정하세요.
          </div>
        ) : (
          inputNodes.map((n) => (
            <div key={n.id} style={{ marginBottom: 8 }}>
              <label style={labelStyle}>{n.text || n.id}</label>
              <input
                style={inputStyle}
                value={values[n.id] ?? ""}
                placeholder={n.config?.placeholder ?? "값 입력"}
                onChange={(e) => setValues((v) => ({ ...v, [n.id]: e.target.value }))}
              />
            </div>
          ))
        )}
        <button className="btn btn--primary" style={{ width: "100%", marginTop: 8 }} onClick={onRun} disabled={running}>
          {running ? "실행 중…" : "실행"}
        </button>
      </section>

      {current && (
        <section style={{ marginTop: 14 }}>
          <div style={sectionTitle}>
            진행 상태 — <span style={{ color: "#6b7280" }}>{current.status}</span>
          </div>
          <div>
            {current.nodeRuns.map((nr) => (
              <div key={nr.nodeId} style={nodeRunRow}>
                <span style={{ ...dot, background: STATUS_COLOR[nr.status] }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {labelOf.get(nr.nodeId) ?? nr.nodeId}{" "}
                    <span style={{ color: STATUS_COLOR[nr.status], fontWeight: 500 }}>· {STATUS_LABEL[nr.status]}</span>
                    {typeof nr.durationMs === "number" && (
                      <span style={{ color: "#9ca3af", fontWeight: 400 }}> · {nr.durationMs}ms</span>
                    )}
                  </div>
                  {nr.error && <div style={{ fontSize: 11, color: "#ef4444" }}>{nr.error}</div>}
                  {nr.note && <div style={{ fontSize: 11, color: "#d97706" }}>⚠ {nr.note}</div>}
                  {nr.output !== undefined && (nr.status === "succeeded" || nr.status === "skipped") && (
                    <pre style={outputPre}>{stringifyOutput(nr.output)}</pre>
                  )}
                  {(nr.tokensIn != null || nr.tokensOut != null) && (
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>
                      tokens in {nr.tokensIn ?? 0} / out {nr.tokensOut ?? 0}
                      {nr.model ? ` · ${nr.model}` : ""}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {current.finalOutput !== undefined && (
            <div style={{ marginTop: 10 }}>
              <div style={sectionTitle}>최종 출력</div>
              <pre style={{ ...outputPre, background: "#f0fdf4", borderColor: "#86efac" }}>
                {stringifyOutput(current.finalOutput)}
              </pre>
            </div>
          )}
          {current.totalTokens != null && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>총 토큰: {current.totalTokens}</div>
          )}
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 배치 모드
// ---------------------------------------------------------------------------
function BatchView(props: {
  inputNodes: { id: string; text: string }[];
  execNodes: { id: string; text: string; nodeRole?: string }[];
  rows: Record<string, string>[];
  setCell: (i: number, nodeId: string, v: string) => void;
  addRow: () => void;
  removeRow: (i: number) => void;
  running: boolean;
  onRun: () => void;
  batch: { cases: Run[]; running: boolean } | null;
}) {
  const { inputNodes, execNodes, rows, setCell, addRow, removeRow, running, onRun, batch } = props;

  if (inputNodes.length === 0) {
    return (
      <div style={hintStyle}>
        배치 실행에는 input 노드가 필요합니다. 블록을 input 역할로 지정한 뒤 케이스별 값을 입력하세요.
      </div>
    );
  }

  return (
    <>
      <section>
        <div style={sectionTitle}>
          입력 케이스 ({rows.length}/{MAX_BATCH_CASES})
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>#</th>
                {inputNodes.map((n) => (
                  <th key={n.id} style={th}>
                    {n.text || n.id}
                  </th>
                ))}
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td style={tdNum}>{i + 1}</td>
                  {inputNodes.map((n) => (
                    <td key={n.id} style={td}>
                      <input
                        style={{ ...inputStyle, fontSize: 12, padding: "4px 6px" }}
                        value={row[n.id] ?? ""}
                        onChange={(e) => setCell(i, n.id, e.target.value)}
                      />
                    </td>
                  ))}
                  <td style={td}>
                    <button className="tool-btn" title="행 삭제" onClick={() => removeRow(i)} disabled={rows.length <= 1}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={addRow} disabled={rows.length >= MAX_BATCH_CASES}>
            + 케이스 추가
          </button>
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={onRun} disabled={running}>
            {running ? "배치 실행 중…" : `배치 실행 (${rows.length})`}
          </button>
        </div>
      </section>

      {batch && (
        <section style={{ marginTop: 14 }}>
          <div style={sectionTitle}>비교 결과</div>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>상태</th>
                  {execNodes.map((n) => (
                    <th key={n.id} style={th}>
                      {n.text || n.id}
                    </th>
                  ))}
                  <th style={th}>최종</th>
                  <th style={th}>토큰</th>
                  <th style={th}>비용~</th>
                </tr>
              </thead>
              <tbody>
                {batch.cases.map((run, i) => {
                  const { usd, tokens } = estimateRunCost(run);
                  const failed = run.status === "failed";
                  return (
                    <tr key={i} style={failed ? { background: "#fef2f2" } : undefined}>
                      <td style={tdNum}>{i + 1}</td>
                      <td style={td}>
                        <span style={{ color: RUN_STATUS_COLOR[run.status], fontWeight: 600, fontSize: 11 }}>
                          {run.status}
                        </span>
                      </td>
                      {execNodes.map((n) => {
                        const nr = run.nodeRuns.find((x) => x.nodeId === n.id);
                        return (
                          <td key={n.id} style={tdCell} title={nr ? stringifyOutput(nr.output) : ""}>
                            {nr ? snippet(nr.output) : "—"}
                          </td>
                        );
                      })}
                      <td style={tdCell} title={stringifyOutput(run.finalOutput)}>
                        {run.finalOutput !== undefined ? snippet(run.finalOutput) : run.error ? "오류" : "—"}
                      </td>
                      <td style={tdNum}>{tokens || "—"}</td>
                      <td style={tdNum}>{usd != null ? formatUSD(usd) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ ...hintStyle, marginTop: 6 }}>
            비용은 토큰×모델단가 추정치(정확 청구 아님). 셀에 마우스를 올리면 전체 출력이 보입니다.
          </div>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 히스토리 모드
// ---------------------------------------------------------------------------
function HistoryView(props: { history: Run[]; onView: (r: Run) => void }) {
  const { history, onView } = props;
  if (history.length === 0) return <div style={hintStyle}>아직 실행 기록이 없습니다.</div>;
  return (
    <div>
      {history.map((run, i) => {
        const { usd, tokens } = estimateRunCost(run);
        const t = new Date(run.startedAt);
        const time = `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}:${t
          .getSeconds()
          .toString()
          .padStart(2, "0")}`;
        return (
          <button key={`${run.runId}-${i}`} onClick={() => onView(run)} style={historyItem}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: RUN_STATUS_COLOR[run.status], fontWeight: 700, fontSize: 12 }}>{run.status}</span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{time}</span>
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              노드 {run.nodeRuns.length} · 토큰 {tokens || 0}
              {usd != null ? ` · ${formatUSD(usd)}~` : ""}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// --- 인라인 스타일(전용 CSS 없이 동작) ---
const runPanelStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  height: "100vh",
  background: "#fff",
  borderLeft: "1px solid #e5e7eb",
  boxShadow: "-2px 0 8px rgba(0,0,0,0.06)",
  display: "flex",
  flexDirection: "column",
  zIndex: 50,
};
const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
};
const tabBar: React.CSSProperties = { display: "flex", gap: 4, padding: "6px 12px", borderBottom: "1px solid #e5e7eb" };
const tabBtn: React.CSSProperties = {
  flex: 1,
  padding: "5px 8px",
  fontSize: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#f9fafb",
  cursor: "pointer",
};
const tabBtnActive: React.CSSProperties = { background: "#2563eb", color: "#fff", borderColor: "#2563eb", fontWeight: 700 };
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#4b5563", marginBottom: 3 };
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
};
const hintStyle: React.CSSProperties = { fontSize: 12, color: "#6b7280", lineHeight: 1.5 };
const nodeRunRow: React.CSSProperties = { display: "flex", alignItems: "flex-start", padding: "6px 0", borderTop: "1px solid #f3f4f6" };
const dot: React.CSSProperties = { display: "inline-block", width: 8, height: 8, borderRadius: "50%", marginRight: 8, flex: "0 0 auto", marginTop: 5 };
const outputPre: React.CSSProperties = {
  margin: "4px 0 0",
  padding: "6px 8px",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  fontSize: 11,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 160,
  overflowY: "auto",
};
const table: React.CSSProperties = { borderCollapse: "collapse", fontSize: 12, width: "100%" };
const th: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: "4px 6px",
  background: "#f3f4f6",
  fontSize: 11,
  fontWeight: 700,
  textAlign: "left",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = { border: "1px solid #e5e7eb", padding: "3px 6px", verticalAlign: "top" };
const tdNum: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap", color: "#6b7280" };
const tdCell: React.CSSProperties = { ...td, maxWidth: 160, fontSize: 11, color: "#374151" };
const historyItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  marginBottom: 6,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
  cursor: "pointer",
};

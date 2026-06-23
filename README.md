# AI Agent Simulation — 웹 구조도 편집기 (MVP)

draw.io 스타일의 경량 다이어그램 편집기. 블록을 만들고 드래그/리사이즈하고,
블록을 더블클릭해 AI 카테고리(생성형/STT/T2I/T2V) 로고를 삽입하거나 직접 텍스트를
입력하고, 화살표를 자유 배치(길이·회전·곡률)한 뒤 캔버스를 PNG로 저장한다.

## 스택

- React 18 + TypeScript
- Vite 5
- Zustand (상태관리)
- html-to-image (PNG 내보내기)
- 일반 CSS + CSS 변수 (Tailwind 미사용)

## 설치 / 실행

```bash
npm install      # 의존성 설치
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 타입체크(tsc) + 프로덕션 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
```

## 주요 기능

1. **레이아웃** — 좌측 얇은 도형 패널 + 상단 제목/저장 바 + 중앙 모눈 캔버스.
2. **블록 생성** — 좌측 패널 클릭으로 사용자(원)/사각형/마름모(조건)/둥근사각형(프로세스)/화살표 추가.
3. **블록 편집** — 드래그 이동, 8방향 핸들 리사이즈, 선택 시 파란 테두리, `Delete`/`Backspace` 삭제.
   - 선택된 블록의 텍스트를 한 번 더 클릭하면 인라인 편집.
4. **AI 모달** — 블록 더블클릭 시 작은 모달(5버튼): 생성형 AI / 음성→텍스트 / 텍스트→이미지 / 이미지·텍스트→영상 / 직접 입력.
5. **로고 삽입** — AI 카테고리 선택 시 해당 회사 로고들을 블록 안에 flex-wrap 그리드로 표시. 직접 입력 선택 시 텍스트 교체.
6. **화살표** — SVG quadratic Bezier. 선택 시 시작/끝 핸들(이동·길이), 곡률 핸들, 회전 핸들. 자유 배치.
7. **저장(PNG)** — 캔버스 DOM만 캡처(좌패널·상단바·선택핸들·모달 제외). File System Access API 우선, 미지원 시 `<a download>` 폴백. 파일명 = 제목 + `.png`.
8. **AI Assistant 패널** — 우측 사이드바(Copilot Chat/Claude Code 스타일). 자연어로 블록 생성·수정·연결·정렬·설명을 요청하면 AI가 **변경 제안**을 만들고, 사용자가 **적용하기**를 눌러야 캔버스에 반영된다(아래 별도 섹션 참고).

## 구조

```
src/
  main.tsx            진입점
  App.tsx             레이아웃 + 단축키 + 저장 트리거
  index.css           전역 스타일(CSS 변수)
  types.ts            데이터 모델
  store/useDiagramStore.ts   Zustand 스토어(블록/화살표/선택/액션)
  data/logoSources.ts        AI 카테고리별 로고 소스(Simple Icons / Clearbit)
  utils/exportCanvas.ts      html-to-image PNG 내보내기 + 저장 폴백
  components/
    TopBar.tsx        제목 input + 저장 버튼
    Sidebar.tsx       도형 팔레트
    Canvas.tsx        모눈 캔버스 + 요소 렌더 + 빈영역 클릭 해제
    DiagramBlock.tsx  블록(드래그/리사이즈/텍스트/모달/로고)
    ArrowElement.tsx  SVG 화살표(길이/회전/곡률 핸들)
    ResizeHandles.tsx 8방향 리사이즈 핸들
    AIModal.tsx       AI 카테고리 / 직접입력 모달
    AIAssistantPanel.tsx  우측 AI Assistant 패널(모델선택/대화/미리보기/적용)
    LogoGrid.tsx      로고 칩 + onError 폴백(Simple Icons → Clearbit → 텍스트 배지)
  store/useAIStore.ts   AI 패널 상태(모델·대화·pending 제안)
  ai/
    types.ts          AI 도메인 타입(AINode/AIEdge/Operation/AIProvider/모델목록)
    systemPrompt.ts   provider 에 넣는 시스템 프롬프트 + 모델별 힌트
    diagramBridge.ts  캔버스 모델↔AI 그래프 변환, operations 검증·적용, 자동정렬
    providers/
      index.ts        registry(USE_MOCK 토글, 모델→provider 매핑)
      mockProvider.ts 규칙기반 mock(키워드→샘플 operations)
      backendProvider.ts  실 LLM 공통 호출(/api/ai/<model>, 키는 백엔드 보관)
      copilotProvider.ts / claudeProvider.ts / openaiProvider.ts /
      geminiProvider.ts / localProvider.ts  모델별 provider
```

## 제약 / 주의사항

- **OneDrive 동기화 폴더** — 이 프로젝트는 OneDrive Desktop 아래에 있다. `node_modules`가
  실시간 동기화되면 설치/빌드가 느려지거나 파일 잠금이 생길 수 있다. 필요 시 해당 폴더를
  OneDrive 동기화 제외로 설정하는 것을 권장.
- **로고 CORS / 차단** — 로고는 외부 CDN(`cdn.simpleicons.org`, `logo.clearbit.com`)에서
  로드한다. 네트워크 차단·CORS·없는 slug인 경우 `<img onError>`가 Simple Icons → Clearbit →
  **회사명 텍스트 배지** 순으로 폴백한다. 또한 외부 이미지가 CORS로 캡처에 포함되지 않으면
  PNG에서 누락될 수 있다(배지 폴백은 정상 캡처됨).
- **File System Access API** — Chrome/Edge 계열에서만 `showSaveFilePicker`로 저장 위치를
  고를 수 있다. 미지원 브라우저(Firefox/Safari)는 자동으로 다운로드 폴더로 내려받는다.

---

## AI Assistant 패널 사용법

화면은 **3단 구조**다: 왼쪽 블록 팔레트 · 가운데 캔버스 · 오른쪽 AI Assistant 패널.
패널 헤더의 `▶`/`◀` 버튼으로 접기/펼치기 한다.

1. **모델 선택** — 상단 드롭다운에서 GitHub Copilot / Claude / GPT / Gemini / Local Model 선택.
2. **요청 입력** — 하단 입력창에 자연어로 입력하고 **실행**(또는 `Enter`, 줄바꿈은 `Shift+Enter`).
3. **미리보기** — AI는 캔버스를 바로 바꾸지 않고 **변경 제안(operations)** 을 패널에 요약해 보여준다.
4. **적용/취소** — **적용하기**를 누르면 제안이 순서대로 캔버스에 반영(한 번의 Undo로 되돌릴 수 있음).
   **취소하기**를 누르면 제안을 버린다.

### 할 수 있는 요청 예시

| 요청 | 결과 |
|---|---|
| "로그인 플로우 만들어줘" | 사용자 → 로그인 페이지 → 인증 서버 (+성공/실패 분기) 블록·연결 생성 |
| "회원가입 흐름 그려줘" | 가입 폼 → 유효성 검사 → 저장/오류 흐름 생성 |
| "성공/실패 조건 추가해줘" | 마름모(diamond) 분기 + 성공/실패 노드 추가 |
| "전체 보기 좋게 정리해줘" | `layoutDiagram` 으로 왼→오 자동 정렬 |
| "이 블록 이름 ○○로 바꿔줘" | 선택된 블록의 라벨 변경(`updateNode`) |
| "이 다이어그램 설명해줘" | 변경 없이 현재 흐름을 텍스트로 설명 |
| "현재 JSON 보여줘" | 현재 nodes/edges JSON 출력 |

### 안전한 적용 (설계 원칙)

- AI 응답은 **즉시 반영하지 않는다**. 먼저 미리보기로 요약 → 사용자가 적용을 눌러야 실행.
- 적용 전 **검증**(`validateOperations`): 존재하지 않는 node/edge id를 참조하거나 허용되지 않은
  블록 타입이면 **적용을 막고 경고**를 표시한다.
- 잘못된/빈 응답은 에러 메시지로 안내한다.

### 데이터 모델 (AI가 읽고 쓰는 형식)

```jsonc
{
  "nodes": [{ "id": "node-1", "type": "user|rectangle|diamond|rounded", "x": 100, "y": 200, "width": 120, "height": 60, "label": "사용자" }],
  "edges": [{ "id": "edge-1", "source": "node-1", "target": "node-2", "label": "요청" }]
}
```

AI 응답 형식:

```jsonc
{ "message": "로그인 흐름을 제안했습니다.", "operations": [ { "type": "addNode", "node": { /* ... */ } } ] }
```

지원 operation: `addNode` `updateNode` `deleteNode` `addEdge` `updateEdge` `deleteEdge` `moveNode` `layoutDiagram`.

### 실제 AI API 연동 (현재는 mock)

- 초기 버전은 `ai/providers/mockProvider.ts`(규칙 기반)로 동작한다.
- 실제 연동 시 `ai/providers/index.ts` 의 `USE_MOCK = false` 로 바꾼다.
- 각 provider 는 자체 백엔드 `/api/ai/<model>` 만 호출한다. **API Key는 프론트에 두지 않고 백엔드가 보관**한다.
- provider 는 공통 인터페이스를 따른다:

```ts
interface AIProvider {
  name: string;
  generateDiagramEdit(input: DiagramAIRequest): Promise<DiagramAIResponse>;
}
```

---

## VS Code + GitHub Copilot 개발 가이드 (학생용)

이 프로젝트는 VS Code + GitHub Copilot으로 이어서 개발하기 좋게 구성돼 있다.

### 1. GitHub Education 학생 인증
1. https://education.github.com/ 접속 → **Get benefits(Student)** 신청.
2. 학교 이메일 또는 재학 증명으로 인증(보통 며칠 내 승인).
3. 승인되면 **GitHub Copilot 무료** 등 Student Developer Pack 혜택을 받는다.

### 2. VS Code 설치
- https://code.visualstudio.com/ 에서 OS에 맞게 설치.
- 권장 확장: **ESLint**, **Prettier**, **TypeScript**(기본 내장).

### 3. GitHub Copilot 확장 설치
1. VS Code → Extensions(`Ctrl+Shift+X`)에서 **GitHub Copilot** 과 **GitHub Copilot Chat** 설치.
2. 우하단 안내로 GitHub 로그인(학생 인증된 계정).
3. 코드 작성 중 회색 제안이 뜨면 `Tab`으로 수락.

### 4. Copilot Chat 사용법
- `Ctrl+Alt+I`(또는 사이드바 Chat 아이콘)로 Chat 패널 열기.
- 파일을 연 채 질문하면 해당 파일을 문맥으로 답한다. `/explain`, `/fix`, `/tests` 슬래시 명령 활용.
- 코드 블록 선택 후 우클릭 → **Copilot** 메뉴로 인라인 수정 요청 가능.

### 5. (Copilot Chat의) 모델 선택 드롭다운 사용법
- Copilot Chat 입력창 하단/우측의 **모델 선택 드롭다운**에서 사용할 모델을 고른다.
- 단순 자동완성은 빠른 모델, 복잡한 리팩터링·설계는 더 강한 모델을 선택하면 좋다.
- (참고) 이 앱의 우측 AI Assistant 패널에도 동일한 컨셉의 모델 드롭다운이 있다 — UI와 호출 로직이
  분리돼 있어 나중에 실제 모델을 붙이기 쉽다.

### 6. 이 프로젝트에서 Copilot에게 줄 추천 프롬프트

> 이 프로젝트는 draw.io와 비슷한 웹 기반 다이어그램 편집기입니다.
> 왼쪽 블록 팔레트, 중앙 캔버스, 오른쪽 AI Assistant 패널로 구성됩니다.
> 블록 타입은 사용자 원형, 사각형, 마름모, 둥근 사각형입니다.
> 현재 다이어그램 상태는 nodes와 edges JSON으로 관리합니다.
> AI Assistant는 사용자의 자연어 요청을 받아 다이어그램 수정 operations JSON을 생성해야 합니다.
> React 컴포넌트 구조를 유지하면서 기능을 단계적으로 구현해주세요.
> 먼저 UI 레이아웃을 만들고, 그다음 블록 드래그 앤 드롭, 연결선, 저장/불러오기, AI Assistant 패널 순서로 구현해주세요.

추가로 유용한 작업별 프롬프트:
- "`ai/providers/claudeProvider.ts`가 실제 Claude API를 백엔드 경유로 호출하도록 구현해줘. API Key는 프론트에 넣지 말고 `/api/ai/claude` 엔드포인트를 쓰는 전제로."
- "`mockProvider`에 '결제 플로우' 시나리오를 키워드 매칭으로 추가해줘. 기존 규칙 테이블 형식을 따라줘."
- "`diagramBridge.ts`의 `layout()`을 위→아래(TB) 방향도 더 깔끔하게 배치하도록 개선해줘."

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
    LogoGrid.tsx      로고 칩 + onError 폴백(Simple Icons → Clearbit → 텍스트 배지)
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

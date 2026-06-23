import { forwardRef, useEffect, useRef, useState } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import { useViewportStore, MIN_ZOOM, MAX_ZOOM } from "../store/useViewportStore";
import DiagramBlock from "./DiagramBlock";
import ArrowElement from "./ArrowElement";
import ImageElementView from "./ImageElementView";
import SmartGuideOverlay from "./SmartGuideOverlay";
import GroupSelectionBox from "./GroupSelectionBox";
import { refsInMarquee, type Rect } from "../utils/selection";
import { CANVAS_H, CANVAS_W } from "../utils/anchors";

const Canvas = forwardRef<HTMLDivElement>(function Canvas(_props, ref) {
  const blocks = useDiagramStore((s) => s.blocks);
  const arrows = useDiagramStore((s) => s.arrows);
  const images = useDiagramStore((s) => s.images);
  const smartGuides = useDiagramStore((s) => s.smartGuides);
  const clearSelection = useDiagramStore((s) => s.clearSelection);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const closeLogoPicker = useDiagramStore((s) => s.closeLogoPicker);

  const zoom = useViewportStore((s) => s.zoom);

  const innerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);

  // Ctrl + 휠 = 캔버스 줌(브라우저 배율 변경 차단). 마우스 위치 기준으로 보정.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const old = useViewportStore.getState().zoom;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, old + (e.deltaY > 0 ? -0.1 : 0.1)));
      if (next === old) return;
      // 마우스 아래의 캔버스 좌표가 줌 후에도 같은 화면 위치에 유지되도록 스크롤 보정.
      const px = e.clientX - rect.left + wrap.scrollLeft;
      const py = e.clientY - rect.top + wrap.scrollTop;
      const canvasX = px / old;
      const canvasY = py / old;
      useViewportStore.getState().setZoom(next);
      requestAnimationFrame(() => {
        wrap.scrollLeft = canvasX * next - (e.clientX - rect.left);
        wrap.scrollTop = canvasY * next - (e.clientY - rect.top);
      });
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, []);

  const setRefs = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  // Background drag = marquee selection (canvas px === screen px, scale 1).
  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    const node = innerRef.current;
    if (!node) return;
    const startCX = e.clientX;
    const startCY = e.clientY;
    const additive = e.shiftKey;

    if (!additive) clearSelection();
    closeLogoPicker();

    // 매 프레임 최신 rect/zoom 으로 변환(드래그 중 스크롤/줌에도 start·cur 가 같은 기준).
    const toCanvas = (clientX: number, clientY: number) => {
      const rect = node.getBoundingClientRect();
      const z = useViewportStore.getState().zoom;
      return { x: (clientX - rect.left) / z, y: (clientY - rect.top) / z };
    };
    const boxOf = (cx: number, cy: number): Rect => {
      const s = toCanvas(startCX, startCY);
      const c = toCanvas(cx, cy);
      return {
        x: Math.min(s.x, c.x),
        y: Math.min(s.y, c.y),
        width: Math.abs(c.x - s.x),
        height: Math.abs(c.y - s.y),
      };
    };

    const onMove = (ev: PointerEvent) => setMarquee(boxOf(ev.clientX, ev.clientY));
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const box = boxOf(ev.clientX, ev.clientY);
      setMarquee(null);
      // Treat as a real marquee only if the user actually dragged.
      if (box.width < 3 && box.height < 3) return;
      const st = useDiagramStore.getState();
      const hits = refsInMarquee(box, st, "intersects");
      if (additive) {
        const merged = [...st.selection];
        const has = (t: string, id: string) => merged.some((r) => r.type === t && r.id === id);
        for (const h of hits) if (!has(h.type, h.id)) merged.push(h);
        setSelection(merged);
      } else {
        setSelection(hits);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      {/* sizer 가 줌된 스크롤 영역을 잡고, .canvas 는 원본 크기 + transform:scale. */}
      <div className="canvas-sizer" style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}>
        <div
          className="canvas"
          ref={setRefs}
          onPointerDown={onBackgroundPointerDown}
          style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}
        >
        {/* 모든 요소가 같은 CSS z-index 평면에서 zIndex 로 정렬된다(Photoshop 식). */}
        {blocks.map((block) => (
          <DiagramBlock key={block.id} block={block} canvasRef={innerRef} />
        ))}
        {arrows.map((arrow) => (
          <ArrowElement key={arrow.id} arrow={arrow} />
        ))}
        {images.map((img) => (
          <ImageElementView key={img.id} img={img} />
        ))}
        {/* Smart alignment guides + group selection box on top (below selection handles). */}
        <SmartGuideOverlay guides={smartGuides} />
        <GroupSelectionBox />
        {marquee && (
          <div
            className="marquee-selection-box"
            data-no-export="true"
            style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
          />
        )}
        </div>
      </div>
    </div>
  );
});

export default Canvas;

import { useEffect } from "react";
import { useViewportStore } from "../store/useViewportStore";
import { useDiagramStore } from "../store/useDiagramStore";

/** 우클릭 레이어 메뉴: 맨 앞/앞/뒤/맨 뒤로 보내기. 마우스 위치에 표시. */
export default function ContextMenu() {
  const menu = useViewportStore((s) => s.contextMenu);
  const close = useViewportStore((s) => s.closeContextMenu);
  const bringToFront = useDiagramStore((s) => s.bringToFront);
  const bringForward = useDiagramStore((s) => s.bringForward);
  const sendBackward = useDiagramStore((s) => s.sendBackward);
  const sendToBack = useDiagramStore((s) => s.sendToBack);

  // 외부 클릭 / ESC 로 닫기.
  useEffect(() => {
    if (!menu) return;
    const onDown = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;

  const ref = menu.ref;
  const run = (fn: (r: typeof ref) => void) => () => {
    fn(ref);
    close();
  };

  const items: { label: string; fn: () => void }[] = [
    { label: "맨 앞으로 보내기", fn: run(bringToFront) },
    { label: "앞으로 보내기", fn: run(bringForward) },
    { label: "뒤로 보내기", fn: run(sendBackward) },
    { label: "맨 뒤로 보내기", fn: run(sendToBack) },
  ];

  return (
    <div
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      // 메뉴 자체 클릭이 외부-클릭 닫기로 잡히지 않도록.
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it) => (
        <button key={it.label} className="context-menu__item" onClick={it.fn}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

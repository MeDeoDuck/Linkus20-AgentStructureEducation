import { useState } from "react";
import type { AIType } from "../types";
import { AI_TYPE_LABELS } from "../data/logoSources";

interface AIModalProps {
  onClose: () => void;
  /** Open the bottom-sheet logo picker for the chosen category. */
  onPickCategory: (aiType: Exclude<AIType, "custom">) => void;
  onApplyText: (text: string) => void;
}

const AI_BUTTONS: Exclude<AIType, "custom">[] = [
  "generative",
  "speechToText",
  "textToImage",
  "imageOrTextToVideo",
];

export default function AIModal({ onClose, onPickCategory, onApplyText }: AIModalProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");

  const handleCategory = (aiType: Exclude<AIType, "custom">) => {
    onPickCategory(aiType);
    onClose();
  };

  const handleCustomSubmit = () => {
    const text = customText.trim();
    if (!text) return;
    onApplyText(text);
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose} data-no-export="true">
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        {!customMode ? (
          <>
            <h3 className="modal__title">블록 유형 선택</h3>
            <div className="modal__list">
              {AI_BUTTONS.map((type) => (
                <button key={type} className="modal__btn" onClick={() => handleCategory(type)}>
                  {AI_TYPE_LABELS[type]}
                </button>
              ))}
              <button className="modal__btn" onClick={() => setCustomMode(true)}>
                직접 입력
              </button>
            </div>
            <button className="btn modal__close" onClick={onClose}>
              닫기
            </button>
          </>
        ) : (
          <div className="modal__custom">
            <h3 className="modal__title">직접 입력</h3>
            <input
              className="modal__input"
              autoFocus
              value={customText}
              placeholder="블록에 표시할 텍스트"
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomSubmit();
              }}
            />
            <div className="modal__actions">
              <button className="btn" onClick={() => setCustomMode(false)}>
                뒤로
              </button>
              <button className="btn btn--primary" onClick={handleCustomSubmit}>
                적용
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

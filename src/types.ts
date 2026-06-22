export type BlockType = "user" | "rectangle" | "diamond" | "rounded";
export type AIType = "generative" | "speechToText" | "textToImage" | "imageOrTextToVideo" | "custom";

export interface BlockLogo {
  name: string;
  logoUrl?: string;
}

export interface DiagramBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  aiType?: AIType;
  logos?: BlockLogo[];
}

export interface ArrowElement {
  id: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
  curve: number;
}

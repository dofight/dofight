/** One line of text read by the Windows OCR, with its box in the game window's client pixels. */
export interface OcrLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

import { t } from "../i18n";

const timers = new WeakMap<Document, ReturnType<typeof setTimeout>>();

/** « Copié » (or « Copie impossible ») at the bottom centre of the window the copy was made in, for 1 s. A second
 * copy replaces the first message (owner, 2026-11-22). Given `within`, inside that box, at its bottom: a sheet's window
 * can be taller than the sheet on macOS, and the toast then showed below the sheet, on nothing (owner, 2026-11-22). */
export function showToast(doc: Document, ok: boolean, within?: HTMLElement): void {
  let toast = doc.querySelector<HTMLElement>(".toast");
  if (!toast) {
    toast = doc.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
  }
  if (toast.parentElement !== (within ?? doc.body)) (within ?? doc.body).append(toast);
  toast.classList.toggle("in-box", !!within);
  toast.textContent = t(ok ? "access.copied" : "access.copyFailed");
  toast.classList.toggle("failed", !ok);
  clearTimeout(timers.get(doc));
  timers.set(doc, setTimeout(() => toast!.remove(), 1000));
}

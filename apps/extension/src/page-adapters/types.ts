export interface PageAdapterResult {
  ok: boolean;
  text?: string;
  error?: "unsupportedPageAdapter" | "emptyResult";
}

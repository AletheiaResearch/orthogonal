// @orthogonal/ui/ai — Tier-2 barrel (AI Elements-style agentic primitives).
// Net-new decoupled components, plus AI-friendly aliases of three generic Tier-1 components.

export * from "./actions";
export * from "./code-block";
export * from "./conversation";
export * from "./loader";
export * from "./message";
export * from "./prompt-input";
export * from "./reasoning";
export * from "./sources";
export * from "./suggestion";
export * from "./task";
export * from "./tool";
export * from "./tool-group";
export * from "./web-preview";

// AI-Elements-style aliases of generic Tier-1 components (single implementation, friendlier names).
export { SafeMarkdown as Response } from "../safe-markdown";
export { MediaLightbox as Lightbox } from "../media-lightbox";
export { ScreenshotArtifactCard as Image } from "../screenshot-artifact-card";

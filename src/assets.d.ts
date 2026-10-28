// Vite asset imports used by the game (the project doesn't pull in vite/client types).
declare module "*.glb?inline" {
  /** The file as a base64 data URL, bundled into the JS (keeps the build a single file). */
  const dataUrl: string;
  export default dataUrl;
}

declare module "*.png?inline" {
  /** The picture as a base64 data URL, bundled into the JS. */
  const dataUrl: string;
  export default dataUrl;
}

declare module "*?raw" {
  /** The file's text, bundled into the JS. */
  const text: string;
  export default text;
}

/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.txt?raw' {
  const content: string;
  export default content;
}

declare module '*.xml?raw' {
  const content: string;
  export default content;
}

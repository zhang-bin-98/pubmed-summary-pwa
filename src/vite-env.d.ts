/// <reference types="vite/client" />

declare module '*.txt?raw' {
  const content: string;
  export default content;
}

declare module '*.xml?raw' {
  const content: string;
  export default content;
}

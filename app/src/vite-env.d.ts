/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" to use fake servers and players instead of calling real servers. */
  readonly VITE_MOCK_API?: string;
}

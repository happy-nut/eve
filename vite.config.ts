import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // TAURI_ENV_PLATFORM (set by the tauri CLI while it builds) lets a phone build leave out desktop-only weight
  envPrefix: ['VITE_', 'TAURI_ENV_PLATFORM'],
  // loaded on first use (the emoji picker, Settings' QR code): the dev server's scan of the code does not reach them, so
  // it found them only when first opened, bundled them then and reloaded the page under whatever was going on there
  optimizeDeps: { include: ['emoji-picker-element', 'uqr'] },
})

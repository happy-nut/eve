import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // TAURI_ENV_PLATFORM (set by the tauri CLI while it builds) lets a phone build leave out desktop-only weight
  envPrefix: ['VITE_', 'TAURI_ENV_PLATFORM'],
})

import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  // Use the 2023 preset — generates 192/512 + maskable + apple-touch-icon
  // sized to current platform recommendations.
  preset: {
    ...minimal2023Preset,
    // Keep the brand background colour behind the maskable icon so the
    // shield doesn't sit on a transparent square that looks weird with
    // round/rounded mask shapes on Android launchers.
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: '#0e2b6e' },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: '#0e2b6e' },
    },
  },
  images: ['public/favicon.svg'],
})

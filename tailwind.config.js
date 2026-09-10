/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1E3A8A',
        'accent-normal': '#16A34A',
        'accent-warning': '#F59E0B',
        'accent-critical': '#DC2626',
        'app-bg': '#F8FAFC',
        // Darker variants of the two accents above, used only where the color
        // renders as small text on a light background. #16A34A/#F59E0B are the
        // documented brand hexes (kept for badge/icon/border fills) but at text
        // size on white they land at ~3.3:1 / ~1.9:1 contrast — below WCAG AA's
        // 4.5:1 for normal text. These pass (~5:1).
        'accent-normal-text': '#15803D',
        'accent-warning-text': '#B45309',
      },
    },
  },
  plugins: [],
}


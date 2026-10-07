/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        red: {
          50: '#fff1f1',
          100: '#ffe1e1',
          200: '#ffc7c7',
          300: '#ffa0a0',
          400: '#ff6b6b',
          500: '#ff3838',
          600: '#e81111',
          700: '#c20a0a',
          800: '#a00d0d',
          900: '#841212',
          950: '#2d0000',
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.08)',
          medium: 'rgba(255, 255, 255, 0.12)',
          heavy: 'rgba(255, 255, 255, 0.18)',
        }
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'clay': '8px 8px 16px rgba(45, 0, 0, 0.3), -8px -8px 16px rgba(139, 0, 0, 0.1), inset 2px 2px 4px rgba(255, 255, 255, 0.1), inset -2px -2px 4px rgba(0, 0, 0, 0.2)',
        'clay-sm': '4px 4px 8px rgba(45, 0, 0, 0.3), -4px -4px 8px rgba(139, 0, 0, 0.1), inset 1px 1px 2px rgba(255, 255, 255, 0.1), inset -1px -1px 2px rgba(0, 0, 0, 0.2)',
        'clay-inset': 'inset 4px 4px 8px rgba(45, 0, 0, 0.3), inset -4px -4px 8px rgba(139, 0, 0, 0.1)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(220, 20, 60, 0.5), 0 0 10px rgba(220, 20, 60, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(220, 20, 60, 0.8), 0 0 40px rgba(220, 20, 60, 0.4)' },
        }
      }
    },
  },
  safelist: [
    { pattern: /^border-(sky|blue|cyan|purple|orange|red|green)-(500\/30|900\/20)$/ },
    { pattern: /^text-(sky|blue|cyan|purple|orange|red|green)-(400|500)$/ },
    { pattern: /^bg-(sky|blue|cyan|purple|orange|red|green)-(900\/20|900\/40)$/ },
    { pattern: /^from-(sky|blue|cyan|purple|orange|red|green)-(600\/20|900\/30)$/ },
    { pattern: /^bg-(sky|blue|cyan|purple|orange|red|green)-500$/ },
    { pattern: /^border-(sky|blue|cyan|purple|orange|red|green)-500$/ },
    { pattern: /^bg-(sky|blue|cyan|purple|orange|red|green)-500\/20$/ },
    { pattern: /^border-(sky|blue|cyan|purple|orange|red|green)-500\/60$/ },
    { pattern: /^hover:bg-(sky|blue|cyan|purple|orange|red|green)-900\/20$/ },
  ],
  plugins: [],
}
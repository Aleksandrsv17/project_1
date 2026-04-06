/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vip: {
          dark: '#1a1a2e',
          darker: '#0f0f1a',
          gold: '#c9a84c',
          'gold-light': '#e8c97a',
        },
      },
    },
  },
  plugins: [],
};

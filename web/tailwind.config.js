module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vip: {
          dark:  '#1a1a2e',
          mid:   '#16213e',
          gold:  '#c9a84c',
          light: '#e8c97a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

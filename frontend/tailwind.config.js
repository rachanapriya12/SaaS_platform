/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef4ff',
          100: '#dbe7ff',
          200: '#bccfff',
          300: '#8eaeff',
          400: '#5e85ff',
          500: '#3d62fb',
          600: '#2845e7',
          700: '#2236be',
          800: '#1f3199',
          900: '#1c2c7a',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.05), 0 1px 1px rgba(15,23,42,0.04)',
      },
    },
  },
  plugins: [],
};

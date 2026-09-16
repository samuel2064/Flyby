/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9edff',
          500: '#0b72d9',
          600: '#0a63bd',
          700: '#0d539c',
          900: '#0f3a66',
        },
      },
    },
  },
  plugins: [],
}

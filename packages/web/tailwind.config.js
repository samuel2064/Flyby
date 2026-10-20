/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#0ea5e9',
        brandDark: '#0284c7',
      },
    },
  },
  plugins: [],
}

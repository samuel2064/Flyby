/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // TIR-463: the brand family is Tailwind's sky scale (brand === sky-500,
        // brandDark === sky-600). Shade-suffixed classes (bg-brand-600,
        // ring-brand-500/40, ...) shipped across Home, Dashboard, onboarding
        // and AirportDetail but generated no CSS while `brand` was a flat
        // string - only the unsuffixed utilities resolved. DEFAULT keeps
        // bg-brand / text-brand working; brandDark stays for legacy classes.
        brand: {
          DEFAULT: '#0ea5e9',
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        brandDark: '#0284c7',
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
// TIR-463 / TIR-368 rev.4: the deploy ramp (#0b72d9) is the brand palette of
// record (production-validated, AA with white labels). Sky values fail AA on
// white (brand-500 #0ea5e9 = 2.77:1) and must not return. Only shades that
// exist on live are kept (50, 100, 500, 600, 700, 900); 200/300/400/800/950
// are omitted to avoid convergence drift with the deploy repo.
// CommonJS format: PostCSS/Tailwind config loading expects module.exports
// (not ESM export default), otherwise sucrase chokes on `export default`.
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0b72d9',
          50: '#eef7ff',
          100: '#d9edff',
          500: '#0b72d9',
          600: '#0a63bd',
          700: '#0d539c',
          900: '#0f3a66',
        },
        brandDark: '#0a63bd',
      },
    },
  },
  plugins: [],
}

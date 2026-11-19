// TIR-469: without this file the tailwindcss/autoprefixer devDependencies are
// never registered as PostCSS plugins, so the @tailwind directives in
// src/index.css pass through uncompiled (vite's default PostCSS pipeline had
// nothing to run) and the app shipped with zero real CSS.
// CommonJS format: PostCSS config loading expects module.exports (not ESM
// export default), otherwise sucrase chokes on `export default`.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

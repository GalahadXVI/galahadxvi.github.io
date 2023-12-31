/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  darkMode: 'class',
  mode: 'jit',
  content: [
      './public/*.html',
      './public/blog/*.html',
      './src/*.html',
      './src/pages/*.html'
  ],
  theme: {
    extend: {

    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography')
  ],
}


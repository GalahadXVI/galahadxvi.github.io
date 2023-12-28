/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  darkMode: 'class',
  mode: 'jit',
  content: [
      './*.html'
  ],
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/forms')],
}


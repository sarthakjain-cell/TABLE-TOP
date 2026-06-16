/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#F97316',
          dark: '#111827',
        }
      },
      boxShadow: {
        'brutal': '4px 4px 0px rgba(0,0,0,1)',
        'brutal-sm': '2px 2px 0px rgba(0,0,0,1)',
        'brutal-hover': '2px 2px 0px rgba(0,0,0,1)',
      }
    },
  },
  plugins: [],
}

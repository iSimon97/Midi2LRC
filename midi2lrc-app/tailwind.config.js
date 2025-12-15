/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'background': '#0f0f0f',
        'background-light': '#1a1a1a',
        'background-hover': '#252525',
        'accent': '#22c55e',
        'accent-hover': '#16a34a',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(34, 197, 94, 0.1)',
      }
    },
  },
  plugins: [],
}

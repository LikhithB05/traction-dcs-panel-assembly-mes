/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bhel: {
          blue: '#1E40AF',
          navy: '#0F172A',
          purple: '#7C3AED',
          green: '#059669',
          orange: '#EA580C',
          slate: '#475569',
          indigo: '#4F46E5'
        }
      }
    },
  },
  plugins: [],
}

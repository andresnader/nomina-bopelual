/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          950: '#020617',
          900: '#0a0e1a',
          800: '#0f172a',
          700: '#1a2332',
          600: '#1e293b',
          500: '#334155',
          400: '#475569',
          300: '#64748b',
          200: '#94a3b8',
          100: '#cbd5e1',
          50: '#f1f5f9',
        },
        gold: {
          DEFAULT: '#ffca3f',
          50: '#fff9e6',
          100: '#fff0b8',
          200: '#ffe78a',
          300: '#ffdd5c',
          400: '#ffca3f',
          500: '#f5b81e',
          600: '#d49a0f',
          700: '#a87800',
          800: '#7c5800',
          900: '#503800',
        },
        surface: {
          DEFAULT: '#0f172a',
          light: '#1a2332',
          hover: '#1e293b',
          border: '#1e293b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(255, 202, 63, 0.15)',
        'glow-sm': '0 0 10px rgba(255, 202, 63, 0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(255, 202, 63, 0.1)' },
          '50%': { boxShadow: '0 0 20px rgba(255, 202, 63, 0.2)' },
        },
      },
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // The full palette from CLAUDE.md §4 — no other colours exist.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      canvas: '#0B0F10',
      surface: '#111819',
      'surface-raised': '#161F21',
      line: '#1E2A2C',
      'line-bright': '#2A3A3D',
      ink: '#E6EDEE',
      'ink-dim': '#8A9A9D',
      'ink-faint': '#5C6B6E',
      live: '#2DD4BF',
      warn: '#E8A33D',
      alert: '#F87171',
    },
    fontFamily: {
      sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
      mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
    },
    // The type scale from CLAUDE.md §4 — nothing between these.
    fontSize: {
      'screen-title': ['22px', { lineHeight: '28px', fontWeight: '500' }],
      'card-title': ['13px', { lineHeight: '18px', fontWeight: '400' }],
      metric: ['28px', { lineHeight: '34px', fontWeight: '500' }],
      'metric-sm': ['17px', { lineHeight: '24px', fontWeight: '400' }],
      label: ['11px', { lineHeight: '14px', fontWeight: '400' }],
      body: ['14px', { lineHeight: '20px', fontWeight: '400' }],
    },
    fontWeight: {
      normal: '400',
      medium: '500',
    },
    borderWidth: {
      DEFAULT: '0.5px',
      0: '0',
    },
    borderRadius: {
      none: '0',
      ctl: '8px',
      card: '10px',
      shell: '28px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
    },
    extend: {
      transitionTimingFunction: {
        instrument: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'boot-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pulse-sync': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
      animation: {
        'boot-in': 'boot-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-sync': 'pulse-sync 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

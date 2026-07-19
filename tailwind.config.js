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
      // The only shadows in the app: soft teal emission, never elevation.
      'glow-sm': '0 0 6px 0 rgba(45, 212, 191, 0.45)',
      glow: '0 0 14px 0 rgba(45, 212, 191, 0.3)',
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
        // Ambient wash at the top of the canvas breathes very slowly.
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        // Glint sweeping the top hairline: moves for ~half the cycle, rests
        // for the other half. Opacity-gated so it never pops in mid-screen.
        scan: {
          '0%': { transform: 'translateX(-30vw)', opacity: '0' },
          '8%': { opacity: '0.8' },
          '42%': { opacity: '0.8' },
          '50%, 100%': { transform: 'translateX(100vw)', opacity: '0' },
        },
        // Faint halo behind a live endpoint, phase-locked to the sync dot.
        halo: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.08' },
        },
        // Energy pass through an on-target bar: sweeps, then rests.
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '45%, 100%': { transform: 'translateX(2400%)' },
        },
      },
      animation: {
        'boot-in': 'boot-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-sync': 'pulse-sync 2s ease-in-out infinite',
        breathe: 'breathe 9s ease-in-out infinite',
        scan: 'scan 9s cubic-bezier(0.45, 0, 0.55, 1) infinite',
        halo: 'halo 2s ease-in-out infinite',
        shimmer: 'shimmer 3.5s cubic-bezier(0.45, 0, 0.55, 1) infinite',
      },
    },
  },
  plugins: [],
}

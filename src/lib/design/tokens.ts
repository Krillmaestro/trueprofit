/**
 * TrueProfit Design Tokens
 * Central design system definitions
 * Inspired by Linear/Stripe - Clean & Minimal
 */

// ===========================================
// COLOR PALETTE
// ===========================================

export const colors = {
  // Neutral colors - Primary palette
  neutral: {
    50: '#f8fafc',   // slate-50 - Lightest background
    100: '#f1f5f9',  // slate-100 - Light background
    200: '#e2e8f0',  // slate-200 - Borders, dividers
    300: '#cbd5e1',  // slate-300 - Disabled state
    400: '#94a3b8',  // slate-400 - Placeholder text
    500: '#64748b',  // slate-500 - Secondary text
    600: '#475569',  // slate-600 - Body text
    700: '#334155',  // slate-700 - Strong text
    800: '#1e293b',  // slate-800 - Headings
    900: '#0f172a',  // slate-900 - Darkest text
    950: '#020617',  // slate-950 - Almost black
  },

  // Brand/Accent - Used sparingly
  accent: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',  // Primary blue - CTAs, links
    600: '#2563eb',  // Hover state
    700: '#1d4ed8',  // Active/pressed state
    800: '#1e40af',
    900: '#1e3a8a',
  },

  // Semantic colors
  success: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',  // Primary green - Profit, positive values
    600: '#059669',
    700: '#047857',
  },

  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',  // Primary amber - Warnings
    600: '#d97706',
    700: '#b45309',
  },

  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',  // Primary red - Errors, losses
    600: '#dc2626',
    700: '#b91c1c',
  },

  // Special colors
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const

// ===========================================
// TYPOGRAPHY
// ===========================================

export const typography = {
  // Font family
  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
    mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
  },

  // Font sizes (in rem, base 16px)
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
  },

  // Font weights
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  // Line heights
  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },

  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const

// Typography presets
export const typographyPresets = {
  // Page title - H1
  pageTitle: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.tight,
    letterSpacing: typography.letterSpacing.tight,
    color: colors.neutral[900],
  },

  // Section title - H2
  sectionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.snug,
    color: colors.neutral[900],
  },

  // Card title - H3
  cardTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.snug,
    color: colors.neutral[900],
  },

  // Label - Uppercase small text
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.normal,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase' as const,
    color: colors.neutral[500],
  },

  // Body text
  body: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.normal,
    lineHeight: typography.lineHeight.relaxed,
    color: colors.neutral[600],
  },

  // Small text
  small: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.normal,
    lineHeight: typography.lineHeight.normal,
    color: colors.neutral[500],
  },

  // Caption
  caption: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.normal,
    color: colors.neutral[400],
  },

  // Metric value (large numbers)
  metricValue: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.none,
    letterSpacing: typography.letterSpacing.tight,
    color: colors.neutral[900],
  },

  // Metric value small
  metricValueSmall: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.none,
    color: colors.neutral[900],
  },
} as const

// ===========================================
// SPACING
// ===========================================

export const spacing = {
  px: '1px',
  0: '0',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
} as const

// ===========================================
// BORDERS & RADIUS
// ===========================================

export const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  DEFAULT: '0.25rem', // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
} as const

export const borderWidth = {
  DEFAULT: '1px',
  0: '0',
  2: '2px',
  4: '4px',
  8: '8px',
} as const

// ===========================================
// SHADOWS
// ===========================================

export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',

  // Custom shadows for cards
  card: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
  cardHover: '0 4px 12px 0 rgb(0 0 0 / 0.08)',

  // Inner shadows
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
} as const

// ===========================================
// TRANSITIONS
// ===========================================

export const transitions = {
  // Durations
  duration: {
    75: '75ms',
    100: '100ms',
    150: '150ms',
    200: '200ms',
    300: '300ms',
    500: '500ms',
    700: '700ms',
    1000: '1000ms',
  },

  // Timing functions
  timing: {
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // Presets
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const

// ===========================================
// Z-INDEX
// ===========================================

export const zIndex = {
  hide: -1,
  auto: 'auto',
  base: 0,
  docked: 10,
  dropdown: 1000,
  sticky: 1100,
  banner: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  skipLink: 1600,
  toast: 1700,
  tooltip: 1800,
} as const

// ===========================================
// BREAKPOINTS
// ===========================================

export const breakpoints = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const

// ===========================================
// COMPONENT SIZES
// ===========================================

export const componentSizes = {
  // Button sizes
  button: {
    sm: { height: '32px', paddingX: '12px', fontSize: typography.fontSize.xs },
    md: { height: '40px', paddingX: '16px', fontSize: typography.fontSize.sm },
    lg: { height: '48px', paddingX: '24px', fontSize: typography.fontSize.base },
  },

  // Input sizes
  input: {
    sm: { height: '32px', paddingX: '12px', fontSize: typography.fontSize.sm },
    md: { height: '40px', paddingX: '14px', fontSize: typography.fontSize.sm },
    lg: { height: '48px', paddingX: '16px', fontSize: typography.fontSize.base },
  },

  // Icon sizes
  icon: {
    xs: '12px',
    sm: '16px',
    md: '20px',
    lg: '24px',
    xl: '32px',
  },

  // Avatar sizes
  avatar: {
    xs: '24px',
    sm: '32px',
    md: '40px',
    lg: '48px',
    xl: '64px',
  },
} as const

// ===========================================
// EXPORT ALL TOKENS
// ===========================================

export const tokens = {
  colors,
  typography,
  typographyPresets,
  spacing,
  borderRadius,
  borderWidth,
  shadows,
  transitions,
  zIndex,
  breakpoints,
  componentSizes,
} as const

export default tokens

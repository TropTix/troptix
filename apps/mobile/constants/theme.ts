export const colors = {
  bg: '#FAF8F4', // warm cream (matches usetroptix.com hero)
  surface: '#FFFFFF',
  surface2: '#F8F9FA', // slate-50
  border: '#E2E8F0', // slate-200
  border2: '#CBD5E1', // slate-300
  text: '#0F172A', // slate-900
  textSub: '#475569', // slate-600
  textMuted: '#64748B', // slate-500
  accent: '#6366F1', // indigo primary (hsl 239 84% 67%)
  accentDim: 'rgba(99,102,241,0.1)',
  success: '#059669', // emerald-600
  successDim: 'rgba(5,150,105,0.08)',
  error: '#EF4444',
  errorDim: 'rgba(239,68,68,0.08)',
  warning: '#F97316',
  warningDim: 'rgba(249,115,22,0.08)',
} as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
} as const;

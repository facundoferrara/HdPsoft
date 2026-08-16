const CLUB_GRADIENTS = {
  'Sol del Norte': [
    'rgba(163,5,5,0.45)',
    'rgba(217,138,28,0.30)',
  ],
  'Cruz del Sur': [
    'rgba(15,5,163,0.42)',
    'rgba(184,184,184,0.22)',
  ],
  'FadW': [
    'rgba(255,255,255,0.35)',
    'rgba(116,172,223,0.40)',
  ],
  'Vincere': [
    'rgba(60,110,210,0.45)',
    'rgba(80,130,230,0.20)',
  ],
  'Independiente': [
    'rgba(160,160,160,0.35)',
    'rgba(255,255,255,0.15)',
  ],
  'Duelist Academy': [
    'rgba(200,40,40,0.38)',
    'rgba(255,255,255,0.15)',
    'rgba(40,40,200,0.32)',
  ],
  'SMCD': [
    'rgba(161,10,10,0.45)',
    'rgba(217,138,28,0.30)',
  ],
  'Motus': [
    'rgba(139,20,20,0.45)',
    'rgba(80,10,10,0.30)',
  ],
}

export function clubGradient(club) {
  const stops = CLUB_GRADIENTS[club]
  if (!stops) return undefined
  if (stops.length === 2) {
    return `linear-gradient(to right, ${stops[0]} 0%, ${stops[1]} 100%)`
  }
  return `linear-gradient(to right, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 100%)`
}

const MEDAL_BORDERS = [
  '1px solid rgba(212,175,55,0.7)',
  '1px solid rgba(192,192,192,0.6)',
  '1px solid rgba(176,141,87,0.55)',
]

export function medalBorder(rank) {
  return MEDAL_BORDERS[rank] ?? undefined
}

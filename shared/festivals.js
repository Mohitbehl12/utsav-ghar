/**
 * Store sections (header navigation). Each category belongs to one section
 * (categories.segment). The current festival itself is a simple store setting
 * (Admin → Payment & Store → Current festival), changed when a new festival comes.
 */

export const SEGMENTS = [
  {
    slug: 'festive-decor', name: 'Festive Décor', name_hi: 'त्योहार सजावट', icon: '✨',
    tagline: 'Diyas, lights, rangoli, torans and décor for every celebration',
    theme: { primary: '#5C0F22', hover: '#7A1630', dark: '#1D1030', mid: '#5C1A33', accent: '#E9C46A' },
    art: [{ type: 'akash', tone: 'maroon' }, { type: 'lights', tone: 'navy' }],
  },
  {
    slug: 'pooja', name: 'Pooja & Spiritual', name_hi: 'पूजा', icon: '🛕',
    tagline: 'Thalis, kalash, bells, incense and sacred décor for daily worship',
    theme: { primary: '#8A3A0C', hover: '#A5480F', dark: '#2B1206', mid: '#6B2A08', accent: '#F2C14E' },
    art: [{ type: 'thali', tone: 'gold' }, { type: 'kalash', tone: 'orange' }],
  },
  {
    slug: 'home-decor', name: 'Home Décor', name_hi: 'घर की सजावट', icon: '🏠',
    tagline: 'Urlis, cushions, runners and brass accents that stay up all year',
    theme: { primary: '#2E3A6E', hover: '#3C4A88', dark: '#101533', mid: '#26305E', accent: '#E6C067' },
    art: [{ type: 'urli', tone: 'gold' }, { type: 'cushion', tone: 'navy' }],
  },
  {
    slug: 'dining', name: 'Crockery & Dining', name_hi: 'क्रॉकरी', icon: '🍽️',
    tagline: 'Dinner sets, serving bowls, tea cups and glassware for guests',
    theme: { primary: '#1D5563', hover: '#256B7C', dark: '#0A2229', mid: '#174652', accent: '#E8C27A' },
    art: [{ type: 'dinner-set', tone: 'cream' }, { type: 'cup-saucer', tone: 'teal' }],
  },
  {
    slug: 'kitchen', name: 'Kitchen', name_hi: 'रसोई', icon: '🍳',
    tagline: 'Kadhais, cookware, masala dabbas, jars and everyday tools',
    theme: { primary: '#8C3B1A', hover: '#A64A22', dark: '#2A1208', mid: '#6E2E13', accent: '#F0C65A' },
    art: [{ type: 'kadhai', tone: 'navy' }, { type: 'masala', tone: 'cream' }],
  },
  {
    slug: 'gifts', name: 'Gifts & Combos', name_hi: 'उपहार', icon: '🎁',
    tagline: 'Hampers, rakhis and ready sets for every festival and occasion',
    theme: { primary: '#5B2A7A', hover: '#6F3594', dark: '#1D0F2A', mid: '#45205E', accent: '#EBC66C' },
    art: [{ type: 'hamper', tone: 'purple' }, { type: 'giftbox', tone: 'maroon' }],
  },
];

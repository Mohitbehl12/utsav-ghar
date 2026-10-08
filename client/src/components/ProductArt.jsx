import { useId } from 'react';

/**
 * Built-in product illustrations. Shown until the store owner uploads real
 * product photos in Admin → Products; any uploaded image always takes priority.
 */
export const TONES = {
  gold:   { a: '#EDC76F', b: '#B8862B', c: '#6E4A12', bg1: '#FFF4DA', bg2: '#F3D9A0' },
  orange: { a: '#F6A04D', b: '#D5621C', c: '#8A380C', bg1: '#FFEEDC', bg2: '#F7C99C' },
  maroon: { a: '#C24A63', b: '#7A1630', c: '#470A1A', bg1: '#FCE6E8', bg2: '#EFBFC6' },
  purple: { a: '#9A69C4', b: '#5B2F86', c: '#321850', bg1: '#F1E7F8', bg2: '#D8C2EB' },
  navy:   { a: '#5566B8', b: '#262F6B', c: '#12173B', bg1: '#E6EAF8', bg2: '#C3CBEB' },
  cream:  { a: '#F7EAD0', b: '#CDB385', c: '#85704A', bg1: '#FFF9EE', bg2: '#F1E2C2' },
  green:  { a: '#78AC70', b: '#3F7A3C', c: '#224822', bg1: '#EAF4E3', bg2: '#C9E2BD' },
  teal:   { a: '#5FB3BF', b: '#1D6F7C', c: '#0D3B43', bg1: '#E3F4F5', bg2: '#BFE1E4' },
  pink:   { a: '#F06FA4', b: '#C2185B', c: '#6E0D34', bg1: '#FDE7F0', bg2: '#F7C3D8' },
  red:    { a: '#E0555F', b: '#A11D2B', c: '#5A0E17', bg1: '#FCE6E6', bg2: '#F2BDBF' },
};
export const ART_TYPES = ['diya', 'brass-diya', 'lotus', 'candle', 'thali', 'kalash', 'bell', 'incense', 'rangoli', 'garland', 'lights', 'akash', 'lantern', 'urli', 'cushion', 'runner', 'hamper', 'giftbox', 'wallhang', 'om', 'nazar', 'toran',
  'xmas-tree', 'bauble', 'star', 'wreath', 'stocking', 'party', 'gulal', 'pichkari', 'rakhi', 'dandiya', 'matki', 'flute', 'moon', 'kite', 'modak',
  'dinner-set', 'plate', 'bowl-set', 'handi', 'tray', 'cup-saucer', 'kulhad', 'bottle', 'glassware', 'kadhai', 'pan', 'pot', 'cooker', 'jars', 'masala', 'tiffin', 'spatula'];

function Flame({ x, y, s = 1, id }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r="30" fill={`url(#${id}-glow)`} />
      <g className="flame">
        <path d="M0,-26 C9,-12 10,-3 0,5 C-10,-3 -9,-12 0,-26Z" fill={`url(#${id}-fire)`} />
        <path d="M0,-12 C4,-6 4,-1 0,3 C-4,-1 -4,-6 0,-12Z" fill="#FFF6C8" />
      </g>
    </g>
  );
}

const shadow = (cx = 100, cy = 172, rx = 58) => <ellipse cx={cx} cy={cy} rx={rx} ry="8" fill="#000" opacity=".12" />;

const MARIGOLD = ['#F7A21B', '#F5C518', '#E8761A'];

function draw(type, t, id) {
  switch (type) {
    case 'diya':
      return (
        <>
          {shadow(100, 168, 62)}
          <path d="M34,120 C40,160 160,160 166,120 Z" fill={`url(#${id}-body)`} />
          <path d="M166,120 C172,112 178,108 186,106 C178,116 170,122 160,126Z" fill={t.b} />
          <ellipse cx="100" cy="120" rx="66" ry="14" fill={t.c} />
          <ellipse cx="100" cy="118" rx="60" ry="10" fill="#6B3A12" />
          <ellipse cx="100" cy="117" rx="56" ry="7" fill="#C98A2E" opacity=".7" />
          {[50, 70, 90, 110, 130, 150].map((x, i) => <circle key={x} cx={x} cy={138 + (i % 2) * 3} r="3.2" fill={i % 2 ? '#FFF1C9' : t.a} />)}
          <path d="M46,134 Q100,150 154,134" stroke="#FFF1C9" strokeWidth="2" fill="none" opacity=".6" />
          <Flame x={176} y={100} s={1.05} id={id} />
        </>
      );
    case 'brass-diya':
      return (
        <>
          {shadow(100, 176, 44)}
          <path d="M70,176 L130,176 L122,164 L78,164Z" fill={`url(#${id}-metal)`} />
          <rect x="92" y="118" width="16" height="48" rx="4" fill={`url(#${id}-metal)`} />
          <ellipse cx="100" cy="140" rx="14" ry="5" fill={t.c} opacity=".5" />
          <path d="M38,96 C44,132 156,132 162,96 Z" fill={`url(#${id}-metal)`} />
          {[-40, -24, -8, 8, 24, 40].map((dx) => <path key={dx} d={`M${100 + dx},104 q6,12 0,20 q-6,-8 0,-20`} fill={t.c} opacity=".35" />)}
          <ellipse cx="100" cy="96" rx="62" ry="12" fill={t.b} />
          <ellipse cx="100" cy="95" rx="56" ry="8" fill="#6B4312" />
          <Flame x={100} y={84} s={1.15} id={id} />
        </>
      );
    case 'lotus':
      return (
        <>
          {shadow(100, 170, 64)}
          {[-70, -45, -20, 20, 45, 70, 0].map((r, i) => (
            <path key={i} d="M100,150 C80,120 86,86 100,64 C114,86 120,120 100,150Z" transform={`rotate(${r} 100 150)`}
              fill={i % 2 ? `url(#${id}-body)` : t.a} stroke={t.c} strokeOpacity=".25" />
          ))}
          <ellipse cx="100" cy="150" rx="46" ry="10" fill={t.c} />
          <ellipse cx="100" cy="128" rx="16" ry="6" fill="#F4E4C0" />
          <Flame x={100} y={122} s={0.9} id={id} />
        </>
      );
    case 'candle':
      return (
        <>
          {shadow(100, 176, 44)}
          <rect x="58" y="74" width="84" height="100" rx="14" fill="#fff" opacity=".45" stroke={t.b} strokeWidth="2" />
          <rect x="62" y="96" width="76" height="74" rx="10" fill={t.a} />
          <rect x="58" y="116" width="84" height="30" fill={t.c} />
          <text x="100" y="136" textAnchor="middle" fontFamily="Hind, sans-serif" fontSize="11" fontWeight="600" fill={t.a} letterSpacing="2">SANDAL</text>
          <path d="M60,74 Q100,64 140,74" stroke={t.b} strokeWidth="2" fill="none" />
          <line x1="100" y1="96" x2="100" y2="88" stroke="#3a2a1a" strokeWidth="2" />
          <Flame x={100} y={86} s={0.9} id={id} />
        </>
      );
    case 'thali':
      return (
        <>
          {shadow(100, 160, 84)}
          <ellipse cx="100" cy="130" rx="86" ry="34" fill={`url(#${id}-metal)`} />
          <ellipse cx="100" cy="126" rx="74" ry="27" fill={t.a} />
          <ellipse cx="100" cy="126" rx="74" ry="27" fill="none" stroke={t.c} strokeDasharray="3 5" opacity=".5" />
          <ellipse cx="62" cy="122" rx="14" ry="6" fill="#C0122F" />
          <ellipse cx="62" cy="119" rx="10" ry="3.5" fill="#E23A4E" />
          <ellipse cx="90" cy="138" rx="13" ry="5.5" fill="#E9A81E" />
          <ellipse cx="90" cy="135" rx="9" ry="3" fill="#F7D04A" />
          {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={118 + i * 7} cy={140 - (i % 2) * 5} r="4" fill={MARIGOLD[i % 3]} />)}
          <path d="M110,118 C112,128 146,128 148,118Z" fill={t.b} />
          <ellipse cx="129" cy="118" rx="19" ry="4" fill={t.c} />
          <Flame x={146} y={110} s={0.75} id={id} />
          <g transform="translate(72 84)">
            <path d="M0,20 C-12,20 -12,0 0,-4 C12,0 12,20 0,20Z" fill={t.b} />
            <rect x="-2" y="-14" width="4" height="12" fill={t.c} />
          </g>
        </>
      );
    case 'kalash':
      return (
        <>
          {shadow(100, 176, 46)}
          <path d="M100,176 C48,176 44,120 72,104 L128,104 C156,120 152,176 100,176Z" fill={`url(#${id}-metal)`} />
          <rect x="76" y="92" width="48" height="14" rx="4" fill={t.b} />
          <path d="M66,140 Q100,152 134,140" stroke="#C0122F" strokeWidth="5" fill="none" />
          <text x="100" y="134" textAnchor="middle" fontSize="16" fill="#C0122F" fontFamily="Rozha One, serif">श्री</text>
          {[-50, -28, -8, 12, 32, 52].map((r, i) => <path key={i} d="M100,92 C94,70 100,52 108,40 C112,56 110,76 100,92Z" transform={`rotate(${r} 100 92)`} fill={i % 2 ? '#3F7A3C' : '#5E9A4E'} />)}
          <ellipse cx="100" cy="70" rx="20" ry="22" fill="#8A5A2B" />
          <path d="M92,52 C96,44 104,44 108,52" stroke="#6B4320" strokeWidth="4" fill="none" />
        </>
      );
    case 'bell':
      return (
        <>
          {shadow(100, 176, 40)}
          <path d="M96,62 L104,62 L104,40 C104,32 96,32 96,40Z" fill={t.b} />
          <path d="M100,24 C88,24 86,40 100,44 C114,40 112,24 100,24Z" fill={`url(#${id}-metal)`} />
          <path d="M100,60 C70,60 64,100 60,150 L140,150 C136,100 130,60 100,60Z" fill={`url(#${id}-metal)`} />
          <rect x="54" y="148" width="92" height="10" rx="5" fill={t.b} />
          <circle cx="100" cy="166" r="8" fill={t.c} />
          {[90, 110, 130].map((y) => <path key={y} d={`M${66 + (y - 90) * 0.1},${y} Q100,${y + 6} ${134 - (y - 90) * 0.1},${y}`} stroke={t.c} opacity=".35" fill="none" strokeWidth="2" />)}
        </>
      );
    case 'incense':
      return (
        <>
          {shadow(100, 176, 60)}
          <rect x="44" y="120" width="112" height="52" rx="6" fill={`url(#${id}-body)`} />
          <rect x="44" y="120" width="112" height="12" fill={t.c} />
          <text x="100" y="158" textAnchor="middle" fontFamily="Rozha One, serif" fontSize="16" fill="#FFF1C9">अगरबत्ती</text>
          {[76, 92, 108, 124].map((x, i) => (
            <g key={x}>
              <line x1={x} y1="120" x2={x + (i - 1.5) * 6} y2="52" stroke="#6B3A12" strokeWidth="2.5" />
              <line x1={x + (i - 1.5) * 4.5} y1="70" x2={x + (i - 1.5) * 6} y2="52" stroke="#3a2012" strokeWidth="3.5" />
              <circle cx={x + (i - 1.5) * 6} cy="51" r="2" fill="#F26A1B" />
              <path className="smoke" d={`M${x + (i - 1.5) * 6},48 c-8,-10 8,-16 0,-26 c-6,-8 6,-12 2,-20`} stroke="#9a8f86" strokeWidth="2" fill="none" opacity=".45" />
            </g>
          ))}
        </>
      );
    case 'rangoli': {
      const rings = [
        { r: 70, n: 16, c: t.b, s: 14 }, { r: 54, n: 12, c: '#F5A623', s: 13 }, { r: 38, n: 10, c: '#D6336C', s: 11 }, { r: 22, n: 8, c: '#2F9E44', s: 9 },
      ];
      return (
        <>
          <circle cx="100" cy="100" r="84" fill={t.c} opacity=".12" />
          <circle cx="100" cy="100" r="80" fill="none" stroke={t.b} strokeWidth="2" strokeDasharray="2 6" />
          {rings.map((g, gi) => Array.from({ length: g.n }, (_, i) => (
            <path key={`${gi}-${i}`} d={`M100,${100 - g.r - g.s} C${100 + g.s * 0.7},${100 - g.r} ${100 + g.s * 0.5},${100 - g.r + g.s} 100,${100 - g.r + g.s * 0.9} C${100 - g.s * 0.5},${100 - g.r + g.s} ${100 - g.s * 0.7},${100 - g.r} 100,${100 - g.r - g.s}Z`}
              transform={`rotate(${(360 / g.n) * i + gi * 11} 100 100)`} fill={g.c} />
          )))}
          <circle cx="100" cy="100" r="12" fill="#F5C518" />
          <circle cx="100" cy="100" r="6" fill={t.c} />
        </>
      );
    }
    case 'garland':
      return (
        <>
          <rect x="20" y="30" width="160" height="8" rx="4" fill={t.c} opacity=".6" />
          {[40, 70, 100, 130, 160].map((x, si) => Array.from({ length: 8 + (si % 2) * 3 }, (_, i) => (
            <g key={`${x}-${i}`}>
              <circle cx={x} cy={46 + i * 12} r="7.5" fill={MARIGOLD[(i + si) % 3]} />
              <circle cx={x} cy={46 + i * 12} r="3.5" fill="#fff" opacity=".25" />
            </g>
          )))}
          {[40, 100, 160].map((x) => <path key={x} d={`M${x},${150 + (x === 100 ? 34 : 0)} l-6,10 l12,0z`} fill={t.b} />)}
        </>
      );
    case 'lights':
      return (
        <>
          <path d="M8,50 Q60,110 100,70 T192,80" stroke={t.c} strokeWidth="2" fill="none" />
          <path d="M8,110 Q70,170 110,128 T192,140" stroke={t.c} strokeWidth="2" fill="none" />
          {[[20, 64], [44, 84], [70, 92], [96, 76], [124, 62], [150, 70], [176, 80], [24, 124], [52, 146], [80, 150], [110, 130], [140, 124], [168, 136]].map(([x, y], i) => (
            <g key={i} className="twinkle" style={{ animationDelay: `${(i % 5) * 0.4}s` }}>
              <circle cx={x} cy={y} r="14" fill={`url(#${id}-glow)`} />
              <circle cx={x} cy={y} r="4.5" fill={i % 3 === 0 ? '#FFE9A8' : '#FFD36B'} />
            </g>
          ))}
        </>
      );
    case 'akash':
      return (
        <>
          <line x1="100" y1="6" x2="100" y2="40" stroke={t.c} strokeWidth="2" />
          <path d="M100,36 L122,70 L160,76 L128,100 L138,138 L100,118 L62,138 L72,100 L40,76 L78,70Z" fill={`url(#${id}-body)`} stroke={t.c} strokeWidth="2" />
          <path d="M100,56 L112,76 L134,80 L116,94 L122,116 L100,104 L78,116 L84,94 L66,80 L88,76Z" fill="#FFD36B" opacity=".85" />
          <circle cx="100" cy="88" r="30" fill={`url(#${id}-glow)`} />
          {[70, 85, 100, 115, 130].map((x, i) => (
            <g key={x}>
              <line x1={x} y1={120 + Math.abs(2 - i) * -6} x2={x} y2={170 - Math.abs(2 - i) * 8} stroke={i % 2 ? '#F5C518' : t.a} strokeWidth="3" />
              <circle cx={x} cy={172 - Math.abs(2 - i) * 8} r="4" fill={i % 2 ? t.a : '#F5C518'} />
            </g>
          ))}
        </>
      );
    case 'lantern':
      return (
        <>
          {shadow(100, 178, 40)}
          <path d="M100,10 C94,10 94,24 100,24 C106,24 106,10 100,10Z" fill="none" stroke={t.c} strokeWidth="3" />
          <path d="M80,34 L120,34 L112,24 L88,24Z" fill={`url(#${id}-metal)`} />
          <path d="M72,40 C60,70 60,130 72,158 L128,158 C140,130 140,70 128,40Z" fill={t.c} />
          <path d="M72,40 C60,70 60,130 72,158 L128,158 C140,130 140,70 128,40Z" fill={`url(#${id}-glow)`} opacity=".9" />
          {[60, 84, 108, 132].map((y) => [80, 92, 104, 116].map((x) => (
            <path key={`${x}-${y}`} d={`M${x + (y % 48 ? 6 : 0)},${y} l5,8 l-5,8 l-5,-8z`} fill="#FFD36B" opacity=".9" />
          )))}
          <path d="M68,158 L132,158 L124,172 L76,172Z" fill={`url(#${id}-metal)`} />
          <path d="M80,34 L120,34 L128,42 L72,42Z" fill={t.b} />
        </>
      );
    case 'urli':
      return (
        <>
          {shadow(100, 168, 82)}
          <path d="M16,116 C26,168 174,168 184,116Z" fill={`url(#${id}-metal)`} />
          <ellipse cx="100" cy="116" rx="84" ry="18" fill={t.b} />
          <ellipse cx="100" cy="116" rx="76" ry="13" fill="#5E8FB8" opacity=".75" />
          {[[60, 114, '#E8761A'], [92, 120, '#D6336C'], [132, 112, '#F5C518'], [150, 120, '#E8761A']].map(([x, y, c], i) => (
            <g key={i}>
              {[0, 72, 144, 216, 288].map((r) => <ellipse key={r} cx={x} cy={y - 5} rx="4" ry="7" transform={`rotate(${r} ${x} ${y})`} fill={c} />)}
              <circle cx={x} cy={y} r="3" fill="#FFF1C9" />
            </g>
          ))}
          <Flame x={112} y={108} s={0.6} id={id} />
          <Flame x={76} y={112} s={0.55} id={id} />
        </>
      );
    case 'cushion':
      return (
        <>
          {shadow(100, 176, 70)}
          <path d="M34,40 Q100,28 166,40 Q176,100 166,160 Q100,172 34,160 Q24,100 34,40Z" fill={`url(#${id}-body)`} />
          <circle cx="100" cy="100" r="46" fill="none" stroke="#E9C46A" strokeWidth="2.5" />
          <circle cx="100" cy="100" r="34" fill="none" stroke="#E9C46A" strokeWidth="1.5" strokeDasharray="4 4" />
          {Array.from({ length: 12 }, (_, i) => <path key={i} d="M100,58 C106,70 106,78 100,86 C94,78 94,70 100,58Z" transform={`rotate(${i * 30} 100 100)`} fill="#E9C46A" opacity=".85" />)}
          <circle cx="100" cy="100" r="8" fill="#E9C46A" />
          {[[34, 40], [166, 40], [34, 160], [166, 160]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="5" fill="#E9C46A" />)}
        </>
      );
    case 'runner':
      return (
        <>
          <g transform="rotate(-18 100 100)">
            <rect x="-10" y="70" width="220" height="60" fill={`url(#${id}-body)`} />
            <rect x="-10" y="74" width="220" height="4" fill="#E9C46A" />
            <rect x="-10" y="122" width="220" height="4" fill="#E9C46A" />
            {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${i * 26},100 l10,-12 l10,12 l-10,12z`} fill="#E9C46A" opacity=".85" />)}
            {Array.from({ length: 22 }, (_, i) => <line key={i} x1={i * 10} y1="130" x2={i * 10 + 2} y2="142" stroke="#E9C46A" strokeWidth="2" />)}
          </g>
        </>
      );
    case 'hamper':
      return (
        <>
          {shadow(100, 176, 72)}
          <path d="M44,96 C44,40 156,40 156,96" stroke={t.c} strokeWidth="6" fill="none" />
          <rect x="62" y="70" width="30" height="36" rx="3" fill="#F5C518" />
          <rect x="96" y="60" width="26" height="46" rx="3" fill={t.a} />
          <circle cx="136" cy="92" r="16" fill="#E8761A" />
          <path d="M30,100 L170,100 L156,172 L44,172Z" fill={`url(#${id}-body)`} />
          {[112, 128, 144, 160].map((y) => <line key={y} x1={30 + (y - 100) * 0.2} y1={y} x2={170 - (y - 100) * 0.2} y2={y} stroke={t.c} strokeOpacity=".35" />)}
          <path d="M100,100 L86,86 L86,114Z M100,100 L114,86 L114,114Z" fill="#E9C46A" />
          <circle cx="100" cy="100" r="6" fill="#C8943A" />
        </>
      );
    case 'giftbox':
      return (
        <>
          {shadow(100, 176, 62)}
          <rect x="44" y="92" width="112" height="80" rx="4" fill={`url(#${id}-body)`} />
          <rect x="38" y="78" width="124" height="22" rx="3" fill={t.b} />
          <rect x="92" y="78" width="16" height="94" fill="#E9C46A" />
          <path d="M100,78 C80,52 58,60 70,76Z M100,78 C120,52 142,60 130,76Z" fill="#E9C46A" stroke="#B8862B" />
          <circle cx="100" cy="78" r="7" fill="#C8943A" />
          {[[60, 124], [138, 146], [66, 156]].map(([x, y]) => <text key={x} x={x} y={y} fontSize="12" fill="#E9C46A" textAnchor="middle">✦</text>)}
        </>
      );
    case 'wallhang':
      return (
        <>
          <line x1="20" y1="22" x2="180" y2="22" stroke={t.c} strokeWidth="3" />
          {[[62, 'शुभ'], [138, 'लाभ']].map(([x, w]) => (
            <g key={x}>
              <line x1={x} y1="22" x2={x} y2="52" stroke={t.b} strokeWidth="2" />
              <circle cx={x} cy="86" r="34" fill={`url(#${id}-body)`} stroke="#E9C46A" strokeWidth="3" />
              <circle cx={x} cy="86" r="27" fill="none" stroke="#E9C46A" strokeDasharray="2 4" />
              <text x={x} y="95" textAnchor="middle" fontFamily="Rozha One, serif" fontSize="22" fill="#FFF1C9">{w}</text>
              {[0, 1, 2, 3].map((i) => <circle key={i} cx={x} cy={128 + i * 11} r="4.5" fill={i % 2 ? '#E9C46A' : t.a} />)}
              <path d={`M${x - 6},172 L${x + 6},172 L${x},186Z`} fill="#E9C46A" />
            </g>
          ))}
        </>
      );
    case 'om':
      return (
        <>
          <circle cx="100" cy="100" r="76" fill={`url(#${id}-metal)`} />
          <circle cx="100" cy="100" r="66" fill={t.c} opacity=".15" />
          <circle cx="100" cy="100" r="70" fill="none" stroke={t.c} strokeWidth="2" strokeDasharray="1 5" />
          <text x="100" y="128" textAnchor="middle" fontFamily="Rozha One, serif" fontSize="82" fill={t.c}>ॐ</text>
        </>
      );
    case 'nazar':
      return (
        <>
          <line x1="100" y1="6" x2="100" y2="40" stroke="#C8943A" strokeWidth="2" />
          <circle cx="100" cy="76" r="36" fill="#1E4FB8" />
          <circle cx="100" cy="76" r="25" fill="#fff" />
          <circle cx="100" cy="76" r="17" fill="#5DB6F0" />
          <circle cx="100" cy="76" r="8" fill="#0B1740" />
          <circle cx="94" cy="70" r="3" fill="#fff" />
          {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx="100" cy={120 + i * 12} r="5" fill={i % 2 ? '#C8943A' : '#1E4FB8'} />)}
          <path d="M90,184 C90,172 110,172 110,184Z" fill="#C8943A" />
          {[70, 130].map((x) => (
            <g key={x}>
              <line x1="100" y1="40" x2={x} y2="110" stroke="#C8943A" strokeWidth="1.5" />
              <circle cx={x} cy="118" r="9" fill="#1E4FB8" />
              <circle cx={x} cy="118" r="5" fill="#fff" />
              <circle cx={x} cy="118" r="2.5" fill="#0B1740" />
            </g>
          ))}
        </>
      );
    // ---- festivals ----
    case 'xmas-tree':
      return (
        <>
          {shadow(100, 176, 50)}
          <rect x="92" y="150" width="16" height="22" fill="#6B3A12" />
          {[[100, 40, 34, 70], [100, 70, 48, 104], [100, 100, 62, 150]].map(([x, top, w, bot], i) => <path key={i} d={`M${x},${top} L${x + w},${bot} L${x - w},${bot}Z`} fill={i === 1 ? t.b : `url(#${id}-body)`} />)}
          {[[84, 94, '#E0555F'], [118, 118, '#F5C518'], [92, 136, '#5FB3BF'], [128, 142, '#E0555F'], [72, 140, '#F5C518'], [106, 86, '#FFFFFF']].map(([x, y, c]) => <circle key={`${x}${y}`} cx={x} cy={y} r="5" fill={c} />)}
          <path d="M100,22 l5,11 12,1 -9,8 3,12 -11,-6 -11,6 3,-12 -9,-8 12,-1Z" fill="#F5C518" stroke="#B8862B" />
        </>
      );
    case 'bauble':
      return (
        <>
          {shadow(100, 176, 60)}
          {[[70, 118, 34, t.b], [128, 110, 30, '#E9C46A'], [102, 146, 24, t.a]].map(([x, y, r, c], i) => (
            <g key={i}>
              <line x1={x} y1={y - r - 30} x2={x} y2={y - r - 6} stroke="#B8862B" />
              <rect x={x - 6} y={y - r - 8} width="12" height="8" rx="2" fill="#C8943A" />
              <circle cx={x} cy={y} r={r} fill={c} />
              <ellipse cx={x - r / 3} cy={y - r / 3} rx={r / 4} ry={r / 6} fill="#fff" opacity=".5" />
              <path d={`M${x - r},${y} Q${x},${y + 10} ${x + r},${y}`} stroke="#fff" strokeOpacity=".5" fill="none" strokeWidth="2" />
            </g>
          ))}
        </>
      );
    case 'star':
      return (
        <>
          <line x1="100" y1="10" x2="100" y2="40" stroke={t.c} strokeWidth="2" />
          <path d="M100,40 L118,82 164,84 128,112 140,156 100,130 60,156 72,112 36,84 82,82Z" fill={`url(#${id}-body)`} stroke={t.c} strokeWidth="2" />
          <path d="M100,56 L110,84 138,86 116,104 124,132 100,116 76,132 84,104 62,86 90,84Z" fill="#FFF3C8" opacity=".55" />
          {[70, 100, 130].map((x) => <path key={x} d={`M${x},150 q-4,16 0,28 M${x},150 q4,16 0,28`} stroke={t.b} strokeWidth="2" fill="none" />)}
          <circle cx="100" cy="100" r="60" fill={`url(#${id}-glow)`} opacity=".6" />
        </>
      );
    case 'wreath':
      return (
        <>
          {Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2; return <ellipse key={i} cx={100 + Math.cos(a) * 52} cy={100 + Math.sin(a) * 52} rx="20" ry="11" transform={`rotate(${(a * 180) / Math.PI + 90} ${100 + Math.cos(a) * 52} ${100 + Math.sin(a) * 52})`} fill={i % 2 ? t.b : t.a} />; })}
          {[[60, 70], [140, 76], [150, 120], [56, 130], [100, 154], [96, 48]].map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="5" fill="#C62828" /><circle cx={x + 7} cy={y + 3} r="5" fill="#E53935" /></g>)}
          <path d="M100,150 L78,178 L90,176 L96,188Z M100,150 L122,178 L110,176 L104,188Z" fill="#B71C1C" />
          <path d="M100,150 C80,132 74,152 100,152 C126,152 120,132 100,150Z" fill="#D32F2F" />
        </>
      );
    case 'stocking':
      return (
        <>
          <line x1="20" y1="30" x2="180" y2="30" stroke={t.c} strokeWidth="3" />
          {[[48, t.b], [100, '#3F7A3C'], [152, t.a]].map(([x, c], i) => (
            <g key={x} transform={`translate(${x - 20} 30)`}>
              <path d="M6,14 L34,14 L34,86 C34,104 20,112 -6,112 C-18,112 -20,96 -8,92 L6,86Z" fill={c} />
              <rect x="2" y="8" width="36" height="16" rx="3" fill="#FFF9EE" />
              {i === 1 ? <path d="M12,50 l8,-8 8,8 -8,8Z" fill="#FFF9EE" opacity=".8" /> : <circle cx="20" cy="54" r="5" fill="#FFF9EE" opacity=".8" />}
            </g>
          ))}
        </>
      );
    case 'party':
      return (
        <>
          {[[62, 70, '#E9C46A'], [100, 56, t.a], [138, 72, t.b]].map(([x, y, c]) => (
            <g key={x}>
              <path d={`M${x},${y + 32} q-6,30 4,60`} stroke={t.c} fill="none" />
              <ellipse cx={x} cy={y} rx="22" ry="28" fill={c} />
              <path d={`M${x - 4},${y + 27} l4,6 4,-6Z`} fill={c} />
              <ellipse cx={x - 8} cy={y - 10} rx="5" ry="8" fill="#fff" opacity=".45" />
            </g>
          ))}
          {Array.from({ length: 22 }, (_, i) => <rect key={i} x={20 + ((i * 37) % 160)} y={120 + ((i * 23) % 60)} width="6" height="3" rx="1" fill={['#E9C46A', t.a, '#F06FA4', '#5FB3BF'][i % 4]} transform={`rotate(${i * 40} ${23 + ((i * 37) % 160)} ${121 + ((i * 23) % 60)})`} />)}
          <path d="M150,170 L172,120 L186,176Z" fill={t.b} /><path d="M172,120 l-6,-10 M172,120 l6,-12 M172,120 l12,-4" stroke="#E9C46A" strokeWidth="3" />
        </>
      );
    case 'gulal':
      return (
        <>
          {shadow(100, 176, 76)}
          {[[50, 138, '#E91E63'], [100, 150, '#FFC107'], [150, 138, '#4CAF50'], [74, 104, '#2196F3'], [126, 104, '#FF5722']].map(([x, y, c], i) => (
            <g key={i}>
              <ellipse cx={x} cy={y + 10} rx="30" ry="10" fill="#D7B98A" />
              <path d={`M${x - 30},${y + 10} C${x - 26},${y - 22} ${x + 26},${y - 22} ${x + 30},${y + 10}Z`} fill={c} />
              <circle cx={x - 8} cy={y - 4} r="4" fill="#fff" opacity=".35" />
            </g>
          ))}
          {Array.from({ length: 14 }, (_, i) => <circle key={i} cx={30 + ((i * 53) % 140)} cy={30 + ((i * 29) % 50)} r={3 + (i % 3)} fill={['#E91E63', '#FFC107', '#4CAF50', '#2196F3'][i % 4]} opacity=".7" />)}
        </>
      );
    case 'pichkari':
      return (
        <>
          {shadow(100, 170, 60)}
          <rect x="40" y="86" width="100" height="30" rx="12" fill={`url(#${id}-body)`} />
          <rect x="140" y="96" width="36" height="10" rx="4" fill={t.c} />
          <rect x="12" y="92" width="34" height="18" rx="6" fill="#F5C518" />
          <path d="M70,116 L60,156 L80,156 L90,116Z" fill={t.b} />
          <circle cx="112" cy="72" r="16" fill="#2196F3" opacity=".85" />
          {[[182, 94, '#E91E63'], [190, 108, '#FFC107'], [184, 120, '#2196F3']].map(([x, y, c]) => <circle key={y} cx={x} cy={y} r="5" fill={c} />)}
        </>
      );
    case 'rakhi':
      return (
        <>
          <path d="M10,110 C50,96 70,104 80,106 M120,106 C130,104 150,96 190,110" stroke="#E53935" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M10,116 C50,102 70,110 80,112 M120,112 C130,110 150,102 190,116" stroke="#F5C518" strokeWidth="3" fill="none" strokeLinecap="round" />
          {Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return <ellipse key={i} cx={100 + Math.cos(a) * 30} cy={108 + Math.sin(a) * 30} rx="14" ry="8" transform={`rotate(${(a * 180) / Math.PI} ${100 + Math.cos(a) * 30} ${108 + Math.sin(a) * 30})`} fill={i % 2 ? t.a : t.b} />; })}
          <circle cx="100" cy="108" r="22" fill="#E9C46A" stroke="#B8862B" strokeWidth="2" />
          <circle cx="100" cy="108" r="12" fill={t.c} />
          {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={100 + Math.cos(i) * 17} cy={108 + Math.sin(i) * 17} r="2.5" fill="#FFF3C8" />)}
          <path d="M60,126 l-6,26 M140,126 l6,26" stroke="#F5C518" strokeWidth="2" /><circle cx="54" cy="156" r="5" fill="#E53935" /><circle cx="146" cy="156" r="5" fill="#E53935" />
        </>
      );
    case 'dandiya':
      return (
        <>
          {shadow(100, 176, 60)}
          {[[-24, t.b], [24, '#3F7A3C']].map(([r, c]) => (
            <g key={r} transform={`rotate(${r} 100 110)`}>
              <rect x="93" y="30" width="14" height="140" rx="7" fill={c} />
              {[50, 80, 110, 140].map((y) => <rect key={y} x="93" y={y} width="14" height="8" fill="#E9C46A" />)}
              {[64, 94, 124].map((y) => <circle key={y} cx="100" cy={y} r="3.5" fill="#E3F4F5" stroke="#B8862B" />)}
              <path d="M100,30 l-8,-12 M100,30 l8,-12 M100,30 v-14" stroke="#E53935" strokeWidth="3" strokeLinecap="round" />
            </g>
          ))}
        </>
      );
    case 'matki':
      return (
        <>
          {shadow(100, 174, 56)}
          <path d="M60,78 C20,110 40,172 100,172 C160,172 180,110 140,78Z" fill={`url(#${id}-body)`} />
          <ellipse cx="100" cy="76" rx="42" ry="10" fill={t.c} />
          <rect x="70" y="58" width="60" height="16" rx="6" fill={t.b} />
          <ellipse cx="100" cy="58" rx="30" ry="7" fill="#FFF9EE" />
          <path d="M44,118 Q100,140 156,118" stroke="#E9C46A" strokeWidth="6" fill="none" />
          {[60, 80, 100, 120, 140].map((x) => <circle key={x} cx={x} cy={126 + Math.abs(100 - x) * -0.12} r="4" fill={x % 40 ? '#3F7A3C' : '#E53935'} />)}
          <path d="M100,36 l0,-18 M70,50 l-12,-14 M130,50 l12,-14" stroke="#5B2F86" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'flute':
      return (
        <>
          <g transform="rotate(-28 100 100)">
            <rect x="14" y="92" width="172" height="16" rx="8" fill={`url(#${id}-metal)`} />
            {[60, 80, 100, 120, 140].map((x) => <circle key={x} cx={x} cy="100" r="3.5" fill={t.c} />)}
            <rect x="34" y="92" width="8" height="16" fill="#E53935" /><rect x="160" y="92" width="8" height="16" fill="#E53935" />
          </g>
          <path d="M150,70 C176,40 190,58 176,84 C168,98 150,92 150,70Z" fill="#1D6F7C" />
          <ellipse cx="166" cy="72" rx="9" ry="12" fill="#2E7D32" /><ellipse cx="166" cy="72" rx="5" ry="7" fill="#1A237E" /><circle cx="166" cy="72" r="2.5" fill="#F5C518" />
          <path d="M150,70 L118,112" stroke="#8D6E63" strokeWidth="2" />
        </>
      );
    case 'moon':
      return (
        <>
          <circle cx="100" cy="92" r="70" fill={`url(#${id}-glow)`} />
          <path d="M122,32 A62,62 0 1,0 150,142 A50,50 0 1,1 122,32Z" fill={`url(#${id}-metal)`} stroke={t.c} strokeWidth="2" />
          <path d="M150,58 l4,10 11,1 -8,7 3,11 -10,-6 -10,6 3,-11 -8,-7 11,-1Z" fill="#F5C518" />
          {[[40, 40], [170, 130], [60, 170], [150, 30]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="2.5" fill="#FFF3C8" />)}
          <line x1="100" y1="0" x2="100" y2="30" stroke={t.c} strokeWidth="2" />
        </>
      );
    case 'kite':
      return (
        <>
          <path d="M100,24 L156,92 L100,160 L44,92Z" fill={t.b} />
          <path d="M100,24 L156,92 L100,92Z" fill={t.a} /><path d="M100,92 L44,92 L100,160Z" fill="#F5C518" />
          <line x1="100" y1="24" x2="100" y2="160" stroke={t.c} strokeWidth="2" /><path d="M44,92 Q100,70 156,92" stroke={t.c} strokeWidth="2" fill="none" />
          <path d="M100,160 l-10,14 20,0Z" fill="#E53935" />
          <path d="M100,160 C120,180 150,170 190,196" stroke="#6E4A12" fill="none" strokeDasharray="3 3" />
        </>
      );
    case 'modak':
      return (
        <>
          {shadow(100, 172, 70)}
          <ellipse cx="100" cy="160" rx="72" ry="14" fill={`url(#${id}-metal)`} />
          {[[64, 130], [136, 130], [100, 112]].map(([x, y], i) => (
            <g key={i}>
              <path d={`M${x - 24},${y + 22} C${x - 28},${y - 6} ${x - 6},${y - 26} ${x},${y - 34} C${x + 6},${y - 26} ${x + 28},${y - 6} ${x + 24},${y + 22}Z`} fill="#FFF3DC" stroke="#E0C9A0" />
              {[-14, -7, 0, 7, 14].map((d) => <path key={d} d={`M${x + d},${y + 20} Q${x + d * 0.4},${y - 6} ${x},${y - 30}`} stroke="#E0C9A0" fill="none" />)}
            </g>
          ))}
          <path d="M40,150 q60,-20 120,0" stroke="#F7A21B" strokeWidth="4" fill="none" strokeDasharray="1 7" strokeLinecap="round" />
        </>
      );
    // ---- crockery & dining ----
    case 'dinner-set':
      return (
        <>
          {shadow(100, 176, 76)}
          <ellipse cx="86" cy="140" rx="70" ry="26" fill="#FFFFFF" stroke={t.b} strokeWidth="2" />
          <ellipse cx="86" cy="140" rx="48" ry="17" fill="none" stroke="#C8943A" strokeWidth="2" />
          <ellipse cx="86" cy="132" rx="54" ry="20" fill="#FFFFFF" stroke={t.b} strokeWidth="2" />
          <ellipse cx="86" cy="132" rx="36" ry="13" fill="none" stroke="#C8943A" strokeWidth="1.5" />
          <path d="M120,86 C120,118 176,118 176,86Z" fill="#FFFFFF" stroke={t.b} strokeWidth="2" />
          <ellipse cx="148" cy="86" rx="28" ry="8" fill={t.bg1} stroke={t.b} strokeWidth="2" />
          <path d="M126,98 Q148,106 170,98" stroke="#C8943A" fill="none" />
          <path d="M40,60 C40,84 88,84 88,60Z" fill="#FFFFFF" stroke={t.b} strokeWidth="2" /><ellipse cx="64" cy="60" rx="24" ry="7" fill={t.bg1} stroke={t.b} strokeWidth="2" />
        </>
      );
    case 'plate':
      return (
        <>
          {shadow(100, 170, 80)}
          <ellipse cx="100" cy="124" rx="84" ry="40" fill={`url(#${id}-body)`} />
          <ellipse cx="100" cy="120" rx="62" ry="27" fill={t.bg1} />
          <ellipse cx="100" cy="120" rx="62" ry="27" fill="none" stroke={t.b} strokeOpacity=".4" />
          {[[76, 112, t.a], [118, 108, '#F7A21B'], [100, 132, '#8BC34A']].map(([x, y, c]) => <ellipse key={x} cx={x} cy={y} rx="16" ry="8" fill={c} stroke={t.c} strokeOpacity=".3" />)}
        </>
      );
    case 'bowl-set':
      return (
        <>
          {shadow(100, 174, 80)}
          {[[60, 150, 40], [140, 150, 34], [100, 104, 30]].map(([x, y, r], i) => (
            <g key={i}>
              <path d={`M${x - r},${y - r * 0.55} C${x - r},${y + r * 0.5} ${x + r},${y + r * 0.5} ${x + r},${y - r * 0.55}Z`} fill={`url(#${id}-body)`} />
              <ellipse cx={x} cy={y - r * 0.55} rx={r} ry={r * 0.25} fill={t.bg1} stroke={t.b} />
              {[-0.5, 0, 0.5].map((d) => <circle key={d} cx={x + d * r} cy={y - r * 0.1} r="3.5" fill="#FFF9EE" opacity=".8" />)}
            </g>
          ))}
        </>
      );
    case 'handi':
      return (
        <>
          {shadow(100, 174, 64)}
          <path d="M40,100 C30,164 70,172 100,172 C130,172 170,164 160,100Z" fill={`url(#${id}-metal)`} />
          {[110, 124, 138, 152].map((y) => <path key={y} d={`M${44 - (y - 100) * 0.1},${y} Q100,${y + 6} ${156 + (y - 100) * 0.1},${y}`} stroke={t.c} strokeOpacity=".25" fill="none" />)}
          <ellipse cx="100" cy="100" rx="62" ry="12" fill={t.b} />
          <path d="M44,96 C44,70 156,70 156,96Z" fill={`url(#${id}-metal)`} />
          <circle cx="100" cy="68" r="10" fill="#C8943A" /><ellipse cx="100" cy="76" rx="16" ry="4" fill="#B8862B" />
          <path d="M34,108 c-14,0 -14,16 0,16 M166,108 c14,0 14,16 0,16" stroke={t.c} strokeWidth="4" fill="none" />
        </>
      );
    case 'tray':
      return (
        <>
          {shadow(100, 172, 84)}
          <path d="M22,112 L178,112 L166,156 L34,156Z" fill={`url(#${id}-body)`} />
          <path d="M22,112 L178,112 L178,104 L22,104Z" fill={t.b} />
          <path d="M12,108 c0,-14 14,-14 14,0 M174,108 c0,-14 14,-14 14,0" stroke="#C8943A" strokeWidth="4" fill="none" />
          {[[56, 96, '#8D6E63'], [82, 94, '#F5C518'], [120, 94, '#E8761A'], [146, 96, '#FFF3DC']].map(([x, y, c]) => <ellipse key={x} cx={x} cy={y} rx="14" ry="8" fill={c} />)}
          {[50, 80, 110, 140].map((x) => <path key={x} d={`M${x},124 l6,6 -6,6 -6,-6Z`} fill="#E9C46A" opacity=".7" />)}
        </>
      );
    case 'cup-saucer':
      return (
        <>
          {shadow(100, 170, 74)}
          <ellipse cx="96" cy="150" rx="72" ry="18" fill="#FFFFFF" stroke={t.b} strokeWidth="2" />
          <ellipse cx="96" cy="148" rx="40" ry="9" fill={t.bg1} />
          <path d="M52,76 L60,138 C64,152 128,152 132,138 L140,76Z" fill="#FFFFFF" stroke={t.b} strokeWidth="2" />
          <ellipse cx="96" cy="76" rx="44" ry="11" fill="#8A4A1C" stroke={t.b} strokeWidth="2" />
          <path d="M138,90 c30,0 30,34 -6,38" stroke={t.b} strokeWidth="7" fill="none" />
          <path d="M56,92 Q96,104 136,92" stroke="#C8943A" strokeWidth="3" fill="none" />
          <path d="M84,58 q-8,-12 0,-24 M104,58 q8,-14 0,-28" stroke="#CFC2B0" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
    case 'kulhad':
      return (
        <>
          {shadow(100, 172, 80)}
          {[[54, 118], [104, 132], [150, 112]].map(([x, y], i) => (
            <g key={i}>
              <path d={`M${x - 24},${y - 36} L${x - 16},${y + 30} L${x + 16},${y + 30} L${x + 24},${y - 36}Z`} fill={`url(#${id}-body)`} />
              <ellipse cx={x} cy={y - 36} rx="24" ry="6" fill="#E8D2B0" stroke={t.c} />
              <path d={`M${x - 20},${y - 12} L${x + 20},${y - 12}`} stroke={t.c} strokeOpacity=".3" />
            </g>
          ))}
        </>
      );
    case 'bottle':
      return (
        <>
          {shadow(100, 176, 40)}
          <rect x="66" y="56" width="68" height="118" rx="20" fill={`url(#${id}-metal)`} />
          {[76, 96, 116, 136, 156].map((y) => <path key={y} d={`M68,${y} Q100,${y + 5} 132,${y}`} stroke={t.c} strokeOpacity=".2" fill="none" />)}
          <rect x="82" y="36" width="36" height="24" rx="6" fill={t.b} />
          <rect x="78" y="26" width="44" height="14" rx="5" fill={t.c} />
        </>
      );
    case 'glassware':
      return (
        <>
          {shadow(100, 174, 72)}
          {[[60, 90], [104, 80], [148, 96]].map(([x, top], i) => (
            <g key={i}>
              <path d={`M${x - 20},${top} L${x - 16},172 L${x + 16},172 L${x + 20},${top}Z`} fill={t.bg1} fillOpacity=".55" stroke={t.b} strokeWidth="2" />
              <path d={`M${x - 18},${top + 30} L${x - 16},166 L${x + 16},166 L${x + 18},${top + 30}Z`} fill={i === 1 ? '#F7A21B' : t.a} opacity=".55" />
              <path d={`M${x - 12},${top + 8} L${x - 10},160`} stroke="#fff" strokeWidth="3" opacity=".6" />
            </g>
          ))}
        </>
      );
    // ---- kitchen ----
    case 'kadhai':
      return (
        <>
          {shadow(100, 172, 70)}
          <path d="M28,98 C34,168 166,168 172,98Z" fill={`url(#${id}-body)`} />
          <ellipse cx="100" cy="98" rx="72" ry="16" fill={t.c} />
          <ellipse cx="100" cy="98" rx="64" ry="11" fill="#2A2A2A" />
          <path d="M18,100 c-16,-4 -16,-22 2,-20 l10,6 M182,100 c16,-4 16,-22 -2,-20 l-10,6" stroke={t.c} strokeWidth="6" fill="none" />
          {[[80, 96, '#F7A21B'], [104, 94, '#8BC34A'], [120, 98, '#E53935']].map(([x, y, c]) => <ellipse key={x} cx={x} cy={y} rx="9" ry="4" fill={c} />)}
        </>
      );
    case 'pan':
      return (
        <>
          {shadow(90, 168, 70)}
          <ellipse cx="86" cy="120" rx="70" ry="30" fill={`url(#${id}-body)`} />
          <ellipse cx="86" cy="116" rx="62" ry="24" fill="#3A3A3A" />
          {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={40 + ((i * 29) % 92)} cy={102 + ((i * 17) % 28)} r="1.2" fill="#9E9E9E" />)}
          <rect x="150" y="108" width="46" height="12" rx="6" fill="#4E342E" transform="rotate(-8 150 114)" />
          <ellipse cx="86" cy="114" rx="36" ry="12" fill="#F3E0B5" opacity=".85" />
        </>
      );
    case 'pot':
      return (
        <>
          {shadow(100, 174, 76)}
          <rect x="28" y="96" width="92" height="70" rx="10" fill={`url(#${id}-metal)`} />
          <ellipse cx="74" cy="96" rx="46" ry="10" fill={t.b} />
          <path d="M34,90 C34,70 114,70 114,90Z" fill={`url(#${id}-metal)`} /><rect x="66" y="66" width="16" height="8" rx="3" fill="#333" />
          <rect x="120" y="124" width="56" height="42" rx="8" fill={`url(#${id}-metal)`} />
          <rect x="176" y="136" width="20" height="8" rx="4" fill="#333" />
          <path d="M8,120 h22 M8,140 h22" stroke="#333" strokeWidth="6" strokeLinecap="round" />
        </>
      );
    case 'cooker':
      return (
        <>
          {shadow(96, 174, 62)}
          <path d="M44,92 L44,160 C44,172 148,172 148,160 L148,92Z" fill={`url(#${id}-metal)`} />
          <ellipse cx="96" cy="92" rx="52" ry="12" fill={t.b} />
          <path d="M50,86 C50,66 142,66 142,86Z" fill={`url(#${id}-metal)`} />
          <rect x="140" y="74" width="54" height="12" rx="6" fill="#222" />
          <rect x="88" y="48" width="16" height="20" rx="4" fill="#222" /><circle cx="96" cy="46" r="7" fill="#444" />
          <path d="M96,36 q-8,-12 0,-22 M104,34 q8,-10 2,-20" stroke="#CFC2B0" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
    case 'jars':
      return (
        <>
          {shadow(100, 176, 80)}
          {[[48, 72, '#F5C518'], [100, 56, '#8D6E63'], [152, 80, '#E8761A']].map(([x, top, fill], i) => (
            <g key={i}>
              <rect x={x - 24} y={top + 14} width="48" height={160 - top} rx="10" fill="#E3F4F5" fillOpacity=".7" stroke={t.b} strokeWidth="2" />
              <rect x={x - 21} y={top + 50} width="42" height={121 - top} rx="8" fill={fill} opacity=".85" />
              <rect x={x - 26} y={top} width="52" height="16" rx="5" fill="#C8A26B" stroke="#8D6E3F" />
            </g>
          ))}
        </>
      );
    case 'masala':
      return (
        <>
          {shadow(100, 170, 80)}
          <ellipse cx="100" cy="116" rx="84" ry="42" fill={`url(#${id}-metal)`} />
          <ellipse cx="100" cy="112" rx="76" ry="36" fill="#D8D8D8" />
          {[[100, 112, '#E53935'], [52, 106, '#F5C518'], [148, 106, '#8D6E63'], [74, 86, '#FF9800'], [126, 86, '#4CAF50'], [74, 136, '#212121'], [126, 136, '#FFF3DC']].map(([x, y, c], i) => (
            <g key={i}><ellipse cx={x} cy={y} rx="20" ry="11" fill="#BDBDBD" /><ellipse cx={x} cy={y} rx="16" ry="8" fill={c} /></g>
          ))}
        </>
      );
    case 'tiffin':
      return (
        <>
          {shadow(100, 176, 50)}
          {[60, 96, 132].map((y) => <g key={y}><rect x="56" y={y} width="88" height="36" rx="8" fill={`url(#${id}-metal)`} /><line x1="56" y1={y + 34} x2="144" y2={y + 34} stroke={t.c} strokeOpacity=".4" /></g>)}
          <rect x="46" y="72" width="8" height="92" rx="4" fill={t.c} /><rect x="146" y="72" width="8" height="92" rx="4" fill={t.c} />
          <path d="M50,72 C50,20 150,20 150,72" stroke={t.c} strokeWidth="6" fill="none" />
        </>
      );
    case 'spatula':
      return (
        <>
          {shadow(100, 178, 70)}
          {[[-18, 'ladle'], [-6, 'flat'], [6, 'spoon'], [18, 'slot']].map(([r, k]) => (
            <g key={r} transform={`rotate(${r} 100 180)`}>
              <rect x="95" y="70" width="10" height="100" rx="5" fill={`url(#${id}-body)`} />
              {k === 'flat' && <rect x="86" y="24" width="28" height="50" rx="8" fill={`url(#${id}-body)`} />}
              {k === 'spoon' && <ellipse cx="100" cy="50" rx="16" ry="24" fill={`url(#${id}-body)`} />}
              {k === 'ladle' && <circle cx="100" cy="54" r="20" fill={`url(#${id}-body)`} />}
              {k === 'slot' && <g><rect x="86" y="24" width="28" height="50" rx="8" fill={`url(#${id}-body)`} /><rect x="95" y="32" width="3" height="30" fill={t.c} /><rect x="103" y="32" width="3" height="30" fill={t.c} /></g>}
            </g>
          ))}
        </>
      );
    case 'toran':
      return (
        <>
          <rect x="6" y="40" width="188" height="26" rx="4" fill={`url(#${id}-body)`} />
          <rect x="6" y="44" width="188" height="3" fill="#E9C46A" />
          <rect x="6" y="59" width="188" height="3" fill="#E9C46A" />
          {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={16 + i * 21} cy="53" r="4" fill={MARIGOLD[i % 3]} />)}
          {Array.from({ length: 8 }, (_, i) => {
            const x = 24 + i * 22;
            return (
              <g key={i}>
                <path d={`M${x},66 C${x + 10},90 ${x + 6},116 ${x},128 C${x - 6},116 ${x - 10},90 ${x},66Z`} fill={i % 2 ? '#3F7A3C' : '#5E9A4E'} />
                <line x1={x} y1="70" x2={x} y2="124" stroke="#2c5a28" strokeWidth="1" />
                {i % 2 === 0 && <g><line x1={x + 11} y1="66" x2={x + 11} y2="150" stroke="#C8943A" /><circle cx={x + 11} cy="104" r="5" fill={MARIGOLD[i % 3]} /><path d={`M${x + 5},150 C${x + 5},160 ${x + 17},160 ${x + 17},150Z`} fill="#C8943A" /></g>}
              </g>
            );
          })}
        </>
      );
    default:
      return draw('diya', t, id);
  }
}

export default function ProductArt({ art, variant = 0, className = '', title, bare = false, ...pos }) {
  const rid = useId().replace(/:/g, '');
  const type = art?.type || 'diya';
  const t = TONES[art?.tone] || TONES.gold;
  const night = variant === 1;
  const zoom = variant === 2 ? 'translate(100 100) scale(1.45) translate(-100 -92)' : variant === 3 ? 'translate(100 100) scale(0.8) translate(-100 -100)' : '';
  return (
    <svg className={bare ? className : `art ${className}`} viewBox="0 0 200 200" role={bare ? undefined : 'img'} aria-label={bare ? undefined : title || type} aria-hidden={bare || undefined} preserveAspectRatio="xMidYMid slice" overflow="visible" {...pos}>
      <defs>
        <radialGradient id={`${rid}-bg`} cx="50%" cy="38%" r="75%">
          <stop offset="0" stopColor={night ? '#3A1F4F' : t.bg1} />
          <stop offset="1" stopColor={night ? '#150E26' : t.bg2} />
        </radialGradient>
        <radialGradient id={`${rid}-glow`}>
          <stop offset="0" stopColor="#FFD36B" stopOpacity=".75" />
          <stop offset=".45" stopColor="#FFB347" stopOpacity=".28" />
          <stop offset="1" stopColor="#FFB347" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${rid}-fire`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FF7A1A" />
          <stop offset=".6" stopColor="#FFB02E" />
          <stop offset="1" stopColor="#FFE38A" />
        </linearGradient>
        <linearGradient id={`${rid}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.a} />
          <stop offset="1" stopColor={t.b} />
        </linearGradient>
        <linearGradient id={`${rid}-metal`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={t.b} />
          <stop offset=".35" stopColor={t.a} />
          <stop offset=".55" stopColor="#FFF3C8" />
          <stop offset=".75" stopColor={t.a} />
          <stop offset="1" stopColor={t.b} />
        </linearGradient>
        <pattern id={`${rid}-jaal`} width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M11,2 L20,11 L11,20 L2,11Z" fill="none" stroke={night ? '#E9C46A' : t.b} strokeOpacity=".14" />
        </pattern>
      </defs>
      {!bare && <rect width="200" height="200" fill={`url(#${rid}-bg)`} />}
      {!bare && (variant === 3 || night) && <rect width="200" height="200" fill={`url(#${rid}-jaal)`} />}
      <g transform={zoom}>{draw(type, t, rid)}</g>
    </svg>
  );
}

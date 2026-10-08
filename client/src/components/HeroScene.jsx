import ProductArt from './ProductArt.jsx';

/**
 * The hero illustration: a carved jharokha doorway on Diwali night — toran and
 * string lights across the arch, a row of lit diyas on the threshold, rangoli
 * in front and an urli of floating flowers.
 */
export default function HeroScene() {
  return (
    <svg className="hero-scene" viewBox="0 0 520 520" role="img" aria-label="A decorated doorway on Diwali night with diyas, rangoli, toran and lights">
      <defs>
        <linearGradient id="hs-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7A1630" />
          <stop offset="1" stopColor="#4A0A1A" />
        </linearGradient>
        <linearGradient id="hs-door" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A1640" />
          <stop offset="1" stopColor="#140B22" />
        </linearGradient>
        <radialGradient id="hs-warm" cx="50%" cy="92%" r="60%">
          <stop offset="0" stopColor="#FFB347" stopOpacity=".55" />
          <stop offset="1" stopColor="#FFB347" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hs-gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B8862B" /><stop offset=".5" stopColor="#F3D48A" /><stop offset="1" stopColor="#B8862B" />
        </linearGradient>
        <pattern id="hs-jaali" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M9 1 17 9 9 17 1 9Z" fill="none" stroke="#E9C46A" strokeOpacity=".18" />
          <circle cx="9" cy="9" r="1.4" fill="#E9C46A" fillOpacity=".25" />
        </pattern>
      </defs>

      {/* arch frame */}
      <path d="M60,500 L60,210 C60,110 150,40 260,40 C370,40 460,110 460,210 L460,500Z" fill="url(#hs-wall)" />
      <path d="M60,500 L60,210 C60,110 150,40 260,40 C370,40 460,110 460,210 L460,500Z" fill="url(#hs-jaali)" />
      <path d="M100,500 L100,220 C100,140 172,84 260,84 C348,84 420,140 420,220 L420,500Z" fill="none" stroke="url(#hs-gold)" strokeWidth="6" />
      <path d="M118,500 L118,226 C118,154 182,104 260,104 C338,104 402,154 402,226 L402,500Z" fill="url(#hs-door)" />
      {/* door panels */}
      <g opacity=".55" stroke="#C8943A" strokeWidth="1.5" fill="none">
        <path d="M260,120 L260,500" />
        <rect x="140" y="250" width="100" height="90" rx="6" />
        <rect x="280" y="250" width="100" height="90" rx="6" />
        <rect x="140" y="360" width="100" height="90" rx="6" />
        <rect x="280" y="360" width="100" height="90" rx="6" />
      </g>
      <circle cx="248" cy="330" r="5" fill="#E9C46A" /><circle cx="272" cy="330" r="5" fill="#E9C46A" />
      <rect x="0" y="0" width="520" height="520" fill="url(#hs-warm)" />

      {/* string lights along the arch */}
      <path d="M78,230 C90,120 170,58 260,58 C350,58 430,120 442,230" stroke="#3a2230" strokeWidth="2" fill="none" />
      {Array.from({ length: 17 }, (_, i) => {
        const a = Math.PI - (i / 16) * Math.PI;
        const x = 260 + Math.cos(a) * 182;
        const y = 232 - Math.sin(a) * 174;
        return (
          <g key={i} className="twinkle" style={{ animationDelay: `${(i % 6) * 0.35}s` }}>
            <circle cx={x} cy={y} r="11" fill="#FFD36B" opacity=".25" />
            <circle cx={x} cy={y} r="4" fill="#FFE9A8" />
          </g>
        );
      })}

      {/* toran across the top of the doorway */}
      <ProductArt bare art={{ type: 'toran', tone: 'maroon' }} x="120" y="72" width="280" height="280" preserveAspectRatio="xMidYMin meet" />

      {/* hanging lanterns */}
      <ProductArt bare art={{ type: 'akash', tone: 'orange' }} x="18" y="40" width="110" height="130" />
      <ProductArt bare art={{ type: 'akash', tone: 'purple' }} x="392" y="40" width="110" height="130" />

      {/* threshold + diyas */}
      <rect x="40" y="440" width="440" height="22" rx="4" fill="#3A1020" />
      <rect x="40" y="440" width="440" height="4" fill="url(#hs-gold)" />
      {[70, 128, 350, 408].map((x) => (
        <ProductArt bare key={x} art={{ type: 'diya', tone: x % 2 ? 'orange' : 'maroon' }} x={x - 20} y="380" width="86" height="86" />
      ))}

      {/* rangoli + urli in the foreground */}
      <ellipse cx="260" cy="492" rx="150" ry="30" fill="#000" opacity=".25" />
      <g transform="translate(260 486) scale(1 .34) translate(-260 -486)">
        <ProductArt bare art={{ type: 'rangoli', tone: 'maroon' }} x="130" y="356" width="260" height="260" />
      </g>
      <ProductArt bare art={{ type: 'urli', tone: 'gold' }} x="196" y="368" width="128" height="128" />
    </svg>
  );
}

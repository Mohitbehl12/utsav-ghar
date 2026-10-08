/**
 * Starter catalogue. Used by the server seed script (server/src/seed.js) and by
 * the in-browser demo backend. Prices are in RUPEES here and converted to paise
 * on insert. `art` drives the built-in SVG illustration shown until real product
 * photos are uploaded from the admin panel.
 */

import { BRAND } from './brand.js';

export { BRAND };

// `segment` places each category in a top-level store section (see shared/festivals.js).
export const categories = [
  { slug: 'diyas-candles', segment: 'festive-decor', name: 'Diyas & Candles', icon: '🪔', art: { type: 'diya', tone: 'gold' }, description: 'Hand-crafted clay, brass & scented diyas' },
  { slug: 'diwali-lights', segment: 'festive-decor', name: 'Festive Lights', icon: '💡', art: { type: 'lights', tone: 'navy' }, description: 'Fairy lights, curtain lights & LED diyas' },
  { slug: 'lanterns', segment: 'festive-decor', name: 'Lanterns', icon: '🏮', art: { type: 'lantern', tone: 'maroon' }, description: 'Akash kandils, crescent, metal & paper lanterns' },
  { slug: 'flowers-rangoli', segment: 'festive-decor', name: 'Flowers & Rangoli', icon: '🌸', art: { type: 'rangoli', tone: 'orange' }, description: 'Rangoli colours, pookalam kits & marigold garlands' },
  { slug: 'festive-decor', segment: 'festive-decor', name: 'Festive Décor', icon: '✨', art: { type: 'garland', tone: 'orange' }, description: 'Garlands, hangings, dandiya, kites & table décor' },
  { slug: 'door-wall-decor', segment: 'festive-decor', name: 'Door & Wall Décor', icon: '🎀', art: { type: 'toran', tone: 'green' }, description: 'Torans, bandhanwars & wall hangings' },
  { slug: 'christmas-decor', segment: 'festive-decor', name: 'Christmas Décor', icon: '🎄', art: { type: 'xmas-tree', tone: 'green' }, description: 'Trees, baubles, wreaths, stars & stockings' },
  { slug: 'party-decor', segment: 'festive-decor', name: 'Party & New Year', icon: '🎉', art: { type: 'party', tone: 'purple' }, description: 'Party kits, balloons & banners for celebrations' },
  { slug: 'holi-colours', segment: 'festive-decor', name: 'Holi Colours', icon: '🎨', art: { type: 'gulal', tone: 'pink' }, description: 'Herbal gulal, pichkaris & Holi hampers' },
  { slug: 'pooja-essentials', segment: 'pooja', name: 'Pooja Essentials', icon: '🛕', art: { type: 'thali', tone: 'maroon' }, description: 'Thalis, kalash, bells & daily pooja needs' },
  { slug: 'spiritual-decor', segment: 'pooja', name: 'Spiritual Décor', icon: '🧿', art: { type: 'nazar', tone: 'navy' }, description: 'Om, swastik & nazar protection décor' },
  { slug: 'home-decor', segment: 'home-decor', name: 'Home Décor', icon: '🏠', art: { type: 'urli', tone: 'navy' }, description: 'Urlis, cushions, runners & brass accents' },
  { slug: 'dinnerware', segment: 'dining', name: 'Dinner Sets & Plates', icon: '🍽️', art: { type: 'dinner-set', tone: 'cream' }, description: 'Ceramic, stoneware, brass & eco leaf plates' },
  { slug: 'serveware', segment: 'dining', name: 'Bowls & Serveware', icon: '🥣', art: { type: 'bowl-set', tone: 'orange' }, description: 'Serving bowls, handis, trays & dry-fruit boxes' },
  { slug: 'drinkware', segment: 'dining', name: 'Cups, Mugs & Glasses', icon: '☕', art: { type: 'cup-saucer', tone: 'teal' }, description: 'Tea cups, kulhads, copper bottles & glassware' },
  { slug: 'cookware', segment: 'kitchen', name: 'Cookware', icon: '🍳', art: { type: 'kadhai', tone: 'navy' }, description: 'Kadhais, tawas, cookers & festive cooking tools' },
  { slug: 'kitchen-storage', segment: 'kitchen', name: 'Storage & Tools', icon: '🫙', art: { type: 'jars', tone: 'green' }, description: 'Jars, masala dabbas, tiffins & wooden tools' },
  { slug: 'diwali-gifts', segment: 'gifts', name: 'Gifts & Hampers', icon: '🎁', art: { type: 'hamper', tone: 'purple' }, description: 'Curated hampers for family, friends & colleagues' },
  { slug: 'rakhi', segment: 'gifts', name: 'Rakhi', icon: '🧵', art: { type: 'rakhi', tone: 'maroon' }, description: 'Kundan, lumba & kids rakhis with roli-chawal' },
  { slug: 'combos', segment: 'gifts', name: 'Combos & Bundles', icon: '🧺', art: { type: 'hamper', tone: 'orange' }, description: 'Ready sets at a better price than buying separately' },
];

const std = {
  delivery: 'Dispatched within 24–48 hours. Delivered in 3–6 business days across India.',
};

// [slug, name, category, price, mrp, rating, reviews, stock, art, flags, short, material, dimensions, weight, included, care]
const P = [
  ['premium-brass-diya', 'Premium Brass Diya', 'diyas-candles', 399, 599, 4.8, 214, 120, ['brass-diya', 'gold'], 'bf', 'Solid brass kuber diya with engraved petals', 'Solid brass', '10 × 10 × 6 cm', '320 g', '1 brass diya, 10 cotton wicks', 'Wipe with a dry cloth; polish with lemon & salt'],
  ['terracotta-diya-set-12', 'Hand-painted Terracotta Diyas (Set of 12)', 'diyas-candles', 349, 499, 4.7, 388, 200, ['diya', 'orange'], 'bfn', 'Artisan-painted clay diyas, ready to light', 'Terracotta, eco paints', '7 cm diameter each', '600 g', '12 diyas', 'Soak in water 1 hour before first use'],
  ['lotus-tealight-holder', 'Lotus Tealight Holder', 'diyas-candles', 499, 799, 4.6, 97, 60, ['lotus', 'purple'], 'n', 'Glass-and-metal lotus that glows from within', 'Iron, glass', '14 × 14 × 8 cm', '280 g', '1 holder, 2 tealights', 'Keep away from water'],
  ['scented-jar-candle-sandal', 'Sandalwood Jar Candle', 'diyas-candles', 449, 649, 4.5, 72, 80, ['candle', 'cream'], '', 'Soy wax candle, 30-hour burn', 'Soy wax, glass jar', '8 × 8 × 9 cm', '350 g', '1 candle', 'Trim wick to 5 mm before each burn'],
  ['floating-diya-set-6', 'Floating Flower Diyas (Set of 6)', 'diyas-candles', 299, 449, 4.4, 131, 150, ['diya', 'maroon'], 'n', 'Wax-filled diyas that float in urlis', 'Wax, PVC petals', '6 cm each', '240 g', '6 floating diyas', 'Store in a cool place'],

  ['brass-pooja-thali-set', 'Brass Pooja Thali Set (7 pcs)', 'pooja-essentials', 1299, 1899, 4.9, 176, 45, ['thali', 'gold'], 'bf', 'Complete thali with diya, bell, kalash & more', 'Brass', '28 cm thali', '1.1 kg', 'Thali, diya, kalash, bell, agarbatti stand, kumkum bowl, spoon', 'Clean with pitambari powder'],
  ['copper-kalash', 'Hammered Copper Kalash', 'pooja-essentials', 699, 999, 4.7, 64, 55, ['kalash', 'orange'], 'n', 'Traditional kalash for sthapana', 'Pure copper', '12 × 12 × 15 cm', '420 g', '1 kalash', 'Clean with tamarind or lemon'],
  ['brass-pooja-bell', 'Brass Pooja Ghanti', 'pooja-essentials', 549, 749, 4.8, 88, 70, ['bell', 'gold'], '', 'Clear, resonant tone with Nandi handle', 'Brass', '6 × 6 × 15 cm', '300 g', '1 bell', 'Polish occasionally'],
  ['incense-gift-box', 'Temple Incense Collection', 'pooja-essentials', 249, 349, 4.5, 203, 300, ['incense', 'maroon'], 'b', 'Six hand-rolled fragrances, 120 sticks', 'Natural resins, bamboo', '22 × 10 × 4 cm', '200 g', '120 sticks, 1 holder', 'Store in a dry place'],

  ['rangoli-colours-10', 'Rangoli Colours (10 Shades)', 'flowers-rangoli', 299, 449, 4.6, 412, 250, ['rangoli', 'purple'], 'bn', 'Bright, skin-safe rangoli powder with funnels', 'Natural stone powder, colour', '10 × 100 g', '1 kg', '10 packs, 2 funnels', 'Keep sealed and dry'],
  ['rangoli-stencil-kit', 'Rangoli Stencil & Tool Kit', 'flowers-rangoli', 399, 599, 4.4, 96, 90, ['rangoli', 'orange'], '', 'Reusable stencils for perfect patterns', 'Food-grade plastic', '30 cm stencils', '350 g', '6 stencils, 4 tools', 'Wash and dry flat'],
  ['marigold-garland-5', 'Artificial Marigold Garlands (5 pcs)', 'flowers-rangoli', 449, 699, 4.5, 158, 140, ['garland', 'orange'], 'b', 'Lifelike genda strings, reusable every year', 'Fabric, nylon string', '1.5 m each', '400 g', '5 garlands', 'Dust gently'],

  ['copper-fairy-lights-10m', 'Warm Copper Fairy Lights (10 m)', 'diwali-lights', 349, 599, 4.6, 520, 400, ['lights', 'navy'], 'bf', '100 warm-white LEDs, 8 modes', 'Copper wire, LED', '10 m', '150 g', 'Light string, USB adapter', 'Indoor/outdoor, avoid submerging'],
  ['led-curtain-lights', 'Star Curtain Lights', 'diwali-lights', 899, 1399, 4.7, 211, 110, ['lights', 'purple'], 'n', '138 LEDs with 12 hanging stars', 'PVC, LED', '2.5 × 1 m', '500 g', 'Curtain light, remote', 'Unplug when not in use'],
  ['led-diya-set-6', 'Flameless LED Diyas (Set of 6)', 'diwali-lights', 499, 799, 4.4, 175, 160, ['diya', 'navy'], '', 'Safe flickering diyas, battery included', 'ABS, LED', '6 cm each', '220 g', '6 LED diyas with cells', 'Remove batteries when storing'],

  ['akash-kandil-lantern', 'Handmade Akash Kandil', 'lanterns', 599, 899, 4.8, 142, 75, ['akash', 'maroon'], 'bf', 'Traditional star lantern with tassels', 'Paper, bamboo, fabric', '40 × 40 cm', '300 g', 'Kandil, bulb holder', 'Keep dry'],
  ['moroccan-metal-lantern', 'Moroccan Metal Lantern', 'lanterns', 1199, 1699, 4.6, 58, 40, ['lantern', 'gold'], 'n', 'Filigree lantern that throws patterned light', 'Iron, antique finish', '16 × 16 × 30 cm', '900 g', '1 lantern', 'Wipe with a dry cloth'],
  ['paper-lantern-set-3', 'Festive Paper Lanterns (Set of 3)', 'lanterns', 449, 699, 4.3, 91, 130, ['lantern', 'orange'], '', 'Foldable lanterns in maroon, gold & saffron', 'Paper, metal frame', '25 cm each', '250 g', '3 lanterns', 'Store folded'],

  ['brass-urli-bowl', 'Brass Urli Bowl', 'home-decor', 1499, 2199, 4.8, 83, 35, ['urli', 'gold'], 'bf', 'Wide urli for flowers & floating diyas', 'Brass', '30 cm diameter', '1.3 kg', '1 urli', 'Polish with brass cleaner'],
  ['mandala-cushion-covers', 'Zari Mandala Cushion Covers (Set of 2)', 'home-decor', 799, 1199, 4.5, 64, 90, ['cushion', 'maroon'], 'n', 'Velvet covers with gold zari embroidery', 'Velvet, zari', '40 × 40 cm', '400 g', '2 covers', 'Dry clean only'],
  ['festive-table-runner', 'Brocade Table Runner', 'home-decor', 649, 999, 4.4, 47, 70, ['runner', 'purple'], '', 'Rich brocade runner for festive tables', 'Silk-blend brocade', '180 × 35 cm', '300 g', '1 runner', 'Dry clean only'],

  ['diwali-hamper-classic', 'Classic Diwali Hamper', 'diwali-gifts', 1499, 2199, 4.9, 126, 60, ['hamper', 'maroon'], 'bf', 'Diyas, dry fruits box, candle & greeting card', 'Mixed', '30 × 25 × 10 cm', '1.4 kg', 'Brass diya, 200 g dry fruits, candle, card', 'Consume dry fruits within 3 months'],
  ['corporate-gift-box', 'Corporate Gift Box', 'diwali-gifts', 999, 1499, 4.7, 204, 150, ['giftbox', 'purple'], 'n', 'Elegant box with diya & festive treats', 'Mixed', '25 × 20 × 8 cm', '900 g', '2 diyas, sweets, card', 'Store in a cool place'],
  ['silver-plated-diya-gift', 'Silver-Plated Diya Gift Set', 'diwali-gifts', 899, 1299, 4.6, 71, 80, ['brass-diya', 'cream'], '', 'Gift-boxed pair of silver-plated diyas', 'Silver-plated brass', '8 cm each', '350 g', '2 diyas in box', 'Wipe with soft cloth'],

  ['beaded-hanging-garland', 'Beaded Festive Hanging', 'festive-decor', 399, 599, 4.5, 118, 160, ['garland', 'maroon'], 'b', 'Beads & bells hanging for doors & corners', 'Beads, bells, thread', '1 m', '200 g', '2 hangings', 'Dust gently'],
  ['festive-table-centrepiece', 'Floral Table Centrepiece', 'festive-decor', 749, 1099, 4.6, 52, 55, ['urli', 'orange'], 'n', 'Urli-style centrepiece with faux florals', 'Metal, faux flowers', '25 cm', '600 g', 'Bowl, flowers, 4 tealights', 'Dust gently'],
  ['shubh-labh-hanging', 'Shubh Labh Hanging', 'festive-decor', 299, 449, 4.7, 186, 190, ['wallhang', 'gold'], 'b', 'Auspicious pair for entrance walls', 'MDF, beads, gota', '35 cm each', '180 g', '1 pair', 'Keep dry'],

  ['om-wall-hanging', 'Brass Om Wall Hanging', 'spiritual-decor', 699, 999, 4.8, 77, 50, ['om', 'gold'], 'f', 'Hand-finished brass Om for pooja rooms', 'Brass', '20 × 20 cm', '400 g', '1 hanging, hook', 'Polish occasionally'],
  ['evil-eye-nazar-hanging', 'Evil-Eye Nazar Hanging', 'spiritual-decor', 349, 499, 4.6, 144, 180, ['nazar', 'navy'], 'n', 'Glass nazar with bells for protection', 'Glass, metal, beads', '45 cm', '150 g', '1 hanging', 'Wipe with soft cloth'],

  ['marigold-toran', 'Marigold & Mango Leaf Toran', 'door-wall-decor', 549, 849, 4.7, 233, 120, ['toran', 'orange'], 'bf', 'Door toran with bells and mango leaves', 'Fabric, beads, bells', '1 m', '350 g', '1 toran', 'Dust gently'],
  ['gota-patti-bandhanwar', 'Gota Patti Bandhanwar', 'door-wall-decor', 649, 999, 4.6, 69, 65, ['toran', 'maroon'], 'n', 'Rajasthani gota-work bandhanwar', 'Fabric, gota lace', '1 m', '300 g', '1 bandhanwar', 'Dry clean'],
  ['swastik-door-sticker-set', 'Swastik & Kalash Door Décor', 'door-wall-decor', 249, 399, 4.4, 102, 220, ['wallhang', 'maroon'], '', 'Reusable acrylic door décor set', 'Acrylic, kundan', '10 cm pieces', '100 g', '4 pieces', 'Peel off gently'],

  // ---- festival specials ----
  ['karwa-chauth-thali', 'Karwa Chauth Thali Set with Channi', 'pooja-essentials', 799, 1199, 4.7, 96, 80, ['thali', 'maroon'], 'n', 'Decorated thali with channi, karwa, diya & kalash', 'Steel, fabric, beads', '30 cm thali', '900 g', 'Thali, channi, karwa, diya, kalash', 'Wipe clean'],
  ['chhath-soop-daura', 'Chhath Puja Soop & Daura Set', 'pooja-essentials', 599, 899, 4.6, 41, 60, ['hamper', 'orange'], 'n', 'Handwoven bamboo soop & daura for arghya', 'Bamboo', '40 cm soop', '700 g', '1 soop, 1 daura', 'Keep dry'],
  ['dandiya-sticks-2-pairs', 'Mirror-work Dandiya Sticks (2 pairs)', 'festive-decor', 349, 499, 4.6, 128, 150, ['dandiya', 'orange'], 'bn', 'Lightweight sticks with mirror & tassel work', 'Wood, mirror, fabric', '35 cm each', '300 g', '4 sticks', 'Wipe with dry cloth'],
  ['dahi-handi-matki', 'Decorated Dahi Handi Matki', 'festive-decor', 449, 649, 4.5, 37, 70, ['matki', 'orange'], 'n', 'Hand-painted clay matki with beads & mirrors', 'Terracotta, beads', '18 cm', '600 g', '1 matki', 'Handle with care'],
  ['peacock-flute-decor', 'Peacock Feather Flute Décor', 'spiritual-decor', 299, 449, 4.6, 58, 110, ['flute', 'gold'], '', 'Decorative bansuri with peacock feather for the mandir', 'Bamboo, feather, beads', '30 cm', '80 g', '1 flute', 'Dust gently'],
  ['crescent-moon-lantern', 'Crescent Moon Lantern', 'lanterns', 899, 1299, 4.7, 44, 50, ['moon', 'gold'], 'n', 'Brass-finish crescent & star lantern for Eid nights', 'Iron, glass', '22 × 12 × 34 cm', '700 g', '1 lantern, 1 LED candle', 'Wipe with a dry cloth'],
  ['kite-set-10', 'Paper Kites with Manjha (Set of 10)', 'festive-decor', 399, 599, 4.4, 83, 120, ['kite', 'orange'], 'n', 'Colourful patang set with a cotton-thread firki', 'Paper, bamboo, cotton thread', '55 cm kites', '400 g', '10 kites, 1 firki', 'Store flat'],
  ['pookalam-flower-kit', 'Pookalam Flower Rangoli Kit', 'flowers-rangoli', 499, 749, 4.5, 39, 60, ['rangoli', 'green'], 'n', 'Reusable fabric petals and a 60 cm pookalam guide', 'Fabric petals, card', '60 cm design', '500 g', 'Petals in 8 colours, guide', 'Store in the box'],
  ['modak-mould-brass', 'Brass Modak Mould', 'cookware', 349, 499, 4.7, 66, 90, ['modak', 'gold'], 'n', 'Makes 11-pleat ukadiche modak for Ganpati', 'Brass', '8 cm', '180 g', '1 mould', 'Wash and dry immediately'],
  ['brass-pongal-pot', 'Brass Pongal Pot', 'cookware', 1299, 1799, 4.6, 29, 30, ['matki', 'gold'], '', 'Traditional vessel for sakkarai pongal', 'Brass, tin-lined', '2 L', '1.1 kg', '1 pot', 'Re-tin when the lining wears'],

  // ---- Christmas & New Year ----
  ['christmas-tree-6ft', 'Pre-lit Christmas Tree (6 ft)', 'christmas-decor', 2499, 3499, 4.6, 88, 30, ['xmas-tree', 'green'], 'bfn', 'Full pine tree with 200 warm LEDs and metal stand', 'PVC needles, metal stand, LED', '183 cm', '5 kg', 'Tree in 3 parts, stand, lights', 'Store in the box after the season'],
  ['christmas-bauble-set-24', 'Christmas Bauble Set (24 pcs)', 'christmas-decor', 599, 899, 4.5, 142, 120, ['bauble', 'maroon'], 'b', 'Shatterproof matte, glitter & shiny baubles', 'Shatterproof plastic', '6 cm each', '400 g', '24 baubles with hooks', 'Dust gently'],
  ['christmas-star-lantern', 'LED Christmas Star Lantern', 'christmas-decor', 699, 999, 4.6, 61, 80, ['star', 'gold'], 'n', 'Paper star with a warm LED — Goa & Kerala style', 'Paper, bamboo, LED', '45 cm', '250 g', '1 star, LED holder', 'Keep dry'],
  ['pine-berry-wreath', 'Pine & Berry Door Wreath', 'christmas-decor', 899, 1299, 4.5, 34, 45, ['wreath', 'green'], 'n', 'Lush wreath with berries, cones and a velvet bow', 'PVC, pine cones, velvet', '40 cm', '600 g', '1 wreath', 'Store flat'],
  ['christmas-stockings-3', 'Christmas Stockings (Set of 3)', 'christmas-decor', 499, 799, 4.4, 27, 60, ['stocking', 'maroon'], '', 'Knitted stockings with name tags for the mantel', 'Knitted acrylic', '45 cm', '300 g', '3 stockings', 'Hand wash'],
  ['new-year-party-kit', 'New Year Party Kit', 'party-decor', 799, 1199, 4.5, 74, 90, ['party', 'purple'], 'bn', 'Banner, 30 balloons, props, poppers & fairy lights', 'Foil, latex, paper', 'Banner 2 m', '700 g', 'Banner, 30 balloons, 12 props, 4 poppers, lights', 'Keep balloons away from heat'],
  ['balloon-garland-kit', 'Gold & Black Balloon Garland Kit', 'party-decor', 649, 999, 4.4, 52, 80, ['party', 'navy'], '', '100-balloon arch kit with strip and glue dots', 'Latex, foil', '4 m arch', '500 g', '100 balloons, strip, glue dots, pump', 'Keep away from sharp edges'],
  ['celebration-foil-banner', 'Celebration Foil Banner', 'party-decor', 299, 449, 4.3, 45, 150, ['party', 'gold'], '', 'Reusable gold foil letters: Happy New Year / Birthday', 'Foil', '2.5 m', '100 g', '2 banners, string', 'Fold gently'],

  // ---- Holi & Rakhi ----
  ['herbal-gulal-5', 'Herbal Gulal (5 Colours)', 'holi-colours', 349, 499, 4.7, 211, 200, ['gulal', 'pink'], 'bn', 'Skin-friendly colours from flowers & corn starch', 'Corn starch, flower extracts', '5 × 100 g', '550 g', '5 colour pouches', 'Keep dry; patch-test on sensitive skin'],
  ['pichkari-tank', 'Pichkari Water Gun with Tank', 'holi-colours', 399, 599, 4.4, 97, 120, ['pichkari', 'green'], 'n', 'Big pichkari with 1 L back tank', 'BPA-free plastic', '45 cm', '450 g', '1 pichkari, 1 tank', 'Rinse and dry after use'],
  ['holi-gift-hamper', 'Holi Gift Hamper', 'holi-colours', 999, 1499, 4.6, 48, 50, ['hamper', 'pink'], 'n', 'Herbal gulal, thandai mix, gujiya box & a small pichkari', 'Mixed', '30 × 25 × 10 cm', '1.2 kg', 'Gulal, thandai, 250 g gujiya, pichkari', 'Consume sweets within 10 days'],
  ['kundan-rakhi-set', 'Kundan Rakhi Set with Roli-Chawal', 'rakhi', 299, 449, 4.7, 176, 200, ['rakhi', 'maroon'], 'bn', 'Two kundan rakhis with roli, chawal & a card', 'Kundan, silk thread', '6 cm', '60 g', '2 rakhis, roli, chawal, card', 'Keep in the box'],
  ['bhaiya-bhabhi-rakhi', 'Bhaiya-Bhabhi Lumba Rakhi Pair', 'rakhi', 349, 549, 4.6, 88, 150, ['rakhi', 'gold'], '', 'Matching rakhi and lumba with pearl work', 'Beads, pearl, thread', '7 cm', '50 g', '1 rakhi, 1 lumba', 'Keep in the box'],
  ['rakhi-gift-hamper', 'Rakhi Gift Hamper with Dry Fruits', 'rakhi', 1199, 1699, 4.8, 64, 60, ['hamper', 'orange'], 'f', 'Designer rakhi, 250 g dry fruits, chocolates & tilak thali', 'Mixed', '30 × 25 × 10 cm', '1.1 kg', 'Rakhi, dry fruits, chocolates, mini thali', 'Store in a cool place'],
  ['kids-rakhi-set', 'Kids Light-up Rakhi (Set of 3)', 'rakhi', 249, 399, 4.4, 57, 150, ['rakhi', 'purple'], '', 'Soft rakhis that glow, with cells included', 'Foam, LED, thread', '8 cm', '60 g', '3 rakhis', 'Remove cells after use'],

  // ---- Crockery & Dining ----
  ['ceramic-dinner-set-18', 'Ceramic Dinner Set (18 pcs)', 'dinnerware', 2999, 4499, 4.6, 132, 40, ['dinner-set', 'cream'], 'bf', 'Service for 6: dinner plates, quarter plates & bowls', 'Microwave-safe ceramic', '27 cm dinner plate', '6.5 kg', '6 dinner plates, 6 quarter plates, 6 bowls', 'Dishwasher safe'],
  ['stoneware-plates-6', 'Hand-glazed Stoneware Plates (Set of 6)', 'dinnerware', 1499, 2199, 4.5, 58, 60, ['plate', 'navy'], 'n', 'Reactive-glaze plates, each one slightly different', 'Stoneware', '26 cm', '4 kg', '6 plates', 'Dishwasher & microwave safe'],
  ['brass-bhojan-thali', 'Brass Bhojan Thali Set (5 pcs)', 'dinnerware', 1899, 2699, 4.7, 47, 35, ['plate', 'gold'], 'f', 'Traditional thali with katoris, glass & spoon', 'Brass', '30 cm thali', '1.6 kg', 'Thali, 2 katoris, glass, spoon', 'Clean with tamarind or pitambari'],
  ['areca-leaf-plates-25', 'Areca Leaf Plates (25 pcs)', 'dinnerware', 249, 399, 4.5, 91, 300, ['plate', 'green'], 'n', 'Eco-friendly plates for sadya, pooja & parties', 'Areca palm leaf', '25 cm', '700 g', '25 plates', 'Single use, compostable'],
  ['serving-bowls-3', 'Hand-painted Serving Bowls (Set of 3)', 'serveware', 999, 1499, 4.6, 73, 70, ['bowl-set', 'orange'], 'b', 'Nesting bowls for sabzi, dal & raita', 'Ceramic', '14, 17 & 20 cm', '1.8 kg', '3 bowls', 'Dishwasher safe'],
  ['copper-serving-handi', 'Copper Serving Handi with Lid', 'serveware', 1299, 1899, 4.7, 52, 40, ['handi', 'orange'], 'f', 'Hammered copper handi with a brass knob', 'Copper, steel-lined', '1.2 L', '800 g', '1 handi with lid', 'Hand wash, polish occasionally'],
  ['mango-wood-tray', 'Mango Wood Serving Tray', 'serveware', 799, 1199, 4.5, 38, 60, ['tray', 'gold'], '', 'Handcrafted tray with brass handles', 'Mango wood, brass', '40 × 25 cm', '900 g', '1 tray', 'Wipe clean, oil occasionally'],
  ['dry-fruit-box-4', 'Dry Fruit Box (4 Compartments)', 'serveware', 699, 999, 4.6, 84, 90, ['tray', 'maroon'], 'b', 'Enamel-painted box for dry fruits & mithai', 'Metal, meenakari', '22 × 22 cm', '700 g', '1 box with lid', 'Wipe with a dry cloth'],
  ['tea-cups-saucers-6', 'Ceramic Tea Cups & Saucers (Set of 6)', 'drinkware', 899, 1299, 4.5, 102, 80, ['cup-saucer', 'cream'], 'b', 'Gold-rim cups for guests and evening chai', 'Bone china', '180 ml', '1.4 kg', '6 cups, 6 saucers', 'Hand wash (gold rim)'],
  ['kulhad-cups-6', 'Clay Kulhad Cups (Set of 6)', 'drinkware', 299, 449, 4.6, 147, 200, ['kulhad', 'orange'], 'n', 'Reusable glazed kulhads for chai & lassi', 'Glazed terracotta', '150 ml', '900 g', '6 kulhads', 'Hand wash'],
  ['copper-water-bottle', 'Pure Copper Water Bottle (1 L)', 'drinkware', 599, 899, 4.6, 238, 150, ['bottle', 'orange'], 'b', 'Leak-proof hammered copper bottle', 'Pure copper', '1 L', '400 g', '1 bottle', 'Clean inside with lemon & salt'],
  ['crystal-tumblers-6', 'Crystal Glass Tumblers (Set of 6)', 'drinkware', 699, 999, 4.4, 66, 90, ['glassware', 'navy'], '', 'Heavy-base glasses for water, thandai & mocktails', 'Lead-free glass', '300 ml', '1.8 kg', '6 glasses', 'Dishwasher safe'],

  // ---- Kitchen ----
  ['cast-iron-kadhai', 'Cast Iron Kadhai (26 cm)', 'cookware', 1299, 1799, 4.7, 156, 60, ['kadhai', 'navy'], 'bf', 'Pre-seasoned kadhai for deep-frying & sabzi', 'Cast iron', '26 cm, 2.5 L', '3 kg', '1 kadhai', 'Dry and oil after washing'],
  ['granite-dosa-tawa', 'Granite Dosa Tawa (28 cm)', 'cookware', 899, 1299, 4.5, 98, 80, ['pan', 'navy'], '', 'Non-toxic granite coating, induction base', 'Aluminium, granite coating', '28 cm', '1.1 kg', '1 tawa', 'Use wooden spatulas'],
  ['triply-cookware-set', 'Tri-ply Steel Cookware Set (3 pcs)', 'cookware', 3499, 4999, 4.6, 64, 30, ['pot', 'cream'], 'n', 'Kadhai, saucepan & fry pan with lids', 'Tri-ply stainless steel', '1.5–2.5 L', '4.2 kg', '3 vessels, 2 lids', 'Dishwasher safe'],
  ['steel-pressure-cooker', 'Stainless Steel Pressure Cooker (3 L)', 'cookware', 1899, 2499, 4.6, 119, 45, ['cooker', 'cream'], '', 'Induction-ready cooker with safety valve', 'Stainless steel', '3 L', '2 kg', 'Cooker, gasket, whistle', 'Replace the gasket yearly'],
  ['glass-jars-6', 'Glass Storage Jars with Bamboo Lids (Set of 6)', 'kitchen-storage', 899, 1299, 4.6, 143, 100, ['jars', 'green'], 'b', 'Airtight jars for dals, snacks & dry fruits', 'Borosilicate glass, bamboo', '650 ml each', '2.4 kg', '6 jars', 'Hand wash lids'],
  ['steel-masala-dabba', 'Steel Masala Dabba (7 bowls)', 'kitchen-storage', 599, 899, 4.7, 188, 120, ['masala', 'cream'], 'b', 'Spice box with see-through lid and spoon', 'Stainless steel', '20 cm', '800 g', 'Box, 7 bowls, spoon', 'Dishwasher safe'],
  ['insulated-lunch-box', 'Insulated Steel Lunch Box (3 tier)', 'kitchen-storage', 749, 1099, 4.4, 71, 90, ['tiffin', 'navy'], '', 'Keeps food warm for 4 hours', 'Stainless steel, insulated bag', '3 × 300 ml', '900 g', '3 containers, bag', 'Hand wash the bag'],
  ['neem-wood-spatulas-5', 'Neem Wood Spatula Set (5 pcs)', 'kitchen-storage', 399, 599, 4.5, 104, 150, ['spatula', 'green'], 'n', 'Non-scratch tools for non-stick & granite pans', 'Neem wood', '30 cm', '300 g', '5 tools', 'Hand wash, dry fully'],
];

/**
 * Products in the current festival collection at launch (Diwali).
 * `cat:<slug>` includes a whole category. When the next festival comes, tick
 * "In current festival collection" on its products in Admin → Products.
 */
const DIWALI_COLLECTION = ['cat:diyas-candles', 'cat:diwali-lights', 'cat:lanterns', 'cat:flowers-rangoli', 'cat:festive-decor', 'cat:door-wall-decor', 'cat:pooja-essentials',
  'cat:spiritual-decor', 'cat:home-decor', 'cat:diwali-gifts', 'cat:combos', 'dry-fruit-box-4', 'serving-bowls-3', 'ceramic-dinner-set-18', 'cast-iron-kadhai'];

export const products = P.map((r, i) => {
  const [slug, name, cat, price, mrp, rating, reviews, stock, art, flags, short, material, dimensions, weight, included, care] = r;
  return {
    slug, name, category_slug: cat, price, mrp, rating, rating_count: reviews, stock,
    // Example purchase cost (38–62% of selling price). Replace with your real costs in Admin → Products or Admin → Profit.
    cost: Math.round(price * (0.38 + ((i * 7) % 9) * 0.03)),
    art: { type: art[0], tone: art[1] },
    is_bestseller: flags.includes('b'),
    is_featured: flags.includes('f'),
    is_new: flags.includes('n'),
    is_diwali: DIWALI_COLLECTION.includes(slug) || DIWALI_COLLECTION.includes(`cat:${cat}`),
    // Powders, incense and battery items are usually not accepted by international couriers.
    ships_international: !['incense-gift-box', 'rangoli-colours-10', 'led-diya-set-6', 'herbal-gulal-5', 'kids-rakhi-set'].includes(slug),
    short_description: short,
    description: `${short}. Thoughtfully sourced from Indian artisans and quality-checked by the ${BRAND.name} team before dispatch — made to bring warmth to your home through every festival and all year round.`,
    specs: { Material: material, Dimensions: dimensions, Weight: weight, "What's included": included, Care: care, Delivery: std.delivery },
    sort: i,
  };
});

/** Combos: each is a product of its own whose stock also draws down its contents. */
export const bundles = [
  { slug: 'diwali-decor-combo', name: 'Diwali Decor Combo', price: 999, art: { type: 'hamper', tone: 'orange' }, stock: 60,
    short: '12 painted diyas, rangoli colours, Shubh Labh pair and marigold garlands',
    items: [['terracotta-diya-set-12', 1], ['rangoli-colours-10', 1], ['shubh-labh-hanging', 1], ['marigold-garland-5', 1]] },
  { slug: 'lakshmi-pooja-combo', name: 'Lakshmi Pooja Combo', price: 1499, art: { type: 'thali', tone: 'maroon' }, stock: 40,
    short: 'Brass pooja thali set, premium brass diya and temple incense',
    items: [['brass-pooja-thali-set', 1], ['premium-brass-diya', 1], ['incense-gift-box', 1]] },
  { slug: 'festive-lights-combo', name: 'Festive Lights Combo', price: 1199, art: { type: 'lights', tone: 'purple' }, stock: 50,
    short: 'Copper fairy lights, 6 flameless LED diyas and a handmade akash kandil',
    items: [['copper-fairy-lights-10m', 1], ['led-diya-set-6', 1], ['akash-kandil-lantern', 1]] },
];

const DIWALI_CATS = ['diyas-candles', 'pooja-essentials', 'flowers-rangoli', 'diwali-lights', 'lanterns', 'diwali-gifts', 'festive-decor', 'door-wall-decor'];
export const offers = [
  {
    name: 'Diwali Offer — Buy More, Save More',
    description: 'Buy 2 get 10% off, 3 get 20% off, 5 or more get 30% off all eligible items.',
    discount_type: 'tiered', discount_value: 30, min_qty: 2,
    tiers: [{ min_qty: 2, percent: 10 }, { min_qty: 3, percent: 20 }, { min_qty: 5, percent: 30 }],
    max_discount: null, starts_at: '2026-09-20T00:00:00+05:30', ends_at: '2026-11-15T23:59:59+05:30',
    coupon_code: null, first_order_only: false, is_active: true, category_slugs: DIWALI_CATS, product_slugs: [],
  },
  {
    name: 'Buy 3 — cheapest item 50% OFF',
    description: 'For every 3 eligible items, the cheapest one is half price.',
    discount_type: 'cheapest', discount_value: 50, min_qty: 3, tiers: null, max_discount: null, starts_at: null, ends_at: null,
    coupon_code: null, first_order_only: false, is_active: false, category_slugs: DIWALI_CATS, product_slugs: [],
  },
  {
    name: 'Buy 3, Get 50% OFF everything (use for clearance only)',
    description: 'Loses money on most products at normal costs — check Admin → Profit before switching on.',
    discount_type: 'percent', discount_value: 50, min_qty: 3, tiers: null, max_discount: null, starts_at: null, ends_at: null,
    coupon_code: null, first_order_only: false, is_active: false, category_slugs: DIWALI_CATS, product_slugs: [],
  },
  {
    name: 'Welcome 10% OFF — first order',
    description: 'Sign up for festive letters and get 10% off your first order (max ₹300).',
    discount_type: 'percent', discount_value: 10, min_qty: 1, tiers: null, max_discount: 30000, starts_at: null, ends_at: null,
    coupon_code: 'WELCOME10', first_order_only: true, is_active: true, category_slugs: [], product_slugs: [],
  },
];

/** Example rates — replace with courier quotes before selling abroad (paise). */
export const shippingZones = [
  { code: 'IN', name: 'India', countries: ['IN'], fee: 7900, extra_item_fee: 0, free_above: 99900, delivery_text: '3–6 business days', duties_note: '' },
  { code: 'GCC', name: 'UAE & Gulf', countries: ['AE', 'SA', 'QA', 'KW', 'OM', 'BH'], fee: 149900, extra_item_fee: 19900, free_above: 999900, delivery_text: '6–10 business days', duties_note: 'Import duties or VAT, if any, are charged by customs on delivery.' },
  { code: 'UK_EU', name: 'UK & Europe', countries: ['GB', 'IE', 'DE', 'FR', 'NL', 'IT', 'ES', 'BE', 'SE', 'CH', 'AT', 'PT', 'DK', 'NO', 'FI'], fee: 219900, extra_item_fee: 29900, free_above: 1499900, delivery_text: '8–14 business days', duties_note: 'Prices exclude UK/EU VAT and duties, which are collected on delivery.' },
  { code: 'NA', name: 'USA & Canada', countries: ['US', 'CA'], fee: 249900, extra_item_fee: 34900, free_above: 1499900, delivery_text: '8–15 business days', duties_note: 'Import duties and taxes, if any, are paid by the receiver.' },
  { code: 'APAC', name: 'Australia, NZ & Singapore', countries: ['AU', 'NZ', 'SG', 'MY'], fee: 229900, extra_item_fee: 29900, free_above: 1499900, delivery_text: '8–14 business days', duties_note: 'Import duties and taxes, if any, are paid by the receiver.' },
  { code: 'ROW', name: 'Rest of the world', countries: ['*'], fee: 299900, extra_item_fee: 39900, free_above: 0, delivery_text: '10–20 business days', duties_note: 'Import duties and taxes, if any, are paid by the receiver.' },
];

export const settings = {
  store_name: BRAND.name,
  festival_name: 'Diwali',
  festival_date: '2026-11-08', // Lakshmi Puja — drives the countdown on the home page
  support_phone: '+91 98765 43210',
  support_email: 'care@utsavghar.in',
  upi_id: 'utsavghar@upi',
  upi_payee_name: 'Utsav Ghar',
  upi_qr_url: '',
  payment_mode: 'manual_upi', // manual_upi | gateway
  gateway_provider: 'razorpay',
  gateway_key_id: '',
  merchant_name: 'Utsav Ghar Retail',
  merchant_gstin: '',
  settlement_note: 'Settlements to HDFC current account (T+1).',
  delivery_fee: 7900, // paise
  free_delivery_above: 99900,
  require_txn_ref: true,
  allow_screenshot: true,
  // Marketing & tracking (IDs are public; access tokens/secrets live only in server .env)
  meta_pixel_id: '',
  ga4_measurement_id: '',
  // Worldwide selling: rupees per 1 unit of each currency (example values — update in Admin → Payment & Store)
  international_enabled: true,
  fx_rates: JSON.stringify({ USD: 95.8, GBP: 127, EUR: 111, AED: 26.1, CAD: 69, AUD: 63, SGD: 74 }),
  fx_markup_pct: 3,
  // Current festival shown on the home page — change these when the next festival comes.
  festival_emoji: '🪔',
  festival_headline: 'Light Up Your Diwali',
  festival_subtitle: 'Hand-painted diyas, brass thalis, rangoli, lanterns, lights and gifts, plus crockery and kitchenware for festive cooking and guests.',
};

export const sampleReviews = [
  { name: 'Ananya S.', city: 'Pune', rating: 5, product: 'premium-brass-diya', text: 'The brass diya is heavy and beautifully finished. Looked stunning in our mandir on Dhanteras.' },
  { name: 'Rahul M.', city: 'Delhi', rating: 5, product: 'copper-fairy-lights-10m', text: 'Bought 3 items and the 50% offer applied instantly. Lights are warm and bright. Great value!' },
  { name: 'Neha K.', city: 'Bengaluru', rating: 4, product: 'diwali-hamper-classic', text: 'Sent hampers to family in 4 cities — all arrived on time and nicely packed.' },
  { name: 'Vikram P.', city: 'Ahmedabad', rating: 5, product: 'marigold-toran', text: 'The toran looks so real. Our entrance has never looked this festive.' },
  { name: 'Priya R.', city: 'Chennai', rating: 5, product: 'brass-pooja-thali-set', text: 'Complete thali set, good weight, and UPI payment was smooth. Will order again.' },
  { name: 'Sanjay T.', city: 'Jaipur', rating: 4, product: 'akash-kandil-lantern', text: 'Lovely handmade kandil, the kids loved hanging it up.' },
];

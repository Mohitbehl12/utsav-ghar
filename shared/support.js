/**
 * Customer help: common problems with instant answers, support-request topics,
 * and simple intent detection (English / Hinglish / Hindi) used by the chatbot.
 * Shared by the server and the demo so answers are identical everywhere.
 */

export const TOPICS = [
  { key: 'order_status', label: 'Where is my order?', icon: '📦', priority: 'normal' },
  { key: 'payment', label: 'Payment deducted / not confirmed', icon: '💳', priority: 'high' },
  { key: 'damaged', label: 'Item arrived damaged', icon: '💔', priority: 'high', photo: true, needsOrder: true },
  { key: 'wrong_item', label: 'Wrong or missing item', icon: '🔄', priority: 'high', photo: true, needsOrder: true },
  { key: 'return', label: 'Return or exchange', icon: '↩️', priority: 'normal', needsOrder: true },
  { key: 'refund', label: 'Refund status', icon: '💰', priority: 'normal', needsOrder: true },
  { key: 'cancel', label: 'Cancel my order', icon: '✖️', priority: 'high', needsOrder: true },
  { key: 'address', label: 'Change address or phone', icon: '🏠', priority: 'high', needsOrder: true },
  { key: 'product', label: 'Question about a product', icon: '🪔', priority: 'normal' },
  { key: 'bulk', label: 'Bulk / corporate gifting', icon: '🎁', priority: 'normal' },
  { key: 'account', label: 'Account or login problem', icon: '🔐', priority: 'normal' },
  { key: 'other', label: 'Something else', icon: '💬', priority: 'normal' },
];
export const topicOf = (k) => TOPICS.find((t) => t.key === k) || TOPICS[TOPICS.length - 1];

/** Instant answers shown before (and after) raising a request. `actions` are links the UI turns into buttons. */
export const SOLUTIONS = {
  order_status: {
    title: 'Where is my order?',
    steps: [
      'Most orders are packed within 24–48 hours of payment and delivered in 3–6 business days.',
      'Track it any time with your order number (e.g. DIWALI10245) and the mobile number you used.',
      'Once shipped you get the courier name and tracking number by SMS/email and on the order page.',
    ],
    actions: [['Track my order', '/track'], ['My orders', '/account/orders']],
  },
  payment: {
    title: 'Money deducted but order shows "payment pending"?',
    steps: [
      'Your money is safe. UPI payments are matched with our bank statement, usually within a few hours (10 am – 8 pm).',
      'If you paid by UPI QR, make sure you entered the 12-digit UTR on the payment page — it speeds up the check.',
      'If a card / netbanking payment failed but money was deducted, your bank reverses it automatically in 5–7 working days.',
      "Still pending after 24 hours? Raise a request below with the UTR or a screenshot — we'll fix it the same day.",
    ],
    actions: [['Track my order', '/track']],
  },
  damaged: {
    title: 'Item arrived damaged',
    steps: [
      "We're sorry! Please don't throw the item or box away.",
      'Raise a request within 7 days of delivery with 1–2 clear photos of the damage and the outer box.',
      'We send a free replacement or a full refund — your choice — usually within 48 hours of approval.',
    ],
  },
  wrong_item: {
    title: 'Wrong or missing item',
    steps: [
      'Check if your order came in more than one box — combos sometimes ship separately.',
      'If something is still missing or different, raise a request within 7 days with a photo of what you received.',
      'We send the right item free of cost, or refund it.',
    ],
  },
  return: {
    title: 'Returns & exchanges',
    steps: [
      'Damaged, defective or wrong items can be returned within 7 days of delivery.',
      'For hygiene reasons, opened pooja samagri, incense, rangoli colours, gulal and food items cannot be returned unless damaged.',
      'Raise a request; we arrange pick-up where available, or reimburse courier charges.',
    ],
    actions: [['Read the returns policy', '/returns']],
  },
  refund: {
    title: 'Refund status',
    steps: [
      'Refunds are started within 2 working days after we approve your return or cancel a paid order.',
      'UPI refunds reach your account in 1–3 working days; cards and netbanking take 5–7 working days, depending on your bank.',
      "Haven't received it after that? Raise a request with your order number and we'll share the bank reference (RRN).",
    ],
  },
  cancel: {
    title: 'Cancel an order',
    steps: [
      'Orders can be cancelled free of cost until they are shipped.',
      'Raise a cancel request with your order number — we confirm by SMS/email.',
      'If you already paid, the full amount is refunded to the same account.',
    ],
  },
  address: {
    title: 'Change address or phone',
    steps: [
      'We can change the delivery address or phone number until the order is shipped.',
      'Raise a request with the order number and the new details.',
    ],
  },
  product: {
    title: 'Questions about a product',
    steps: [
      'Size, material and what is in the box are listed under "Specifications" on every product page.',
      'Ask us anything else — we usually reply within a few hours.',
    ],
  },
  bulk: {
    title: 'Bulk & corporate gifting',
    steps: [
      'We offer special prices for 20+ hampers, custom message cards and branding.',
      'Tell us the quantity, budget per gift and delivery date, and we send a quote within a day.',
    ],
  },
  account: {
    title: 'Account or login',
    steps: [
      'Forgot your password? Contact us from the email linked to your account and we reset it.',
      "Locked after wrong passwords? It unlocks by itself after 15 minutes.",
      'You can also shop and track orders without an account.',
    ],
  },
  other: { title: 'Something else', steps: ["Tell us what's wrong and we'll get back to you."] },
};

/** Other quick answers the chatbot gives (no request needed). */
export const FAQ = {
  delivery: 'Delivery across India takes 3–6 business days after payment. Delivery is free above the free-delivery amount shown in your cart; below that a small fee applies.',
  payment_methods: 'You can pay by UPI (Google Pay, PhonePe, Paytm, BHIM), credit/debit cards (Visa, Mastercard, RuPay, Amex, Diners), net banking, wallets and EMI where available. Card details are entered only in our payment partner\'s secure window.',
  cod: 'Cash on delivery is not available right now. UPI and cards are confirmed instantly, and if anything goes wrong you get a full refund.',
  offers: 'Buy more, save more is applied automatically in the cart. First order? Use code WELCOME10 for 10% off (up to ₹300).',
  international: 'Yes, we ship to many countries. Change "Deliver to" at the top of the page to see prices and delivery time for your country.',
  contact: 'You can reach us here in chat, on WhatsApp, or by raising a support request. We reply within a few hours (10 am – 8 pm).',
  hours: 'Our team replies 10 am – 8 pm, Monday to Saturday. Requests raised at night are answered first thing next morning.',
  invoice: 'Your GST invoice is emailed when your order ships. Need it again? Raise a request with the order number.',
};

const has = (t, words) => words.some((w) => t.includes(w));
/**
 * Best guess at what the customer wants. Returns { intent, orderNumber? }.
 * intents: greet, thanks, track, payment, damaged, wrong_item, return, refund, cancel, address, delivery,
 * payment_methods, cod, offers, international, contact, hours, invoice, human, bulk, account, shop, unknown
 */
export function detectIntent(text) {
  const t = ` ${String(text || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}#\s]/gu, ' ').replace(/\s+/g, ' ')} `;
  // Order numbers look like DIWALI10245. A bare number counts only when the message is about an order
  // (so "diya under 1000" is a price, not an order).
  const up = String(text || '').toUpperCase();
  const pre = up.match(/\b(DIWALI|UG|ORD)\s?#?(\d{4,8})\b/);
  const bare = up.match(/(?:^|\s|#)(\d{5,8})(?=\s|$)/);
  const orderNumber = pre ? `${pre[1]}${pre[2]}` : bare && (/^\s*#?\d{5,8}\s*$/.test(up) || /ORDER|ऑर्डर/.test(up)) ? `DIWALI${bare[1]}` : null;
  const pick = (intent) => ({ intent, orderNumber });
  if (has(t, [' human', ' agent', ' person ', ' call me', ' talk to', ' baat kar', ' insaan', ' customer care', ' executive', ' representative', 'इंसान', 'बात करनी'])) return pick('human');
  if (has(t, ['damage', 'broken', 'broke', 'toota', 'tuta', 'tooti', 'tuti', 'crack', 'kharab', 'defect', 'टूट', 'खराब'])) return pick('damaged');
  if (has(t, ['wrong item', 'wrong product', 'galat', 'different item', 'missing', 'nahi aaya item', 'kam aaya', 'गलत'])) return pick('wrong_item');
  if (has(t, ['refund', 'paisa wapas', 'paise wapas', 'money back', 'रिफंड', 'पैसे वापस'])) return pick('refund');
  if (has(t, ['cancel', 'radd', 'रद्द', 'कैंसल'])) return pick('cancel');
  if (has(t, ['return', 'exchange', 'wapas karna', 'replace', 'वापस'])) return pick('return');
  if (has(t, ['deduct', 'kat gaya', 'kat gaye', 'kat gye', 'kat liya', 'pending', 'paid', 'cut ho', 'payment fail', 'paid but', 'money debited', 'debit ho', 'utr', 'पैसे कट', 'payment issue', 'payment problem'])) return pick('payment');
  if (has(t, ['address', 'pata badal', 'phone number change', 'change number', 'पता'])) return pick('address');
  if (has(t, ['track', 'where is my order', 'order status', 'kahan hai', 'kab aayega', 'kab milega', 'not received', 'nahi mila', 'delivery status', 'dispatched', 'shipped yet', 'मेरा ऑर्डर', 'ऑर्डर कहाँ', 'कब आएगा', 'my order'])) return pick('track');
  if (orderNumber) return pick('track');
  if (has(t, ['cod', 'cash on delivery', 'cash'])) return pick('cod');
  if (has(t, ['card', 'credit', 'debit', 'emi', 'netbanking', 'net banking', 'wallet', 'payment option', 'payment method', 'how to pay', 'kaise pay', 'upi'])) return pick('payment_methods');
  if (has(t, ['offer', 'coupon', 'promo', 'discount', 'code', 'sale', 'chhoot', 'छूट'])) return pick('offers');
  if (has(t, ['delivery', 'shipping', 'how many days', 'kitne din', 'deliver', 'courier'])) return pick('delivery');
  if (has(t, ['international', 'abroad', 'usa', 'uk', 'dubai', 'uae', 'canada', 'outside india', 'videsh'])) return pick('international');
  if (has(t, ['invoice', 'bill', 'gst'])) return pick('invoice');
  if (has(t, ['bulk', 'corporate', 'wholesale', '100 pieces', 'office gift'])) return pick('bulk');
  if (has(t, ['login', 'password', 'sign in', 'account lock', 'otp'])) return pick('account');
  if (has(t, ['timing', 'hours', 'open', 'kab tak'])) return pick('hours');
  if (has(t, ['contact', 'whatsapp', 'email', 'phone', 'helpline', 'number'])) return pick('contact');
  if (has(t, [' thank', ' thanks', ' dhanyavad', ' shukriya', ' ok thanks', 'धन्यवाद'])) return pick('thanks');
  if (/^ (hi|hello|hey|namaste|namaskar|hii+|helo|नमस्ते) $/.test(t) || has(t, [' good morning', ' good evening'])) return pick('greet');
  if (has(t, ['show', 'dikhao', 'chahiye', 'buy', 'kharid', 'price', 'kitne ka', 'available', 'diya', 'thali', 'rangoli', 'lights', 'rakhi', 'toran', 'kalash', 'hamper', 'gift', 'dinner', 'kadhai', 'candle', 'lantern', 'decor'])) return pick('shop');
  return pick('unknown');
}

export const TICKET_STATUS = { open: 'Open', in_progress: 'We are working on it', waiting: 'Waiting for your reply', resolved: 'Resolved', closed: 'Closed' };

/** Canned replies the admin can insert with one click. */
export const QUICK_REPLIES = [
  ['Sorry + replacement', "We're really sorry about this. We're sending a replacement free of cost — it ships within 24 hours and you'll get the tracking number by SMS."],
  ['Refund started', "We've started your refund. UPI refunds arrive in 1–3 working days, cards/netbanking in 5–7. We'll share the bank reference once it's processed."],
  ['Payment confirmed', "Good news — we've matched your payment and your order is now being packed. Thank you for your patience!"],
  ['Need photos', 'Could you please reply with 1–2 clear photos of the item and the outer box? That helps us resolve this quickly.'],
  ['Cancelled', 'Your order has been cancelled as requested. If you had paid, the refund is on its way to the same account.'],
];

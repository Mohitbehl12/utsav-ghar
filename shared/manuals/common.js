/**
 * User manuals (Customer, Dealer, Admin) — shared building blocks.
 * Every text is bilingual: { en, hi }. The same data builds the PDFs (manuals/build.py)
 * and the in-app "User manual" pages, so both always say the same thing.
 *
 * Callout selectors (used only when capturing screenshots):
 *   'text:Sign in'      element whose visible text starts with "Sign in" (buttons, links, headings, tabs)
 *   'label:Email'       the form field whose label starts with "Email"
 *   'ph:Search diyas'   input/textarea whose placeholder starts with the text
 *   'css:.zh__cart'     any CSS selector
 */
export const t = (en, hi) => ({ en, hi });

export const MANUAL_VERSION = '1.0';
export const MANUAL_DATE = t('October 2026', 'अक्टूबर 2026');
export const COMPANY = 'Utsav Ghar';

/** Labels used by the PDF and the in-app reader. */
export const UI = {
  contents: t('Table of Contents', 'विषय-सूची'),
  what: t('What is this page?', 'यह पेज क्या है?'),
  why: t('Why are we using this page?', 'हम इस पेज का उपयोग क्यों करते हैं?'),
  can: t('What can I do here?', 'मैं यहाँ क्या कर सकता/सकती हूँ?'),
  steps: t('Step-by-step', 'चरण-दर-चरण'),
  after: t('What happens after I submit?', 'सबमिट करने के बाद क्या होता है?'),
  statuses: t('Status meaning', 'स्टेटस का मतलब'),
  status: t('Status', 'स्टेटस'),
  meaning: t('Meaning', 'मतलब'),
  important: t('Important', 'ज़रूरी बातें'),
  mistakes: t('Common mistakes', 'आम गलतियाँ'),
  help: t('Need help?', 'मदद चाहिए?'),
  planned: t('Planned Feature', 'आने वाली सुविधा (Planned Feature)'),
  plannedNote: t('This is not available in the app yet. Until it is, use the steps given here.', 'यह सुविधा अभी ऐप में नहीं है। तब तक यहाँ बताए गए तरीके का उपयोग करें।'),
  illustrative: t('Illustrative Screen — Final UI may vary.', 'उदाहरण स्क्रीन — अंतिम डिज़ाइन अलग हो सकता है।'),
  realScreen: t('Actual screen from the Utsav Ghar website / app (demo data).', 'Utsav Ghar वेबसाइट / ऐप की असली स्क्रीन (डेमो डेटा)।'),
  screenEnglish: t('', 'स्क्रीन पर बटन और नाम अंग्रेज़ी में हैं, जैसे ऐप में दिखते हैं।'),
  version: t('Version', 'संस्करण'),
  updates_h: t('Future updates', 'आगे के अपडेट'),
  updates: t('When the app gets new features or changes, they will be added to this user manual. Always use the latest version — check the version number and date.', 'जब ऐप में नई सुविधाएँ या बदलाव आएँगे, तो उन्हें इस यूज़र मैनुअल में जोड़ा जाएगा। हमेशा नया संस्करण ही इस्तेमाल करें — संस्करण नंबर और तारीख देखें।'),
  date: t('Date', 'तारीख'),
  problem: t('Problem', 'समस्या'),
  solution: t('What to do', 'क्या करें'),
  question: t('Question', 'प्रश्न'),
  answer: t('Answer', 'उत्तर'),
  download: t('Download PDF', 'PDF डाउनलोड करें'),
  english: t('English', 'English'),
  hindi: t('हिंदी', 'हिंदी'),
  callouts: t('What the numbers show', 'नंबरों का मतलब'),
  flow: t('Process flow', 'प्रक्रिया का क्रम'),
};

/** Shown in every "Need help?" box. */
export const HELP = {
  customer: t(
    'Open Help Center (Customer Service in the top menu) or tap the 💬 Help button on any page. You can chat, raise a request, WhatsApp or call us. Our phone, WhatsApp and email are shown at the bottom of every page.',
    'ऊपर के मेन्यू में Customer Service (Help Center) खोलें या किसी भी पेज पर 💬 Help बटन दबाएँ। आप चैट कर सकते हैं, रिक्वेस्ट बना सकते हैं, WhatsApp या कॉल कर सकते हैं। हमारा फ़ोन, WhatsApp और ईमेल हर पेज के सबसे नीचे दिया है।'),
  dealer: t(
    'Call or WhatsApp the Utsav Ghar dealer team, or reply to any email we sent you. Your account manager can also reset your password and update your delivery area.',
    'Utsav Ghar डीलर टीम को कॉल या WhatsApp करें, या हमारे भेजे किसी भी ईमेल का जवाब दें। आपका अकाउंट मैनेजर पासवर्ड रीसेट और डिलीवरी एरिया अपडेट भी कर सकता है।'),
  admin: t(
    'Ask the store owner (Owner role). For technical problems, check Security → checklist and the Audit log, then contact your developer with the order number, time and a screenshot.',
    'स्टोर ओनर (Owner रोल) से पूछें। तकनीकी समस्या के लिए Security → checklist और Audit log देखें, फिर ऑर्डर नंबर, समय और स्क्रीनशॉट के साथ अपने डेवलपर से संपर्क करें।'),
};

/** Process diagrams (rendered as boxes and arrows). */
export const FLOWS = {
  settlement_flow: {
    title: t('Dealer settlement', 'डीलर सेटलमेंट'),
    steps: [
      [t('Order delivered', 'ऑर्डर डिलीवर'), t('Counted at your dealer price × quantity.', 'आपके डीलर प्राइस × मात्रा पर गिना जाता है।')],
      [t('Due to you', 'आपका बकाया'), t('Shown in Payments & settlement.', 'Payments & settlement में दिखता है।')],
      [t('Returns & adjustments', 'रिटर्न और समायोजन'), t('Returned pieces and any penalty or bonus.', 'लौटाए गए पीस और कोई पेनल्टी या बोनस।')],
      [t('Settlement created', 'सेटलमेंट बना'), t('Finance creates it — status Processing.', 'फ़ाइनेंस बनाता है — स्टेटस Processing।')],
      [t('Bank transfer', 'बैंक ट्रांसफ़र'), t('To your verified bank account.', 'आपके सत्यापित बैंक खाते में।')],
      [t('Paid', 'भुगतान हो गया'), t('Marked Paid with the UTR; you get a message.', 'UTR के साथ Paid; आपको संदेश मिलता है।')],
    ],
  },
  customer_order: {
    title: t('Customer order flow', 'ग्राहक ऑर्डर का क्रम'),
    steps: [
      [t('Product Search', 'प्रोडक्ट खोजें'), t('Find what you need by search, voice or categories.', 'सर्च, आवाज़ या कैटेगरी से सामान ढूँढें।')],
      [t('Product Details', 'प्रोडक्ट विवरण'), t('Check photos, price, offer and delivery date.', 'फ़ोटो, कीमत, ऑफ़र और डिलीवरी तारीख देखें।')],
      [t('Add to Cart', 'कार्ट में डालें'), t('Collect items; offers apply automatically.', 'सामान जोड़ें; ऑफ़र अपने-आप लगते हैं।')],
      [t('Checkout', 'चेकआउट'), t('Sign in and confirm your details.', 'साइन इन करें और अपनी जानकारी पक्की करें।')],
      [t('Address', 'पता'), t('Where we deliver; PIN decides the delivery charge.', 'डिलीवरी का पता; PIN से डिलीवरी चार्ज तय होता है।')],
      [t('Payment', 'भुगतान'), t('Pay by UPI (or card/net banking when enabled).', 'UPI से भुगतान करें (या चालू होने पर कार्ड/नेट बैंकिंग)।')],
      [t('Order Confirmation', 'ऑर्डर कन्फ़र्मेशन'), t('You get an order number and messages.', 'आपको ऑर्डर नंबर और मैसेज मिलते हैं।')],
      [t('Order Tracking', 'ऑर्डर ट्रैकिंग'), t('Follow each step in My Orders or Track Order.', 'My Orders या Track Order में हर चरण देखें।')],
      [t('Delivery', 'डिलीवरी'), t('Share the 4-digit code only after you receive the parcel.', 'पार्सल मिलने के बाद ही 4 अंकों का कोड बताएँ।')],
      [t('Return / Refund if required', 'ज़रूरत हो तो रिटर्न / रिफ़ंड'), t('Raise a request from Help Center.', 'Help Center से रिक्वेस्ट बनाएँ।')],
    ],
  },
  dealer_approval: {
    title: t('Dealer approval flow', 'डीलर अप्रूवल का क्रम'),
    steps: [
      [t('Registration', 'रजिस्ट्रेशन'), t('Create your dealer account with your mobile number.', 'अपने मोबाइल नंबर से डीलर अकाउंट बनाएँ।')],
      [t('Business Details', 'बिज़नेस विवरण'), t('Tell us who you are and where you work from.', 'बताएँ आप कौन हैं और कहाँ से काम करते हैं।')],
      [t('KYC', 'KYC'), t('PAN, GST, registration and bank account.', 'PAN, GST, रजिस्ट्रेशन और बैंक खाता।')],
      [t('Documents', 'दस्तावेज़'), t('Upload proofs for what you entered.', 'जो जानकारी दी उसके प्रमाण अपलोड करें।')],
      [t('Document Verification', 'दस्तावेज़ जाँच'), t('Our team checks each document.', 'हमारी टीम हर दस्तावेज़ जाँचती है।')],
      [t('Dealer Agreement', 'डीलर एग्रीमेंट'), t('Read the agreement in simple words and in full.', 'एग्रीमेंट को आसान भाषा में और पूरा पढ़ें।')],
      [t('Digital Signature', 'डिजिटल सिग्नेचर'), t('Sign with name, drawn signature and mobile OTP.', 'नाम, बनाया गया सिग्नेचर और मोबाइल OTP से साइन करें।')],
      [t('Admin Review', 'एडमिन रिव्यू'), t('Final check by Utsav Ghar.', 'Utsav Ghar की अंतिम जाँच।')],
      [t('Approved', 'अप्रूव्ड'), t('You can receive orders and add products.', 'अब आप ऑर्डर ले सकते हैं और प्रोडक्ट जोड़ सकते हैं।')],
      [t('Dealer Dashboard Activated', 'डीलर डैशबोर्ड चालू'), t('Full app: Dashboard, Orders, Products, Profile.', 'पूरा ऐप: Dashboard, Orders, Products, Profile।')],
    ],
  },
  dealer_order: {
    title: t('Dealer order flow', 'डीलर ऑर्डर का क्रम'),
    steps: [
      [t('New Order', 'नया ऑर्डर'), t('Status "New" — accept or reject in time.', 'स्टेटस "New" — समय पर स्वीकार या अस्वीकार करें।')],
      [t('Accept', 'स्वीकार करें'), t('Customer address and phone now visible.', 'अब ग्राहक का पता और फ़ोन दिखता है।')],
      [t('Pack', 'पैक करें'), t('Tick every item while packing.', 'पैक करते समय हर आइटम टिक करें।')],
      [t('Ready', 'तैयार'), t('Print the packing slip.', 'पैकिंग स्लिप प्रिंट करें।')],
      [t('Ship / Out for delivery', 'शिप / डिलीवरी के लिए निकला'), t('Your delivery person or a courier with tracking number.', 'आपका डिलीवरी व्यक्ति या ट्रैकिंग नंबर वाला कूरियर।')],
      [t('Delivered', 'डिलीवर'), t('Enter the customer\'s 4-digit code or the courier status.', 'ग्राहक का 4 अंकों का कोड या कूरियर स्टेटस डालें।')],
      [t('Return / Refund if applicable', 'लागू हो तो रिटर्न / रिफ़ंड'), t('Handled by the Utsav Ghar team (Planned Feature in the app).', 'Utsav Ghar टीम संभालती है (ऐप में Planned Feature)।')],
    ],
  },
  price_split: {
    title: t('Two different prices', 'दो अलग-अलग कीमतें'),
    steps: [
      [t('Dealer Price', 'डीलर प्राइस'), t('What Utsav Ghar pays you per piece. You set it; our team agrees it.', 'हर पीस के लिए Utsav Ghar आपको जो देता है। आप तय करते हैं; टीम मंज़ूर करती है।')],
      [t('Utsav Ghar review', 'Utsav Ghar रिव्यू'), t('Team adds delivery, packaging, fees and taxes.', 'टीम डिलीवरी, पैकिंग, फ़ीस और टैक्स जोड़ती है।')],
      [t('Platform Selling Price', 'प्लेटफ़ॉर्म सेलिंग प्राइस'), t('What the customer pays. Set by Utsav Ghar; not shown in the dealer app.', 'ग्राहक जो देता है। Utsav Ghar तय करता है; डीलर ऐप में नहीं दिखता।')],
    ],
  },
  policy_versions: {
    title: t('Policy version control', 'पॉलिसी वर्ज़न कंट्रोल'),
    steps: [
      [t('Dealer Agreement v1.0', 'Dealer Agreement v1.0'), t('Published; dealers signed it. Kept for ever.', 'प्रकाशित; डीलरों ने साइन किया। हमेशा सुरक्षित।')],
      [t('Dealer Agreement v1.1', 'Dealer Agreement v1.1'), t('Small change → new version, old one stays on record.', 'छोटा बदलाव → नया वर्ज़न, पुराना रिकॉर्ड में रहता है।')],
      [t('Dealer Agreement v2.0', 'Dealer Agreement v2.0'), t('Big (important) change → everyone accepts again.', 'बड़ा (ज़रूरी) बदलाव → सभी दोबारा स्वीकार करते हैं।')],
    ],
  },
  policy_workflow: {
    title: t('Policy approval workflow', 'पॉलिसी अप्रूवल का क्रम'),
    steps: [
      [t('Draft', 'ड्राफ़्ट'), t('Write or edit.', 'लिखें या बदलें।')],
      [t('Internal Review', 'आंतरिक समीक्षा'), t('A team member checks it.', 'टीम का सदस्य जाँचता है।')],
      [t('Legal Review', 'कानूनी समीक्षा'), t('Your lawyer reviews it.', 'आपका वकील जाँचता है।')],
      [t('Approved', 'अप्रूव्ड'), t('Lawyer\'s name recorded.', 'वकील का नाम दर्ज होता है।')],
      [t('Scheduled', 'शेड्यूल्ड'), t('Goes live on a future date.', 'आगे की तारीख पर लाइव होगा।')],
      [t('Published', 'प्रकाशित'), t('Visible to users; never edited again.', 'यूज़र्स को दिखता है; दोबारा बदला नहीं जाता।')],
      [t('User Acceptance', 'यूज़र की स्वीकृति'), t('People accept; records are kept.', 'लोग स्वीकार करते हैं; रिकॉर्ड रखे जाते हैं।')],
    ],
  },
};

/** Common status tables reused by several pages. */
export const STATUS = {
  returns: [
    [t('Return requested', 'रिटर्न माँगा गया'), t('We received your request and reply within 1 working day.', 'आपकी रिक्वेस्ट मिल गई; 1 कार्य दिवस में जवाब मिलेगा।')],
    [t('Approved — pickup pending', 'मंज़ूर — पिकअप बाकी'), t('Keep the item packed. We arrange the pickup.', 'सामान पैक रखें। पिकअप हम करवाते हैं।')],
    [t('Received — refund in progress', 'मिल गया — रिफ़ंड जारी'), t('We received the item; the refund is being sent.', 'सामान मिल गया; रिफ़ंड भेजा जा रहा है।')],
    [t('Refunded', 'रिफ़ंड हो गया'), t('Money sent back to your original payment method (reference shown).', 'पैसा उसी भुगतान तरीके में वापस भेजा गया (रेफ़रेंस दिखता है)।')],
    [t('Not accepted', 'स्वीकार नहीं'), t('The reason is shown. Reply through Help Center if you disagree.', 'कारण दिखता है। असहमत हों तो Help Center से जवाब दें।')],
    [t('Return cancelled', 'रिटर्न कैंसल'), t('The return was cancelled.', 'रिटर्न कैंसल हुआ।')],
  ],
  refund: [
    [t('Refund pending', 'रिफ़ंड बाकी'), t('The refund is opened and waiting for our finance team.', 'रिफ़ंड खुल गया है; फ़ाइनेंस टीम के पास है।')],
    [t('Refunded', 'रिफ़ंड हो गया'), t('Sent. The bank reference (UTR / refund ID) is shown.', 'भेज दिया। बैंक रेफ़रेंस (UTR / रिफ़ंड ID) दिखता है।')],
    [t('Refund failed — retrying', 'रिफ़ंड फ़ेल — दोबारा कोशिश'), t('The bank returned it (e.g. account closed). Our team retries and may contact you.', 'बैंक ने लौटा दिया (जैसे खाता बंद)। टीम दोबारा कोशिश करती है और संपर्क कर सकती है।')],
  ],
  settlement: [
    [t('Processing', 'प्रोसेसिंग'), t('Finance created the settlement; the bank transfer is being made.', 'फ़ाइनेंस ने सेटलमेंट बनाया; बैंक ट्रांसफ़र हो रहा है।')],
    [t('Paid', 'भुगतान हो गया'), t('Sent to your bank account. The UTR reference and date are shown.', 'आपके बैंक खाते में भेजा गया। UTR रेफ़रेंस और तारीख दिखती है।')],
    [t('Cancelled', 'कैंसल'), t('The batch was cancelled; its orders come back in the next settlement.', 'बैच कैंसल हुआ; इसके ऑर्डर अगले सेटलमेंट में आते हैं।')],
  ],
  payment: [
    [t('Awaiting Payment', 'भुगतान बाकी'), t('Order is reserved but no payment has been received yet.', 'ऑर्डर रिज़र्व है पर अभी भुगतान नहीं मिला।')],
    [t('Payment Verification Pending', 'भुगतान की जाँच बाकी'), t('You told us you paid by UPI; our team is matching it with the bank statement.', 'आपने UPI भुगतान बताया है; टीम बैंक स्टेटमेंट से मिलान कर रही है।')],
    [t('Payment Confirmed', 'भुगतान पक्का'), t('Money received. Your order moves to packing.', 'पैसा मिल गया। ऑर्डर पैकिंग में जाता है।')],
    [t('Payment Rejected', 'भुगतान अस्वीकार'), t('We could not match the payment. Pay again or contact us with the UTR.', 'भुगतान मिलान नहीं हुआ। दोबारा भुगतान करें या UTR के साथ संपर्क करें।')],
    [t('Refunded', 'रिफ़ंड हुआ'), t('The money was returned to you after a cancellation.', 'कैंसलेशन के बाद पैसा आपको वापस किया गया।')],
  ],
  order: [
    [t('Order Placed', 'ऑर्डर हुआ'), t('We have your order.', 'आपका ऑर्डर हमें मिल गया।')],
    [t('Payment Confirmed', 'भुगतान पक्का'), t('Payment received.', 'भुगतान मिल गया।')],
    [t('Processing / Sent to Dealer', 'प्रोसेसिंग / डीलर को भेजा'), t('Your items are being prepared, by us or a local dealer.', 'आपका सामान तैयार हो रहा है — हमारे या स्थानीय डीलर द्वारा।')],
    [t('Order Accepted · Packed · Ready for Delivery', 'स्वीकार · पैक · डिलीवरी के लिए तैयार'), t('The dealer accepted, packed and handed it over.', 'डीलर ने स्वीकार किया, पैक किया और भेजने के लिए तैयार किया।')],
    [t('Shipped', 'शिप हुआ'), t('Given to a courier; tracking number shown.', 'कूरियर को दिया; ट्रैकिंग नंबर दिखता है।')],
    [t('Out for Delivery', 'डिलीवरी के लिए निकला'), t('Arriving today. Keep the delivery code ready.', 'आज पहुँचेगा। डिलीवरी कोड तैयार रखें।')],
    [t('Delivered', 'डिलीवर हुआ'), t('You received the parcel.', 'आपको पार्सल मिल गया।')],
    [t('Cancelled', 'कैंसल'), t('The order was cancelled; if paid, a refund follows.', 'ऑर्डर कैंसल हुआ; भुगतान हुआ था तो रिफ़ंड होगा।')],
  ],
  ticket: [
    [t('Open', 'खुली'), t('We received your request.', 'आपकी रिक्वेस्ट मिल गई।')],
    [t('We are working on it', 'हम काम कर रहे हैं'), t('Someone from our team is handling it.', 'हमारी टीम का कोई व्यक्ति इसे देख रहा है।')],
    [t('Waiting for your reply', 'आपके जवाब का इंतज़ार'), t('We asked you something — please reply.', 'हमने कुछ पूछा है — कृपया जवाब दें।')],
    [t('Resolved', 'हल हो गया'), t('Solved. Rate us with 1–5 stars.', 'हल हो गया। 1–5 स्टार से रेटिंग दें।')],
    [t('Closed', 'बंद'), t('Finished. Raise a new request if needed.', 'पूरा हुआ। ज़रूरत हो तो नई रिक्वेस्ट बनाएँ।')],
  ],
  onboarding: [
    [t('Draft', 'ड्राफ़्ट'), t('You started but have not finished and signed.', 'आपने शुरू किया है पर पूरा करके साइन नहीं किया।')],
    [t('Submitted', 'जमा किया'), t('Your details reached our team.', 'आपकी जानकारी टीम तक पहुँच गई।')],
    [t('Documents pending', 'दस्तावेज़ बाकी'), t('We asked for more documents.', 'हमने और दस्तावेज़ माँगे हैं।')],
    [t('Under review', 'जाँच में'), t('Agreement signed; our team is checking documents.', 'एग्रीमेंट साइन हो गया; टीम दस्तावेज़ जाँच रही है।')],
    [t('Documents rejected', 'दस्तावेज़ अस्वीकार'), t('One or more documents must be uploaded again (reason shown).', 'एक या अधिक दस्तावेज़ दोबारा अपलोड करें (कारण दिखता है)।')],
    [t('Agreement pending', 'एग्रीमेंट बाकी'), t('Please sign the (new) agreement.', 'कृपया (नया) एग्रीमेंट साइन करें।')],
    [t('Agreement signed', 'एग्रीमेंट साइन हुआ'), t('Signature recorded.', 'सिग्नेचर दर्ज हुआ।')],
    [t('Approved', 'अप्रूव्ड'), t('You receive orders and can add products.', 'आपको ऑर्डर मिलते हैं और आप प्रोडक्ट जोड़ सकते हैं।')],
    [t('Rejected', 'अस्वीकार'), t('Application not approved (reason shown).', 'आवेदन मंज़ूर नहीं हुआ (कारण दिखता है)।')],
    [t('Suspended', 'निलंबित'), t('New orders are paused until reinstated.', 'दोबारा चालू होने तक नए ऑर्डर रुके हैं।')],
    [t('Terminated', 'समाप्त'), t('The agreement ended; the account is switched off.', 'एग्रीमेंट खत्म; अकाउंट बंद है।')],
  ],
  document: [
    [t('Pending', 'बाकी'), t('Not uploaded yet.', 'अभी अपलोड नहीं हुआ।')],
    [t('Uploaded ✓ · Under review', 'अपलोड ✓ · जाँच में'), t('Uploaded; waiting for our team.', 'अपलोड हो गया; टीम का इंतज़ार।')],
    [t('Approved', 'अप्रूव्ड'), t('Checked and accepted.', 'जाँचकर स्वीकार किया गया।')],
    [t('Rejected', 'अस्वीकार'), t('Not accepted — read the reason and upload again.', 'स्वीकार नहीं — कारण पढ़कर दोबारा अपलोड करें।')],
  ],
  dealerOrder: [
    [t('New (Sent to Dealer)', 'New (डीलर को भेजा)'), t('Waiting for you to accept or reject.', 'आपके स्वीकार या अस्वीकार का इंतज़ार।')],
    [t('Accepted', 'स्वीकार'), t('You accepted; now pack the items.', 'आपने स्वीकार किया; अब आइटम पैक करें।')],
    [t('Packed', 'पैक'), t('All items ticked and packed.', 'सारे आइटम टिक और पैक हो गए।')],
    [t('Ready', 'तैयार'), t('Ready to hand over for delivery.', 'डिलीवरी के लिए देने को तैयार।')],
    [t('Out for delivery', 'डिलीवरी पर'), t('With your delivery person or the courier.', 'आपके डिलीवरी व्यक्ति या कूरियर के पास।')],
    [t('Delivered', 'डिलीवर'), t('Finished. Counts in your earnings.', 'पूरा हुआ। आपकी कमाई में गिना जाता है।')],
    [t('Rejected by dealer', 'डीलर ने अस्वीकार किया'), t('You could not take it; it went to another dealer.', 'आप नहीं ले सके; दूसरे डीलर को गया।')],
    [t('Moved to another dealer', 'दूसरे डीलर को भेजा'), t('Not accepted in time, or moved by the store.', 'समय पर स्वीकार नहीं हुआ, या स्टोर ने बदला।')],
    [t('Cancelled', 'कैंसल'), t('Cancelled by the store — do not ship.', 'स्टोर ने कैंसल किया — शिप न करें।')],
  ],
  product: [
    [t('⏳ Under review', '⏳ जाँच में'), t('Our team is checking your product.', 'टीम आपका प्रोडक्ट जाँच रही है।')],
    [t('✏️ Changes needed', '✏️ बदलाव चाहिए'), t('Read the team\'s note, edit and send again.', 'टीम का नोट पढ़ें, बदलें और फिर भेजें।')],
    [t('✅ Approved / Live on store', '✅ अप्रूव्ड / स्टोर पर लाइव'), t('Accepted; "Live on store" means customers can buy it.', 'स्वीकार; "Live on store" का मतलब ग्राहक खरीद सकते हैं।')],
    [t('✖️ Not accepted', '✖️ स्वीकार नहीं'), t('Rejected with a reason.', 'कारण के साथ अस्वीकार।')],
  ],
  health: [
    [t('🟢 Good', '🟢 अच्छा'), t('All measures within target.', 'सभी माप लक्ष्य के अंदर।')],
    [t('🟡 Needs attention', '🟡 ध्यान दें'), t('One or more measures are slipping.', 'एक या अधिक माप बिगड़ रहे हैं।')],
    [t('🟠 Warning', '🟠 चेतावनी'), t('Action needed now.', 'अभी कदम उठाना ज़रूरी।')],
    [t('🔴 Restricted', '🔴 प्रतिबंधित'), t('New orders or listings may be paused.', 'नए ऑर्डर या लिस्टिंग रोकी जा सकती हैं।')],
  ],
  violation: [
    [t('Open', 'खुला'), t('Issue recorded; action needed.', 'मामला दर्ज; कार्रवाई ज़रूरी।')],
    [t('Correction requested', 'सुधार माँगा'), t('Dealer must fix it by the due date.', 'डीलर को तय तारीख तक ठीक करना है।')],
    [t('Resolved', 'हल'), t('Fixed; no longer counts in account health.', 'ठीक हो गया; अब अकाउंट हेल्थ में नहीं गिना जाता।')],
    [t('Closed', 'बंद'), t('Finished (resolution recorded).', 'पूरा (समाधान दर्ज)।')],
  ],
  policy: [
    [t('🟡 Draft', '🟡 ड्राफ़्ट'), t('Being written; can be edited.', 'लिखा जा रहा है; बदला जा सकता है।')],
    [t('🔵 Internal review', '🔵 आंतरिक समीक्षा'), t('Locked; a team member checks it.', 'लॉक; टीम का सदस्य जाँचता है।')],
    [t('🔵 Under legal review', '🔵 कानूनी समीक्षा में'), t('With your lawyer.', 'आपके वकील के पास।')],
    [t('🟠 Changes requested', '🟠 बदलाव माँगे'), t('Sent back; edit and resubmit.', 'वापस भेजा; बदलकर फिर जमा करें।')],
    [t('✅ Approved', '✅ अप्रूव्ड'), t('Ready to publish.', 'प्रकाशित करने को तैयार।')],
    [t('🗓️ Scheduled', '🗓️ शेड्यूल्ड'), t('Published with a future effective date.', 'आगे की प्रभावी तारीख के साथ प्रकाशित।')],
    [t('🟢 Published', '🟢 प्रकाशित'), t('Live; users see and accept it.', 'लाइव; यूज़र देखते और स्वीकार करते हैं।')],
    [t('🔴 Expired', '🔴 समय पूरा'), t('Still live, but its review date has passed.', 'अभी लाइव है, पर समीक्षा की तारीख निकल गई।')],
    [t('⚫ Archived', '⚫ आर्काइव'), t('Retired; kept as a legal record.', 'हटाया गया; कानूनी रिकॉर्ड के रूप में रखा।')],
  ],
};

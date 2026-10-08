/**
 * Starter templates for the policies beyond the core agreements (shared/legalTemplates.js).
 * ORIGINAL TEXT written for Utsav Ghar in plain language — not copied from any other marketplace.
 * They are created as DRAFTS: an admin completes them, sends them through internal and legal review,
 * and only then publishes them. A qualified lawyer must review every document before use.
 */
const NOTE = '> Starter template — complete it for your business and have it reviewed by a qualified lawyer before publishing.';

/** Build the document text from parts (same format as the other legal documents). */
export function policyBody({ title, intro, summary = [], sections = [] }) {
  const out = [`# ${title}`, '', `> ${intro}`, '', NOTE, '', '## In simple words', ...summary.map((s) => `- ${s}`), ''];
  sections.forEach(([h, simple, terms], i) => {
    out.push(`## ${i + 1}. ${h}`, `> What this means: ${simple}`, ...terms, '');
  });
  return out.join('\n').trim();
}

const P = {
  // ------------------------------------------------------------ customer
  payment_policy: {
    title: 'Payment Policy',
    intro: 'How you can pay for orders on {{company_name}}, when a payment counts as received, and what happens if a payment fails.',
    summary: ['Pay by UPI, cards, net banking or other methods shown at checkout.', 'Your order is confirmed only after the payment is confirmed.', 'We never ask for your card PIN, OTP or UPI PIN by phone, chat or email.', 'Failed or duplicate payments are refunded to the same payment method.'],
    sections: [
      ['Payment methods', 'Use any method shown at checkout; availability can change.', ['The payment methods available for an order are shown at checkout and may depend on the order value, delivery location and the payment partner.', 'Cards, net banking and wallets are processed by licensed payment partners. {{company_name}} does not store full card numbers, CVV, PINs or passwords.']],
      ['Prices and charges', 'You pay the total shown before you confirm.', ['The total shown at checkout includes the item price, applicable taxes, delivery charges and any other charge, each shown separately.', 'No charge is added after you place the order, except where you change the order or the law requires it.']],
      ['Payment confirmation', 'We start processing once your payment is confirmed.', ['For UPI payments where you tell us you have paid, the order stays in "payment verification" until the amount is matched with our account.', 'If we cannot confirm a payment within a reasonable time, we will contact you and may cancel the order. Any amount received is refunded in full.']],
      ['Failed, pending and duplicate payments', 'Money that left your account without a confirmed order comes back to you.', ['If your account is debited but the order is not confirmed, the amount is normally reversed by the bank or payment partner automatically. If it is not reversed within 7 working days, contact support with the transaction reference.', 'Duplicate payments for the same order are refunded to the original method.']],
      ['Safety', 'Never share your OTP or PIN with anyone.', ['Our team will never ask for your OTP, UPI PIN, card PIN, CVV or passwords.', 'Report any suspicious call or message claiming to be from {{company_name}} to {{support_email}}.']],
    ],
  },
  shipping_policy: {
    title: 'Shipping & Delivery Policy',
    intro: 'Where we deliver, how long it takes, what it costs and what happens if a delivery cannot be completed.',
    summary: ['Delivery time and charges are shown before you pay.', 'You get tracking updates by SMS, email or WhatsApp.', 'Check the package at delivery and report damage within 48 hours.', 'If we cannot deliver, we contact you before cancelling.'],
    sections: [
      ['Delivery areas', 'We deliver to PIN codes served by our dealers and courier partners.', ['Enter your PIN code on the product or checkout page to see whether we deliver there and the expected date.', 'Some items (for example fragile glass or large items) may not be available in every area.']],
      ['Delivery time', 'The date shown is our best estimate.', ['Orders are usually dispatched within 1–2 working days of payment confirmation. The expected delivery date is shown at checkout and in your order.', 'Festivals, weather, strikes or events beyond our control can delay delivery. We will tell you if your order is delayed.']],
      ['Delivery charges', 'Charges depend on the order value and location and are shown before payment.', ['The delivery charge, if any, is shown separately at checkout. Orders above the free-delivery value shown on the website are delivered free in serviceable areas.']],
      ['Receiving your order', 'Check the package when it arrives.', ['Some deliveries need a one-time code (OTP) that you share with the delivery person only when you receive the package.', 'If the package is damaged or opened, you may refuse it or record the damage. Report damaged or missing items within 48 hours of delivery with photos.']],
      ['Failed delivery', 'We try again or contact you before cancelling.', ['If delivery fails because the address is wrong, nobody is available or the phone is unreachable, we may try again. After repeated failed attempts the order may be cancelled and the amount refunded, less any non-refundable delivery charge shown at checkout.']],
    ],
  },
  review_policy: {
    title: 'Customer Review Policy',
    intro: 'Reviews help other shoppers. This policy explains which reviews we publish, which we remove, and how ratings are shown.',
    summary: ['Write about your own experience with the product.', 'We do not pay for, edit or hide honest reviews because they are negative.', 'We remove abusive, fake, promotional or unrelated reviews.', 'A "Verified purchase" label means the reviewer bought the item from us.'],
    sections: [
      ['Who can review', 'Customers with an account can review products.', ['Reviews marked "Verified purchase" are from customers who bought and received the product through {{company_name}}.', 'Dealers, their staff and relatives may not review their own products or competing products.']],
      ['What a review must not contain', 'Keep it honest, relevant and respectful.', ['Reviews must not contain abuse, hate speech, personal data, links, advertising, or content you do not have the right to share.', 'Reviews offered in exchange for money, free products or discounts are not allowed.']],
      ['Moderation', 'We check reviews before or after publishing.', ['We may publish, decline or remove a review that breaks this policy. We do not remove a review only because it is negative.', 'In line with the Consumer Protection (E-Commerce) Rules, 2020 and applicable standards on online reviews, we aim to show reviews fairly and in a neutral order.']],
      ['Ratings', 'The star rating is the average of published reviews.', ['Product ratings are calculated from published reviews only. We may show the number of ratings and the distribution of stars.']],
      ['Reporting a review', 'Tell us if a review looks fake or harmful.', ['Use the report option or write to {{support_email}} with the product and review details.']],
    ],
  },
  account_security_policy: {
    title: 'Account & Security Policy',
    intro: 'How to keep your account safe, what we do when we see suspicious activity, and how to close your account.',
    summary: ['Use a strong password and do not share it.', 'You are responsible for activity on your account.', 'We may lock an account to protect it from misuse.', 'You can ask us to close your account at any time.'],
    sections: [
      ['Your account', 'One person, correct details, kept up to date.', ['Provide accurate name, mobile number, email and address details. Keep them up to date.', 'Do not create accounts for others without their permission or use another person’s account.']],
      ['Passwords and codes', 'Keep your password and one-time codes private.', ['Choose a strong password that you do not use elsewhere. Never share passwords or OTPs. Tell us immediately at {{support_email}} if you think someone else used your account.']],
      ['Suspicious activity', 'We may pause an account to protect you and others.', ['If we see unusual sign-ins, payment fraud signals or misuse, we may ask you to verify your identity, reset your password, or temporarily lock the account.']],
      ['Closing your account', 'You can ask to close your account.', ['Write to {{support_email}} from your registered email. Open orders, refunds and records we must keep by law are handled before closure. See the Privacy Policy for how long data is kept.']],
    ],
  },
  prohibited_activities: {
    title: 'Prohibited Activities Policy',
    intro: 'Activities that are not allowed on {{company_name}} for anyone — customers, dealers or visitors.',
    summary: ['No fraud, fake orders or misuse of offers and refunds.', 'No abuse of staff, delivery partners or other users.', 'No hacking, scraping or interfering with the platform.', 'Breaking these rules can lead to cancelled orders and account closure.'],
    sections: [
      ['Fraud and misuse', 'Do not cheat the platform or other people.', ['Fake or fraudulent orders, payment chargeback abuse, false return or damage claims, and using multiple accounts to misuse offers are not allowed.']],
      ['Respectful behaviour', 'Treat people with respect.', ['Threats, harassment or abusive language towards our team, dealers, delivery partners or other customers are not allowed.']],
      ['Platform integrity', 'Do not attack or copy the platform.', ['Do not attempt to gain unauthorised access, test vulnerabilities without permission (see the Information Security Policy for responsible reporting), overload our systems, or copy content and data with automated tools.']],
      ['Illegal content and goods', 'Do not use the platform for anything illegal.', ['Uploading unlawful content, infringing intellectual property, or trying to buy or sell prohibited goods is not allowed.']],
      ['What we may do', 'We may act to protect the platform and its users.', ['We may cancel orders, withhold offers, suspend or close accounts, and report matters to authorities where required by law. We will tell you the reason unless the law or an investigation prevents it.']],
    ],
  },
  complaint_policy: {
    title: 'Complaints & Grievance Policy',
    intro: 'How to raise a complaint about an order, product, dealer or our service, and how quickly we respond.',
    summary: ['Start with Help / Customer Service on the website or app.', 'We acknowledge complaints within 48 hours.', 'We aim to resolve them within one month.', 'You can escalate to our Grievance Officer at any time.'],
    sections: [
      ['How to complain', 'Use Help on the website or app, or email us.', ['Raise a request from Help / Customer Service, your order page, or by email to {{support_email}}. Include your order number and photos where relevant.']],
      ['Grievance Officer', 'A named person handles unresolved complaints.', ['Grievance Officer: {{grievance_officer}}', 'Email: {{grievance_email}}', 'Address: {{company_address}}', 'As required by the Consumer Protection (E-Commerce) Rules, 2020, the Grievance Officer acknowledges a complaint within forty-eight hours and redresses it within one month of receipt.']],
      ['Tracking your complaint', 'Every complaint gets a reference number.', ['You can follow the status of your request in My Account → Support requests or by replying to our email.']],
      ['If you are not satisfied', 'You have other options too.', ['You may approach the National Consumer Helpline or the consumer commissions under the Consumer Protection Act, 2019. See also the Dispute Resolution Policy.']],
    ],
  },
  // ------------------------------------------------------------ dealer
  kyc_policy: {
    title: 'Dealer Registration & KYC Policy',
    intro: 'Who can become a dealer, which documents we need, how we verify them, and keeping your details up to date.',
    summary: ['Register with your real business and owner details.', 'Upload the documents your business type requires.', 'We verify documents before you can receive orders.', 'Update us within 7 days if anything changes.'],
    sections: [
      ['Eligibility', 'Registered businesses and sole proprietors in India can apply.', ['Applicants must be legally able to contract and hold the registrations required for the products they sell (for example GST where applicable).']],
      ['Documents', 'What you upload depends on your business type.', ['Typical documents: PAN, GST certificate (if registered), business registration, address proof, ID of the owner or authorised signatory, bank proof, and authorisation for the signatory where applicable.', 'Documents must be clear, complete, current and in the business’s name.']],
      ['Verification', 'We check documents before approval.', ['We may verify documents with issuing authorities or trusted verification services, ask for originals or more documents, or visit the business address. We may refuse an application that cannot be verified.']],
      ['Keeping details current', 'Tell us about changes and renew expiring documents.', ['Inform us within 7 days of changes to ownership, address, bank account, GST status or signatory. Upload renewed licences before they expire; expired documents can pause new orders.']],
      ['Data handling', 'Your KYC data is protected.', ['KYC documents are stored securely, with access limited to authorised staff, and bank account numbers are encrypted. See the Privacy & Data Protection Policy.']],
    ],
  },
  listing_policy: {
    title: 'Product Listing & Quality Policy',
    intro: 'Rules for product titles, photos, descriptions, stock and quality so customers get exactly what they see.',
    summary: ['Describe products truthfully, with real photos.', 'Show size, material, quantity and country of origin.', 'Keep stock counts accurate.', 'Send only new, genuine, undamaged products.'],
    sections: [
      ['Accurate listings', 'What the customer sees must match what they get.', ['Titles, photos and descriptions must be accurate and not misleading. Do not use other brands’ names, keywords or images you have no right to use.']],
      ['Mandatory information', 'Include the details the law and customers need.', ['Include material, size/dimensions, net quantity, country of origin, and any care or safety instructions. Packaged goods must carry the declarations required by the Legal Metrology (Packaged Commodities) Rules, 2011.']],
      ['Photos', 'Use clear photos of the actual product.', ['Photos must show the product being sold, without watermarks of other sellers, and must not include contact details or links.']],
      ['Inventory', 'Keep your stock count correct.', ['Update stock promptly. Orders you cannot fulfil because of wrong stock count towards your cancellation rate.']],
      ['Quality', 'Only send goods you would be happy to receive.', ['Products must be new (unless clearly sold otherwise), genuine, within shelf life and packed to survive transit. Repeated quality complaints can lead to listing removal.']],
      ['Review of listings', 'We check new listings before they go live.', ['We may edit presentation, ask for changes, or decline a listing that breaks this policy.']],
    ],
  },
  pricing_fee_policy: {
    title: 'Pricing & Fee Policy',
    intro: 'How dealer prices, the supply or commission model, and platform fees work.',
    summary: ['Your commercial terms are in your Dealer Agreement schedule.', 'In the supply model you are paid your agreed dealer price.', 'In the commission model fees are deducted as listed in your schedule.', 'Fees change only with notice.'],
    sections: [
      ['Commercial models', 'Your schedule says which model applies to you.', ['Supply model: you supply each product at the dealer price we accept; {{company_name}} sets the customer price. Commission model: the agreed commission and fees are deducted from the amount collected.']],
      ['Dealer price', 'Quote fair, all-inclusive prices.', ['Dealer prices must include your packing and handling costs unless your schedule says otherwise. Do not quote different prices for the same product to circumvent this policy.']],
      ['Fees', 'Only the fees in your schedule apply.', ['Fees, if any, are listed in your commercial schedule. Taxes such as GST, TCS and TDS are applied as required by law.']],
      ['Changes', 'We give notice before fees change.', ['We will give at least 15 days’ notice of fee changes. Changes to your signed commercial terms require you to sign the updated schedule.']],
    ],
  },
  settlement_policy: {
    title: 'Payment & Settlement Policy',
    intro: 'When and how dealers are paid for delivered orders, and what can be deducted or held.',
    summary: ['You are paid for delivered orders after the settlement period.', 'Refunds, returns and penalties are adjusted in settlements.', 'Payments go only to your verified bank account.', 'You get a statement for every settlement.'],
    sections: [
      ['Settlement cycle', 'Paid after delivery, on the cycle in your schedule.', ['Amounts for delivered orders are settled within the number of days set in your commercial schedule, after the return window where applicable.']],
      ['Deductions', 'Agreed adjustments are made in the settlement.', ['Settlements may be adjusted for customer refunds, returns, damaged goods attributable to the dealer, penalties under your agreement and taxes deducted at source.']],
      ['Holds', 'We may hold amounts only for a clear reason.', ['We may hold payments while a fraud, quality or legal investigation is open, or when KYC documents have expired. We will tell you the reason and release amounts that are not in dispute.']],
      ['Bank account', 'We pay only your verified account.', ['Bank account changes require verification and may delay the next settlement.']],
      ['Statements and disputes', 'Check your statement and raise issues within 30 days.', ['Each settlement has a statement. Raise any discrepancy within 30 days so we can investigate.']],
    ],
  },
  fulfillment_policy: {
    title: 'Shipping & Fulfilment Policy',
    intro: 'What dealers must do from the moment an order arrives until it is delivered.',
    summary: ['Accept or reject new orders within the time shown in the app.', 'Pack well and dispatch on time.', 'Use the delivery code or courier tracking as instructed.', 'Late dispatch and cancellations affect your account health.'],
    sections: [
      ['Accepting orders', 'Respond quickly to every new order.', ['Accept or reject each order within the acceptance time shown in the dealer app. Unanswered orders may be moved to another dealer.']],
      ['Packing', 'Pack so the item arrives safely.', ['Use suitable packaging and cushioning for fragile items. Include the invoice or packing slip where required. Do not include marketing material for other platforms.']],
      ['Dispatch time', 'Dispatch within the agreed time.', ['Dispatch within the dispatch time set in the account health rules (shown in your app) after accepting the order.']],
      ['Delivery and proof', 'Record delivery correctly.', ['For own deliveries, collect the customer’s delivery code. For courier deliveries, enter the correct courier name and tracking number.']],
      ['Problems', 'Tell us early if you cannot deliver.', ['If you cannot fulfil an order, reject it or contact us as early as possible so the customer is not kept waiting.']],
    ],
  },
  dealer_returns_policy: {
    title: 'Dealer Return & Refund Policy',
    intro: 'How customer returns, damaged items and refunds are handled between {{company_name}} and dealers.',
    summary: ['Customer returns follow the Cancellation, Return & Refund Policy.', 'Items damaged because of poor packing or quality are the dealer’s responsibility.', 'Returned resaleable items go back to your stock.', 'You can dispute a return decision within 7 days.'],
    sections: [
      ['Customer returns', 'Customers can return within the published return window.', ['Returns are accepted as described in the customer Cancellation, Return & Refund Policy and the return window in your commercial schedule.']],
      ['Responsibility', 'Who bears the cost depends on the cause.', ['Wrong, defective, expired or poorly packed items are the dealer’s responsibility. Transit damage on platform-arranged couriers is handled with the courier.']],
      ['Returned goods', 'Resaleable items are sent back to you.', ['Items in resaleable condition are returned to the dealer or adjusted in stock. Non-resaleable items are handled as agreed in your schedule.']],
      ['Disputes', 'Contest a decision with evidence.', ['You may dispute a return decision within 7 days with photos or proof of dispatch condition.']],
    ],
  },
  customer_comm_policy: {
    title: 'Customer Communication Policy',
    intro: 'How dealers may contact customers about their orders — and what is not allowed.',
    summary: ['Contact customers only about their current order.', 'Be polite and professional.', 'Never ask customers to buy outside the platform.', 'Never share customer details with anyone else.'],
    sections: [
      ['Allowed contact', 'Only to deliver or fix their order.', ['You may contact a customer only to confirm address, arrange delivery or resolve an issue with that order.']],
      ['Not allowed', 'No marketing or off-platform selling.', ['Do not send promotions, ask for reviews in exchange for benefits, request payments outside the platform, or direct customers to other websites or sellers.']],
      ['Conduct', 'Be respectful.', ['Communication must be courteous. Complaints about dealer behaviour are investigated and can lead to violations.']],
    ],
  },
  customer_data_policy: {
    title: 'Customer Data & Privacy Policy (for Dealers)',
    intro: 'Customer details shared with dealers may be used only to fulfil orders and must be protected.',
    summary: ['Use customer data only to deliver the order.', 'Keep it secure and do not copy it elsewhere.', 'Delete it when it is no longer needed for the order or the law.', 'Report any data leak to us within 24 hours.'],
    sections: [
      ['Purpose limit', 'Order fulfilment only.', ['Names, phone numbers and addresses are shared only to fulfil orders. Any other use is prohibited, consistent with the Digital Personal Data Protection Act, 2023.']],
      ['Security', 'Protect devices and printouts.', ['Keep devices locked, do not share app logins, and dispose of printed labels securely.']],
      ['Retention', 'Do not keep data longer than needed.', ['Delete customer data from personal devices and records once the order and any return are complete, unless the law requires you to keep it.']],
      ['Incidents', 'Tell us immediately about a breach.', ['Report suspected loss or misuse of customer data to {{legal_email}} within 24 hours.']],
    ],
  },
  ip_policy: {
    title: 'Intellectual Property Policy',
    intro: 'Respecting brands, trademarks, designs and copyright, and how to report infringement.',
    summary: ['Sell only genuine goods you are allowed to sell.', 'Use only photos and text you own or have permission to use.', 'Counterfeits are removed and can end your account.', 'Rights owners can report infringement to us.'],
    sections: [
      ['Genuine products', 'No counterfeits or replicas.', ['Products must be genuine. Replicas or items using another brand’s trademark without authorisation are prohibited.']],
      ['Content', 'Use your own content.', ['Photos, descriptions and designs must be your own or licensed to you.']],
      ['Reporting infringement', 'Rights owners can file a notice.', ['Send details of the right, the listing and proof of ownership to {{legal_email}}. We review notices promptly and may remove listings while we investigate.']],
      ['Consequences', 'Repeat infringement leads to removal.', ['Confirmed infringement leads to listing removal; repeated infringement can lead to suspension or termination.']],
    ],
  },
  product_safety_policy: {
    title: 'Product Safety & Compliance Policy',
    intro: 'Products sold on {{company_name}} must be safe, legal and correctly labelled.',
    summary: ['Follow labelling and safety rules for your products.', 'Some products are restricted or not allowed.', 'Electrical and fire-risk items need extra care.', 'Report safety incidents and recalls to us at once.'],
    sections: [
      ['Legal requirements', 'Meet the rules that apply to your product.', ['Comply with applicable laws such as the Legal Metrology (Packaged Commodities) Rules, 2011, BIS certification where mandatory, and food safety rules for any food items.']],
      ['Restricted products', 'Some items need approval or cannot be sold.', ['Firecrackers, flammable liquids and other hazardous items may not be listed unless we approve them in writing and all licences are in place.']],
      ['Safety information', 'Give clear warnings and instructions.', ['Include warnings for candles, diyas, electrical lights, sharp items and items not suitable for children.']],
      ['Incidents and recalls', 'Act fast if a product is unsafe.', ['Tell us immediately about injuries, safety complaints or recalls. We may suspend listings until the issue is resolved.']],
    ],
  },
  performance_policy: {
    title: 'Dealer Performance & Account Health Policy',
    intro: 'The measures we use to check that customers get a good experience, and what happens when targets are missed.',
    summary: ['We track cancellations, late shipments, complaints, returns and violations.', 'Your account health is Good, Needs attention, Warning or Restricted.', 'We warn you and help before restricting an account.', 'Restricted accounts may stop receiving new orders.'],
    sections: [
      ['What we measure', 'Measures are calculated over a rolling period.', ['Order cancellation rate, late shipment rate, customer complaints, return rate, refund issues, product quality complaints, open policy violations, document expiry and fraud indicators.']],
      ['Targets', 'Targets are shown in your dealer app.', ['Current target thresholds are set by {{company_name}} and shown to dealers. Rates are assessed only once you have enough orders in the period.']],
      ['Levels', 'Four levels show where you stand.', ['Good — meets all targets. Needs attention — one or more measures slipping. Warning — action needed now. Restricted — new orders or listings may be paused.']],
      ['Improvement', 'We give you a chance to improve.', ['We notify you before restricting your account, except in cases of fraud, safety risk or legal requirement.']],
    ],
  },
  violation_policy: {
    title: 'Dealer Violation, Suspension & Termination Policy',
    intro: 'How we handle policy violations, how you can respond, and when an account can be suspended or terminated.',
    summary: ['Each violation gets a severity: low, medium, high or critical.', 'You are told what is wrong and can correct it or respond.', 'Serious or repeated violations can lead to suspension.', 'You can appeal a decision within 15 days.'],
    sections: [
      ['Violations', 'We record what happened and how serious it is.', ['Examples: incorrect product information, counterfeit goods, unsafe products, misuse of customer data, repeated late shipment, and fraud.']],
      ['Process', 'Notice, chance to fix, then action.', ['We notify you with details and may ask for a correction within a set time. Listings may be paused while serious issues are investigated.']],
      ['Suspension', 'New orders can be paused.', ['We may suspend a listing or the account for critical violations, repeated violations, expired mandatory documents or legal requirements. We tell you the reason and what is needed to reinstate.']],
      ['Termination', 'Serious breaches can end the agreement.', ['Termination follows the Dealer Agreement. Signed agreements, documents and records are kept as required by law.']],
      ['Appeals', 'You can ask us to look again.', ['Write to {{legal_email}} within 15 days of a decision with your reasons and evidence. A different team member reviews the appeal.']],
    ],
  },
  // ------------------------------------------------------------ company
  platform_terms: {
    title: 'Platform Terms of Use',
    intro: 'These terms apply to everyone who visits or uses the {{company_name}} website and apps.',
    summary: ['Use the platform lawfully and respectfully.', 'Content on the platform belongs to us or our licensors.', 'We may update the platform and these terms.', 'Specific terms apply when you buy (Customer Terms) or sell (Dealer Agreement).'],
    sections: [
      ['About us', 'Who operates the platform.', ['The platform is operated by {{company_legal_name}}, {{company_address}}.']],
      ['Use of the platform', 'Use it lawfully.', ['You must follow the Prohibited Activities Policy and applicable law.']],
      ['Content and trademarks', 'Do not copy our content without permission.', ['Text, images, logos and software are owned by {{company_legal_name}} or its licensors.']],
      ['Availability', 'The platform may change or be unavailable at times.', ['We work to keep the platform available but do not guarantee uninterrupted access.']],
      ['Changes and law', 'We may update these terms; Indian law applies.', ['Changes are published on this page. These terms are governed by the laws of India; courts at {{jurisdiction_city}} have jurisdiction, subject to consumer protection law.']],
    ],
  },
  data_protection: {
    title: 'Privacy & Data Protection Policy',
    intro: 'How {{company_name}} governs personal data across the company, in line with the Digital Personal Data Protection Act, 2023.',
    summary: ['We collect only the data we need and use it for stated purposes.', 'Access is limited to people who need it.', 'We keep data only as long as necessary or required by law.', 'People can access, correct and erase their data.'],
    sections: [
      ['Principles', 'Lawful, fair and limited use.', ['Personal data is processed for specified purposes with consent or another lawful basis, kept accurate, and protected with reasonable security safeguards.']],
      ['Roles', 'Clear responsibility.', ['{{company_legal_name}} is the data fiduciary for customer and dealer data. Processors (payment, courier, messaging providers) act under contract.']],
      ['Rights', 'Requests are handled promptly.', ['Data principals can request access, correction, erasure and grievance redressal by writing to {{grievance_email}}.']],
      ['Breach response', 'We act and notify as required.', ['Personal data breaches are assessed and notified to the Data Protection Board and affected people as required by law.']],
      ['Retention', 'Data is deleted when no longer needed.', ['Retention periods follow legal requirements (for example tax and consumer protection records) and are reviewed yearly.']],
    ],
  },
  cookie_policy: {
    title: 'Cookie Policy',
    intro: 'Which cookies and similar technologies we use, why, and how you can control them.',
    summary: ['Essential cookies keep you signed in and your cart working.', 'Optional analytics help us improve the site.', 'You can block cookies in your browser settings.', 'We do not sell cookie data.'],
    sections: [
      ['Essential', 'Needed for the site to work.', ['Sign-in sessions, security tokens (CSRF) and your cart use essential cookies or local storage.']],
      ['Preferences and analytics', 'Help us remember choices and improve.', ['We may use first-party analytics to understand site usage. Where required, we ask for consent first.']],
      ['Control', 'You decide.', ['You can delete or block cookies in your browser. Blocking essential cookies may stop parts of the site from working.']],
    ],
  },
  communication_policy: {
    title: 'Communication Policy',
    intro: 'The messages we send by email, SMS, WhatsApp and app notifications, and how to opt out.',
    summary: ['Order and account messages are always sent.', 'Offers and festival messages only with your consent.', 'You can opt out of promotional messages at any time.', 'We never ask for OTPs or PINs.'],
    sections: [
      ['Transactional messages', 'Needed to serve you.', ['Order confirmations, delivery updates, OTPs, security alerts and policy updates are sent to provide the service.']],
      ['Promotional messages', 'Only with consent.', ['Offers and festival reminders are sent only if you opted in. Each message has an unsubscribe option.']],
      ['Opting out', 'Stop promotions any time.', ['Use the unsubscribe link, reply STOP where supported, or change preferences in your account.']],
      ['Policy changes', 'We tell you about important changes.', ['When we make important changes to our terms or policies, we notify affected customers or dealers and ask them to accept the new version where required.']],
    ],
  },
  dispute_policy: {
    title: 'Dispute Resolution Policy',
    intro: 'The steps we follow to resolve disputes with customers and dealers fairly and quickly.',
    summary: ['Step 1: contact support.', 'Step 2: escalate to the Grievance Officer.', 'Step 3: mediation or the dispute process in your agreement.', 'Consumers keep all their rights under consumer protection law.'],
    sections: [
      ['Support', 'Most issues are solved here.', ['Raise the issue through Help / Customer Service (customers) or the dealer app support (dealers).']],
      ['Escalation', 'The Grievance Officer reviews unresolved issues.', ['Escalate to {{grievance_officer}} at {{grievance_email}}.']],
      ['Customers', 'Consumer rights are not limited.', ['Customers may approach the National Consumer Helpline or consumer commissions under the Consumer Protection Act, 2019.']],
      ['Dealers', 'As set out in the Dealer Agreement.', ['Disputes with dealers follow the dispute resolution clause of the Dealer Agreement (negotiation, then arbitration seated at {{jurisdiction_city}} where agreed).']],
    ],
  },
  fraud_policy: {
    title: 'Fraud Prevention Policy',
    intro: 'How we prevent, detect and respond to fraud by anyone using the platform.',
    summary: ['We monitor orders, payments and accounts for fraud signals.', 'Suspicious orders may be held or verified.', 'Fraud leads to cancellation, account closure and reporting to authorities.', 'Report suspected fraud to us immediately.'],
    sections: [
      ['Detection', 'Automated checks and human review.', ['We use rate limits, payment verification and pattern checks to spot fraud. Flags are reviewed by staff before permanent action.']],
      ['Actions', 'Proportionate response.', ['We may hold orders, ask for verification, cancel orders, recover amounts, suspend accounts, and report to law enforcement where required.']],
      ['Dealers', 'Fraud indicators affect account health.', ['Confirmed fraud by a dealer is a critical violation under the Dealer Violation Policy.']],
      ['Reporting', 'Tell us what you saw.', ['Report suspected fraud or impersonation of {{company_name}} to {{support_email}}.']],
    ],
  },
  security_policy: {
    title: 'Information Security Policy',
    intro: 'How we protect our systems and data, and how to report a security issue responsibly.',
    summary: ['Data is encrypted in transit and sensitive fields at rest.', 'Staff access is role-based and logged.', 'We patch and back up systems regularly.', 'Report vulnerabilities to us privately.'],
    sections: [
      ['Controls', 'Layered protection.', ['HTTPS everywhere, hashed passwords, encrypted bank details, role-based admin access, audit logs, rate limits and regular backups.']],
      ['People', 'Access only when needed.', ['Staff get the minimum access needed for their role. Access is removed when no longer required.']],
      ['Incidents', 'Detect, contain, notify.', ['Security incidents are investigated and, where personal data is affected, notified as required by law.']],
      ['Responsible disclosure', 'Report issues privately.', ['Email {{legal_email}} with details. Do not access other people’s data or disrupt the service while testing.']],
    ],
  },
  legal_notice: {
    title: 'Legal Notice',
    intro: 'Details about the company that operates {{company_name}}, as required for e-commerce entities in India.',
    summary: ['Who we are and where we are registered.', 'How to contact customer care and the Grievance Officer.', 'Where to find our policies.'],
    sections: [
      ['Company', 'The legal entity behind the brand.', ['Legal name: {{company_legal_name}}', 'Registered office: {{company_address}}', 'Website: {{website}}']],
      ['Contact', 'Customer care and grievances.', ['Customer care: {{support_email}} · {{support_phone}}', 'Grievance Officer: {{grievance_officer}} · {{grievance_email}}']],
      ['Policies', 'All our policies in one place.', ['Our current terms and policies are listed on the Policies page of the website and app.']],
    ],
  },
};

export const STARTER_POLICIES = Object.fromEntries(Object.entries(P).map(([kind, d]) => [kind, { title: d.title, body: policyBody(d) }]));

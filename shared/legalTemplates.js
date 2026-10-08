/**
 * Version 1.0 of every legal document — ORIGINAL DRAFT TEXT written for Utsav Ghar,
 * in plain language. Each numbered section starts with a one-line "What this means"
 * (a `>` line right under the `##` heading), followed by the detailed terms.
 *
 * Format the app understands:
 *   # Title
 *   > Intro (shown in a box under the title)
 *   ## In simple words        → highlighted summary list
 *   ## 1. Section title
 *   > What this means: …      → the simple explanation
 *   …detailed terms…          → "Full legal terms", folded by default
 *
 * These are starting points only. A qualified lawyer must review and approve every
 * document (Admin → Legal & Agreements: Draft → Legal review → Approved → Published).
 * {{placeholders}} are filled from Company details and, for dealers, the dealer's details.
 */
const NOTE = '> Sample text — to be reviewed and approved by a qualified lawyer before use.';

export const DEFAULT_LEGAL_DOCS = {
  customer_terms: {
    title: 'Customer Terms & Agreement',
    body: `# Customer Terms & Agreement

> This agreement explains the basic rules for using our platform, buying products, making payments, returns, refunds and protecting your account.

${NOTE}

## In simple words
- Give us correct details and keep your password safe.
- The price you see at checkout is the price you pay — no hidden charges.
- You can cancel before your order is packed.
- You can return eligible products within the return period shown on the product page.
- Refunds go back to your original payment method.
- We protect your data and share it only to deliver your order.
- Do not misuse offers, reviews or the website.
- If something goes wrong, contact us — we have a Grievance Officer to help.

## 1. About Our Platform
> What this means: {{company_name}} is an online store for festive, pooja, home and kitchen products. Some orders are packed and delivered by our trusted dealer partners.
{{website}} and the {{company_name}} app ("Platform") are operated by {{company_legal_name}}, {{company_address}} ("we", "us"). By creating an account or placing an order you agree to this agreement, our Privacy Policy and our Cancellation, Return & Refund Policy. Products may be fulfilled by us or by dealer partners who ship on our behalf. We remain your point of contact for every order.

## 2. Customer Account
> What this means: One account per person. Keep your password secret and tell us if you think someone else is using your account.
- You must be at least 18 years old, or use the Platform under the supervision of a parent or guardian.
- Give true, current and complete details and keep them up to date.
- You are responsible for activity on your account. Tell us at once at {{support_email}} if you suspect misuse.
- Accounts cannot be sold or transferred.

## 3. Customer Responsibilities
> What this means: Use the Platform honestly, give correct delivery details and be available to receive your order.
- Check your order, address and phone number before paying.
- Be available, or arrange someone, to receive the delivery and share the delivery code only when you receive the parcel.
- Use products as described on the product page and follow any safety instructions (for example, never leave a lit diya unattended).

## 4. Product Information
> What this means: We describe products as accurately as we can. Handmade items may vary slightly in colour, finish and size.
- Photos, sizes, weights and materials are shown on each product page. Small variations are normal for handmade brass, clay and wood items.
- If a product you receive is materially different from its description, you may return it as per our return policy.

## 5. Orders
> What this means: Your order is confirmed only after we send a confirmation. We may cancel an order for genuine reasons and refund you in full.
- An order is a request to buy. A contract is formed when we confirm the order by email, SMS or in your account.
- We may refuse or cancel an order because of stock, pricing errors, payment problems, delivery limits or suspected fraud. Any amount paid is refunded in full.

## 6. Payments
> What this means: Prices are in rupees and include GST unless stated. The total at checkout is the total you pay.
- We accept UPI, cards, net banking and wallets through our payment partner, and Cash on Delivery where offered.
- The checkout shows the item price, any discount, the delivery charge and the total payable. Nothing is added after you confirm.
- We do not store your card or UPI PIN details; our payment partner handles them securely.
- We may correct an obvious pricing error; if it affects your order we will tell you and you may cancel for a full refund.

## 7. Delivery
> What this means: The delivery charge depends on your PIN code and is shown before you pay. Delivery dates are estimates.
- Orders are delivered by us, a courier or a nearby dealer partner. For dealer deliveries you get a 4-digit delivery code.
- Delivery dates may move because of festival peaks, weather or courier delays; we will keep you updated.
- Check the parcel on delivery. If the box is visibly damaged, refuse it or send us photos within 48 hours.

## 8. Cancellation
> What this means: You can cancel free of charge until your order is packed.
Details are in the Cancellation, Return & Refund Policy, which forms part of this agreement.

## 9. Returns
> What this means: You may return an eligible product according to our return policy. The return period and conditions may be different for different products.
Details, including items that cannot be returned, are in the Cancellation, Return & Refund Policy.

## 10. Refunds
> What this means: Approved refunds go back to your original payment method, usually within 5–7 working days.
Details are in the Cancellation, Return & Refund Policy.

## 11. Warranty
> What this means: If a product comes with a warranty, the warranty details are shown on its product page.
Warranty, where offered, is provided by the maker or as stated on the product page. Your rights under the Consumer Protection Act, 2019 are not affected.

## 12. Customer Data & Privacy
> What this means: We use your details to run your account and deliver your orders. We never sell your data.
How we collect, use and protect your personal data is explained in our Privacy Policy. By ticking the box you also agree that we may send order updates, OTPs and notices to you by email, SMS, WhatsApp or in your account, and that these electronic notices and your electronic acceptance are valid under the Information Technology Act, 2000. Marketing messages are sent only if you choose to receive them.

## 13. Prohibited Activities
> What this means: Do not cheat, misuse offers or reviews, or try to harm the website.
You must not: use the Platform for anything unlawful or fraudulent; place orders you do not intend to accept; misuse returns, coupons or offers; copy or scrape Platform content; use bots; interfere with security or other accounts; post false, paid or abusive reviews; or harass our staff, delivery partners or dealers.

## 14. Account Suspension/Termination
> What this means: We may suspend or close an account that breaks these rules. You can close your account any time.
We may suspend or close an account that breaks this agreement, misuses offers or returns, or is linked to fraud. Where reasonable we will tell you why. Orders already placed will be completed or refunded. You may close your account by writing to {{support_email}}.

## 15. Complaints & Disputes
> What this means: Contact our support first. If it is not resolved, our Grievance Officer will help, and you can also approach a consumer commission.
- Grievance Officer: {{grievance_officer}}, {{grievance_email}}, {{company_address}}. We acknowledge complaints within 48 hours and aim to resolve them within one month, as required by the Consumer Protection (E-Commerce) Rules, 2020.
- You may approach the consumer commission or any other forum available to you by law.
- Our liability for an order is limited to the amount paid for that order, except where the law does not allow such a limit. Nothing here limits liability for fraud or for death or injury caused by negligence.

## 16. Changes to Terms
> What this means: If we change this agreement in an important way, we will ask you to accept the new version before your next order.
The version you accepted stays on record in My Account → Legal Documents.

## 17. Contact Information
> What this means: Here is how to reach us.
{{company_legal_name}}, {{company_address}}. Customer care: {{support_email}}, {{support_phone}}. Grievance Officer: {{grievance_officer}}, {{grievance_email}}.

## 18. Governing Law
> What this means: Indian law applies to this agreement.
This agreement is governed by the laws of India. Subject to your rights as a consumer, courts at {{jurisdiction_city}} have jurisdiction.`,
  },

  privacy: {
    title: 'Privacy Policy',
    body: `# Privacy Policy

> This policy explains what personal data we collect, why we need it, who we share it with and your rights under the Digital Personal Data Protection Act, 2023.

${NOTE}

## In simple words
- We collect only what we need to run your account and deliver your orders.
- We never sell your data.
- The dealer who delivers your order sees only your name, phone and delivery address — after accepting the order.
- You can ask to see, correct or delete your data.

## 1. Data we collect
> What this means: Your name, contact details, addresses, orders and basic device information.
- You give us: name, mobile number, email, delivery addresses, date of birth if you choose to give it, messages to support, reviews and photos.
- When you order: items, amounts, payment status and payment reference. Card and UPI details are handled by our payment partner.
- Automatically: device and browser type, IP address, pages viewed and items added to cart, and cookies needed to keep you signed in.

## 2. Why we use it
> What this means: To deliver orders, support you, prevent fraud and meet legal duties.
To create and secure your account, process orders, deliver and handle returns and refunds, answer questions, prevent fraud, meet tax and legal duties, and recommend products on the Platform using our own software. Offers and festival reminders are sent only if you opt in.

## 3. Who we share it with
> What this means: Only with the people who help deliver your order, and the government when the law requires.
The dealer who fulfils your order receives your name, delivery address, PIN code and phone number only after accepting the order, and only to deliver it. Courier, payment, SMS, email and WhatsApp providers receive what they need for their service. We do not sell or rent personal data.

## 4. How long we keep it
> What this means: While your account is open, and longer only where the law needs records.
Order and invoice records are kept as long as tax law requires (currently at least 8 years). Records of the terms you accepted are kept as long as they may be needed to show what was agreed.

## 5. Security
> What this means: We protect your data with encryption and limited access.
Passwords are stored as one-way hashes, data travels over encrypted connections, and access to sensitive data is limited and logged.

## 6. Your rights
> What this means: You can see, correct or delete your data, or withdraw consent.
Write to {{grievance_email}} to access, correct or erase your personal data, withdraw consent, or nominate someone to act for you. Some data must be kept for legal reasons.

## 7. Contact
> What this means: Our Grievance Officer handles privacy questions.
{{grievance_officer}}, {{grievance_email}}, {{company_address}}.`,
  },

  refund_cancellation: {
    title: 'Cancellation, Return & Refund Policy',
    body: `# Cancellation, Return & Refund Policy

> This policy explains when you can cancel an order, which products can be returned, and how and when you get your money back.

${NOTE}

## In simple words
- Cancel free of charge until your order is packed.
- Return eligible products within 7 days of delivery (unless the product page says otherwise).
- Damaged or wrong item? Tell us within 48 hours with photos.
- Refunds go to your original payment method in 5–7 working days.
- No hidden deductions.

## 1. Cancellation
> What this means: You can cancel free of charge until the order is packed.
- Go to My Account → Orders → Cancel. After dispatch you can refuse the delivery or request a return.
- We may cancel an order if a product is unavailable, the address cannot be served, or payment is not received. You get a full refund.

## 2. Returns
> What this means: Unused items in original packing can be returned within the return window.
- Return window: 7 days from delivery, unless the product page says otherwise.
- Items must be unused, with original packing and tags.
- Not returnable unless damaged or wrong: diyas with oil, used candles, puja consumables (kumkum, incense, wicks), food items and personalised products.

## 3. Damaged, broken or wrong item
> What this means: Tell us within 48 hours with photos and we will replace or refund.
Report it in My Account or to {{support_email}} within 48 hours of delivery with photos of the item and the box.

## 4. Refunds
> What this means: Money goes back to your original payment method.
- Prepaid orders are refunded within 5–7 working days after the cancellation is approved or the return is received.
- Delivery charges are refunded if the item was damaged, wrong, or cancelled by us.
- We never charge a hidden restocking fee. Any deduction is shown to you before you confirm a return.

## 5. Contact
> What this means: How to reach us about cancellations, returns and refunds.
{{support_email}} · {{support_phone}} · Grievance Officer: {{grievance_officer}}, {{grievance_email}}.`,
  },

  dealer_agreement: {
    title: 'Dealer Agreement',
    body: `# Dealer Agreement

> This agreement explains how you can work with our platform as a dealer, your responsibilities, our responsibilities, product rules, payments, returns, customer service and other important business terms.

${NOTE}

## In simple words
- You must provide correct business information.
- You must upload genuine and valid documents.
- You must provide genuine products.
- Product information must be accurate.
- You must follow our marketplace rules.
- You must handle orders according to the agreed process.
- You must follow return/refund requirements.
- You must not misuse customer information.
- You must comply with applicable laws.
- You must pay applicable platform fees/charges, if any apply to your model.
- We may suspend or terminate your account if you seriously violate the agreement.

## Parties
This Dealer Agreement ("Agreement") is made on {{effective_date}} between **{{company_legal_name}}**, operating the {{company_name}} platform, {{company_address}} ("Platform"), and **{{dealer_legal_name}}** ({{dealer_business_type}}), PAN {{dealer_pan}}, GSTIN {{dealer_gstin}}, {{dealer_address}}, acting through {{signatory_name}}, {{signatory_capacity}} ("Dealer").

## 1. About the Partnership
> What this means: You supply and deliver products to our customers; we run the store, the customers and the payments.
The Dealer supplies and delivers products to customers who order on the Platform, on the terms below and in the Commercial Schedule. The Dealer is an independent business. Nothing in this Agreement makes the Dealer an employee, agent or partner in law of the Platform.

## 2. Dealer Information
> What this means: Your business, KYC and bank details must be true, and you must tell us when they change.
All business, KYC and bank information given is true and complete. The Dealer informs the Platform of any change within 7 days. The Platform may verify any information and ask for more.

## 3. Dealer Responsibilities
> What this means: Run your business lawfully and follow our policies.
The Dealer complies with all applicable laws, including GST and tax laws, the Consumer Protection Act, 2019 and the Legal Metrology Act, 2009 (labelling of packaged goods), and with the Platform's policies, including the Dealer Terms & Conditions, which form part of this Agreement.

## 4. Product Information
> What this means: Product name, description, photos, specifications and availability must be correct.
Product name, description, images, specifications, size, material, weight, contents and availability must be accurate and not misleading. Photos must be of the actual product and owned or licensed by the Dealer.

## 5. Product Quality
> What this means: Only genuine, safe and legally permitted products.
Products must be genuine, new unless agreed otherwise, safe, legally permitted, and match the approved listing. Counterfeit, unsafe or prohibited products are not allowed.

## 6. Pricing
> What this means: You quote your Dealer Price. The Platform decides the price customers pay. Fees, commission and taxes depend on your model, shown in the Commercial Schedule.
- **Dealer Price:** the price the Dealer quotes and the Platform accepts for each product. The Dealer does not change it for an order already accepted.
- **Platform Selling Price:** set by the Platform alone. The Platform's internal costs, margins and pricing calculations are confidential and are not shared with the Dealer unless the Platform agrees in writing.
- **Fees, commission, taxes and other charges:** as set out in the Commercial Schedule below. Each party bears its own taxes; TCS/TDS is applied where the law requires.

**Commercial Schedule**

{{commercial_schedule}}

## 7. Orders
> What this means: Orders come to your dealer app. Accept or reject quickly, pack all items, then dispatch.
New orders for the Dealer's area and products are sent to the dealer app with a WhatsApp/SMS alert. The Dealer accepts or rejects (with a reason) within the time shown in the app, ticks every item while packing, marks the order ready and dispatches it. Orders not accepted in time may be moved to another dealer.

## 8. Inventory
> What this means: Keep your stock numbers correct so customers can only buy what you have.
The Dealer keeps stock in the dealer app accurate at all times and sets quantity to zero for items it cannot supply.

## 9. Delivery & Shipping
> What this means: You deliver with your own rider (using the customer's delivery code) or hand over to a courier and enter the tracking number.
Orders are packed securely and handed over within the promised time. Own-rider deliveries are completed only with the customer's delivery code. For courier deliveries the Dealer enters the courier name and tracking number. Logistics costs are as set out in the Commercial Schedule.

## 10. Returns & Refunds
> What this means: Customers can return eligible products as per our policy; you take back returned goods and refunds are adjusted in your payments.
The Dealer accepts returns and replacements as per the Platform's Cancellation, Return & Refund Policy and the Commercial Schedule. Refunds to customers for products supplied by the Dealer are adjusted against the Dealer's settlements where the Dealer is at fault (for example damaged, wrong or poor-quality products).

## 11. Customer Complaints
> What this means: Help us resolve complaints quickly — usually within 48 hours.
The Dealer responds to the Platform within 48 hours on any complaint about its products or deliveries, and co-operates to resolve it. The Platform remains the customer's point of contact.

## 12. Payment & Settlement
> What this means: You are paid for delivered orders on the settlement cycle in the Commercial Schedule, after any agreed deductions.
The Dealer is paid for delivered orders within the settlement period in the Commercial Schedule, less any applicable commission or fees, refund adjustments, penalties and taxes required by law. Each settlement shows its calculation.

## 13. Dealer Documents
> What this means: Keep valid KYC and business documents with us; tell us when they expire or change.
The Dealer provides valid business and KYC documents and replaces them before they expire. The Dealer authorises the Platform to verify them. The Dealer account becomes active only after verification and approval.

## 14. Data Privacy
> What this means: Use customer details only to deliver the order. Never save, share or sell them.
Customer personal data is shared with the Dealer only to deliver orders. The Dealer keeps it secure, does not share or sell it, does not contact customers for any other purpose, and deletes it when no longer needed. The Dealer reports any loss or misuse within 24 hours. Both parties comply with the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000. The Dealer keeps confidential the Platform's business and pricing information and these commercial terms.

## 15. Prohibited Activities
> What this means: No fake products, no misleading listings, no selling to customers outside the platform, no misuse of data.
The Dealer must not: supply counterfeit, unsafe or prohibited products; post misleading information; contact customers for sales outside the Platform; misuse customer information; pressure customers for reviews; or use the Platform's name or logo without consent except to say it is a {{company_name}} dealer.

## 16. Suspension
> What this means: We may pause new orders while we look into a serious problem.
The Platform may temporarily suspend new orders for: expired or doubtful documents; repeated late dispatch, cancellations or complaints; suspected fraud; or breach of this Agreement, while the matter is reviewed. The Dealer is told the reason.

## 17. Termination
> What this means: Either side can end the agreement with 30 days' notice; we may end it at once for serious breaches.
Either party may end this Agreement with 30 days' written notice. The Platform may terminate at once for fraud, false documents, prohibited products, misuse of customer data, serious or repeated breach, or legal or regulatory reasons. Accepted orders are then completed or handed back, and amounts due are settled after deductions.

## 18. Dispute Resolution
> What this means: We first talk it out; if that fails, an arbitrator decides under Indian law.
The parties will try to resolve any dispute by good-faith discussion within 30 days. If unresolved, it is referred to a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated at {{jurisdiction_city}}, in English. This Agreement is governed by the laws of India and courts at {{jurisdiction_city}} have jurisdiction.

## 19. Changes to Agreement
> What this means: If we change this agreement, you will be asked to review and sign the new version. Your old signed copies stay available.
The Platform may issue a new version of this Agreement or its policies. Material changes are notified and must be accepted to keep receiving orders. Previously signed versions remain on record and downloadable.

## 20. Contact Information
> What this means: Who to contact for help, payments or legal matters.
Dealer support: {{support_email}}, {{support_phone}}. Legal notices: {{legal_email}}, {{company_legal_name}}, {{company_address}}.

## Electronic execution
This Agreement is executed electronically under section 10A of the Information Technology Act, 2000. The Dealer's typed name, drawn signature and mobile OTP verification, recorded with date, time and device details, are the Dealer's acceptance and signature. For the Platform: {{authorised_signatory}}, {{signatory_designation}}.`,
  },

  marketplace_policy: {
    title: 'Dealer Terms & Conditions',
    body: `# Dealer Terms & Conditions

> These are the day-to-day marketplace rules for dealers: listings, prohibited products, service standards and conduct. They form part of the Dealer Agreement.

${NOTE}

## In simple words
- Use real photos and correct details.
- Never sell firecrackers, counterfeit or illegal items.
- Accept orders within the time shown and dispatch on time.
- Use customer details only for delivery.
- Be polite to customers and our team.

## 1. Listings
> What this means: Real photos of the actual product and correct details.
Use clear photos of the actual product on a plain background, at least 1000 px wide, without other websites' watermarks. Name, material, size, weight and contents must be correct. Do not claim "pure silver" or similar unless certified. Do not copy other sellers' photos or text.

## 2. Prohibited products
> What this means: Some products can never be sold on the platform.
Firecrackers and explosives; articles made from protected wildlife materials; counterfeit or replica branded goods; unapproved medicines or "miracle" products; anything illegal to sell in India.

## 3. Service standards
> What this means: Accept fast, dispatch on time, keep cancellations low.
Accept or reject a new order within the time shown in the app (usually 2 hours). Dispatch within the promised time. Keep cancellations below 2% of orders. Never ask a customer for the delivery code before handing over the parcel.

## 4. Customer data
> What this means: Customer details are only for delivery.
Do not save customer numbers in personal contacts, add them to groups or send them promotions.

## 5. Conduct
> What this means: Be polite and professional.
Abuse, threats or pressure on customers to give reviews lead to suspension.

## 6. Enforcement
> What this means: Breaking these rules can lead to warnings, suspension or termination.
Breaches may lead to a warning, listing removal, a hold on payments for disputed orders, suspension or termination under the Dealer Agreement.`,
  },
};

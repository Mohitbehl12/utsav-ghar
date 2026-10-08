// Countries customers can pick (ISO 3166-1 alpha-2) and the currency we show them.
export const COUNTRIES = [
  ['IN', 'India', '🇮🇳', 'INR'], ['AE', 'United Arab Emirates', '🇦🇪', 'AED'], ['US', 'United States', '🇺🇸', 'USD'], ['GB', 'United Kingdom', '🇬🇧', 'GBP'],
  ['CA', 'Canada', '🇨🇦', 'CAD'], ['AU', 'Australia', '🇦🇺', 'AUD'], ['SG', 'Singapore', '🇸🇬', 'SGD'], ['NZ', 'New Zealand', '🇳🇿', 'USD'],
  ['SA', 'Saudi Arabia', '🇸🇦', 'USD'], ['QA', 'Qatar', '🇶🇦', 'USD'], ['KW', 'Kuwait', '🇰🇼', 'USD'], ['OM', 'Oman', '🇴🇲', 'USD'], ['BH', 'Bahrain', '🇧🇭', 'USD'],
  ['DE', 'Germany', '🇩🇪', 'EUR'], ['FR', 'France', '🇫🇷', 'EUR'], ['NL', 'Netherlands', '🇳🇱', 'EUR'], ['IE', 'Ireland', '🇮🇪', 'EUR'], ['IT', 'Italy', '🇮🇹', 'EUR'],
  ['ES', 'Spain', '🇪🇸', 'EUR'], ['BE', 'Belgium', '🇧🇪', 'EUR'], ['AT', 'Austria', '🇦🇹', 'EUR'], ['PT', 'Portugal', '🇵🇹', 'EUR'], ['FI', 'Finland', '🇫🇮', 'EUR'],
  ['SE', 'Sweden', '🇸🇪', 'EUR'], ['DK', 'Denmark', '🇩🇰', 'EUR'], ['NO', 'Norway', '🇳🇴', 'EUR'], ['CH', 'Switzerland', '🇨🇭', 'EUR'],
  ['MY', 'Malaysia', '🇲🇾', 'USD'], ['MU', 'Mauritius', '🇲🇺', 'USD'], ['NP', 'Nepal', '🇳🇵', 'USD'], ['ZA', 'South Africa', '🇿🇦', 'USD'],
  ['KE', 'Kenya', '🇰🇪', 'USD'], ['HK', 'Hong Kong', '🇭🇰', 'USD'], ['JP', 'Japan', '🇯🇵', 'USD'], ['FJ', 'Fiji', '🇫🇯', 'USD'], ['TT', 'Trinidad and Tobago', '🇹🇹', 'USD'],
];
export const countryName = (c) => COUNTRIES.find((x) => x[0] === c)?.[1] || c;
export const countryFlag = (c) => COUNTRIES.find((x) => x[0] === c)?.[2] || '🌍';
export const currencyFor = (c) => COUNTRIES.find((x) => x[0] === c)?.[3] || 'USD';

const TZ = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'Europe/London': 'GB', 'Asia/Singapore': 'SG', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Los_Angeles': 'US', 'America/Denver': 'US',
  'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Muscat': 'OM', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Amsterdam': 'NL', 'Europe/Dublin': 'IE',
  'Pacific/Auckland': 'NZ', 'Asia/Kuala_Lumpur': 'MY',
};
/** Best guess of the visitor's country from their time zone (no location permission needed). */
export function guessCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TZ[tz] || (tz?.startsWith('Asia/Kolkata') ? 'IN' : 'IN');
  } catch {
    return 'IN';
  }
}

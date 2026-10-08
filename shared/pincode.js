/**
 * Indian PIN code → state (from the postal circle prefixes). Used only to
 * pre-select the State field; the customer can still change it.
 */
const THREE = {
  194: 'Ladakh', 403: 'Goa', 605: 'Puducherry', 737: 'Sikkim', 744: 'Andaman and Nicobar Islands', 396: 'Gujarat',
  790: 'Arunachal Pradesh', 791: 'Arunachal Pradesh', 792: 'Arunachal Pradesh', 793: 'Meghalaya', 794: 'Meghalaya', 795: 'Manipur',
  796: 'Mizoram', 797: 'Nagaland', 798: 'Nagaland', 799: 'Tripura', 160: 'Chandigarh',
};
for (const n of [244, 246, 247, 248, 249, 262, 263]) THREE[n] = 'Uttarakhand';
for (let n = 490; n <= 497; n++) THREE[n] = 'Chhattisgarh';
for (let n = 814; n <= 835; n++) THREE[n] = 'Jharkhand';
const TWO = {
  11: 'Delhi', 12: 'Haryana', 13: 'Haryana', 14: 'Punjab', 15: 'Punjab', 16: 'Punjab', 17: 'Himachal Pradesh', 18: 'Jammu and Kashmir', 19: 'Jammu and Kashmir',
  20: 'Uttar Pradesh', 21: 'Uttar Pradesh', 22: 'Uttar Pradesh', 23: 'Uttar Pradesh', 24: 'Uttar Pradesh', 25: 'Uttar Pradesh', 26: 'Uttar Pradesh', 27: 'Uttar Pradesh', 28: 'Uttar Pradesh',
  30: 'Rajasthan', 31: 'Rajasthan', 32: 'Rajasthan', 33: 'Rajasthan', 34: 'Rajasthan', 36: 'Gujarat', 37: 'Gujarat', 38: 'Gujarat', 39: 'Gujarat',
  40: 'Maharashtra', 41: 'Maharashtra', 42: 'Maharashtra', 43: 'Maharashtra', 44: 'Maharashtra', 45: 'Madhya Pradesh', 46: 'Madhya Pradesh', 47: 'Madhya Pradesh', 48: 'Madhya Pradesh', 49: 'Chhattisgarh',
  50: 'Telangana', 51: 'Andhra Pradesh', 52: 'Andhra Pradesh', 53: 'Andhra Pradesh', 56: 'Karnataka', 57: 'Karnataka', 58: 'Karnataka', 59: 'Karnataka',
  60: 'Tamil Nadu', 61: 'Tamil Nadu', 62: 'Tamil Nadu', 63: 'Tamil Nadu', 64: 'Tamil Nadu', 67: 'Kerala', 68: 'Kerala', 69: 'Kerala',
  70: 'West Bengal', 71: 'West Bengal', 72: 'West Bengal', 73: 'West Bengal', 74: 'West Bengal', 75: 'Odisha', 76: 'Odisha', 77: 'Odisha', 78: 'Assam',
  80: 'Bihar', 81: 'Bihar', 82: 'Bihar', 83: 'Jharkhand', 84: 'Bihar', 85: 'Bihar',
};
export function stateForPin(pin) {
  const p = String(pin || '').replace(/\D/g, '');
  if (!/^[1-9]\d{5}$/.test(p)) return null;
  return THREE[+p.slice(0, 3)] || TWO[+p.slice(0, 2)] || null;
}

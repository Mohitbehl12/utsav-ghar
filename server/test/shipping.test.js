import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneFor, parseWeight, parseDims, chargeableKg, rateCardCost, customerFee, unitEconomics, priceForTarget } from '../../shared/shipping.js';

test('zones from origin & destination PIN', () => {
  assert.equal(zoneFor('411002', '411038'), 'local');
  assert.equal(zoneFor('411002', '400028'), 'metro');
  assert.equal(zoneFor('411002', '431001'), 'regional');
  assert.equal(zoneFor('411002', '302001'), 'national');
  assert.equal(zoneFor('411002', '781001'), 'special');
  assert.equal(zoneFor('411002', '190001'), 'special');
  assert.equal(zoneFor('', '302001'), 'national');
});

test('weight, box size and chargeable weight', () => {
  assert.equal(parseWeight('450 g'), 450); assert.equal(parseWeight('1.3 kg'), 1300); assert.equal(parseWeight('n/a'), null);
  assert.deepEqual(parseDims('12 × 8 × 15 cm'), [12, 8, 15]);
  assert.equal(chargeableKg({ weight_g: 300 }), 0.5);
  assert.equal(chargeableKg({ weight_g: 450, dims: [12, 8, 15] }), 1); // volumetric wins
  assert.equal(rateCardCost(null, 'national', 1), 5800 + 5000);
});

test('profit per order: price + delivery − GST − cost − expenses − courier', () => {
  const e = unitEconomics({ price: 80000, cost: 40000, packaging: 2000, other: 2000, courier: 6500, delivery_charged: 0 });
  assert.equal(e.profit, 29500);
  assert.equal(customerFee(null, 'local', 50000), 0);
  assert.equal(customerFee(null, 'local', 30000), 3900);
  // suggested price really gives at least the target profit
  for (const zone of ['local', 'regional', 'metro', 'national', 'special']) {
    const courier = rateCardCost(null, zone, 1);
    const p = priceForTarget({ target: 30000, cost: 40000, packaging: 2000, other: 2000, courier, zone });
    const got = unitEconomics({ price: p, cost: 40000, packaging: 2000, other: 2000, courier, delivery_charged: customerFee(null, zone, p) });
    assert.ok(got.profit >= 30000 && got.profit < 30000 + 1000 + 15000, `${zone}: ₹${p / 100} → profit ₹${got.profit / 100}`);
  }
});

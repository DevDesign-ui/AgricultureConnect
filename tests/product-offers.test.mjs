import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterProductsByOfferType,
  getOfferPriceUnit,
  getProductOfferType,
  isOfferAvailable,
  isPurchasableOffer,
} from '../src/lib/product-offers.ts';

test('preserves existing products as agricultural offers when no offer type is present', () => {
  const legacyProduct = { type_offre: undefined };

  assert.equal(getProductOfferType(legacyProduct), 'produit_agricole');
  assert.equal(isPurchasableOffer(legacyProduct), true);
});

test('filters offers by one of the four catalog activities while retaining all offers in Tous', () => {
  const products = [
    { id: 'legacy', type_offre: undefined },
    { id: 'sale', type_offre: 'materiel_vente' },
    { id: 'rental', type_offre: 'materiel_location' },
    { id: 'service', type_offre: 'service_agricole' },
  ];

  assert.deepEqual(filterProductsByOfferType(products, 'tous'), products);
  assert.deepEqual(filterProductsByOfferType(products, 'produit_agricole').map((item) => item.id), ['legacy']);
  assert.deepEqual(filterProductsByOfferType(products, 'materiel_vente').map((item) => item.id), ['sale']);
  assert.deepEqual(filterProductsByOfferType(products, 'materiel_location').map((item) => item.id), ['rental']);
  assert.deepEqual(filterProductsByOfferType(products, 'service_agricole').map((item) => item.id), ['service']);
});

test('uses stock for purchase offers but does not imply booking availability for services or rentals', () => {
  assert.equal(isOfferAvailable({ type_offre: 'produit_agricole', disponible: true, stock: 0 }), false);
  assert.equal(isOfferAvailable({ type_offre: 'materiel_vente', disponible: true, stock: 0 }), false);
  assert.equal(isOfferAvailable({ type_offre: 'materiel_location', disponible: true, stock: 0 }), true);
  assert.equal(isOfferAvailable({ type_offre: 'service_agricole', disponible: true, stock: 0 }), true);
  assert.equal(isOfferAvailable({ type_offre: 'service_agricole', disponible: false, stock: 0 }), false);
});

test('displays the specific tariff unit for rentals and services', () => {
  assert.equal(getOfferPriceUnit({
    type_offre: 'materiel_location',
    unite: 'offre',
    unite_tarifaire: 'jour',
  }), 'jour');
  assert.equal(getOfferPriceUnit({
    type_offre: 'service_agricole',
    unite: 'offre',
    unite_tarifaire: 'hectare',
  }), 'hectare');
  assert.equal(getOfferPriceUnit({
    type_offre: 'produit_agricole',
    unite: 'kg',
    unite_tarifaire: null,
  }), 'kg');
});

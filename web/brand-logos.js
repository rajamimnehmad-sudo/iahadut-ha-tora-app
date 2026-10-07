import {brandKey} from './category-navigation.js';

// Existing official-site artwork, shared with the home brand carousel.
// Explicit names avoid depending on missing or generic image alt text.
const names = [
  ['Noel'], ['La Campagnola'], ['Barba Roja'], ['Arcor'],
  ['Mesquida', 'Gabriel Mesquida'], ['RR'], ['Monda'], ['Rodez'],
  ['Pomona foods', 'Pomona'], ['El Parque'], ['La Parmesana'], ['Karu'],
  ['Sozoé'], ['Agrocomercial Vagnoni'], ['Pura frutta', 'Pura fruta'],
  ['AIT'], ['Alnuna'], ['Almirante Dönn'], ['Amande'], ['Ancestral'],
  ['Api-Frank'], ['Finca Balcarce'], ['La Simona'], ['Mudra'], ['Vitalgy'], ['Wik!']
];
const logos = new Map(names.flatMap((aliases,index) => {
  const file = `brand-${String(index).padStart(2,'0')}.png`;
  // Vite resolves this URL into a bundled, hashed asset. Plain path strings
  // only worked in the dev server and were missing in the Android bundle.
  const url = new URL(`./assets/brands/${file}`, import.meta.url).href;
  return aliases.map(name => [brandKey(name), url]);
}));
export function brandLogo(name) {
  return logos.get(brandKey(name)) || '';
}
export function brandForLogoPath(path) {
  const match = String(path || '').match(/brand-(\d{2})(?:[.-])/);
  return match ? names[Number(match[1])]?.[0] || '' : '';
}

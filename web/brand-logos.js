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
const logos = new Map(names.flatMap((aliases,index) => aliases.map(name =>
  [brandKey(name), `assets/brands/brand-${String(index).padStart(2,'0')}.png`]
)));
export function brandLogo(name) {
  return logos.get(brandKey(name)) || '';
}

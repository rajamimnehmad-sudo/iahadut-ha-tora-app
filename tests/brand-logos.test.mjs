import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {brandLogo} from '../web/brand-logos.js';
import {brandName} from '../web/category-navigation.js';

test('all existing official brand logos are registered and exist locally',()=>{
 const names=['Noel','La Campagnola','Barba Roja','Arcor','Mesquida','RR','Monda','Rodez','Pomona foods','El Parque','La Parmesana','Karu','Sozoé','Agrocomercial Vagnoni','Pura frutta','AIT','Alnuna','Almirante Dönn','Amande','Ancestral','Api-Frank','Finca Balcarce','La Simona','Mudra','Vitalgy','Wik!'];
 names.forEach((name,index)=>{
   assert.equal(brandLogo(name),`assets/brands/brand-${String(index).padStart(2,'0')}.png`);
   assert.ok(fs.existsSync(new URL(`../web/${brandLogo(name)}`,import.meta.url)));
 });
 assert.equal(brandLogo('Marca desconocida'),'');
});
test('catalog flavour suffixes share one logo and generic labels cannot assign logos',()=>{
 assert.equal(brandLogo(brandName({brand:'»Pura frutta» manzana roja'})),brandLogo('Pura frutta'));
 assert.equal(brandLogo('Sozoe'),brandLogo('Sozoé'));
 assert.equal(brandLogo('Planta certificada'),'');
 assert.equal(brandLogo('Marvavic'),'');
});

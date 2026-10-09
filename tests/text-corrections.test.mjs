import test from 'node:test';import assert from 'node:assert/strict';
import {correctDisplayText,correctContentTree} from '../web/text-corrections.js';
test('clear spelling errors are corrected across titles and paragraphs, preserving breaks',()=>{
 assert.equal(correctDisplayText('Certifcación: OK\n\nProducto bajo supervisón. Mermelada de Naraja.'),'Certificación: OK\n\nProducto bajo supervisión. Mermelada de Naranja.');
 assert.equal(correctDisplayText('CERTIFIACIÓN KOSHER'),'CERTIFICACIÓN KOSHER');
});
test('names, barcodes, URLs and classification identities are preserved',()=>{
 const value={url:'https://vaad.ar/producto/cafe-naraja/',barcode:'7790001234567',categoryPath:['Cafe'],brand:'Buckinhgam',description:'Café marca Monte cudine. Nother. Karlsberg.'};
 assert.deepEqual(correctContentTree(value),value);
});
test('remote corrections can fix new wording without replacing product or template code',()=>{
 assert.equal(correctDisplayText('Texto erradoo de marca',{'erradoo':'errado'}),'Texto errado de marca');
 assert.equal(correctDisplayText('https://example.com/erradoo',{'erradoo':'errado'}),'https://example.com/erradoo');
});
test('corrections are idempotent and never alter a legitimate word substring',()=>{
 const text='MErmelada de Naraja, supervisón, maca y humado';
 assert.equal(correctDisplayText(correctDisplayText(text)),correctDisplayText(text));
 assert.equal(correctDisplayText('Maizena, Macarena y Bitburger'),'Maizena, Macarena y Bitburger');
});

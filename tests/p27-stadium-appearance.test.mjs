import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyStadiumTint } from '../src/stadium-appearance.js';

test('P27 stade : les changements répétés de skin repartent toujours de la couleur d’origine',()=>{
 const material=new THREE.MeshLambertMaterial({color:0x435669});
 const materials=[material];
 applyStadiumTint(materials,0x687f91);
 const first=material.color.getHex();
 applyStadiumTint(materials,0x687f91);
 assert.equal(material.color.getHex(),first);
 applyStadiumTint(materials,0xffffff);
 assert.equal(material.color.getHex(),0x435669);
});

test('P27 stade : plusieurs changements de skin ne détruisent pas la palette source',()=>{
 const material=new THREE.MeshStandardMaterial({color:0x8aa0b7});
 applyStadiumTint([material],0x687f91);
 applyStadiumTint([material],0x8aa0b7);
 const expected=new THREE.Color(0x8aa0b7).multiply(new THREE.Color(0x8aa0b7)).getHex();
 assert.equal(material.color.getHex(),expected);
 assert.equal(material.userData.p27BaseColor,0x8aa0b7);
});

test('P27 stade : ignore les entrées sans couleur sans interrompre la palette',()=>{
 const material=new THREE.MeshLambertMaterial({color:0x26754e});
 assert.doesNotThrow(()=>applyStadiumTint([null,{},material],0xffffff));
 assert.equal(material.color.getHex(),0x26754e);
});

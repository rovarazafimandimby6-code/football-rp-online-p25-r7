import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clonePlayerMaterials } from '../src/player-materials.js';

test('P27 joueurs 3D : les couleurs de maillot sont isolées entre joueurs',()=>{
 const shared=new THREE.MeshStandardMaterial({color:0xffffff});
 const makeModel=()=>{const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),shared));return root;};
 const playerA=makeModel(),playerB=makeModel();
 clonePlayerMaterials(playerA);
 clonePlayerMaterials(playerB);
 const matA=playerA.children[0].material,matB=playerB.children[0].material;
 matA.color.set('#d83b35');
 assert.notEqual(matA,shared);
 assert.notEqual(matA,matB);
 assert.equal(matB.color.getHex(),0xffffff);
 assert.equal(shared.color.getHex(),0xffffff);
});

test('P27 joueurs 3D : conserve le partage des matériaux au sein du même joueur',()=>{
 const shared=new THREE.MeshStandardMaterial({color:0xffffff});
 const root=new THREE.Group();
 root.add(new THREE.Mesh(new THREE.BoxGeometry(),shared),new THREE.Mesh(new THREE.SphereGeometry(),shared));
 clonePlayerMaterials(root);
 assert.equal(root.children[0].material,root.children[1].material);
 assert.notEqual(root.children[0].material,shared);
});

test('P27 joueurs 3D : clone correctement les matériaux multi-slots',()=>{
 const a=new THREE.MeshStandardMaterial({color:0xff0000});
 const b=new THREE.MeshStandardMaterial({color:0x0000ff});
 const root=new THREE.Group();
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),[a,b]);
 root.add(mesh);
 clonePlayerMaterials(root);
 assert.equal(mesh.material.length,2);
 assert.notEqual(mesh.material[0],a);
 assert.notEqual(mesh.material[1],b);
});

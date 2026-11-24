import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminTokenConfigured, isValidAdminToken } from '../server/admin-auth.js';

test('P27 admin : exige un secret configuré d’au moins 32 octets',()=>{
 assert.equal(isAdminTokenConfigured('a'.repeat(32)),true);
 assert.equal(isAdminTokenConfigured('a'.repeat(31)),false);
 assert.equal(isAdminTokenConfigured(''),false);
 assert.equal(isAdminTokenConfigured(undefined),false);
});

test('P27 admin : compare le jeton sans accepter une valeur différente ou absente',()=>{
 const secret='p27-test-secret-0123456789abcdef';
 assert.equal(isValidAdminToken(secret,secret),true);
 assert.equal(isValidAdminToken(secret+'x',secret),false);
 assert.equal(isValidAdminToken(secret.slice(1),secret),false);
 assert.equal(isValidAdminToken('',secret),false);
 assert.equal(isValidAdminToken(secret,undefined),false);
});

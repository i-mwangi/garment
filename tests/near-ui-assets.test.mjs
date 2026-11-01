import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import {displayUsdc} from '../services/near/display.ts';import {identiconSeed} from '../services/utils/identicon.ts';
test('native UI amounts use six USDC decimals and native account avatars remain deterministic',()=>{assert.equal(displayUsdc(1n),'0.000001');assert.equal(displayUsdc(1000000n),'1.00');assert.equal(identiconSeed('owner.testnet'),identiconSeed('owner.testnet'));assert.equal(existsSync('public/chain/near.svg'),true);});

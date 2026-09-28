import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createLocalJobs} from '../local/jobs.mjs';
import {validate} from '../validation.mjs';

test('local tiny preset does not leak into cloud configuration',()=>{
 const input={prompt:'A forest',preset:'tiny',seed:42};
 assert.equal(validate(input,true).preset,'tiny');assert.throws(()=>validate(input));
});
test('local process completion, serialization and cancellation',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'wan-local-test-'));let child;
 const manager=createLocalJobs({directory,launch:()=>{child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};return child;}});
 const input={prompt:'Forest',preset:'tiny',seed:42};const job=await manager.submit(input);
 await assert.rejects(manager.submit(input));
 await mkdir(path.join(directory,'outputs'));await writeFile(path.join(directory,'outputs',job.id+'.mp4'),'mock');
 child.emit('close',0);assert.equal(manager.status(job.id).status,'COMPLETED');
 const next=await manager.submit(input);assert.equal(manager.cancel(next.id).status,'CANCELLED');
 await assert.rejects(manager.submit(input));child.emit('close',1);
 assert.equal(manager.status(next.id).status,'CANCELLED');
 const failed=await manager.submit(input);child.emit('error',new Error('Python unavailable'));
 assert.equal(manager.status(failed.id).status,'FAILED');
});
test('browser script parses',async()=>{const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);});

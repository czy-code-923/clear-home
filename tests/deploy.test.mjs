import {spawn, spawnSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, readdir, access, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

const source=fileURLToPath(new URL('../',import.meta.url)), php=process.env.PHP_BINARY||'php';
const temp=await mkdtemp(path.join(os.tmpdir(),'clear-home-deploy-'));
const target=path.join(temp,'site'),pub=path.join(target,'public');
let child,log='';
function prepare(){const r=spawnSync(php,[path.join(source,'scripts/prepare.php'),target],{encoding:'utf8'});if(r.error)throw r.error;assert.equal(r.status,0,r.stderr);}
try{
  prepare();
  assert.deepEqual((await readdir(pub)).sort(),['api.php','app.js','index.html','style.css','sync.js']);
  for(const f of await readdir(pub))assert.deepEqual(await readFile(path.join(pub,f)),await readFile(path.join(source,f)));
  await assert.rejects(access(path.join(target,'clear-home-config.php')));
  const config=path.join(target,'clear-home-config.php'),data=path.join(target,'clear-home-data');
  const password=randomBytes(24).toString('hex');
  const privateConfig=`<?php return ['admin_password'=>'${password}','data_dir'=>__DIR__.'/clear-home-data','secure_cookie'=>true];`;
  await writeFile(config,privateConfig);
  const sentinel='preserve-existing-data';await writeFile(path.join(data,'keep.txt'),sentinel);
  prepare();
  assert.equal(await readFile(config,'utf8'),privateConfig);
  assert.equal(await readFile(path.join(data,'keep.txt'),'utf8'),sentinel);
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const env={...process.env};delete env.CLEAR_HOME_CONFIG;
  child=spawn(php,['-S',`127.0.0.1:${port}`,'-t',pub],{env});child.stderr.on('data',d=>log+=d);
  let spawnError;child.on('error',e=>spawnError=e);
  let response;
  for(let i=0;i<50;i++){if(spawnError)throw spawnError;try{response=await fetch(`http://127.0.0.1:${port}/api.php`);break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(response,'PHP service did not start');assert.equal(response.status,200,log);
  assert.match(response.headers.get('content-type'),/application\/json/);
  assert.match(response.headers.get('set-cookie'),/secure/i);
  assert.equal((await response.json()).revision,0);
  const publicIndex=await readFile(path.join(pub,'index.html'),'utf8');
  for(const name of ['clear-home-config.php','clear-home-data/navigation.json','.git/config']){
    const result=await fetch(`http://127.0.0.1:${port}/${name}`),body=await result.text();
    // A development-server fallback may serve only the exact public homepage.
    assert.ok(result.status===404||(result.status===200&&body===publicIndex),`${name}: unexpected HTTP ${result.status} response`);
  }
  console.log('Deployment checks passed: exact runtime files, idempotent update, adjacent private config discovery, Secure cookie, private paths not served.');
}finally{
  if(child&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});
  // This randomly created temporary test directory is owned entirely by this test.
  await rm(temp,{recursive:true,force:true});
}

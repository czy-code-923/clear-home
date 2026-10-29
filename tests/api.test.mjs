import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),php=process.env.PHP_BINARY||'php';
const dir=await mkdtemp(path.join(os.tmpdir(),'clear-home-api-test-'));
const config=path.join(dir,'config.php'),dataDir=path.join(dir,'private-data');
const password=randomBytes(24).toString('hex');
await writeFile(config,`<?php return ['admin_password'=>'${password}','data_dir'=>'${dataDir.replaceAll('\\','/')}'];`);
const source=await readFile(path.join(root,'app.js'),'utf8');
const fixture=vm.runInNewContext(source.slice(0,source.indexOf('const localOnly'))+';initial()', {URL});
let child,logs='';const base='http://127.0.0.1:4184';let checks=0;
async function start(){child=spawn(php,['-S','127.0.0.1:4184','-t',root],{env:{...process.env,CLEAR_HOME_CONFIG:config}});child.stderr.on('data',d=>logs+=d);for(let i=0;i<50;i++){try{await fetch(base+'/api.php');return;}catch{await new Promise(r=>setTimeout(r,100));}}throw Error('Server did not start');}
async function stop(){const p=child;if(!p||p.exitCode!==null)return;await new Promise(r=>{p.once('exit',r);p.kill();});}
class Client{
 cookie='';csrf='';
 async request(method='GET',op='state',body,csrf=this.csrf){const r=await fetch(base+'/api.php?op='+op,{method,headers:{...(this.cookie?{Cookie:this.cookie}:{}),...(body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});const cookie=r.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];const json=await r.json();if(json.csrf)this.csrf=json.csrf;return {status:r.status,...json};}
}
function ok(condition,label){assert.ok(condition,label);console.log('PASS '+label);checks++;}
try{
 await start();const a=new Client(),b=new Client(),anonymous=new Client();
 let r=await a.request();ok(r.status===200&&r.revision===0&&r.data===null,'fresh storage is empty');
 await anonymous.request();r=await anonymous.request('PUT','state',{revision:0,data:fixture});ok(r.status===401,'anonymous write rejected');
 r=await a.request('POST','login',{password:'incorrect-password'});ok(r.status===401,'wrong password rejected');
 r=await a.request('POST','login',{password});ok(r.authenticated===true,'administrator login');
 r=await a.request('PUT','state',{revision:0,data:fixture},'forged');ok(r.status===403,'CSRF write rejected');
 r=await a.request('PUT','state',{revision:0,data:fixture});ok(r.status===200&&r.revision===1,'initial server save');
 r=await b.request();ok(r.data.sites.length===11&&r.revision===1&&!r.authenticated,'independent browser reads same navigation');
 const edited=structuredClone(fixture);edited.sites[0].name='多端同步验证';edited.sites.push({...edited.sites[0],id:'cross-device-test',name:'手机可见网站'});
 r=await a.request('PUT','state',{revision:1,data:edited});ok(r.revision===2,'add and edit persisted');
 r=await b.request();ok(r.data.sites.at(-1).name==='手机可见网站'&&r.data.sites[0].name==='多端同步验证','second device sees edits and additions');
 await b.request('POST','login',{password});
 r=await b.request('PUT','state',{revision:1,data:fixture});ok(r.status===409,'stale second-device write rejected');
 r=await a.request();ok(r.revision===2&&r.data.sites.length===12,'conflict leaves latest server data intact');
 const bad=structuredClone(fixture);bad.sites[0].url='javascript:alert(1)';r=await a.request('PUT','state',{revision:2,data:bad});ok(r.status===422,'unsafe URL rejected by server');
 const dup=structuredClone(fixture);dup.categories[1].id=dup.categories[0].id;r=await a.request('PUT','state',{revision:2,data:dup});ok(r.status===422,'invalid backup rejected by server');
 await stop();await start();const c=new Client();r=await c.request();ok(r.revision===2&&r.data.sites.length===12,'disk persistence survives PHP restart');
 r=await fetch(base+'/navigation.json');ok(r.status===404,'private navigation file not publicly served');
 await a.request();r=await a.request('PUT','state',{revision:2,data:fixture});ok(r.status===200,'delete/import replacement saves');
 await b.request();const results=await Promise.all([a.request('PUT','state',{revision:3,data:fixture}),b.request('PUT','state',{revision:3,data:edited})]);ok(results.filter(x=>x.status===200).length===1&&results.filter(x=>x.status===409).length===1,'simultaneous writers cannot overwrite each other');await a.request('POST','logout',{});await a.request();r=await a.request('PUT','state',{revision:3,data:edited});ok(r.status===401,'logout removes write access');
 const d=new Client();await d.request();for(let i=0;i<10;i++)await d.request('POST','login',{password:'wrong'});r=await d.request('POST','login',{password});ok(r.status===429,'login throttling survives cookie/session changes');
 await rename(config,config+'.off');r=await c.request();ok(r.status===503&&r.code==='setup_required','missing config gives explicit setup failure');await rename(config+'.off',config);
 const record=JSON.parse(await readFile(path.join(dataDir,'navigation.json'),'utf8'));ok(record.revision===4&&[11,12].includes(record.data.sites.length),'failed writes leave valid disk state');
 await writeFile(path.join(dataDir,'navigation.json'),'{broken');r=await c.request();ok(r.status===500&&r.code==='storage_error','corrupt disk data never silently resets');await writeFile(path.join(dataDir,'navigation.json'),JSON.stringify(record));console.log(`${checks} integration checks passed`);
}finally{await stop();await writeFile(path.join(dir,'server.log'),logs);}

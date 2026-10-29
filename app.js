'use strict';
const $ = id => document.getElementById(id);
const STORAGE_KEY = 'clear-home.v1';
const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const initial = () => ({version:1,categories:[{id:'self',name:'自建服务'},{id:'daily',name:'常用网站'},{id:'dev',name:'开发工具'},{id:'fun',name:'影音娱乐'}],sites:[
 {id:'s1',name:'VPS 探针',url:'https://example.com/status',icon:'📡',description:'服务器状态，一目了然',category:'self',target:'_blank',favorite:false},
 {id:'s2',name:'我的云盘',url:'https://example.com/drive',icon:'☁️',description:'文件与灵感，随时随地',category:'self',target:'_blank',favorite:false},
 {id:'s3',name:'宝塔面板',url:'https://example.com/panel',icon:'🛠️',description:'让服务器管理更简单',category:'self',target:'_blank',favorite:false},
 {id:'s4',name:'哔哩哔哩',url:'https://www.bilibili.com',icon:'📺',description:'发现好内容，收获新灵感',category:'fun',target:'_blank',favorite:true},
 {id:'s5',name:'GitHub',url:'https://github.com',icon:'◉',description:'代码、开源与无限可能',category:'dev',target:'_blank',favorite:true},
 {id:'s6',name:'Notion',url:'https://www.notion.so',icon:'▣',description:'把想法整理成自己的知识库',category:'daily',target:'_blank',favorite:true},
 {id:'s7',name:'Gmail',url:'https://mail.google.com',icon:'✉️',description:'保持连接，不错过重要消息',category:'daily',target:'_blank',favorite:true},
 {id:'s8',name:'MDN Web Docs',url:'https://developer.mozilla.org/zh-CN/',icon:'⌘',description:'开发路上的可靠参考',category:'dev',target:'_blank',favorite:false},
 {id:'s9',name:'Figma',url:'https://www.figma.com',icon:'🎨',description:'让每一个好想法变得可见',category:'dev',target:'_blank',favorite:false},
 {id:'s10',name:'豆瓣',url:'https://www.douban.com',icon:'豆',description:'遇见下一本好书、下一部好电影',category:'fun',target:'_blank',favorite:false},
 {id:'s11',name:'少数派',url:'https://sspai.com',icon:'🔴',description:'高效工作，品质生活',category:'daily',target:'_blank',favorite:false}
],settings:{theme:'light',accent:'#4386ec',background:'sky',backgroundImage:'',engine:'bing'}});
function validUrl(value){const raw=value.trim();const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(raw)&&! /^[^/:?#]+:\d+(?:[/?#]|$)/.test(raw)?raw:`https://${raw}`);if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw Error('请输入有效的 HTTP / HTTPS 网站地址');return url.href;}
function validateData(data){
 if(!data||data.version!==1||!Array.isArray(data.categories)||!data.categories.length||data.categories.length>50||!Array.isArray(data.sites)||data.sites.length>2000)throw Error('备份格式不正确，或版本不受支持');
 const ids=new Set();const categories=data.categories.map(g=>{if(typeof g.id!=='string'||!g.id||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>30)throw Error('分类数据无效');ids.add(g.id);return {id:g.id,name:g.name.trim()};});
 const siteIds=new Set();const sites=data.sites.map(s=>{if(typeof s.id!=='string'||!s.id||siteIds.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>60||typeof s.url!=='string'||!ids.has(s.category)||typeof s.icon!=='string'||s.icon.length>16||typeof s.description!=='string'||s.description.length>150||!['_blank','_self'].includes(s.target)||typeof s.favorite!=='boolean')throw Error('网站数据无效');siteIds.add(s.id);return {id:s.id,name:s.name.trim(),url:validUrl(s.url),icon:s.icon||'🌐',description:s.description,category:s.category,target:s.target,favorite:s.favorite};});
 const settings={...initial().settings,...data.settings};if(!['light','dark','auto'].includes(settings.theme)||!/^#[\da-f]{6}$/i.test(settings.accent)||!['sky','mint','lavender','custom'].includes(settings.background)||!['bing','baidu','google','bilibili'].includes(settings.engine)||typeof settings.backgroundImage!=='string'||settings.backgroundImage.length>2900000||settings.backgroundImage&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(settings.backgroundImage))throw Error('外观设置无效');
 return {version:1,categories,sites,settings};
}
const localOnly = location.protocol === 'file:';
const server = new NavigationServer();
let startupError='', legacyData=null, state=initial(), pendingSnapshot=null;
try {const saved=localStorage.getItem(STORAGE_KEY);if(saved)legacyData=validateData(JSON.parse(saved));if(localOnly&&legacyData)state=legacyData;}catch(e){startupError='无法读取旧版本机数据，请使用已导出的 JSON 备份。';}
let saveQueue=Promise.resolve(),saving=false,refreshing=false,syncError='';
function updateSyncStatus(message='') {
 const text=localOnly?'本机模式，不跨设备同步':saving?'正在保存到 VPS…':syncError?'VPS 连接或保存失败':pendingSnapshot?'有未保存内容，可导出':!server.ready?'正在连接 VPS…':server.revision===0?'服务器尚无已保存导航':`VPS 已同步 · 第 ${server.revision} 版`;
 $('saveStatus').textContent=text;$('serverStatus').textContent=message||syncError||text;
 $('adminBtn').textContent=localOnly?'本机模式':server.authenticated?'退出管理':'管理员登录';
 $('migrateLocal').hidden=localOnly||!legacyData;$('exportFailed').hidden=!pendingSnapshot;
 $('storageDescription').textContent=localOnly?'当前为本机预览，不跨设备同步':'数据保存到 VPS，多端共享';
 $('syncNotice').hidden=!localOnly&&!syncError&&!pendingSnapshot&&server.ready&&server.revision>0;
 $('syncNotice').textContent=message||syncError||(pendingSnapshot?'上次修改未确认保存。服务器导航已保留，可在设置中导出未保存内容。':localOnly?'当前直接打开本地文件：数据只保存在本浏览器。跨设备共享请部署 PHP 服务。':server.ready?'VPS 已连接。管理员登录后即可保存；有旧版数据可在设置中发布。':'正在读取 VPS 导航…');
 $('syncNotice').classList.toggle('sync-warning',!!syncError||localOnly);
}
function refreshServer(force=false){
 if(localOnly||saving||refreshing||!force&&document.querySelector('dialog[open]'))return Promise.resolve();
 return enqueueSave(()=>performRefresh(force));
}
async function performRefresh(force=false) {
 if(localOnly||saving||refreshing||!force&&document.querySelector('dialog[open]'))return;
 refreshing=true;
 try {
   const result=await server.load();const next=result.data===null?initial():validateData(result.data);
   const changed=server.revision!==result.revision;server.accept(result);syncError='';
   if(changed||force){state=next;if(active!=='all'&&!state.categories.some(g=>g.id===active))active='all';render();if(changed&&!force)toast('已读取其他设备更新的导航');}
   updateSyncStatus();
 }catch(e){syncError=e.message;server.ready=false;updateSyncStatus();if(force)toast(e.message);}finally{refreshing=false;}
}
function ensureWritable(){
 if(localOnly)return true;
 if(!server.ready){toast(syncError||'正在读取服务器，请稍候再试');return false;}
 if(!server.authenticated){if(!$('loginDialog').open){$('loginError').textContent='';$('loginDialog').showModal();$('adminPassword').focus();}return false;}
 return true;
}
function enqueueSave(work){const result=saveQueue.then(work,work);saveQueue=result.catch(()=>{});return result;}
async function persist(next,message){
 if(!ensureWritable())return false;
 document.querySelectorAll('.sync-dialog-error').forEach(el=>el.remove());
 saving=true;updateSyncStatus();
 try {
   next=validateData(next);
   if(localOnly)localStorage.setItem(STORAGE_KEY,JSON.stringify(next));else await server.save(next);
   state=next;pendingSnapshot=null;syncError='';
   if(!localOnly){try{localStorage.removeItem('clear-home.unsaved.v2');}catch{}}
   render();if(message)toast(localOnly?`${message}（仅本机）`:`${message} · 已保存到 VPS`);return true;
 }catch(e){
   pendingSnapshot=next;try{localStorage.setItem('clear-home.unsaved.v2',JSON.stringify(next));}catch{}
   syncError=e.message||'保存失败，数据未确认同步';
   if(e.status===409||e.status===403||e.status===401)server.ready=false;
   document.querySelectorAll('dialog[open]').forEach(dialog=>{const error=document.createElement('p');error.className='form-error sync-dialog-error';error.setAttribute('role','alert');error.textContent=syncError;dialog.append(error);});
   toast(syncError);return false;
 }finally{saving=false;updateSyncStatus();}
}
function downloadData(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${name}-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
let active='all',draggedId=null,toastTimer;
const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function commit(next,message){return enqueueSave(()=>persist(next,message));}
function mutate(action,message){return enqueueSave(()=>{const next=structuredClone(state);try{action(next);}catch(e){toast('该网站或分类已变化，请刷新后再试');return false;}return persist(next,message);});}
function applyAppearance(){const s=state.settings;const dark=s.theme==='dark'||s.theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches;document.body.classList.toggle('dark',dark);document.body.dataset.background=s.background;document.body.classList.toggle('custom-bg',s.background==='custom'&&!!s.backgroundImage);document.body.style.setProperty('--custom-bg',s.backgroundImage?`url("${s.backgroundImage}")`:'none');document.documentElement.style.setProperty('--accent',s.accent);document.documentElement.style.setProperty('--accent-rgb',s.accent.match(/\w\w/g).map(x=>parseInt(x,16)).join(','));$('themeToggle').textContent=dark?'☀':'☾';$('engine').value=s.engine;}
function render(){
 applyAppearance();const query=$('filter').value.trim().toLocaleLowerCase();const filtered=state.sites.filter(s=>(active==='all'||s.category===active)&&[s.name,s.url,s.description,state.categories.find(g=>g.id===s.category)?.name].join(' ').toLocaleLowerCase().includes(query));
 const cats=[{id:'all',name:'全部网站'},...state.categories];const navIcons=['▦','▤','◎','⌘','▷'];$('sideNav').innerHTML=cats.map((g,i)=>`<button data-category="${escapeHtml(g.id)}" class="${active===g.id?'active':''}" aria-pressed="${active===g.id}" title="${escapeHtml(g.name)}"><span class="nav-icon">${navIcons[i]||'◇'}</span><span class="nav-name">${escapeHtml(g.name)}</span><span class="nav-count">${g.id==='all'?state.sites.length:state.sites.filter(s=>s.category===g.id).length}</span></button>`).join('');
 $('categoryTabs').innerHTML=cats.map(g=>`<button data-category="${escapeHtml(g.id)}" class="${active===g.id?'active':''}" aria-pressed="${active===g.id}">${escapeHtml(g.name)}</button>`).join('');$('totalCount').textContent=state.sites.length;$('collectionTitle').textContent=query?`搜索结果 · ${filtered.length}`:cats.find(g=>g.id===active)?.name||'全部网站';
 $('siteGrid').innerHTML=filtered.map((s,i)=>{const category=state.categories.find(g=>g.id===s.category)?.name||'';return `<article class="site-card" draggable="true" data-id="${escapeHtml(s.id)}"><a class="site-link" href="${escapeHtml(s.url)}" target="${s.target}" rel="noopener noreferrer" aria-label="${escapeHtml(s.name)}${s.target==='_blank'?'（新标签页打开）':''}"><div class="card-top"><span class="site-icon" style="--icon-bg:${['#e2eeff','#e9edff','#e1f1f2','#ffe8ef','#e8ebf1','#e9ecf3','#fff0e8','#e1edf9','#f4e8f5','#e3f1ea','#fce8e8'][i%11]}">${escapeHtml(s.icon)}</span><div class="card-identity"><div class="site-name">${escapeHtml(s.name)}</div><div class="site-host">${escapeHtml(new URL(s.url).host)}</div></div></div><div class="site-description">${escapeHtml(s.description||'点击开启你的下一站')}</div><div class="card-bottom"><span class="category-tag">${escapeHtml(category)}</span><span class="link-arrow">${s.favorite?'☆ ':''}↗</span></div></a><details class="card-menu"><summary aria-label="管理${escapeHtml(s.name)}" title="管理网站">···</summary><div class="menu-content"><button data-action="edit">编辑网站</button><button data-action="favorite">${s.favorite?'移出':'加入'}常用收藏</button><button data-action="up">向前移动</button><button data-action="down">向后移动</button><button class="danger" data-action="delete">删除网站</button></div></details></article>`;}).join('')+(filtered.length?'<button class="add-card" id="gridAdd"><span>＋</span>添加一个新网站</button>':'');
 $('empty').hidden=filtered.length>0;$('favoriteList').innerHTML=state.sites.filter(s=>s.favorite).map(s=>`<a href="${escapeHtml(s.url)}" target="${s.target}" rel="noopener noreferrer" title="${escapeHtml(s.description)}"><span>${escapeHtml(s.icon)}</span>${escapeHtml(s.name)}</a>`).join('')||'<span class="muted">收藏常用的网站，让它们触手可及。</span>';
}
function openSite(id=null,favorite=false){if(!ensureWritable())return;$('siteForm').reset();const s=state.sites.find(s=>s.id===id);$('siteDialogTitle').textContent=s?'编辑网站':'添加网站';$('siteId').value=s?.id||'';$('siteName').value=s?.name||'';$('siteIcon').value=s?.icon||'🌐';$('siteUrl').value=s?.url||'';$('siteDescription').value=s?.description||'';$('siteCategory').innerHTML=state.categories.map(g=>`<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join('');$('siteCategory').value=s?.category||(active==='all'?state.categories[0].id:active);$('siteTarget').value=s?.target||'_blank';$('siteFavorite').checked=s?.favorite||favorite;$('siteError').textContent='';$('siteDialog').showModal();$('siteName').focus();}
function confirmAction(title,text,callback){$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmDialog').showModal();$('confirmOk').onclick=async()=>{const btn=$('confirmOk');btn.disabled=true;try{if(await callback()!==false)$('confirmDialog').close();}catch(e){toast(e.message);}finally{btn.disabled=false;}};$('confirmCancel').focus();}
async function reorder(id,targetId){if(id===targetId)return;return mutate(next=>{const from=next.sites.findIndex(s=>s.id===id);const target=next.sites.findIndex(s=>s.id===targetId);if(from<0||target<0)return;const [item]=next.sites.splice(from,1);next.sites.splice(target,0,item);},'网站顺序已保存');}
function openSettings(){for(const [id,key] of [['themeSetting','theme'],['accentSetting','accent'],['backgroundSetting','background']])$(id).value=state.settings[key];$('settingsDialog').showModal();}
function renderGroups(){$('groupList').innerHTML=state.categories.map(g=>`<div class="group-row" data-group="${escapeHtml(g.id)}"><input value="${escapeHtml(g.name)}" maxlength="30" aria-label="分类名称"><button data-group-action="rename">保存</button><button data-group-action="delete">删除</button></div>`).join('');}
document.addEventListener('click',async e=>{const category=e.target.closest('[data-category]');if(category){active=category.dataset.category;render();}const close=e.target.closest('[data-close]');if(close)close.closest('dialog').close();if(e.target.closest('#gridAdd'))openSite();const action=e.target.closest('[data-action]');if(action){const id=action.closest('[data-id]').dataset.id;const s=state.sites.find(s=>s.id===id);action.closest('details').open=false;switch(action.dataset.action){case 'edit':openSite(id);break;case 'favorite':mutate(n=>n.sites.find(x=>x.id===id).favorite=!s.favorite,s.favorite?'已移出常用收藏':'已加入常用收藏');break;case 'delete':confirmAction('删除这个网站？',`“${s.name}”将从导航和常用收藏中移除。`,()=>mutate(n=>n.sites=n.sites.filter(x=>x.id!==id),'网站已删除'));break;default:{const visible=[...$('siteGrid').querySelectorAll('[data-id]')].map(x=>x.dataset.id);const index=visible.indexOf(id);const other=visible[index+(action.dataset.action==='up'?-1:1)];if(other){await reorder(id,other);[...$('siteGrid').querySelectorAll('[data-id]')].find(x=>x.dataset.id===id)?.querySelector('summary').focus();}else toast('已经到达当前列表边界');}}}document.querySelectorAll('.card-menu[open]').forEach(d=>{if(!d.contains(e.target))d.open=false;});});
for(const id of ['addSite','emptyAdd'])$(id).onclick=()=>openSite();$('addFavorite').onclick=()=>openSite(null,true);$('settingsBtn').onclick=openSettings;$('sideSettings').onclick=openSettings;$('themeToggle').onclick=()=>mutate(n=>n.settings.theme=document.body.classList.contains('dark')?'light':'dark','主题已切换');$('filter').addEventListener('input',render);
Object.entries({themeSetting:'theme',accentSetting:'accent',backgroundSetting:'background'}).forEach(([id,key])=>$(id).addEventListener('change',()=>mutate(n=>n.settings[key]=$(id).value,'外观已保存')));
$('siteForm').onsubmit=async e=>{e.preventDefault();const submit=$('siteForm').querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;try{const name=$('siteName').value.trim();if(!name)throw Error('请填写网站名称');const site={id:$('siteId').value||uid(),name,url:validUrl($('siteUrl').value),icon:$('siteIcon').value.trim()||'🌐',description:$('siteDescription').value.trim(),category:$('siteCategory').value,target:$('siteTarget').value,favorite:$('siteFavorite').checked};if(await mutate(n=>{const index=n.sites.findIndex(s=>s.id===site.id);if(index<0)n.sites.push(site);else n.sites[index]=site;},'网站已保存'))$('siteDialog').close();}catch(error){$('siteError').textContent=error.message;}finally{submit.disabled=false;}};
$('engine').onchange=()=>mutate(n=>n.settings.engine=$('engine').value);$('searchForm').onsubmit=e=>{e.preventDefault();const q=$('webSearch').value.trim();if(!q){$('webSearch').focus();return;}const engines={bing:'https://www.bing.com/search?q=',baidu:'https://www.baidu.com/s?wd=',google:'https://www.google.com/search?q=',bilibili:'https://search.bilibili.com/all?keyword='};window.open(engines[state.settings.engine]+encodeURIComponent(q),'_blank','noopener,noreferrer');};
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('filter').focus();}else if(e.key==='/'&&!typing){e.preventDefault();$('webSearch').focus();}else if(e.key==='Escape'){if($('filter').value){$('filter').value='';render();}document.querySelectorAll('details[open]').forEach(d=>d.open=false);}});
$('siteGrid').addEventListener('dragstart',e=>{if(!ensureWritable()){e.preventDefault();return;}const card=e.target.closest('.site-card');if(!card||e.target.closest('details')){e.preventDefault();return;}draggedId=card.dataset.id;card.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedId);});$('siteGrid').addEventListener('dragover',e=>{const card=e.target.closest('.site-card');if(card&&draggedId){e.preventDefault();card.classList.add('drag-over');e.dataTransfer.dropEffect='move';}});$('siteGrid').addEventListener('dragleave',e=>e.target.closest('.site-card')?.classList.remove('drag-over'));$('siteGrid').addEventListener('drop',e=>{const card=e.target.closest('.site-card');if(card&&draggedId){e.preventDefault();reorder(draggedId,card.dataset.id);}draggedId=null;});$('siteGrid').addEventListener('dragend',()=>{draggedId=null;document.querySelectorAll('.dragging,.drag-over').forEach(x=>x.classList.remove('dragging','drag-over'));});
$('settingsGroups').onclick=()=>{if(!ensureWritable())return;renderGroups();$('groupsDialog').showModal();};
$('manageGroups').onclick=()=>{if(!ensureWritable())return;renderGroups();$('groupsDialog').showModal();};$('groupForm').onsubmit=async e=>{e.preventDefault();const name=$('newGroup').value.trim();if(!name)return;if(state.categories.some(g=>g.name===name)){toast('这个分类已经存在');return;}if(state.categories.length>=50){toast('最多支持 50 个分类');return;}if(await mutate(n=>n.categories.push({id:uid(),name}),'分类已添加')){$('newGroup').value='';renderGroups();}};
$('groupList').onclick=async e=>{const btn=e.target.closest('[data-group-action]');if(!btn)return;const row=btn.closest('[data-group]');const id=row.dataset.group;const name=row.querySelector('input').value.trim();if(btn.dataset.groupAction==='rename'){if(!name){toast('分类名称不能为空');return;}if(state.categories.some(g=>g.id!==id&&g.name===name)){toast('分类名称重复');return;}await mutate(n=>n.categories.find(g=>g.id===id).name=name,'分类已更新');renderGroups();}else{if(state.categories.length===1){toast('请至少保留一个分类');return;}const target=state.categories.find(g=>g.id!==id);confirmAction('删除分类？',`此分类的网站将移入“${target.name}”，网站不会被删除。`,async()=>{if(await mutate(n=>{n.categories=n.categories.filter(g=>g.id!==id);n.sites.forEach(s=>{if(s.category===id)s.category=target.id;});},'分类已删除')){if(active===id){active='all';render();}renderGroups();}});}};
$('confirmCancel').onclick=()=>$('confirmDialog').close();
$('backgroundFile').onchange=async()=>{const file=$('backgroundFile').files[0];if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('请选择不超过 2 MB 的 JPG、PNG 或 WebP 图片');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});if(await mutate(n=>{n.settings.background='custom';n.settings.backgroundImage=data;},'自定义背景已保存'))$('backgroundSetting').value='custom';}catch(e){toast(e.message||'读取图片失败');}$('backgroundFile').value='';};
$('exportBtn').onclick=()=>{downloadData(state,'澄页备份');toast('备份文件已导出');};$('importBtn').onclick=()=>{if(ensureWritable())$('importFile').click();};$('importFile').onchange=async()=>{const file=$('importFile').files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('备份文件不能超过 5 MB');const next=validateData(JSON.parse(await file.text()));confirmAction('恢复这份备份？',`将替换为 ${next.sites.length} 个网站和 ${next.categories.length} 个分类；当前数据将被覆盖。`,async()=>{if(await commit(next,'备份已恢复')){active='all';$('filter').value='';render();$('settingsDialog').close();}});}catch(e){toast(`导入失败：${e instanceof SyntaxError?'JSON 文件格式错误':e.message}`);}$('importFile').value='';};
function updateClock(){const now=new Date();$('clock').innerHTML=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}<span>:${String(now.getSeconds()).padStart(2,'0')}</span>`;$('date').textContent=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(now);const hour=now.getHours();$('greeting').textContent=`${hour<6?'夜深了':hour<12?'上午好':hour<18?'下午好':'晚上好'}，欢迎回到你的空间`;}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyAppearance);render();updateClock();setInterval(updateClock,1000);if(startupError)toast(startupError);

$('adminBtn').onclick=async()=>{
 if(localOnly){toast('跨设备同步需要部署 PHP 服务，请查看部署说明');return;}
 if(!server.ready){await refreshServer(true);if(!server.ready)return;}
 if(server.authenticated){try{await server.logout();await refreshServer(true);toast('已退出管理员');}catch(e){toast(e.message);}return;}
 ensureWritable();
};
$('loginForm').onsubmit=async e=>{
 e.preventDefault();const btn=$('loginSubmit');btn.disabled=true;$('loginError').textContent='';
 try{
   if(location.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(location.hostname))throw Error('请先在宝塔启用 HTTPS，再输入管理员密码。');
   await server.login($('adminPassword').value);$('adminPassword').value='';
   await refreshServer(true);if(!server.ready)throw Error(syncError);
   $('loginDialog').close();updateSyncStatus();toast('已登录，修改将自动保存到 VPS');
 }catch(e){$('loginError').textContent=e.message;}finally{btn.disabled=false;}
};
$('loginDialog').addEventListener('close',()=>$('adminPassword').value='');
$('refreshServer').onclick=()=>refreshServer(true);
$('migrateLocal').onclick=()=>{
 if(!ensureWritable()||!legacyData)return;
 confirmAction('将旧版本机导航发布到 VPS？',`将用本浏览器旧版的 ${legacyData.sites.length} 个网站替换服务器导航，其他设备会读取这份数据。建议先导出服务器备份。`,async()=>{const ok=await commit(legacyData,'旧版导航已发布');if(ok){legacyData=null;updateSyncStatus();}return ok;});
};
$('exportFailed').onclick=()=>{if(pendingSnapshot)downloadData(pendingSnapshot,'澄页未保存内容');};
try{const draft=localStorage.getItem('clear-home.unsaved.v2');if(draft)pendingSnapshot=validateData(JSON.parse(draft));}catch{}
updateSyncStatus();if(!localOnly)refreshServer(true);
setInterval(()=>{if(!document.hidden)refreshServer();},20000);
window.addEventListener('focus',()=>refreshServer());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshServer();});

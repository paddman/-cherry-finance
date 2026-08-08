import type { FastifyPluginAsync } from 'fastify';

const demoHtml = String.raw`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CherryFin Accounting MVP</title>
  <style>
    :root{color-scheme:dark;--bg:#090b12;--panel:#121621;--panel2:#181e2c;--line:#2a3142;--text:#eef2ff;--muted:#94a0b8;--pink:#ff4d8d;--cyan:#48d7ff;--green:#5de09b;--amber:#ffcb6b;--danger:#ff6b81;--shadow:0 20px 70px rgba(0,0,0,.35)}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#25122b 0,transparent 34%),radial-gradient(circle at 90% 10%,#0c2b3a 0,transparent 30%),var(--bg);font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text)}
    button,input,select,textarea{font:inherit}.shell{max-width:1480px;margin:auto;padding:26px}.top{display:flex;gap:18px;align-items:center;justify-content:space-between;margin-bottom:22px}.brand{display:flex;gap:14px;align-items:center}.logo{width:48px;height:48px;border-radius:16px;background:linear-gradient(145deg,var(--pink),#9d4dff);display:grid;place-items:center;font-size:25px;box-shadow:0 12px 35px rgba(255,77,141,.28)}h1{font-size:22px;margin:0}.sub{color:var(--muted)}.badge{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:999px;padding:7px 11px;background:rgba(18,22,33,.75)}.dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 14px var(--green)}
    .notice{border:1px solid rgba(255,203,107,.35);background:rgba(255,203,107,.08);color:#ffe2a5;border-radius:14px;padding:12px 15px;margin-bottom:20px}.grid{display:grid;grid-template-columns:300px minmax(0,1fr) 360px;gap:18px}.card{background:linear-gradient(180deg,rgba(24,30,44,.94),rgba(16,20,31,.94));border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);overflow:hidden}.card h2{font-size:14px;letter-spacing:.08em;text-transform:uppercase;margin:0;color:#cbd4e8}.head{padding:16px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}.body{padding:17px}.stack{display:grid;gap:12px}.field{display:grid;gap:6px}.field label{font-size:12px;color:var(--muted)}input,select,textarea{width:100%;border:1px solid var(--line);background:#0d111b;color:var(--text);border-radius:10px;padding:10px 11px;outline:none}input:focus,select:focus,textarea:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(72,215,255,.09)}button{border:0;border-radius:10px;padding:10px 13px;cursor:pointer;background:#252d3d;color:var(--text);font-weight:650}button:hover{filter:brightness(1.12)}button.primary{background:linear-gradient(135deg,var(--pink),#a94dff)}button.cyan{background:linear-gradient(135deg,#0786b7,var(--cyan));color:#061018}button.good{background:#194f38;color:#aaffd0}button.bad{background:#552033;color:#ffc2cf}button:disabled{opacity:.45;cursor:not-allowed}.row{display:flex;gap:8px;flex-wrap:wrap}.split{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tiny{font-size:11px;color:var(--muted)}.list{display:grid;gap:10px}.item{border:1px solid var(--line);border-radius:13px;padding:12px;background:rgba(9,11,18,.5);cursor:pointer}.item:hover{border-color:#52617e}.itemTop{display:flex;justify-content:space-between;gap:10px}.status{font-size:11px;padding:3px 8px;border-radius:99px;background:#252d3d}.status.pending{color:var(--amber)}.status.confirmed,.status.corrected,.status.done,.status.clean{color:var(--green)}.status.rejected,.status.failed,.status.infected{color:var(--danger)}.money{font-variant-numeric:tabular-nums;font-weight:750}.empty{padding:28px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:13px}.drop{border:1px dashed #4e5d79;border-radius:15px;padding:24px;text-align:center;background:rgba(72,215,255,.025)}.progress{height:7px;border-radius:99px;background:#252d3d;overflow:hidden}.bar{height:100%;width:0;background:linear-gradient(90deg,var(--pink),var(--cyan));transition:width .3s}.kv{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 0;border-bottom:1px solid rgba(42,49,66,.65)}.kv:last-child{border:0}.log{height:160px;overflow:auto;background:#080a10;border:1px solid var(--line);border-radius:10px;padding:10px;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;color:#b8c3d8}.modal{position:fixed;inset:0;background:rgba(2,4,8,.76);display:none;place-items:center;padding:24px;z-index:20}.modal.open{display:grid}.dialog{width:min(920px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow)}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--muted);font-size:11px;text-transform:uppercase}.right{text-align:right}.json{white-space:pre-wrap;word-break:break-word;background:#090c14;padding:12px;border-radius:10px;color:#c7d3ea}@media(max-width:1100px){.grid{grid-template-columns:280px 1fr}.rightCol{grid-column:1/-1}}@media(max-width:760px){.shell{padding:14px}.top{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.split{grid-template-columns:1fr}}
  </style>
</head>
<body>
<div class="shell">
  <div class="top">
    <div class="brand"><div class="logo">🍒</div><div><h1>CherryFin Accounting MVP</h1><div class="sub">Upload → Extract → Draft → Human Review → CFO Brief</div></div></div>
    <div class="row"><span class="badge"><span class="dot"></span><span id="apiState">กำลังตรวจ API</span></span><a class="badge" href="/docs" target="_blank" style="color:inherit;text-decoration:none">OpenAPI</a></div>
  </div>
  <div class="notice"><strong>พื้นที่สาธิต:</strong> ใช้ข้อมูลสังเคราะห์หรือข้อมูลที่ทำ Data Anonymization แล้วเท่านั้น ห้ามโยนเอกสารลูกค้าจริงเข้าระบบพัฒนา เพราะกฎหมายไม่ได้ประทับใจกับคำว่า “ผมแค่ลองดูครับ”</div>
  <div class="grid">
    <section class="card">
      <div class="head"><h2>Workspace</h2></div>
      <div class="body stack">
        <div class="field"><label>JWT (เว้นว่างเมื่อ AUTH_MODE=development)</label><textarea id="token" rows="3" placeholder="Bearer token"></textarea></div>
        <div class="field"><label>ชื่อองค์กร</label><input id="orgName" value="Cherry Demo Group" /></div>
        <button class="primary" id="createOrg">สร้างองค์กร</button>
        <div class="field"><label>องค์กร</label><select id="orgSelect"><option value="">เลือกองค์กร</option></select></div>
        <div class="field"><label>ชื่อนิติบุคคล</label><input id="companyName" value="Cherry Synthetic Co., Ltd." /></div>
        <div class="field"><label>เลขผู้เสียภาษีสังเคราะห์</label><input id="taxId" value="0105559999999" /></div>
        <button class="cyan" id="createCompany">สร้างบริษัท</button>
        <div class="field"><label>บริษัท</label><select id="companySelect"><option value="">เลือกบริษัท</option></select></div>
        <div class="tiny">ค่าที่เลือกจะถูกเก็บใน browser เครื่องนี้เท่านั้น</div>
      </div>
    </section>

    <main class="stack">
      <section class="card">
        <div class="head"><h2>1. Document intake</h2><button id="refreshAttachments">รีเฟรช</button></div>
        <div class="body stack">
          <div class="drop"><input id="file" type="file" /><p class="sub">PDF, PNG, JPEG, WEBP, TXT, CSV หรือ JSON ไม่เกิน 25 MB</p><button class="primary" id="upload">อัปโหลดและประมวลผล</button></div>
          <div class="progress"><div class="bar" id="bar"></div></div>
          <div id="attachments" class="list"></div>
        </div>
      </section>

      <section class="card">
        <div class="head"><h2>2. Accounting review inbox</h2><button id="refreshDrafts">รีเฟรช</button></div>
        <div class="body"><div id="drafts" class="list"></div></div>
      </section>
    </main>

    <aside class="card rightCol">
      <div class="head"><h2>3. CFO Brief</h2></div>
      <div class="body stack">
        <div class="split"><div class="field"><label>เริ่มงวด</label><input id="periodStart" type="date" /></div><div class="field"><label>สิ้นงวด</label><input id="periodEnd" type="date" /></div></div>
        <button class="primary" id="makeBrief">สร้าง CFO Brief</button>
        <div id="brief" class="empty">ยังไม่มีรายงาน</div>
        <div class="field"><label>Activity log</label><div id="log" class="log"></div></div>
      </div>
    </aside>
  </div>
</div>

<div class="modal" id="modal"><div class="dialog"><div class="head"><h2>Draft review</h2><button id="closeModal">ปิด</button></div><div class="body stack" id="draftDetail"></div></div></div>
<script>
const state={orgId:localStorage.orgId||'',companyId:localStorage.companyId||'',draft:null};
const $=id=>document.getElementById(id);const log=(m,d)=>{$('log').textContent='['+new Date().toLocaleTimeString()+'] '+m+(d?' '+JSON.stringify(d):'')+'\n'+$('log').textContent};
function headers(json=true){const h={};if(json)h['content-type']='application/json';const t=$('token').value.trim();if(t)h.authorization=t.startsWith('Bearer ')?t:'Bearer '+t;return h}
async function api(path,opt={}){const r=await fetch(path,{...opt,headers:{...headers(opt.body!==undefined),...(opt.headers||{})}});const text=await r.text();let body={};try{body=text?JSON.parse(text):{}}catch{body={raw:text}}if(!r.ok)throw new Error(body.error?.message||('HTTP '+r.status));return body}
function requireCompany(){if(!state.orgId||!state.companyId)throw new Error('กรุณาเลือกองค์กรและบริษัทก่อน')}
function status(v){return '<span class="status '+v+'">'+v+'</span>'}
async function health(){try{await api('/healthz',{headers:{}});$('apiState').textContent='API พร้อมใช้งาน'}catch(e){$('apiState').textContent='API ไม่พร้อม';log(e.message)}}
async function loadOrgs(){const data=await api('/v1/organizations');$('orgSelect').innerHTML='<option value="">เลือกองค์กร</option>'+data.items.map(x=>'<option value="'+x.id+'">'+escapeHtml(x.name)+'</option>').join('');$('orgSelect').value=state.orgId;if(state.orgId)await loadCompanies()}
async function loadCompanies(){if(!state.orgId)return;const data=await api('/v1/organizations/'+state.orgId+'/companies');$('companySelect').innerHTML='<option value="">เลือกบริษัท</option>'+data.items.map(x=>'<option value="'+x.id+'">'+escapeHtml(x.displayName||x.legalName)+'</option>').join('');$('companySelect').value=state.companyId}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
$('createOrg').onclick=async()=>{try{const o=await api('/v1/organizations',{method:'POST',body:JSON.stringify({name:$('orgName').value})});state.orgId=o.id;localStorage.orgId=o.id;await loadOrgs();log('สร้างองค์กรแล้ว',o)}catch(e){alert(e.message)}};
$('orgSelect').onchange=async e=>{state.orgId=e.target.value;state.companyId='';localStorage.orgId=state.orgId;localStorage.removeItem('companyId');await loadCompanies()};
$('createCompany').onclick=async()=>{try{if(!state.orgId)throw new Error('เลือกองค์กรก่อน');const c=await api('/v1/organizations/'+state.orgId+'/companies',{method:'POST',body:JSON.stringify({legalName:$('companyName').value,displayName:$('companyName').value,taxId:$('taxId').value||undefined,currency:'THB',timezone:'Asia/Bangkok'})});state.companyId=c.id;localStorage.companyId=c.id;await loadCompanies();log('สร้างบริษัทแล้ว',c)}catch(e){alert(e.message)}};
$('companySelect').onchange=async e=>{state.companyId=e.target.value;localStorage.companyId=state.companyId;await Promise.all([loadAttachments(),loadDrafts()])};
async function sha256(file){const b=await file.arrayBuffer();const h=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function mimeFor(file){if(file.type)return file.type;const ext=file.name.toLowerCase().split('.').pop();return ({json:'application/json',csv:'text/csv',txt:'text/plain',pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'})[ext]||'application/octet-stream'}
$('upload').onclick=async()=>{try{requireCompany();const f=$('file').files[0];if(!f)throw new Error('เลือกไฟล์ก่อน');$('bar').style.width='10%';const digest=await sha256(f);$('bar').style.width='25%';const init=await api('/v1/organizations/'+state.orgId+'/companies/'+state.companyId+'/attachments',{method:'POST',body:JSON.stringify({originalFilename:f.name,mimeType:mimeFor(f),byteSize:f.size,sha256:digest})});$('bar').style.width='45%';const put=await fetch(init.upload.url,{method:'PUT',headers:init.upload.headers,body:f});if(!put.ok)throw new Error('Object upload failed HTTP '+put.status);$('bar').style.width='75%';await api('/v1/attachments/'+init.attachment.id+'/complete',{method:'POST',body:JSON.stringify({etag:put.headers.get('etag')||undefined})});$('bar').style.width='100%';log('ส่งเอกสารเข้าคิวแล้ว',{attachmentId:init.attachment.id});await loadAttachments();setTimeout(loadDrafts,2500)}catch(e){alert(e.message);log('อัปโหลดล้มเหลว',{error:e.message})}finally{setTimeout(()=>$('bar').style.width='0%',800)}};
async function loadAttachments(){if(!state.orgId||!state.companyId){$('attachments').innerHTML='<div class="empty">เลือกบริษัทก่อน</div>';return}try{const d=await api('/v1/organizations/'+state.orgId+'/companies/'+state.companyId+'/attachments');$('attachments').innerHTML=d.items.length?d.items.map(x=>'<div class="item"><div class="itemTop"><strong>'+escapeHtml(x.originalFilename)+'</strong>'+status(x.extractStatus)+'</div><div class="tiny">scan '+x.scanStatus+' · '+Math.round(x.byteSize/1024)+' KB · '+new Date(x.createdAt).toLocaleString()+'</div></div>').join(''):'<div class="empty">ยังไม่มีเอกสาร</div>'}catch(e){log(e.message)}}
async function loadDrafts(){if(!state.orgId||!state.companyId){$('drafts').innerHTML='<div class="empty">เลือกบริษัทก่อน</div>';return}try{const d=await api('/v1/organizations/'+state.orgId+'/companies/'+state.companyId+'/accounting/drafts');$('drafts').innerHTML=d.items.length?d.items.map(x=>'<div class="item" data-id="'+x.id+'"><div class="itemTop"><strong>Draft v'+x.version+'</strong>'+status(x.status)+'</div><div class="row tiny"><span>Debit <b class="money">'+x.totalDebit+'</b></span><span>Credit <b class="money">'+x.totalCredit+'</b></span><span>'+new Date(x.createdAt).toLocaleString()+'</span></div></div>').join(''):'<div class="empty">ยังไม่มี Draft หรือ Worker ยังประมวลผลไม่เสร็จ</div>';document.querySelectorAll('#drafts .item').forEach(el=>el.onclick=()=>openDraft(el.dataset.id))}catch(e){log(e.message)}}
async function openDraft(id){try{const d=await api('/v1/accounting/drafts/'+id);state.draft=d;const rows=d.lines.map(x=>'<tr><td>'+x.lineNumber+'</td><td>'+escapeHtml(x.accountCode+' '+x.accountName)+'</td><td class="right money">'+x.debit+'</td><td class="right money">'+x.credit+'</td></tr>').join('');$('draftDetail').innerHTML='<div class="split"><div><div class="tiny">เอกสาร</div><strong>'+escapeHtml(d.attachment.originalFilename)+'</strong><div>'+escapeHtml(d.document.counterpartyName||'ไม่ทราบคู่ค้า')+'</div></div><div><div class="tiny">ยอดรวม</div><strong class="money">'+escapeHtml(d.document.totalAmount||'-')+' '+d.document.currency+'</strong><div>'+status(d.status)+'</div></div></div><table><thead><tr><th>#</th><th>บัญชี</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead><tbody>'+rows+'</tbody></table><div class="row"><button class="good" id="confirmDraft">ยืนยัน Draft</button><button class="bad" id="rejectDraft">ปฏิเสธ</button></div><details><summary>Extraction / validation</summary><pre class="json">'+escapeHtml(JSON.stringify({extracted:d.document.extractedFields,validation:d.document.validationResults,evidence:d.evidence},null,2))+'</pre></details>';$('confirmDraft').disabled=d.status!=='pending';$('rejectDraft').disabled=d.status!=='pending';$('confirmDraft').onclick=()=>review('confirm');$('rejectDraft').onclick=()=>review('reject');$('modal').classList.add('open')}catch(e){alert(e.message)}}
async function review(action){try{const note=prompt(action==='confirm'?'หมายเหตุการยืนยัน (ไม่บังคับ)':'เหตุผลที่ปฏิเสธ')||'';const path='/v1/accounting/drafts/'+state.draft.id+'/'+(action==='confirm'?'confirm':'reject');await api(path,{method:'POST',body:JSON.stringify(action==='confirm'?{note:note||undefined}:{note:note||'ข้อมูลไม่ถูกต้อง'})});$('modal').classList.remove('open');await loadDrafts();log('บันทึกการตรวจ Draft แล้ว',{action,draftId:state.draft.id})}catch(e){alert(e.message)}}
$('makeBrief').onclick=async()=>{try{requireCompany();const b=await api('/v1/organizations/'+state.orgId+'/companies/'+state.companyId+'/cfo/briefs',{method:'POST',body:JSON.stringify({periodStart:$('periodStart').value,periodEnd:$('periodEnd').value,currency:'THB'})});const s=b.sections;const e=s.executiveSummary||{};$('brief').className='';$('brief').innerHTML='<div class="kv"><span>รายได้</span><b class="money">'+(e.revenue||'0')+'</b></div><div class="kv"><span>ค่าใช้จ่าย</span><b class="money">'+(e.expenses||'0')+'</b></div><div class="kv"><span>ผลดำเนินงาน</span><b class="money">'+(e.operatingResult||'0')+'</b></div><div class="kv"><span>เอกสารตรวจแล้ว</span><b>'+e.reviewedDocumentCount+'</b></div><details><summary>รายงานฉบับ JSON</summary><pre class="json">'+escapeHtml(JSON.stringify(b,null,2))+'</pre></details>';log('สร้าง CFO Brief แล้ว',{briefId:b.id})}catch(e){alert(e.message)}};
$('closeModal').onclick=()=> $('modal').classList.remove('open');$('modal').onclick=e=>{if(e.target===$('modal'))$('modal').classList.remove('open')};$('refreshAttachments').onclick=loadAttachments;$('refreshDrafts').onclick=loadDrafts;
const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1);$('periodStart').value=first.toISOString().slice(0,10);$('periodEnd').value=now.toISOString().slice(0,10);$('token').value=localStorage.jwt||'';$('token').onchange=()=>localStorage.jwt=$('token').value;
health();loadOrgs().then(()=>Promise.all([loadAttachments(),loadDrafts()])).catch(e=>log(e.message));setInterval(()=>{if(state.companyId)Promise.all([loadAttachments(),loadDrafts()])},10000);
</script>
</body></html>`;

export const demoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/app', async (_request, reply) =>
    reply.type('text/html; charset=utf-8').send(demoHtml)
  );
  app.get('/', async (_request, reply) => reply.redirect('/app'));
};

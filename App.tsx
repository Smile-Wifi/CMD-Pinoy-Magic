import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ShieldCheck, Zap, X, CheckCircle2, AlertTriangle, Clock3, Receipt, Image as ImageIcon, User, Link2, RefreshCw, Settings as SettingsIcon, ListFilter, FileText, Power, Star, ChevronRight, Copy, Eye, Lock, Unlock, Activity, Package, Banknote, ScanLine, CircleAlert, ArrowRight, Sparkles } from 'lucide-react';

type OrderStatus='pending'|'approved'|'rejected'|'reupload';
type HitPayStatus='MATCHED'|'NO MATCH'|'PENDING'|'NOT FOUND';
interface Order { orderId:string; customer:string; packageName:string; amount:number; paidAmount:number; method:string; submitted:string; sender:string; ref:string; time:string; hitpay:HitPayStatus; status:OrderStatus; note:string; unlockCode:string; reason:string; photoLabel:string }
interface OrderRec { recordId:string; value:Order }
interface Audit { at:string; actor:string; action:string; orderId:string; detail:string }
interface AuditRec { recordId:string; value:Audit }
interface SettingsVal { apiKey:string; autoApprove:boolean; webhook:string; disengaged:boolean; lastSync:string }

const SEED:Order[]=[
  {orderId:'PPM-2026-0142',customer:'Maria Santos',packageName:'Basic',amount:99,paidAmount:99,method:'GCash',submitted:'Today · 09:42 AM',sender:'Maria Santos',ref:'GCASH-8821-4407',time:'09:41 AM',hitpay:'MATCHED',status:'pending',note:'Clean receipt, sender and amount line up. Ready to verify.',unlockCode:'',reason:'',photoLabel:'MS'},
  {orderId:'PPM-2026-0143',customer:'Andrea Reyes',packageName:'Basic',amount:99,paidAmount:100,method:'GCash',submitted:'Today · 10:08 AM',sender:'Andrea Reyes',ref:'GCASH-7712-9034',time:'10:07 AM',hitpay:'NO MATCH',status:'pending',note:'Customer paid ₱100 for a ₱99 package. Overpayment — confirm before approving.',unlockCode:'',reason:'',photoLabel:'AR'},
  {orderId:'PPM-2026-0144',customer:'Miguel Torres',packageName:'Music',amount:149,paidAmount:149,method:'Maya',submitted:'Today · 10:31 AM',sender:'Miguel Torres',ref:'MAYA-5520-1189',time:'10:29 AM',hitpay:'NO MATCH',status:'pending',note:'Same Maya ref was used on an earlier order. Do not approve until ref is cleared.',unlockCode:'',reason:'',photoLabel:'MT'},
  {orderId:'PPM-2026-0141',customer:'Liza Ramos',packageName:'Music',amount:149,paidAmount:149,method:'HitPay',submitted:'Yesterday · 06:12 PM',sender:'Liza Ramos',ref:'HITPAY-9931-2208',time:'06:11 PM',hitpay:'MATCHED',status:'approved',note:'Verified and released. Download link sent to customer.',unlockCode:'PASKO-7K2Q-91XA',reason:'',photoLabel:'LR'},
  {orderId:'PPM-2026-0140',customer:'Carlo Aquino',packageName:'Basic',amount:99,paidAmount:99,method:'Bank',submitted:'Yesterday · 04:05 PM',sender:'C. Aquino',ref:'BANK-4410-7782',time:'04:02 PM',hitpay:'NOT FOUND',status:'rejected',note:'No matching bank posting found. Customer asked to resend proof.',unlockCode:'',reason:'No HitPay / bank match',photoLabel:'CA'},
  {orderId:'PPM-2026-0139',customer:'Sofia Villanueva',packageName:'Basic',amount:99,paidAmount:99,method:'GCash',submitted:'Yesterday · 02:48 PM',sender:'Sofia Villanueva',ref:'GCASH-3098-6612',time:'02:47 PM',hitpay:'PENDING',status:'reupload',note:'Receipt photo is cropped. Amount and ref are cut off.',unlockCode:'',reason:'Receipt unreadable',photoLabel:'SV'},
];
const HITPAY_TX=[
  {id:'HP-88412',ref:'GCASH-8821-4407',sender:'Maria Santos',amount:99,method:'GCash',time:'09:41 AM',status:'SETTLED'},
  {id:'HP-88419',ref:'GCASH-7712-9034',sender:'Andrea Reyes',amount:100,method:'GCash',time:'10:07 AM',status:'SETTLED'},
  {id:'HP-88420',ref:'MAYA-5520-1189',sender:'Miguel Torres',amount:149,method:'Maya',time:'10:29 AM',status:'FLAGGED'},
  {id:'HP-88401',ref:'HITPAY-9931-2208',sender:'Liza Ramos',amount:149,method:'HitPay',time:'06:11 PM',status:'SETTLED'},
  {id:'HP-88388',ref:'GCASH-3098-6612',sender:'Sofia Villanueva',amount:99,method:'GCash',time:'02:47 PM',status:'PENDING'},
];
const CHECKS=['Amount matches','Ref not reused','Sender name matches','Receipt readable','Time within 24h'];

async function api(action:string,args:any){
  const res=await fetch("actions",{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,args})});
  const j=await res.json().catch(()=>({}));
  if(!res.ok||j.error) throw new Error(j.error||`Request failed (${res.status})`);
  return j.data;
}

export default function App(){
  const [orders,setOrders]=useState<OrderRec[]>([]);
  const [audits,setAudits]=useState<AuditRec[]>([]);
  const [settings,setSettings]=useState<SettingsVal>({apiKey:'',autoApprove:false,webhook:'https://pasko-photo-magic.example/webhooks/hitpay',disengaged:false,lastSync:'Today · 08:15 AM'});
  const [settingsId,setSettingsId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [backendError,setBackendError]=useState('');
  const [seedResult,setSeedResult]=useState<{saved:number;remaining:number;error:string|null;reloadError:string|null}|null>(null);
  const [busy,setBusy]=useState(false);
  const [view,setView]=useState<'Queue'|'Approved'|'Rejected'|'HitPay Sync'|'Audit Log'|'Settings'>('Queue');
  const [search,setSearch]=useState(''); const [pkg,setPkg]=useState('All'); const [method,setMethod]=useState('All'); const [statusFilter,setStatusFilter]=useState('All');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [checks,setChecks]=useState<Record<string,boolean>>({});
  const [overrideReason,setOverrideReason]=useState(''); const [useOverride,setUseOverride]=useState(false);
  const [rejectReason,setRejectReason]=useState(''); const [rejectNote,setRejectNote]=useState('');
  const [hitpayChecking,setHitpayChecking]=useState(false); const [hitpayResult,setHitpayResult]=useState('');
  const [approveFlash,setApproveFlash]=useState('');
  const [actionMsg,setActionMsg]=useState('');
  const [syncing,setSyncing]=useState(false); const [linkOrder,setLinkOrder]=useState(''); const [linkTxn,setLinkTxn]=useState('');
  const [auditFilter,setAuditFilter]=useState('All'); const [auditSearch,setAuditSearch]=useState('');
  const [showDisengage,setShowDisengage]=useState(false);
  const [showSettingsSaved,setShowSettingsSaved]=useState('');
  const [copied,setCopied]=useState('');
  const copyRef=useRef<HTMLTextAreaElement>(null);

  async function reloadRecords(){
    const o=await api("records.list",{collection:'pasko_cmd_orders'});
    const a=await api("records.list",{collection:'pasko_cmd_audit'});
    const s=await api("records.list",{collection:'pasko_cmd_settings'});
    const oRecs=(o?.records||[]).map((r:any)=>({recordId:r.id,value:r.value as Order}));
    const aRecs=(a?.records||[]).map((r:any)=>({recordId:r.id,value:r.value as Audit}));
    setOrders(oRecs); setAudits(aRecs);
    if((s?.records||[]).length){ setSettings(s.records[0].value as SettingsVal); setSettingsId(s.records[0].id); }
    return {oRecs,aRecs};
  }
  async function createRow(row:Order){
    await api("records.create",{collection:'pasko_cmd_orders',value:row,idempotency_key:`seed-${row.orderId}`});
  }
  async function loadInitial(){
    try{
      const {oRecs}=await reloadRecords();
      if(oRecs.length===0){
        setBusy(true); let saved=0; let error:string|null=null;
        try{ for(const row of SEED){ await createRow(row); saved+=1; } }catch(e){ error=e instanceof Error?e.message:String(e); }
        let reloadError:string|null=null;
        try{ await reloadRecords(); }catch(e){ reloadError=e instanceof Error?e.message:String(e); }
        setSeedResult({saved,remaining:SEED.length-saved,error,reloadError}); setBusy(false);
        if(saved===SEED.length){
          try{ await api("records.create",{collection:'pasko_cmd_audit',value:{at:new Date().toLocaleString(),actor:'SYSTEM',action:'QUEUE SEEDED',orderId:'—',detail:'Demo queue loaded: 6 orders ready for manual verification.'},idempotency_key:'seed-audit-1'}); await reloadRecords(); }catch{}
        }
      }
      setBackendError('');
    }catch(e){ setBackendError('Backend unavailable in this preview — showing demo queue. Changes will save after publishing.'); setOrders(SEED.map((v,i)=>({recordId:`demo-${i}`,value:v}))); setAudits([{recordId:'a1',value:{at:'Today · 08:15 AM',actor:'SYSTEM',action:'QUEUE SEEDED',orderId:'—',detail:'Demo queue loaded for manual verification.'}}]); }
    setLoading(false);
  }
  useEffect(()=>{ loadInitial(); },[]);

  const selected=orders.find(o=>o.value.orderId===selectedId)?.value;
  const selectedRec=orders.find(o=>o.value.orderId===selectedId);
  const pending=orders.filter(o=>o.value.status==='pending').length;
  const approved=orders.filter(o=>o.value.status==='approved').length;
  const rejected=orders.filter(o=>o.value.status==='rejected').length;
  const matchedPct=orders.length?Math.round(orders.filter(o=>o.value.hitpay==='MATCHED').length/orders.length*100):0;

  const visible=useMemo(()=>{
    let list=orders;
    if(view==='Queue') list=list.filter(o=>o.value.status==='pending'||o.value.status==='reupload');
    if(view==='Approved') list=list.filter(o=>o.value.status==='approved');
    if(view==='Rejected') list=list.filter(o=>o.value.status==='rejected');
    if(view==='Queue'||view==='Approved'||view==='Rejected'){
      const q=search.trim().toLowerCase();
      if(q) list=list.filter(o=>o.value.orderId.toLowerCase().includes(q)||o.value.customer.toLowerCase().includes(q)||o.value.ref.toLowerCase().includes(q));
      if(pkg!=='All') list=list.filter(o=>o.value.packageName===pkg);
      if(method!=='All') list=list.filter(o=>o.value.method===method);
      if(statusFilter!=='All') list=list.filter(o=>o.value.status===statusFilter);
    }
    return list;
  },[orders,view,search,pkg,method,statusFilter]);

  const filteredAudit=useMemo(()=>audits.filter(a=>{
    const q=auditSearch.toLowerCase(); const okSearch=!q||a.value.orderId.toLowerCase().includes(q)||a.value.detail.toLowerCase().includes(q)||a.value.action.toLowerCase().includes(q);
    const okF=auditFilter==='All'||a.value.action.includes(auditFilter); return okSearch&&okF;
  }).sort((a,b)=>b.recordId.localeCompare(a.recordId)),[audits,auditFilter,auditSearch]);

  function openOrder(o:OrderRec){ setSelectedId(o.value.orderId); setChecks({}); setOverrideReason(''); setUseOverride(false); setRejectReason(''); setRejectNote(''); setHitpayResult(''); setActionMsg(''); }
  function allChecked(){ return CHECKS.every(c=>checks[c]); }
  async function persistOrder(updated:Order,recId:string){
    try{ await api("records.replace",{collection:'pasko_cmd_orders',id:recId,value:updated}); setBackendError(''); }catch(e){ setBackendError('Could not save to backend — change shown in this session only.'); }
  }
  async function addAudit(a:Audit){
    try{ await api("records.create",{collection:'pasko_cmd_audit',value:a,idempotency_key:`audit-${a.orderId}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`}); }catch{}
    try{ await reloadRecords(); }catch{}
  }
  function genCode(){ return `PASKO-${Math.random().toString(36).slice(2,6).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`; }

  async function doApprove(){
    if(!selected||!selectedRec) return;
    if(!allChecked()&&!(useOverride&&overrideReason.trim())){ setActionMsg('Check every item, or turn on admin override and add a reason.'); return; }
    const code=genCode(); const updated={...selected, status:'approved' as OrderStatus, unlockCode:code, hitpay:'MATCHED' as HitPayStatus, reason: useOverride?`Override: ${overrideReason}`:''};
    await persistOrder(updated,selectedRec.recordId);
    setOrders(prev=>prev.map(o=>o.recordId===selectedRec.recordId?{...o,value:updated}:o));
    await addAudit({at:new Date().toLocaleString(),actor:'ADMIN',action:'APPROVED',orderId:selected.orderId,detail:`Approved ${selected.packageName} ₱${selected.amount}. Unlock code ${code} generated. ${useOverride?`Override reason: ${overrideReason}`:'All manual checks passed.'}`});
    setApproveFlash(code); setActionMsg('');
  }
  async function doReject(){
    if(!selected||!selectedRec) return;
    if(!rejectReason){ setActionMsg('Choose a rejection reason first.'); return; }
    const updated={...selected,status:'rejected' as OrderStatus,reason:`${rejectReason}${rejectNote?` — ${rejectNote}`:''}`};
    await persistOrder(updated,selectedRec.recordId);
    setOrders(prev=>prev.map(o=>o.recordId===selectedRec.recordId?{...o,value:updated}:o));
    await addAudit({at:new Date().toLocaleString(),actor:'ADMIN',action:'REJECTED',orderId:selected.orderId,detail:`Rejected — ${rejectReason}. ${rejectNote}`});
    setActionMsg('Order moved to Rejected.'); setSelectedId(null);
  }
  async function doReupload(){
    if(!selected||!selectedRec) return;
    const updated={...selected,status:'reupload' as OrderStatus,reason:rejectNote||'Receipt unreadable — re-upload requested'};
    await persistOrder(updated,selectedRec.recordId);
    setOrders(prev=>prev.map(o=>o.recordId===selectedRec.recordId?{...o,value:updated}:o));
    await addAudit({at:new Date().toLocaleString(),actor:'ADMIN',action:'RE-UPLOAD REQUESTED',orderId:selected.orderId,detail:`Asked customer to re-upload receipt. ${rejectNote||'Receipt unreadable.'}`});
    setActionMsg('Re-upload requested. Order stays in queue for the customer to resend proof.'); 
  }
  function checkHitPay(){
    if(!selected) return; setHitpayChecking(true); setHitpayResult('');
    setTimeout(()=>{ setHitpayChecking(false); if(selected.hitpay==='MATCHED') setHitpayResult(`MATCHED — HitPay found ${selected.ref}. Sender ${selected.sender}, ₱${selected.paidAmount}, ${selected.time}.`); else if(selected.hitpay==='NO MATCH') setHitpayResult(`MISMATCH — HitPay amount / ref does not line up. Order ₱${selected.amount} vs paid ₱${selected.paidAmount}. Ref ${selected.ref} needs review.`); else if(selected.hitpay==='NOT FOUND') setHitpayResult(`NOT FOUND — No HitPay posting for ${selected.ref}. Ask customer to confirm sender / ref.`); else setHitpayResult(`PENDING — HitPay has not settled ${selected.ref} yet. Recheck in a few minutes.`); },950);
  }
  async function syncHitPay(){
    setSyncing(true); const now=new Date().toLocaleString();
    setTimeout(async()=>{ setSyncing(false); const next={...settings,lastSync:now}; setSettings(next);
      try{ if(settingsId) await api("records.replace",{collection:'pasko_cmd_settings',id:settingsId,value:next}); else { const r=await api("records.create",{collection:'pasko_cmd_settings',value:next,idempotency_key:'settings-1'}); setSettingsId(r?.id||null);} }catch{}
      await addAudit({at:now,actor:'SYSTEM',action:'HITPAY SYNC',orderId:'—',detail:'HitPay sync completed. 5 transactions reviewed.'});
    },1100);
  }
  async function linkAndApprove(){
    const order=orders.find(o=>o.value.orderId===linkOrder); const txn=HITPAY_TX.find(t=>t.id===linkTxn);
    if(!order||!txn){ setActionMsg('Select both an order and a HitPay transaction.'); return; }
    const code=genCode(); const updated={...order.value,status:'approved' as OrderStatus,unlockCode:code,hitpay:'MATCHED' as HitPayStatus,ref:txn.ref,paidAmount:txn.amount};
    await persistOrder(updated,order.recordId);
    setOrders(prev=>prev.map(o=>o.recordId===order.recordId?{...o,value:updated}:o));
    await addAudit({at:new Date().toLocaleString(),actor:'ADMIN',action:'LINKED & APPROVED',orderId:order.value.orderId,detail:`Manually linked to HitPay ${txn.id} (${txn.ref}, ₱${txn.amount}) and approved. Unlock ${code}.`});
    setActionMsg(`Linked ${order.value.orderId} → ${txn.id} and approved. Unlock code ${code}.`); setLinkOrder(''); setLinkTxn('');
  }
  async function saveSettings(){
    try{ if(settingsId) await api("records.replace",{collection:'pasko_cmd_settings',id:settingsId,value:settings}); else { const r=await api("records.create",{collection:'pasko_cmd_settings',value:settings,idempotency_key:'settings-1'}); setSettingsId(r?.id||null); } setShowSettingsSaved('Settings saved. Test key is stored in this CMD workspace only.'); setBackendError(''); }catch(e){ setShowSettingsSaved('Could not save to backend in this preview — settings shown here only.'); }
  }
  async function setDisengaged(v:boolean){
    const next={...settings,disengaged:v}; setSettings(next); setShowDisengage(false);
    try{ if(settingsId) await api("records.replace",{collection:'pasko_cmd_settings',id:settingsId,value:next}); else { const r=await api("records.create",{collection:'pasko_cmd_settings',value:next,idempotency_key:'settings-1'}); setSettingsId(r?.id||null);} }catch{}
    await addAudit({at:new Date().toLocaleString(),actor:'ADMIN',action:v?'CMD DISENGAGED':'CMD RE-ENGAGED',orderId:'—',detail:v?'CMD detached. Storefront continues on HitPay auto mode.':'CMD manual verification re-engaged.'});
  }
  function copyText(text:string){
    if(copyRef.current){ copyRef.current.value=text; copyRef.current.select(); try{document.execCommand('copy'); setCopied(text);}catch{} }
  }

  if(loading) return <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] grid place-items-center mono">PASKO CMD // LOADING QUEUE…</div>;
  if(settings.disengaged) return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] pt-6">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-[var(--red-dim)] grid place-items-center"><Power className="w-8 h-8 text-[var(--red)]"/></div>
        <p className="mono text-xs tracking-[.25em] text-[var(--amber)] mt-6">CMD DETACHED</p>
        <h1 className="text-3xl sm:text-5xl font-bold mt-3 leading-tight">CMD is detached.</h1>
        <p className="text-[var(--muted)] mt-4 leading-relaxed">Manual verification is off. Your Pasko storefront continues on HitPay auto mode. No orders are held in this console while detached. Approvals, rejections and audit logging resume only after you re-engage.</p>
        <div className="text-left bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 mt-7 space-y-2 text-sm"><p className="font-bold">What stays true while detached</p><p className="text-[var(--muted)]">• Storefront checkout still works through HitPay.</p><p className="text-[var(--muted)]">• No new orders are queued for manual review here.</p><p className="text-[var(--muted)]">• Re-engage any time to return to manual verification.</p></div>
        <button onClick={()=>setDisengaged(false)} className="mt-7 bg-[var(--green)] text-black font-bold px-6 py-3.5 rounded-full inline-flex items-center gap-2"><Unlock className="w-4 h-4"/> Re-engage CMD</button>
        <p className="mono text-xs text-[var(--muted-2)] mt-6">PASKO CMD v1.0 · PASKO PHOTO MAGIC</p>
      </div>
    </div>
  );

  const nav=[{label:'Queue',icon:Clock3},{label:'Approved',icon:CheckCircle2},{label:'Rejected',icon:X},{label:'HitPay Sync',icon:RefreshCw},{label:'Audit Log',icon:FileText},{label:'Settings',icon:SettingsIcon}] as const;

  return (
    <div data-safe-area-inset-root style={{boxSizing:'border-box',paddingTop:'var(--safe-area-inset-top)'}} className="min-h-screen bg-[var(--bg)] text-[var(--text)] overflow-x-clip">
      <textarea ref={copyRef} aria-hidden="true" className="fixed opacity-0 pointer-events-none w-1 h-1" readOnly />
      {/* TOP BAR */}
      <header data-safe-area-sticky-top style={{top:'var(--safe-area-inset-top)'}} className="sticky z-30 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border)]">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 min-w-0"><div className="w-9 h-9 rounded-lg bg-[var(--green)] text-black grid place-items-center font-black">⌘</div><div><p className="font-bold leading-none text-[15px] sm:text-lg">PASKO <span className="text-[var(--green)]">CMD</span> <span className="mono text-xs text-[var(--muted)]">v1.0</span></p><p className="text-[11px] text-[var(--muted)] hidden sm:block">Pasko Photo Magic · Admin only</p></div></div>
          <div className="hidden md:flex items-center gap-2 ml-3"><span className="mono text-[11px] px-2.5 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)]"><span className="text-[var(--green)]">●</span> HITPAY: CONNECTED <span className="text-[var(--muted-2)]">(mock)</span></span><span className="mono text-[11px] px-2.5 py-1.5 rounded-full bg-[var(--amber-dim)] text-[var(--amber)] border border-[#4a3610]">MODE: MANUAL VERIFICATION</span></div>
          <div className="ml-auto flex items-center gap-2"><span className="hidden lg:flex items-center gap-1.5 text-xs text-[var(--muted)]"><Star className="w-3.5 h-3.5 text-[var(--amber)]"/> Maligayang Pasko</span><button onClick={()=>setShowDisengage(true)} className="bg-[var(--red)] text-white text-xs sm:text-sm font-bold px-3 sm:px-4 py-2.5 rounded-full flex items-center gap-1.5"><Power className="w-4 h-4"/> DISENGAGE CMD</button></div>
        </div>
        <div className="md:hidden px-3 pb-2 flex gap-2 overflow-x-auto"><span className="mono text-[10px] px-2 py-1 rounded-full border border-[var(--border)] whitespace-nowrap">● HITPAY: CONNECTED (mock)</span><span className="mono text-[10px] px-2 py-1 rounded-full bg-[var(--amber-dim)] text-[var(--amber)] whitespace-nowrap">MODE: MANUAL VERIFICATION</span></div>
      </header>

      <div className="max-w-[1440px] mx-auto flex items-start">
        {/* SIDEBAR */}
        <aside className="hidden lg:block w-[228px] shrink-0 sticky top-[64px] p-4">
          <p className="mono text-[11px] tracking-widest text-[var(--muted-2)] px-2 mb-2">CONSOLE</p>
          <nav className="space-y-1">{nav.map(n=>{const Icon=n.icon; const active=view===n.label; const count=n.label==='Queue'?pending:n.label==='Approved'?approved:n.label==='Rejected'?rejected:undefined; return <button key={n.label} onClick={()=>setView(n.label as any)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm ${active?'bg-[var(--green)] text-black font-bold':'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-white'}`}><Icon className="w-4 h-4"/>{n.label}{count!==undefined&&<span className={`ml-auto mono text-xs px-2 py-0.5 rounded-full ${active?'bg-black/15':'bg-[var(--surface-3)]'}`}>{count}</span>}</button>})}</nav>
          <div className="mt-6 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4"><p className="text-xs font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[var(--green)]"/> Manual = safe</p><p className="text-xs text-[var(--muted)] leading-relaxed mt-2">Nothing is released until you check it. Every approve, reject and re-upload is written to the audit log.</p><p className="mono text-[10px] text-[var(--muted-2)] mt-3">QUEUE: {orders.length} ORDERS</p></div>
          <p className="text-[11px] text-[var(--muted-2)] px-2 mt-5 leading-relaxed">Demo data only.<br/>Do not paste a live HitPay secret key here.</p>
        </aside>

        <main className="flex-1 min-w-0 px-3 sm:px-5 py-4 sm:py-6">
          {/* MOBILE NAV */}
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-3">{nav.map(n=><button key={n.label} onClick={()=>setView(n.label as any)} className={`whitespace-nowrap px-3.5 py-2 rounded-full text-sm border ${view===n.label?'bg-[var(--green)] text-black font-bold border-transparent':'border-[var(--border)] text-[var(--muted)]'}`}>{n.label}</button>)}</div>
          {backendError&&<div className="mb-4 bg-[var(--amber-dim)] border border-[#5a4210] text-[var(--amber)] text-sm rounded-xl px-4 py-3 flex gap-2"><CircleAlert className="w-4 h-4 shrink-0 mt-0.5"/>{backendError}</div>}
          {seedResult&&seedResult.saved>0&&<div className="mb-4 bg-[var(--green-dim)] border border-[var(--border)] text-sm rounded-xl px-4 py-3">Demo queue loaded — <b>{seedResult.saved} saved</b>{seedResult.remaining>0?`, ${seedResult.remaining} remaining`:''}.</div>}
          {approveFlash&&<div className="mb-4 bg-[var(--green-dim)] border border-[var(--green)]/40 rounded-2xl p-4 flex flex-wrap items-center gap-3 animate-pop"><CheckCircle2 className="w-6 h-6 text-[var(--green)]"/><div className="flex-1 min-w-[220px]"><p className="font-bold">Approved &amp; released ✓</p><p className="text-sm text-[var(--muted)]">Unlock code generated for the customer.</p></div><code className="mono bg-black/30 px-3 py-2 rounded-lg">{approveFlash}</code><button onClick={()=>copyText(approveFlash)} className="text-sm bg-white text-black px-3 py-2 rounded-full font-bold flex items-center gap-1"><Copy className="w-3.5 h-3.5"/>{copied===approveFlash?'Copied':'Copy'}</button><button onClick={()=>setApproveFlash('')} className="text-[var(--muted)]"><X className="w-4 h-4"/></button></div>}

          {(view==='Queue'||view==='Approved'||view==='Rejected')&&(<>
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mono text-[11px] tracking-[.22em] text-[var(--green)]">ENHANCED CMD WORKFLOW</p><h1 className="text-2xl sm:text-[34px] leading-tight font-bold mt-1">{view==='Queue'?'Verify before you release':view==='Approved'?'Approved & released':'Rejected orders'}</h1><p className="text-sm text-[var(--muted)] mt-1">Step 1 Intake → Step 2 Verify → Step 3 Decide → Step 4 Release → Step 5 Audit</p></div><div className="mono text-xs text-[var(--muted)]">TODAY · <span className="text-[var(--green)]">● LIVE QUEUE</span></div></div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-3 mt-5">
              {[{l:'Pending Verification',v:String(pending),s:'in queue',c:'text-[var(--amber)]'},{l:'Approved Today',v:String(approved),s:'released',c:'text-[var(--green)]'},{l:'Rejected',v:String(rejected),s:'stopped',c:'text-[var(--red)]'},{l:'Avg Verify Time',v:'18 min',s:'last 24h',c:'text-white'},{l:'HitPay Matched',v:`${matchedPct}%`,s:'of queue',c:'text-[var(--blue)]'}].map(x=><div key={x.l} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4"><p className="text-[11px] sm:text-xs text-[var(--muted)] leading-tight">{x.l}</p><p className={`text-2xl sm:text-[32px] font-bold leading-none mt-2 ${x.c}`}>{x.v}</p><p className="text-[11px] text-[var(--muted-2)] mt-1.5">{x.s}</p></div>)}
            </div>

            <div className="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 flex flex-col xl:flex-row gap-2.5">
              <label className="flex-1 flex items-center gap-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2.5"><Search className="w-4 h-4 text-[var(--muted)]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Order ID / Name / GCash ref…" className="bg-transparent flex-1 min-w-0 text-sm placeholder:text-[var(--muted-2)]"/></label>
              <div className="flex flex-wrap gap-2"><select value={pkg} onChange={e=>setPkg(e.target.value)} className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"><option>All</option><option>Basic</option><option>Music</option></select><select value={method} onChange={e=>setMethod(e.target.value)} className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"><option>All</option><option>GCash</option><option>Maya</option><option>Bank</option><option>HitPay</option></select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"><option value="All">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="reupload">Needs re-upload</option></select><button onClick={()=>{setSearch('');setPkg('All');setMethod('All');setStatusFilter('All');}} className="px-3 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--muted)]">Clear</button></div>
            </div>
            <p className="text-xs text-[var(--muted)] mt-3 flex items-center gap-1"><ListFilter className="w-3.5 h-3.5"/> Showing <b className="text-white">{visible.length}</b> order{visible.length===1?'':'s'} · Tap any order to verify</p>

            <div className="mt-3 space-y-2.5">{visible.map(o=>{const v=o.value; const badge=v.hitpay==='MATCHED'?'bg-[var(--green-dim)] text-[var(--green)] border-[var(--green)]/30':v.hitpay==='NO MATCH'?'bg-[var(--red-dim)] text-[var(--red)] border-red-900/40':v.hitpay==='PENDING'?'bg-[var(--amber-dim)] text-[var(--amber)] border-amber-900/40':'bg-white/5 text-[var(--muted)] border-[var(--border)]'; return (
              <button key={v.orderId} onClick={()=>openOrder(o)} className="w-full text-left bg-[var(--surface)] hover:border-[var(--green)]/50 border border-[var(--border)] rounded-2xl p-3 sm:p-4 transition flex flex-wrap gap-3 items-center">
                <div className="w-11 h-11 rounded-xl bg-[var(--surface-3)] grid place-items-center font-bold shrink-0">{v.photoLabel}</div>
                <div className="min-w-[170px] flex-1"><p className="mono text-sm font-bold">{v.orderId}</p><p className="text-sm font-semibold">{v.customer}</p><p className="text-xs text-[var(--muted)]">{v.submitted} · {v.ref}</p></div>
                <div className="text-left sm:text-right"><p className="text-sm font-bold">{v.packageName} · ₱{v.amount}</p><p className="text-xs text-[var(--muted)]">{v.method} · paid ₱{v.paidAmount}</p></div>
                <span className={`mono text-[11px] font-bold px-2.5 py-1 rounded-full border ${badge}`}>{v.hitpay}</span>
                <span className={`mono text-[11px] px-2.5 py-1 rounded-full ${v.status==='approved'?'bg-[var(--green)] text-black':v.status==='rejected'?'bg-[var(--red)] text-white':v.status==='reupload'?'bg-[var(--amber)] text-black':'bg-white/10 text-white'}`}>{v.status==='reupload'?'NEEDS RE-UPLOAD':v.status.toUpperCase()}</span>
                <span className="text-[var(--muted)] flex items-center gap-1 text-xs font-semibold">Review <ChevronRight className="w-4 h-4"/></span>
              </button>)})}
              {visible.length===0&&<div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl p-10 text-center"><p className="font-bold">No orders match this filter</p><p className="text-sm text-[var(--muted)] mt-1">Try a different search, package or payment method.</p></div>}
            </div>

            <div className="mt-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4"><p className="text-sm font-bold flex items-center gap-2"><Sparkles className="w-4 h-4 text-[var(--amber)]"/> What to check first</p><p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">Amount mismatch? Reused ref? Sender name different? Those three catch most bad proofs. When in doubt, ask for a re-upload instead of approving.</p></div>
          </>)}

          {view==='HitPay Sync'&&(<div>
            <p className="mono text-[11px] tracking-[.22em] text-[var(--green)]">STEP 2 · HITPAY SYNC</p><h1 className="text-2xl sm:text-[34px] font-bold mt-1">HitPay Sync</h1><p className="text-sm text-[var(--muted)] mt-1">Compare what the storefront collected against what HitPay actually settled.</p>
            <div className="mt-5 grid lg:grid-cols-3 gap-3"><div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4"><div className="flex flex-wrap gap-3 items-center justify-between"><div><p className="font-bold">Last sync</p><p className="text-sm text-[var(--muted)]">{settings.lastSync}</p></div><button onClick={syncHitPay} disabled={syncing} className="bg-[var(--green)] text-black font-bold px-4 py-2.5 rounded-full flex items-center gap-2 disabled:opacity-60"><RefreshCw className={`w-4 h-4 ${syncing?'animate-spin':''}`}/>{syncing?'Syncing…':'Sync with HitPay'}</button></div>
              <div className="mt-4 space-y-2">{HITPAY_TX.map(t=><div key={t.id} className="flex flex-wrap gap-2 items-center bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-3"><div className="flex-1 min-w-[180px]"><p className="mono text-sm font-bold">{t.id} · {t.ref}</p><p className="text-xs text-[var(--muted)]">{t.sender} · {t.method} · {t.time}</p></div><b>₱{t.amount}</b><span className={`mono text-[11px] px-2 py-1 rounded-full ${t.status==='SETTLED'?'bg-[var(--green-dim)] text-[var(--green)]':t.status==='FLAGGED'?'bg-[var(--red-dim)] text-[var(--red)]':'bg-[var(--amber-dim)] text-[var(--amber)]'}`}>{t.status}</span></div>)}</div></div>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4"><p className="font-bold flex items-center gap-2"><Link2 className="w-4 h-4 text-[var(--green)]"/> Manual link</p><p className="text-sm text-[var(--muted)] mt-1">HitPay didn’t auto-match? Link it yourself, then approve in one step.</p><label className="block text-xs text-[var(--muted)] mt-4">Order</label><select value={linkOrder} onChange={e=>setLinkOrder(e.target.value)} className="w-full mt-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"><option value="">Select order…</option>{orders.map(o=><option key={o.value.orderId} value={o.value.orderId}>{o.value.orderId} · {o.value.customer} · ₱{o.value.amount}</option>)}</select><label className="block text-xs text-[var(--muted)] mt-3">HitPay transaction</label><select value={linkTxn} onChange={e=>setLinkTxn(e.target.value)} className="w-full mt-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"><option value="">Select transaction…</option>{HITPAY_TX.map(t=><option key={t.id} value={t.id}>{t.id} · {t.ref} · ₱{t.amount}</option>)}</select><button onClick={linkAndApprove} className="w-full mt-4 bg-white text-black font-bold py-3 rounded-full">Link &amp; Approve</button>{actionMsg&&view==='HitPay Sync'&&<p className="text-sm mt-3 bg-[var(--green-dim)] border border-[var(--border)] rounded-xl px-3 py-2.5">{actionMsg}</p>}<p className="text-xs text-[var(--muted-2)] mt-3">Linking writes an audit entry with both IDs.</p></div></div>
          </div>)}

          {view==='Audit Log'&&(<div><p className="mono text-[11px] tracking-[.22em] text-[var(--green)]">STEP 5 · AUDIT</p><h1 className="text-2xl sm:text-[34px] font-bold mt-1">Audit Log</h1><p className="text-sm text-[var(--muted)] mt-1">Every action logged. Nothing is deleted from here.</p>
            <div className="mt-5 flex flex-wrap gap-2"><input value={auditSearch} onChange={e=>setAuditSearch(e.target.value)} placeholder="Search audit…" className="flex-1 min-w-[200px] bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"/><select value={auditFilter} onChange={e=>setAuditFilter(e.target.value)} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"><option>All</option><option>APPROVED</option><option>REJECTED</option><option>RE-UPLOAD</option><option>HITPAY</option><option>CMD</option></select></div>
            <div className="mt-3 space-y-2">{filteredAudit.map(a=><div key={a.recordId} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex gap-3"><div className="w-9 h-9 rounded-full bg-[var(--surface-3)] grid place-items-center shrink-0"><Activity className="w-4 h-4 text-[var(--green)]"/></div><div className="min-w-0"><p className="text-sm"><b>{a.value.action}</b> · <span className="mono">{a.value.orderId}</span> <span className="text-[var(--muted)]">· {a.value.actor}</span></p><p className="text-sm text-[var(--muted)] mt-0.5">{a.value.detail}</p><p className="mono text-[11px] text-[var(--muted-2)] mt-1">{a.value.at}</p></div></div>)}{filteredAudit.length===0&&<p className="text-[var(--muted)] text-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center">No audit entries match this filter.</p>}</div>
          </div>)}

          {view==='Settings'&&(<div className="max-w-3xl"><p className="mono text-[11px] tracking-[.22em] text-[var(--green)]">ADMIN · SETTINGS</p><h1 className="text-2xl sm:text-[34px] font-bold mt-1">Settings</h1>
            <div className="mt-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-5">
              <div><label className="text-sm font-bold flex items-center gap-2"><Lock className="w-4 h-4"/> HitPay API key <span className="mono text-[11px] font-normal text-[var(--amber)] bg-[var(--amber-dim)] px-2 py-0.5 rounded-full">TEST KEY ONLY</span></label><input type="password" value={settings.apiKey} onChange={e=>setSettings({...settings,apiKey:e.target.value})} placeholder="hp_test_••••••••" className="w-full mt-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-3 mono text-sm"/><p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">Paste a test key. Never commit a key, never send a live secret to anyone through this tool. This field is for your own test workspace only.</p></div>
              <div className="flex flex-wrap gap-3 items-center justify-between bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4"><div><p className="font-bold text-sm">Auto-approve</p><p className="text-xs text-[var(--muted)] mt-0.5">When ON, CMD is bypassed and HitPay approves automatically.</p></div><button onClick={()=>setSettings({...settings,autoApprove:!settings.autoApprove})} className={`w-12 h-7 rounded-full p-1 transition ${settings.autoApprove?'bg-[var(--green)] justify-end':'bg-[#2a362a]'} flex`} aria-label="Toggle auto-approve"><span className="w-5 h-5 bg-white rounded-full block"/></button></div>
              {settings.autoApprove&&<div className="bg-[var(--amber-dim)] border border-amber-900/50 text-[var(--amber)] text-sm rounded-xl px-4 py-3 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/> Warning: Auto-approve is ON. CMD manual verification is bypassed. Turn it OFF to require manual checks again.</div>}
              <div><label className="text-sm font-bold">Webhook URL</label><input value={settings.webhook} onChange={e=>setSettings({...settings,webhook:e.target.value})} className="w-full mt-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-3 mono text-sm"/></div>
              <button onClick={saveSettings} className="bg-[var(--green)] text-black font-bold px-5 py-3 rounded-full">Save settings</button>{showSettingsSaved&&<p className="text-sm text-[var(--green)]">{showSettingsSaved}</p>}
            </div>
            <div className="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5"><p className="font-bold flex items-center gap-2"><Power className="w-4 h-4 text-[var(--red)]"/> Disengage CMD</p><p className="text-sm text-[var(--muted)] leading-relaxed mt-2">To detach CMD: 1) Set the storefront to HitPay auto mode. 2) Turn off this page. 3) Or press DISENGAGE CMD in the top bar. The storefront keeps running on HitPay auto-approve only.</p><button onClick={()=>setShowDisengage(true)} className="mt-4 border border-[var(--red)] text-[var(--red)] font-bold px-4 py-2.5 rounded-full">Open disengage confirmation</button></div>
            <div className="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5"><p className="font-bold">How to connect to your Pasko page</p><ol className="text-sm text-[var(--muted)] leading-relaxed mt-2 space-y-2 list-decimal pl-5"><li><b className="text-white">Deploy this CMD as a separate page/app</b> — keep it apart from the customer storefront.</li><li><b className="text-white">Storefront posts orders</b> to a shared sheet, database, or HitPay webhook.</li><li><b className="text-white">CMD reads the queue</b> and you verify each order here.</li><li><b className="text-white">CMD approve webhook</b> calls the storefront to unlock generation and send the download link.</li></ol><div className="mt-4 grid sm:grid-cols-2 gap-2 text-xs"><div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3"><b>Packages</b><p className="text-[var(--muted)] mt-1">Basic ₱99 · Music ₱149</p></div><div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3"><b>Methods</b><p className="text-[var(--muted)] mt-1">GCash · Maya · Bank · HitPay</p></div></div></div>
          </div>)}
          <footer className="mt-10 pb-6 flex flex-wrap gap-2 justify-between text-xs text-[var(--muted-2)]"><span>PASKO CMD v1.0 · PASKO PHOTO MAGIC · MANUAL VERIFICATION</span><span className="flex items-center gap-1"><Banknote className="w-3.5 h-3.5"/> Demo data · No live money moves here</span></footer>
        </main>
      </div>

      {/* DETAIL DRAWER */}
      {selected&&(<div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={()=>setSelectedId(null)}><div className="min-h-full flex justify-end" onClick={e=>e.stopPropagation()}><div className="w-full sm:max-w-[620px] bg-[var(--surface)] border-l border-[var(--border)] p-4 sm:p-6 animate-pop my-0 sm:my-0 min-h-full">
        <div className="flex items-start justify-between gap-3"><div><p className="mono text-xs text-[var(--green)]">ORDER DETAIL</p><h2 className="mono text-xl sm:text-2xl font-bold mt-1">{selected.orderId}</h2><p className="text-sm text-[var(--muted)] mt-1">{selected.customer} · {selected.packageName} · ₱{selected.amount}</p></div><button onClick={()=>setSelectedId(null)} className="w-9 h-9 rounded-full bg-[var(--bg)] grid place-items-center"><X className="w-4 h-4"/></button></div>
        <div className="grid grid-cols-2 gap-3 mt-5"><div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3"><p className="text-[11px] text-[var(--muted)] flex items-center gap-1"><Receipt className="w-3.5 h-3.5"/> RECEIPT PREVIEW</p><div className="mt-3 aspect-[4/3] bg-[var(--surface-3)] rounded-xl relative overflow-hidden grid place-items-center"><div className="scan-line absolute left-2 right-2 h-[2px] bg-[var(--green)]/70"/><div className="text-center px-4"><Receipt className="w-8 h-8 mx-auto text-[var(--green)]"/><p className="mono text-xs mt-2">{selected.ref}</p><p className="text-xs text-[var(--muted)] mt-1">{selected.method} · ₱{selected.paidAmount} · {selected.time}</p><p className="text-[11px] text-[var(--muted-2)] mt-2">Receipt image placeholder —<br/>check sender, ref &amp; amount</p></div></div></div><div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3"><p className="text-[11px] text-[var(--muted)] flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5"/> CUSTOMER PHOTO</p><div className="mt-3 aspect-[4/3] bg-[var(--surface-3)] rounded-xl grid place-items-center"><div className="text-center"><div className="w-14 h-14 rounded-full bg-[var(--green)] text-black grid place-items-center font-bold text-lg mx-auto">{selected.photoLabel}</div><p className="text-xs mt-2">{selected.customer}</p><p className="text-[11px] text-[var(--muted-2)]">Photo thumbnail placeholder</p></div></div></div></div>
        <div className="mt-3 bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4"><p className="text-xs font-bold flex items-center gap-1.5"><User className="w-4 h-4"/> PAYMENT DETAILS</p><dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-3"><div><dt className="text-[11px] text-[var(--muted)]">Sender</dt><dd>{selected.sender}</dd></div><div><dt className="text-[11px] text-[var(--muted)]">Ref no.</dt><dd className="mono text-[13px]">{selected.ref}</dd></div><div><dt className="text-[11px] text-[var(--muted)]">Amount</dt><dd>₱{selected.paidAmount} <span className="text-[var(--muted)]">(order ₱{selected.amount})</span></dd></div><div><dt className="text-[11px] text-[var(--muted)]">Time</dt><dd>{selected.time} · {selected.submitted}</dd></div><div><dt className="text-[11px] text-[var(--muted)]">Method</dt><dd>{selected.method}</dd></div><div><dt className="text-[11px] text-[var(--muted)]">Status</dt><dd className="capitalize">{selected.status}</dd></div></dl><p className="text-sm text-[var(--muted)] mt-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5">{selected.note}</p>{selected.unlockCode&&<p className="mt-3 text-sm">Unlock code: <code className="mono bg-black/30 px-2 py-1 rounded">{selected.unlockCode}</code> <button onClick={()=>copyText(selected.unlockCode)} className="ml-1 text-xs font-bold underline">{copied===selected.unlockCode?'Copied':'Copy'}</button></p>}</div>
        <div className="mt-3 bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold flex items-center gap-2"><ScanLine className="w-4 h-4 text-[var(--green)]"/> HitPay lookup</p><button onClick={checkHitPay} disabled={hitpayChecking} className="bg-[var(--green)] text-black text-sm font-bold px-4 py-2 rounded-full disabled:opacity-60">{hitpayChecking?'Checking…':'Check HitPay'}</button></div><p className="text-xs text-[var(--muted)] mt-2">Current HitPay status: <b className="text-white">{selected.hitpay}</b></p>{hitpayResult&&<p className="text-sm mt-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5">{hitpayResult}</p>}</div>
        <div className="mt-3 bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-sm font-bold">Manual checklist</p><button onClick={()=>setChecks(Object.fromEntries(CHECKS.map(c=>[c,true])))} className="text-xs font-bold text-[var(--green)]">Mark all</button></div><div className="mt-3 space-y-2.5">{CHECKS.map(c=><label key={c} className="flex items-center gap-2.5 text-sm cursor-pointer"><input type="checkbox" className="checkbox" checked={!!checks[c]} onChange={e=>setChecks({...checks,[c]:e.target.checked})}/>{c}</label>)}</div><label className="flex items-center gap-2.5 text-sm mt-4"><input type="checkbox" className="checkbox" checked={useOverride} onChange={e=>setUseOverride(e.target.checked)}/> Admin override</label>{useOverride&&<input value={overrideReason} onChange={e=>setOverrideReason(e.target.value)} placeholder="Override reason — required" className="w-full mt-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"/>}<p className="text-xs text-[var(--muted)] mt-2">Approve is enabled when all checks pass, or when override is on with a reason.</p></div>
        <div className="mt-3 bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4"><p className="text-sm font-bold">Reject / Re-upload</p><div className="grid sm:grid-cols-2 gap-2 mt-3"><select value={rejectReason} onChange={e=>setRejectReason(e.target.value)} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"><option value="">Rejection reason…</option><option>No HitPay / bank match</option><option>Amount mismatch</option><option>Reused reference</option><option>Receipt unreadable</option><option>Sender name mismatch</option><option>Suspected fake receipt</option></select><input value={rejectNote} onChange={e=>setRejectNote(e.target.value)} placeholder="Note to customer (optional)" className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm"/></div></div>
        {actionMsg&&<p className="mt-3 text-sm bg-[var(--amber-dim)] text-[var(--amber)] rounded-xl px-3 py-2.5">{actionMsg}</p>}
        <div className="mt-4 grid gap-2 pb-6"><button onClick={doApprove} disabled={!(allChecked()||(useOverride&&overrideReason.trim()))||selected.status==='approved'} className="w-full bg-[var(--green)] text-black font-bold py-3.5 rounded-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4"/> Approve &amp; Release</button><div className="grid grid-cols-2 gap-2"><button onClick={doReupload} className="bg-[var(--amber)] text-black font-bold py-3 rounded-full flex items-center justify-center gap-1.5 text-sm"><Eye className="w-4 h-4"/> Request Re-upload</button><button onClick={doReject} className="bg-[var(--red)] text-white font-bold py-3 rounded-full text-sm">Reject</button></div><p className="text-[11px] text-center text-[var(--muted-2)]">Approving generates a download unlock code and writes an audit entry.</p></div>
      </div></div></div>)}

      {showDisengage&&(<div className="fixed inset-0 z-[60] bg-black/80 grid place-items-center p-4"><div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 animate-pop"><div className="w-12 h-12 rounded-full bg-[var(--red-dim)] grid place-items-center"><Power className="w-6 h-6 text-[var(--red)]"/></div><h2 className="text-xl font-bold mt-4">Detach CMD manual verification?</h2><p className="text-sm text-[var(--muted)] leading-relaxed mt-2">This will detach CMD manual verification. Storefront will rely on HitPay auto-approve only. Are you sure?</p><p className="text-sm mt-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2.5">You can re-engage CMD any time from the detached screen.</p><div className="grid grid-cols-2 gap-2 mt-5"><button onClick={()=>setShowDisengage(false)} className="py-3 rounded-full border border-[var(--border)] font-bold">Keep CMD on</button><button onClick={()=>setDisengaged(true)} className="py-3 rounded-full bg-[var(--red)] text-white font-bold">Yes, disengage</button></div></div></div>)}
    </div>
  );
}

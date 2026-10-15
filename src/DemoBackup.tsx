import { useRef, useState } from "react";
import { type Data, normalizePhone } from "./domain";
import { demoSave } from "./api";

function download(data: Data, label = "backup") {
  const url = URL.createObjectURL(new Blob([JSON.stringify({format: "ngf-demo-backup", version: 1, exportedAt: new Date().toISOString(), data}, null, 2)], {type: "application/json"}));
  const a = document.createElement("a"); a.href = url; a.download = `ngf-${label}-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function readBackup(text: string): Data {
  const file = JSON.parse(text);
  if (file.format !== "ngf-demo-backup" || file.version !== 1 || !file.data) throw Error("Choose an NGF backup file.");
  const d = file.data;
  const fields: Record<string, Record<string,string>> = {
    members: {id:'string',name:'string',phone:'string',email:'string',gender:'string',address:'string',height:'string',weight:'string',joined:'string',archived:'boolean',notes:'string'},
    plans: {id:'string',name:'string',months:'number',price:'number'},
    memberships: {id:'string',memberId:'string',planName:'string',start:'string',end:'string',amount:'number'},
    payments: {id:'string',membershipId:'string',memberId:'string',amount:'number',method:'string',reference:'string',at:'string',receipt:'string',voided:'boolean',voidReason:'string'},
    attendance: {id:'string',memberId:'string',day:'string',at:'string',override:'string'},
    reminders: {id:'string',memberId:'string',kind:'string',note:'string',at:'string'},
  };
  for(const [key, shape] of Object.entries(fields)) {
    if(!Array.isArray(d[key])) throw Error(`Invalid ${key} records.`);
    const ids = new Set();
    for(const row of d[key]) {
      if(!row || typeof row !== 'object' || Object.entries(shape).some(([f,t])=>typeof row[f]!==t) || !row.id || ids.has(row.id)) throw Error(`Invalid ${key} record.`);
      ids.add(row.id);
    }
  }
  if(!d.gym || ['name','phone','address'].some(k=>typeof d.gym[k]!=='string')) throw Error('Invalid gym details.');
  const memberIds = new Set(d.members.map((m: any)=>m.id));
  const memberships = new Map(d.memberships.map((m:any)=>[m.id,m]));
  for(const m of d.members) if(!m.name.trim() || !/^\d{10,15}$/.test(normalizePhone(m.phone)) || (m.photo && (typeof m.photo!=='string' || m.photo.length>100000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(m.photo)))) throw Error('Invalid member details or photo.');
  for(const key of ['memberships','payments','attendance','reminders']) for(const row of d[key]) if(!memberIds.has(row.memberId)) throw Error('Backup contains an unlinked member record.');
  for(const m of d.memberships) if(!Number.isSafeInteger(m.amount)||m.amount<0||!/^\d{4}-\d{2}-\d{2}$/.test(m.start)||!/^\d{4}-\d{2}-\d{2}$/.test(m.end)||m.end<m.start) throw Error('Invalid membership details.');
  for(const p of d.payments) if(!Number.isSafeInteger(p.amount)||p.amount<=0||(memberships.get(p.membershipId) as any)?.memberId!==p.memberId) throw Error('Invalid payment details.');
  if(d.audit && (!Array.isArray(d.audit) || d.audit.some((a:any)=>!a || typeof a.id!=='string'||typeof a.action!=='string'||typeof a.at!=='string'))) throw Error('Invalid audit records.');
  // Operational settings are local to each browser and are not transferred.
  return {gym:d.gym,members:d.members,plans:d.plans,memberships:d.memberships,payments:d.payments,attendance:d.attendance,reminders:d.reminders,audit:d.audit||[]} as Data;
}
export function DemoBackup({data,onRestore}:{data:Data;onRestore:(d:Data)=>void}) {
  const input=useRef<HTMLInputElement>(null);
  const [pending,setPending]=useState<Data|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
  return <section className="panel settings-card demo-backup">
    <h2>Demo backup & transfer</h2>
    <p>Download here, then import the file on your phone. Includes members, photos, memberships, payments and attendance.</p>
    <div className="backup-actions">
      <button className="secondary" onClick={()=>{download(data);setMessage('Backup downloaded. Keep it private; it contains member and payment details.');}}>Download backup</button>
      <button className="secondary" onClick={()=>input.current?.click()}>Import backup</button>
    </div>
    <input ref={input} className="backup-file-input" type="file" aria-label="Choose demo backup" accept=".json,application/json" onChange={async e=>{
      const file=e.target.files?.[0];setError('');setMessage('');setPending(null);
      try{if(!file)return;if(file.size>10*1024*1024)throw Error('Backup must be smaller than 10 MB.');setPending(readBackup(await file.text()));}catch(err){setError((err as Error).message);}finally{if(input.current)input.current.value='';}
    }}/>
    {pending&&<div className="context-note"><strong>{pending.members.length} members · {pending.memberships.length} memberships · {pending.payments.length} payments</strong>
      <p>Restore replaces this browser’s demo records. Your current records are saved locally as a recovery copy first.</p>
      <div className="backup-actions"><button className="primary" onClick={()=>{try{localStorage.setItem('ngf-demo-before-restore',JSON.stringify(data));const restored={...data,...pending};demoSave(restored);onRestore(restored);setPending(null);setMessage('Backup restored in this browser.');}catch(err){setError((err as Error).message);}}}>Restore backup</button><button className="secondary" onClick={()=>setPending(null)}>Cancel import</button></div>
    </div>}
    <button className="text-button" onClick={()=>{try{const old=localStorage.getItem('ngf-demo-before-restore');if(!old)throw Error('No recovery copy in this browser.');download(JSON.parse(old),'recovery');}catch(err){setError((err as Error).message);}}}>Download pre-restore recovery copy</button>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </section>;
}

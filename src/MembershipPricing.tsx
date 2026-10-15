import {useState} from 'react';
import {money, type Membership} from './domain';
export function discountTotal(base:number, kind:string, value:number) {
 const off=kind==='percent'?Math.round(base*value/100):Math.round(value*100);
 if(!Number.isSafeInteger(base)||base<0||!Number.isFinite(value)||value<0||!['fixed','percent'].includes(kind)||off>base||(kind==='percent'&&value>100)) throw Error('Discount must be between zero and the membership fee.');
 return {amount:base-off,discount:off};
}
export function MembershipPricing({base,onBase,initial}:{base:number;onBase:(n:number)=>void;initial?:Membership}){
 const [kind,setKind]=useState(initial?.discountType||'fixed'),[value,setValue]=useState(initial?.discountValue||0);
 let net=0,error='';try{net=discountTotal(Math.round(base*100),kind,value).amount;}catch(e){error=(e as Error).message;}
 return <><label>Fee (₹)<input type="number" name="baseAmount" required min="0" step="0.01" value={base} onChange={e=>onBase(Number(e.target.value))}/></label>
 <div className="form-grid"><label>Discount type<select name="discountType" value={kind} onChange={e=>setKind(e.target.value as 'fixed'|'percent')}><option value="fixed">Amount (₹)</option><option value="percent">Percentage (%)</option></select></label><label>Discount<input type="number" name="discountValue" min="0" max={kind==='percent'?100:base} step="0.01" required value={value} onChange={e=>setValue(Number(e.target.value))}/></label></div>
 <input type="hidden" name="amount" value={net/100}/>{error?<p className="error" role="alert">{error}</p>:<p className="context-note">Final fee <strong>{money(net)}</strong></p>}</>;
}
export function EditMembershipPricing({membership}:{membership:Membership}){const [base,setBase]=useState((membership.baseAmount??membership.amount)/100);return <MembershipPricing base={base} onBase={setBase} initial={membership}/>;}

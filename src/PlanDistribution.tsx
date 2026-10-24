import { type Data, today, frozen } from "./domain";
const COLORS = ["#d11e3d", "#547db1", "#25927c", "#ba893b", "#9273b1", "#64868f"];
export function PlanDistribution({data, open}: {data: Data; open: (name: string, ids: string[])=>void}) {
 const day = today();
 const groups = new Map<string, string[]>();
 for (const member of data.members.filter(m=>!m.archived)) {
   const membership = data.memberships.find(s=>s.memberId===member.id && !s.cancelled && s.start<=day && s.end>=day && !frozen(s,day));
   if (membership) groups.set(membership.planName,[...(groups.get(membership.planName)||[]),member.id]);
 }
 const entries = [...groups].sort((a,b)=>b[1].length-a[1].length);
 const total=entries.reduce((sum,[,ids])=>sum+ids.length,0);
 let offset=0;
 return <section className="panel plan-distribution">
   <div className="panel-header"><div><h2>Membership plans</h2><p>Current active members by plan</p></div></div>
   {total ? <div className="distribution-body">
     <div className="distribution-donut" role="img" aria-label={`${total} active members across ${entries.length} plans`}>
       <svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="62" fill="none" stroke="var(--line)" strokeWidth="21"/>{entries.map(([name,ids],i)=>{const percent=ids.length/total*100;const start=offset;offset+=percent;return <circle key={name} cx="80" cy="80" r="62" fill="none" stroke={COLORS[i%COLORS.length]} strokeWidth="21" pathLength="100" strokeDasharray={`${percent} ${100-percent}`} strokeDashoffset={-start} transform="rotate(-90 80 80)"/>;})}</svg>
       <div><strong>{total}</strong><span>Active members</span></div>
     </div>
     <div className="distribution-legend" role="group" aria-label="Active members per plan">{entries.map(([name,ids],i)=><button type="button" key={name} onClick={()=>open(name,ids)} aria-label={`View ${name} members`}><span className="distribution-dot" style={{background:COLORS[i%COLORS.length]}}/><span>{name}</span><strong>{ids.length}</strong><small>{Math.round(ids.length/total*100)}%</small></button>)}</div>
   </div> : <div className="empty"><p>No active memberships yet.</p></div>}
 </section>;
}

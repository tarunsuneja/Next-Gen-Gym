import { useState } from "react";
import { chartBuckets, type RangeKey } from "./analytics";
import { date, money } from "./domain";

type Bucket = ReturnType<typeof chartBuckets>["buckets"][number];
const compact=(paise:number)=>"₹"+new Intl.NumberFormat("en-IN",{notation:"compact",maximumFractionDigits:1}).format(paise/100);
export function CollectionChart({buckets,range,activeKey}:{buckets:Bucket[];range:RangeKey;activeKey:string}) {
 const [selected,setSelected]=useState<string|null>(null);
 const maximum=Math.max(100,...buckets.map(b=>b.total));
 const step=Math.pow(10,Math.floor(Math.log10(maximum/4)));
 const tick=Math.ceil(maximum/4/step)*step;
 const ceiling=tick*4;
 const label=(b:Bucket)=>range==="today" ? `${b.key.slice(1).padStart(2,"0")}:00` : new Date(b.key+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"});
 const current=buckets.find(b=>b.key===selected);
 return <div className="collections-chart">
  <div className="collections-plot">
   <div className="collections-axis" aria-hidden="true">{[4,3,2,1,0].map(n=><span key={n}>{compact(n*tick)}</span>)}</div>
   <div className="collections-scroll" role="region" aria-label="Collections over the selected range" tabIndex={0}>
    <div className="collections-bars" style={{minWidth:buckets.length>10 ? buckets.length*44 : undefined}}>
     <div className="collections-grid" aria-hidden="true">{[0,1,2,3,4].map(n=><i key={n}/>)}</div>
     {buckets.map(b=><div className="collections-column" key={b.key}>
      <button type="button" className={"collections-track"+(b.key===selected?" selected":"")} onClick={()=>setSelected(b.key)} aria-label={`${label(b)}: ${money(b.total)} collected`} aria-pressed={b.key===selected} title={`${label(b)}: ${money(b.total)}`}>
       <span className={"collections-bar"+(b.key===activeKey?" current":"")} style={{height:`${b.total/ceiling*100}%`}}/>
      </button>
      <span className="collections-date">{label(b)}</span>
     </div>)}
    </div>
   </div>
  </div>
  <p className="collections-detail" aria-live="polite">{current ? <><strong>{range==="today"?label(current):date(current.key)}</strong><span>{money(current.total)} collected</span></> : <span>Tap a bar for the exact amount.{buckets.length>10?" Swipe or scroll to see all dates.":""}</span>}</p>
 </div>;
}

import { useState } from "react";
import { createPortal } from "react-dom";
import { ModalView } from "./ModalView";
import { MemberAvatar } from "./MemberAvatar";
import {
  ArrowUpRight,
  Cake,
  MessageCircle,
  Users,
} from "lucide-react";
import { type Data, today, date, normalizePhone } from "./domain";
export function MemberHighlights({
  data,
  open,
  variant = "birthdays",
}: {
  variant?: "movement" | "birthdays";
  data: Data;
  open: (id: string) => void;
}) {
  const [movement, setMovement] = useState<"joined" | "left" | null>(null);
  const t = today(),
    month = t.slice(0, 7);
  const joined = data.members.filter((m) => m.joined.startsWith(month)).sort((a, b) => b.joined.localeCompare(a.joined));
  const left = data.members.filter(
    (m) => m.archived && m.leftOn?.startsWith(month),
  );
  const movementMembers = movement === "joined" ? joined : [...left].sort((a,b)=>(b.leftOn || "").localeCompare(a.leftOn || ""));
  const birthdays = data.members.filter(
    (m) => !m.archived && m.dob?.slice(5) === t.slice(5),
  );
  return (
    <section className={variant === "movement" ? "panel stat movement-metric" : "panel member-highlights birthday-highlights"} aria-label={variant === "movement" ? "Member movement this month" : "Member birthdays"}>
      {variant === "movement" ? <>
        <div className="movement-metric-heading"><span>Member movement</span><span className="stat-icon violet"><Users size={19}/></span></div>
        <div className="movement-metric-values">
          {(["joined", "left"] as const).map(kind=><div className={`movement-card ${kind}`} key={kind}>
            <button type="button" aria-haspopup="dialog" aria-label={kind === "joined" ? "View members joined this month" : "View members who left this month"} onClick={()=>setMovement(kind)}>
              <strong>{kind === "joined" ? joined.length : left.length}</strong>
              <span><i aria-hidden="true"/>{kind === "joined" ? "Joined" : "Left"}<ArrowUpRight size={12}/></span>
            </button>
          </div>)}
        </div>
        <small>This month · {new Date(t + "T12:00:00").toLocaleDateString("en-IN",{month:"short"})}</small>
      </> : <>
        <div className="birthday-card">
          <div className="birthday-heading">
            <span className="birthday-icon">
              <Cake size={21} />
            </span>
            <div>
              <h2>Birthdays today</h2>
              <small>A little wish goes a long way.</small>
            </div>
            <span className="birthday-count">{birthdays.length}</span>
          </div>
          <div className="record-scroll" role="region" aria-label="Birthday members" tabIndex={0}>
{birthdays.map((m) => (
            <div className="birthday-row" key={m.id}>
              <button className="birthday-member" onClick={() => open(m.id)}>
                <MemberAvatar name={m.name} photo={m.photo} className="birthday-avatar" />
                <span>
                  <strong>{m.name}</strong>
                  <small>{date(t)} · Birthday</small>
                </span>
              </button>
              <a
                className="small-button birthday-wish"
                target="_blank"
                rel="noopener noreferrer"
                href={`https://wa.me/${normalizePhone(m.phone).length === 10 ? "91" : ""}${normalizePhone(m.phone)}?text=${encodeURIComponent(`Happy Birthday, ${m.name}! Wishing you a wonderful year of health, strength and happiness. Best wishes from ${data.gym.name}!`)}`}
              >
                <MessageCircle size={15} />
                WhatsApp wishes
              </a>
            </div>
          ))}
</div>
          {!birthdays.length && (
            <div className="birthday-empty">
              <Cake size={25} />
              <span>No birthdays today</span>
            </div>
          )}
        </div>
      </>}
      {movement && createPortal(
        <ModalView title={movement === "joined" ? "Joined this month" : "Left this month"} close={()=>setMovement(null)}>
          <div className="movement-popup-heading"><span>{new Date(t + "T12:00:00").toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</span><span>{movementMembers.length} member{movementMembers.length===1?"":"s"}</span></div>
          <div className="movement-member-list movement-popup-list" role="region" aria-label={movement === "joined" ? "Members joined this month" : "Members who left this month"} tabIndex={0}>
            {movementMembers.map(m=><button type="button" className="small-button" key={m.id} onClick={()=>{setMovement(null);open(m.id);}}>
              <MemberAvatar name={m.name} photo={m.photo}/>
              <span className="movement-member-copy"><strong>{m.name}</strong><small>{m.phone} · {movement === "joined" ? `Joined ${date(m.joined)}` : `Left ${date(m.leftOn!)}`}</small></span>
              <ArrowUpRight size={16}/>
            </button>)}
            {!movementMembers.length && <p>{movement === "joined" ? "No new members this month." : "No departures recorded this month."}</p>}
          </div>
        </ModalView>, document.body)}
    </section>
  );
}

"use client";
import { useEffect, useRef } from "react";

interface DetailItem { label: string; value: string; }
interface Props {
  isOpen: boolean; onClose: () => void; onConfirm: () => void;
  title: string; description?: string; details?: DetailItem[];
  confirmLabel?: string; cancelLabel?: string;
  variant?: "warning"|"danger"|"success"; auditNote?: string; disableEscape?: boolean;
}

export default function AdminActionConfirmModal({
  isOpen, onClose, onConfirm, title="Admin Action Confirm Karein",
  description, details, confirmLabel="Confirm", cancelLabel="Cancel",
  variant="warning", auditNote="Ye action audit log me save hoga.", disableEscape=true,
}: Props) {
  const modalRef=useRef<HTMLDivElement>(null);
  const confirmRef=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    if(!isOpen)return;
    document.body.style.overflow="hidden";
    confirmRef.current?.focus();
    const h=(e:KeyboardEvent)=>{
      if(e.key==="Escape"&&!disableEscape)onClose();
      if(e.key==="Tab"){
        const m=modalRef.current; if(!m)return;
        const f=m.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if(!f.length)return;
        if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1]?.focus()}
        else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0]?.focus()}
      }
    };
    window.addEventListener("keydown",h);
    return ()=>{document.body.style.overflow="";window.removeEventListener("keydown",h)};
  },[isOpen,onClose,disableEscape]);

  if(!isOpen)return null;

  const vc:Record<string,{bg:string;icon:string}>={
    warning:{bg:"var(--color-warning)",icon:"⚠️"},
    danger:{bg:"var(--color-danger)",icon:"❗"},
    success:{bg:"var(--color-trust)",icon:"✅"},
  };
  const c=vc[variant];

  return (<>
    <div onClick={onClose} aria-hidden="true" style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.4)",zIndex:"var(--z-modal)"}}/>
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label={title}
      className="confirm-modal"
      /* calc() needs whitespace around `+` — `calc(var(--z-modal)+1)` is invalid,
         which silently dropped the dialog to z-index:auto and put the overlay on
         top of it, so every button click hit the overlay and just closed it. */
      style={{position:"fixed",zIndex:"calc(var(--z-modal) + 1)",backgroundColor:"var(--color-surface)",borderRadius:"var(--radius-lg)",boxShadow:"var(--shadow-lg)",maxWidth:"480px",width:"calc(100% - var(--space-8))",maxHeight:"90vh",overflowY:"auto",padding:"var(--space-6)"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:"var(--space-3)",marginBottom:"var(--space-4)"}}>
        <span style={{fontSize:"var(--text-xl)",flexShrink:0}}>{c.icon}</span>
        <div>
          <h3 style={{fontSize:"var(--text-lg)",fontWeight:"var(--font-semibold)",color:"var(--color-text)",margin:0,marginBottom:"var(--space-1)"}}>{title}</h3>
          {description&&<p style={{fontSize:"var(--text-sm)",color:"var(--color-text-muted)",margin:0,lineHeight:"var(--leading-normal)"}}>{description}</p>}
        </div>
      </div>
      {details&&details.length>0&&(
        <div style={{backgroundColor:"var(--color-bg-soft)",borderRadius:"var(--radius-md)",padding:"var(--space-3)",marginBottom:"var(--space-4)"}}>
          {details.map((d,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"var(--space-1) 0",fontSize:"var(--text-sm)"}}>
              <span style={{color:"var(--color-text-muted)"}}>{d.label}</span>
              <span style={{fontWeight:"var(--font-medium)",color:"var(--color-text)"}}>{d.value}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",gap:"var(--space-2)",padding:"var(--space-2) var(--space-3)",backgroundColor:"var(--color-info-soft)",borderRadius:"var(--radius-sm)",marginBottom:"var(--space-4)"}}>
        <span style={{fontSize:"var(--text-sm)",flexShrink:0}}>ℹ️</span>
        <p style={{fontSize:"var(--text-xs)",color:"var(--color-text-muted)",margin:0}}>{auditNote}</p>
      </div>
      <div style={{display:"flex",gap:"var(--space-3)",justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"var(--space-2) var(--space-5)",fontSize:"var(--text-sm)",fontWeight:"var(--font-medium)",backgroundColor:"transparent",color:"var(--color-text)",border:"1px solid var(--color-border)",borderRadius:"var(--radius-md)",cursor:"pointer",fontFamily:"var(--font-sans)",minHeight:"var(--touch-min)"}}>{cancelLabel}</button>
        <button ref={confirmRef} onClick={onConfirm} style={{padding:"var(--space-2) var(--space-5)",fontSize:"var(--text-sm)",fontWeight:"var(--font-medium)",backgroundColor:c.bg,color:"var(--color-text-inverse)",border:"none",borderRadius:"var(--radius-md)",cursor:"pointer",fontFamily:"var(--font-sans)",minHeight:"var(--touch-min)"}}>{confirmLabel}</button>
      </div>
    </div>
    <style jsx>{`.confirm-modal{top:50%;left:50%;transform:translate(-50%,-50%)}@media(max-width:767px){.confirm-modal{bottom:0;top:auto;left:0;transform:none;maxWidth:100%;width:100%;border-radius:var(--radius-lg) var(--radius-lg) 0 0}}`}</style>
  </>);
}
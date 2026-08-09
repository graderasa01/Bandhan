"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AIMessageBubble from "./AIMessageBubble";
import AIActionCard from "./AIActionCard";
import { useT } from "@/components/i18n/LanguageProvider";
import type { Translate } from "@/lib/i18n/translate";

interface Message { role: "ai" | "user"; text: string; }
interface QuickAction { id: string; title: string; description?: string; onClick?: () => void; }

interface AIDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  contextPage?: string;
  messages?: Message[];
  quickActions?: QuickAction[];
  onSend?: (text: string) => void;
  isThinking?: boolean;
}

function demoMessages(t: Translate): Message[] {
  return [
    { role: "ai", text: t("ai.drawer.demoMessage1", "Namaste! Main aapki profile complete karne me help kar sakta hu. Kya aap chahte hain ki main missing details identify karu?") },
    { role: "user", text: t("ai.drawer.demoMessage2", "Haan, meri missing details batao.") },
    { role: "ai", text: t("ai.drawer.demoMessage3", "Abhi aapki height, current city aur family details missing hain. Sabse pehle aapki height kya hai?") },
  ];
}

function demoActions(t: Translate): QuickAction[] {
  return [
    { id: "complete-profile", title: t("ai.drawer.demoAction1Title", "Complete My Profile"), description: t("ai.drawer.demoAction1Desc", "AI aapki missing details puchhega") },
    { id: "upload-biodata", title: t("ai.drawer.demoAction2Title", "Upload Biodata"), description: t("ai.drawer.demoAction2Desc", "Biodata se auto-fill") },
  ];
}

export default function AIDrawer({
  isOpen,
  onClose,
  contextPage: contextPageProp,
  messages: messagesProp,
  quickActions: quickActionsProp,
  onSend,
  isThinking = false,
}: AIDrawerProps) {
  const t = useT();
  const contextPage = contextPageProp ?? t("ai.drawer.defaultContextPage", "Dashboard");
  const messages = messagesProp ?? demoMessages(t);
  const quickActions = quickActionsProp ?? demoActions(t);
  const [inputValue, setInputValue] = useState("");
  const [localThinking, setLocalThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const [sheetOffset, setSheetOffset] = useState(0);

  useEffect(() => {
    if (isOpen) { document.body.style.overflow = "hidden"; }
    else { document.body.style.overflow = ""; setSheetOffset(0); }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, localThinking]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    if (onSend) { onSend(text); }
    else { setLocalThinking(true); setTimeout(() => setLocalThinking(false), 1500); }
    setInputValue("");
  }, [inputValue, onSend]);

  const handleTouchStart = (e: React.TouchEvent) => { startYRef.current = e.touches[0].clientY; };
  const handleTouchMove = (e: React.TouchEvent) => { const d = e.touches[0].clientY - startYRef.current; if (d > 0) setSheetOffset(d); };
  const handleTouchEnd = () => { if (sheetOffset > 120) onClose(); setSheetOffset(0); };

  if (!isOpen) return null;
  const thinking = isThinking || localThinking;

  return (<>
      <div aria-hidden="true" onClick={onClose} style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.3)",zIndex:"var(--z-drawer)"}}/>
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={t("ai.drawer.panelAriaLabel", "AI Assistant panel")}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        style={{position:"fixed",zIndex:"calc(var(--z-drawer)+1)",backgroundColor:"var(--color-surface)",display:"flex",flexDirection:"column",boxShadow:"var(--shadow-drawer)",transform:sheetOffset?`translateY(${sheetOffset}px)`:undefined,transition:sheetOffset?"none":"transform var(--transition-base)"}}
        className="ai-drawer">
        <div aria-hidden="true" className="drag-handle" style={{display:"none",justifyContent:"center",padding:"var(--space-2) 0"}}>
          <div style={{width:"40px",height:"4px",borderRadius:"var(--radius-full)",backgroundColor:"var(--color-border)"}}/>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"var(--space-3) var(--space-4)",borderBottom:"1px solid var(--color-border)",flexShrink:0}}>
          <div><h3 style={{fontSize:"var(--text-base)",fontWeight:"var(--font-semibold)",color:"var(--color-text)",margin:0}}>{t("ai.drawer.title", "AI Assistant")}</h3>
            <p style={{fontSize:"var(--text-xs)",color:"var(--color-text-muted)",margin:0}}>{t("ai.drawer.currentPagePrefix", "Current Page: ")}{contextPage}</p></div>
          <button onClick={onClose} aria-label={t("ai.drawer.closeAriaLabel", "Close AI drawer")} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-muted)",padding:"var(--space-1)",borderRadius:"var(--radius-sm)",display:"flex",minWidth:"var(--touch-min)",minHeight:"var(--touch-min)",alignItems:"center",justifyContent:"center"}}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div style={{padding:"var(--space-3) var(--space-4)",borderBottom:"1px solid var(--color-border)",flexShrink:0}}>
          <p style={{fontSize:"var(--text-xs)",fontWeight:"var(--font-medium)",color:"var(--color-text-muted)",marginBottom:"var(--space-2)"}}>{t("ai.drawer.suggestedActions", "Suggested Actions")}</p>
          <div style={{display:"flex",flexDirection:"column",gap:"var(--space-1)"}}>
            {quickActions.map(a=><AIActionCard key={a.id} title={a.title} description={a.description} onClick={a.onClick||(()=>{})}/>)}</div></div>
        <div style={{flex:1,overflowY:"auto",padding:"var(--space-3) var(--space-4)",display:"flex",flexDirection:"column",gap:"var(--space-3)"}}>
          {messages.map((m,i)=><AIMessageBubble key={i} role={m.role} text={m.text}/>)}
          {thinking&&<div style={{display:"flex",justifyContent:"flex-start"}}><div aria-label={t("ai.drawer.thinkingAriaLabel", "AI is thinking")} style={{backgroundColor:"var(--color-info-soft)",color:"var(--color-text-muted)",padding:"var(--space-3)",borderRadius:"var(--radius-md)",fontSize:"var(--text-sm)",display:"flex",alignItems:"center",gap:"var(--space-2)"}}>
            <span style={{display:"flex",gap:"4px"}}><span className="dot" style={{width:"6px",height:"6px",borderRadius:"var(--radius-full)",backgroundColor:"var(--color-text-muted)",animation:"dot-pulse 1.4s infinite",animationDelay:"0s"}}/><span className="dot" style={{width:"6px",height:"6px",borderRadius:"var(--radius-full)",backgroundColor:"var(--color-text-muted)",animation:"dot-pulse 1.4s infinite",animationDelay:"0.2s"}}/><span className="dot" style={{width:"6px",height:"6px",borderRadius:"var(--radius-full)",backgroundColor:"var(--color-text-muted)",animation:"dot-pulse 1.4s infinite",animationDelay:"0.4s"}}/></span>{t("ai.drawer.thinkingText", "AI soch raha hai...")}</div></div>}
          <div ref={messagesEndRef}/></div>
        <div style={{padding:"var(--space-3) var(--space-4)",borderTop:"1px solid var(--color-border)",flexShrink:0,backgroundColor:"var(--color-surface)"}}>
          <div style={{display:"flex",gap:"var(--space-2)"}}>
            <input type="text" value={inputValue} onChange={e=>setInputValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();handleSend()}}} placeholder={t("ai.drawer.inputPlaceholder", "Apna message likhein...")} disabled={thinking} aria-label={t("ai.drawer.inputAriaLabel", "AI chat input")}
              style={{flex:1,padding:"var(--space-2) var(--space-3)",fontSize:"var(--text-sm)",fontFamily:"var(--font-sans)",border:"1px solid var(--color-border)",borderRadius:"var(--radius-md)",outline:"none",backgroundColor:"var(--color-surface)",color:"var(--color-text)"}}
              onFocus={e=>{e.currentTarget.style.borderColor="var(--color-border-focus)";e.currentTarget.style.boxShadow="0 0 0 2px var(--color-primary-soft)"}}
              onBlur={e=>{e.currentTarget.style.borderColor="var(--color-border)";e.currentTarget.style.boxShadow="none"}}/>
            <button onClick={handleSend} disabled={thinking||!inputValue.trim()} aria-label={t("ai.drawer.sendAriaLabel", "Send message")}
              style={{padding:"var(--space-2) var(--space-4)",backgroundColor:thinking||!inputValue.trim()?"var(--color-bg-soft)":"var(--color-primary)",color:thinking||!inputValue.trim()?"var(--color-text-muted)":"var(--color-text-inverse)",border:"none",borderRadius:"var(--radius-md)",fontSize:"var(--text-sm)",fontWeight:"var(--font-medium)",cursor:thinking||!inputValue.trim()?"not-allowed":"pointer",minWidth:"var(--touch-min)",minHeight:"var(--touch-min)",display:"flex",alignItems:"center",justifyContent:"center"}}>{t("ai.drawer.send", "Send")}</button></div></div>
      </div>
      <style jsx>{`@keyframes dot-pulse{0%,80%,100%{opacity:0.3}40%{opacity:1}}.ai-drawer{right:0;top:0;width:100%;height:70vh;bottom:0;top:auto;border-radius:var(--radius-lg) var(--radius-lg) 0 0}@media(max-width:767px){.drag-handle{display:flex!important}.ai-drawer{width:100%;height:70vh;bottom:0;top:auto;border-radius:var(--radius-lg) var(--radius-lg) 0 0}}@media(min-width:768px){.ai-drawer{width:400px;height:100%;top:0;bottom:auto;border-radius:0;border-left:1px solid var(--color-border)}}`}</style>
    </>);}

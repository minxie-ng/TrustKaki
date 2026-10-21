"use client";

import { useEffect, useRef, useState } from "react";
import { authHeader } from "@/lib/auth/client";
import { voiceLanguageOptions, voiceLanguageSchema } from "@/lib/voiceLanguage";

interface Props { seniorId: string; authToken: string; onUnauthorized: () => void; }
export function VoiceLanguagePanel({seniorId,authToken,onUnauthorized}: Props) {
  const [language,setLanguage] = useState("");
  const [saved,setSaved] = useState("");
  const [loaded,setLoaded] = useState(false);
  const unauthorized = useRef(onUnauthorized);
  useEffect(()=>{unauthorized.current=onUnauthorized;},[onUnauthorized]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);
  const endpoint = `/api/admin/seniors/${encodeURIComponent(seniorId)}/voice-language`;
  useEffect(()=>{
    const controller = new AbortController();
    void (async()=>{
      try {
        const response=await fetch(endpoint,{headers:authHeader(authToken),signal:controller.signal});
        if(response.status===401){unauthorized.current();return;}
        if(!response.ok)throw new Error();
        const body=await response.json();const value=voiceLanguageSchema.parse(body.language)??"";
        if(!controller.signal.aborted){setLanguage(value);setSaved(value);setLoading(false);setLoaded(true);}
      }catch{if(!controller.signal.aborted){setError("Voice language could not be loaded. Reopen Care setup to try again.");setLoading(false);}}
    })();
    return ()=>controller.abort();
  },[endpoint,authToken]);
  async function save() {
    setBusy(true);setNotice(null);setError(null);
    try{
      const response=await fetch(endpoint,{method:"PUT",headers:{...authHeader(authToken),"content-type":"application/json"},body:JSON.stringify({language:language||null})});
      if(response.status===401){unauthorized.current();return;}
      if(!response.ok)throw new Error();
      const body=await response.json();const value=voiceLanguageSchema.parse(body.language)??"";
      setLanguage(value);setSaved(value);setNotice("Voice language saved. Applies to new voice notes.");
    }catch{setError("Voice language was not saved. Try again.");}
    finally{setBusy(false);}
  }
  return <section className="mb-6 rounded-xl border border-[var(--care-hairline)] bg-white p-4 sm:p-5" aria-labelledby="voice-language-heading">
    <h3 id="voice-language-heading" className="text-lg font-semibold text-gray-950">Voice language</h3>
    <p className="mt-2 text-base leading-6 text-gray-600">Choose the senior’s usual spoken language to help transcribe short voice notes. They still review every transcript before confirming.</p>
    <label className="mt-4 block text-sm font-semibold text-gray-800" htmlFor="voice-language-select">Preferred spoken language</label>
    <div className="mt-2 flex flex-wrap gap-3">
      <select id="voice-language-select" value={language} disabled={!loaded||loading||busy} onChange={e=>{setLanguage(e.target.value);setNotice(null);}} className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base">
        {voiceLanguageOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button type="button" disabled={!loaded||loading||busy||saved===language} onClick={()=>void save()} className="care-primary-button min-h-11 disabled:opacity-50">{busy?"Saving…":"Save language"}</button>
    </div>
    <p className="mt-2 text-sm leading-6 text-gray-600">Automatic detection supports language switching, but can misidentify short recordings.</p>
    {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="mt-3 text-sm text-emerald-800">{notice}</p>}
  </section>;
}

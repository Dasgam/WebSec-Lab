import React, { useMemo, useState } from 'react';
import { analyzeHttpUrl } from './api';
import {
  AlertTriangle, CheckCircle2, Clipboard, Cookie, Download, FileJson,
  FileSearch, Globe2, Info, Lock, Search, ShieldAlert, ShieldCheck,
  Trash2, XCircle, Zap, ChevronDown
} from 'lucide-react';

const HEADER_RULES = [
  { key:'strict-transport-security', name:'Strict-Transport-Security', group:'HTTPS', weight:14, desc:'Защищает от downgrade/SSL stripping после включения HSTS.', good:v=>/^max-age=\d{5,}/i.test(v) && !/max-age=0/i.test(v), warn:v=>/max-age=/i.test(v), rec:'Используйте HTTPS и HSTS с подходящим max-age. Для production можно рассмотреть includeSubDomains и preload после проверки совместимости.' },
  { key:'content-security-policy', name:'Content-Security-Policy', group:'XSS', weight:18, desc:'Ограничивает источники скриптов и других ресурсов.', good:v=>/script-src[^;]*\b(?!.*\bunsafe-inline\b)(?:'self'|nonce-|sha256-)/i.test(v) && !/\*\s*;/.test(v), warn:v=>/script-src/i.test(v), rec:'Определите script-src явно. Избегайте unsafe-inline и чрезмерно широких источников; для динамических скриптов используйте nonce/hash.' },
  { key:'x-content-type-options', name:'X-Content-Type-Options', group:'MIME sniffing', weight:8, desc:'Запрещает браузеру MIME sniffing.', good:v=>v.toLowerCase()==='nosniff', warn:()=>true, rec:'Установите X-Content-Type-Options: nosniff.' },
  { key:'x-frame-options', name:'X-Frame-Options', group:'Clickjacking', weight:9, desc:'Ограничивает встраивание страницы в frame/iframe.', good:v=>/^(deny|sameorigin)$/i.test(v.trim()), warn:v=>!!v, rec:'Используйте DENY или SAMEORIGIN. Современная альтернатива — frame-ancestors в CSP.' },
  { key:'referrer-policy', name:'Referrer-Policy', group:'Privacy', weight:7, desc:'Управляет объёмом данных, передаваемых в Referer.', good:v=>/^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/i.test(v.trim()), warn:()=>true, rec:'Предпочтительны no-referrer, strict-origin или strict-origin-when-cross-origin в зависимости от сценария.' },
  { key:'permissions-policy', name:'Permissions-Policy', group:'Browser features', weight:6, desc:'Ограничивает доступ страницы к чувствительным browser features.', good:v=>!!v.trim(), warn:()=>true, rec:'Явно отключите ненужные возможности, например camera, microphone, geolocation.' },
  { key:'cross-origin-opener-policy', name:'Cross-Origin-Opener-Policy', group:'Isolation', weight:6, desc:'Помогает изолировать browsing context от cross-origin окон.', good:v=>/^(same-origin|same-origin-allow-popups)$/i.test(v.trim()), warn:()=>true, rec:'Для приложений, которым нужна строгая изоляция, рассмотрите same-origin.' },
  { key:'cross-origin-resource-policy', name:'Cross-Origin-Resource-Policy', group:'Isolation', weight:5, desc:'Ограничивает загрузку ресурсов с других origin.', good:v=>/^(same-origin|same-site|cross-origin)$/i.test(v.trim()), warn:()=>true, rec:'Выберите CORP-политику в соответствии с тем, должны ли ресурсы быть доступны cross-origin.' },
];

const SAMPLE_RESPONSES = {
  weak: `HTTP/1.1 200 OK\nContent-Type: text/html; charset=UTF-8\nServer: nginx/1.24.0\nAccess-Control-Allow-Origin: *\nSet-Cookie: session=abc123; Path=/\nCache-Control: public, max-age=3600`,
  balanced: `HTTP/1.1 200 OK\nContent-Type: text/html; charset=UTF-8\nServer: nginx\nStrict-Transport-Security: max-age=31536000\nContent-Security-Policy: default-src 'self'; script-src 'self'\nX-Content-Type-Options: nosniff\nX-Frame-Options: SAMEORIGIN\nReferrer-Policy: strict-origin-when-cross-origin\nPermissions-Policy: camera=(), microphone=(), geolocation=()\nCross-Origin-Opener-Policy: same-origin\nSet-Cookie: session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax\nCache-Control: no-store`,
  strong: `HTTP/2 200 OK\nContent-Type: text/html; charset=UTF-8\nStrict-Transport-Security: max-age=31536000; includeSubDomains\nContent-Security-Policy: default-src 'self'; script-src 'self' 'nonce-demo'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'\nX-Content-Type-Options: nosniff\nX-Frame-Options: DENY\nReferrer-Policy: no-referrer\nPermissions-Policy: camera=(), microphone=(), geolocation=()\nCross-Origin-Opener-Policy: same-origin\nCross-Origin-Resource-Policy: same-origin\nSet-Cookie: session=abc123; Path=/; Secure; HttpOnly; SameSite=Strict\nCache-Control: no-store`
};

function parseResponse(raw) {
  const lines = raw.split(/\r?\n/);
  const statusLine = lines.find(line => /^HTTP\/\d(?:\.\d)?\s+\d{3}/i.test(line)) || '';
  const headers = {};
  const headerPairs = [];
  lines.forEach(line => {
    const index = line.indexOf(':');
    if (index <= 0) return;
    const key = line.slice(0,index).trim().toLowerCase();
    const value = line.slice(index+1).trim();
    headerPairs.push([key,value]);
    if (headers[key]) headers[key] = Array.isArray(headers[key]) ? [...headers[key], value] : [headers[key], value];
    else headers[key] = value;
  });
  const match = statusLine.match(/^HTTP\/([\d.]+)\s+(\d{3})(?:\s+(.*))?/i);
  const get = key => {
    const v=headers[key];
    return Array.isArray(v) ? v[0] : (v || '');
  };
  return { statusLine, protocol:match?.[1]||'—', status:match?.[2]||'—', reason:match?.[3]||'', headers, headerPairs, get };
}

function cookieList(parsed) {
  const values = parsed.headers['set-cookie'];
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return list.map((raw,index)=>{
    const parts=raw.split(';').map(x=>x.trim());
    const first=parts.shift()||'';
    const eq=first.indexOf('=');
    const attrs={};
    parts.forEach(p=>{const i=p.indexOf('='); const k=(i>0?p.slice(0,i):p).toLowerCase(); attrs[k]=i>0?p.slice(i+1):true;});
    return {id:index,name:eq>0?first.slice(0,eq):first,value:eq>0?first.slice(eq+1):'',raw,secure:!!attrs.secure,httpOnly:!!attrs.httponly,sameSite:String(attrs.samesite||'').toLowerCase(),path:attrs.path||''};
  });
}

function assess(parsed, targetUrl) {
  const findings=[];
  HEADER_RULES.forEach(rule=>{
    const value=parsed.get(rule.key);
    if(!value) findings.push({...rule,state:'bad',score:0,value:''});
    else if(rule.good(value)) findings.push({...rule,state:'good',score:rule.weight,value});
    else findings.push({...rule,state:'warn',score:Math.round(rule.weight*.55),value});
  });
  const cookies=cookieList(parsed);
  cookies.forEach(c=>{
    const missing=[];
    if(!c.secure) missing.push('Secure');
    if(!c.httpOnly) missing.push('HttpOnly');
    if(!c.sameSite) missing.push('SameSite');
    findings.push({key:`cookie-${c.id}`,name:`Cookie: ${c.name}`,group:'Cookies',weight:Math.min(5,2+missing.length),desc:'Защитные атрибуты cookie уменьшают риск кражи и нежелательной отправки сессии.',state:missing.length===0?'good':missing.length===1?'warn':'bad',score:missing.length===0?4:missing.length===1?2:0,value:missing.length?`Отсутствует: ${missing.join(', ')}`:'Secure · HttpOnly · SameSite'});
  });
  const cors=parsed.get('access-control-allow-origin');
  if(cors) findings.push({key:'cors',name:'CORS',group:'Cross-origin',weight:8,desc:'Определяет, какие origin могут читать ответы через браузер.',state:cors.trim()==='*'?'warn':'good',score:cors.trim()==='*'?4:8,value:cors});
  const server=parsed.get('server');
  if(server && /\d/.test(server)) findings.push({key:'server',name:'Server disclosure',group:'Information exposure',weight:3,desc:'Версия сервера может раскрывать лишнюю информацию о стеке.',state:'warn',score:1,value:server});
  const httpsKnown=/^https:/i.test(targetUrl.trim()) || /^http:/i.test(targetUrl.trim());
  if(httpsKnown && /^http:/i.test(targetUrl.trim())) findings.push({key:'transport',name:'HTTPS target',group:'HTTPS',weight:10,desc:'Целевой URL указан без HTTPS.',state:'bad',score:0,value:targetUrl});
  else if(httpsKnown) findings.push({key:'transport',name:'HTTPS target',group:'HTTPS',weight:10,desc:'Целевой URL указан через HTTPS.',state:'good',score:10,value:targetUrl});
  const knownWeight=findings.reduce((a,f)=>a+f.weight,0);
  const earned=findings.reduce((a,f)=>a+f.score,0);
  const score=knownWeight?Math.round(earned/knownWeight*100):0;
  return {findings,cookies,score,knownWeight};
}

function StateIcon({state}) { return state==='good'?<CheckCircle2 size={19}/>:state==='warn'?<AlertTriangle size={19}/>:<XCircle size={19}/>; }

function explain(f){
  if(f.key==='content-security-policy') return 'CSP работает как политика источников для браузера. Чем уже разрешённые источники, тем меньше поверхность для XSS и внедрения стороннего контента.';
  if(f.key==='strict-transport-security') return 'HSTS заставляет браузер использовать HTTPS для будущих обращений к origin. Важно сначала убедиться, что весь сайт действительно доступен по HTTPS.';
  if(f.key==='cors') return f.state==='warn'?'Звёздочка разрешает cross-origin чтение без ограничения конкретным origin. Это допустимо для публичных ресурсов, но опасно для чувствительных API в сочетании с другими настройками.':'Проверьте CORS вместе с credentials и конкретными origin — само наличие заголовка не означает уязвимость.';
  if(f.group==='Cookies') return 'Для сессионных cookie обычно важны Secure, HttpOnly и подходящий SameSite. Выбор зависит от архитектуры и сценария cross-site взаимодействия.';
  return f.desc;
}

export default function HttpAnalyzerApp(){
  const [raw,setRaw]=useState(SAMPLE_RESPONSES.balanced);
  const [targetUrl,setTargetUrl]=useState('https://demo.local/');
  const [activeTab,setActiveTab]=useState('overview');
  const [expanded,setExpanded]=useState(null);
  const [query,setQuery]=useState('');
  const [copied,setCopied]=useState(false);
  const [loading,setLoading]=useState(false);
  const [requestError,setRequestError]=useState('');
  const [requestMeta,setRequestMeta]=useState(null);
  const parsed=useMemo(()=>parseResponse(raw),[raw]);
  const hasHttpResponse=Boolean(parsed.statusLine);
  const analysis=useMemo(()=>hasHttpResponse?assess(parsed,targetUrl):{findings:[],cookies:[],score:null,knownWeight:0},[parsed,targetUrl,hasHttpResponse]);
  const allHeaders=parsed.headerPairs;
  const filteredHeaders=allHeaders.filter(([k,v])=>`${k} ${v}`.toLowerCase().includes(query.toLowerCase()));
  const scoreLabel=analysis.score===null?'Ожидание HTTP-ответа':analysis.score>=90?'Отличное покрытие':analysis.score>=75?'Хорошее покрытие':analysis.score>=55?'Есть риски':'Нужна доработка';
  const counts={good:analysis.findings.filter(f=>f.state==='good').length,warn:analysis.findings.filter(f=>f.state==='warn').length,bad:analysis.findings.filter(f=>f.state==='bad').length};
  const topFindings=[...analysis.findings].filter(f=>f.state!=='good').sort((a,b)=>b.weight-a.weight).slice(0,5);
  const csp=parsed.get('content-security-policy');
  const cors=parsed.get('access-control-allow-origin');

  const copy=async(text)=>{try{await navigator.clipboard?.writeText(text);}catch(_){} setCopied(true);setTimeout(()=>setCopied(false),1200);};
  const analyzeLive=async()=>{
    setRequestError('');
    setRequestMeta(null);
    setRaw('');
    setLoading(true);
    try {
      const data=await analyzeHttpUrl(targetUrl);
      setRaw(data.raw || '');
      setRequestMeta(data);
      setActiveTab('overview');
    } catch (error) {
      setRequestError(error.message || 'Не удалось получить HTTP-ответ.');
      setRequestMeta(null);
    } finally { setLoading(false); }
  };
  const exportJson=()=>{const payload={tool:'WebSec Lab HTTP Security Analyzer',target:targetUrl,score:analysis.score,status:parsed.status,protocol:parsed.protocol,findings:analysis.findings,headers:Object.fromEntries(allHeaders),cookies:analysis.cookies}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='webseclab-http-report.json';a.click();URL.revokeObjectURL(a.href);};
  const exportHtml=()=>{const rows=analysis.findings.map(f=>`<tr><td>${f.name}</td><td>${f.state}</td><td>${String(f.value).replaceAll('<','&lt;')}</td><td>${f.desc}</td></tr>`).join('');const html=`<!doctype html><html><head><meta charset="utf-8"><title>WebSec Lab HTTP Report</title><style>body{font:14px Arial;color:#17252b;padding:32px}h1{margin-bottom:4px}.score{font-size:32px;font-weight:700}table{border-collapse:collapse;width:100%;margin-top:24px}td,th{border:1px solid #ccd6da;padding:8px;text-align:left}th{background:#edf3f5}</style></head><body><h1>WebSec Lab — HTTP Security Report</h1><p>${targetUrl}</p><div class="score">${analysis.score}/100</div><p>${scoreLabel} · ${counts.good} passed · ${counts.warn} warnings · ${counts.bad} critical</p><table><tr><th>Check</th><th>State</th><th>Value</th><th>Explanation</th></tr>${rows}</table></body></html>`;const blob=new Blob([html],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='webseclab-http-report.html';a.click();URL.revokeObjectURL(a.href);};

  return <div className="http-analyzer">
    <div className="http-head">
      <div><div className="path">TOOLS / HTTP / SECURITY ANALYZER v2</div><h1>HTTP Security Analyzer</h1><p>Безопасно получает HTTP-ответ в отдельном Docker sandbox и разбирает security headers, cookies, CSP, CORS и признаки лишнего раскрытия информации.</p></div>
      <div className={`http-score score-${analysis.score>=85?'good':analysis.score>=60?'medium':'low'}`}><ShieldCheck size={28}/><strong>{analysis.score===null?'—':`${analysis.score}/100`}</strong><span>{scoreLabel}</span></div>
    </div>

    <section className="http-target-card"><div className="http-target-row"><Globe2 size={18}/><input value={targetUrl} onChange={e=>setTargetUrl(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') analyzeLive();}} placeholder="https://example.com/"/><button className="btn-primary" onClick={analyzeLive} disabled={loading}>{loading?'Получаем ответ…':'Анализировать URL'}</button></div>{requestError&&<div className="http-live-error">{requestError}</div>}{requestMeta&&<div className="http-live-meta">Получено: <b>{requestMeta.status} {requestMeta.reason}</b> · {requestMeta.elapsed_ms} ms · итоговый URL: <span>{requestMeta.final_url}</span>{requestMeta.redirects?.length?` · редиректов: ${requestMeta.redirects.length}`: ""}</div>}<div className="http-samples"><span>Примеры:</span><button onClick={()=>setRaw(SAMPLE_RESPONSES.weak)}>Weak</button><button onClick={()=>setRaw(SAMPLE_RESPONSES.balanced)}>Balanced</button><button onClick={()=>setRaw(SAMPLE_RESPONSES.strong)}>Strong</button></div></section>

    <section className="http-input-card"><div className="http-section-title"><FileSearch size={18}/> HTTP RESPONSE <span>сюда также можно вставить raw-ответ вручную или посмотреть ответ URL</span></div><textarea value={raw} onChange={e=>setRaw(e.target.value)} spellCheck="false" aria-label="HTTP response"/><div className="http-actions"><button className="btn-secondary" onClick={()=>setRaw('')}><Trash2 size={15}/> Очистить</button><button className="btn-secondary" onClick={()=>copy(raw)}><Clipboard size={15}/> {copied?'Скопировано':'Копировать'}</button><button className="btn-secondary" onClick={exportJson}><FileJson size={15}/> JSON</button><button className="btn-secondary" onClick={exportHtml}><Download size={15}/> HTML-отчёт</button><button className="btn-primary" onClick={()=>setRaw(v=>v)}><Zap size={15}/> Пересчитать анализ</button></div></section>

    <section className="http-overview"><div className="http-stat"><span>HTTP-статус</span><strong>{hasHttpResponse?`${parsed.status} ${parsed.reason}`:'—'}</strong></div><div className="http-stat"><span>Протокол</span><strong>{hasHttpResponse?`HTTP/${parsed.protocol}`:'—'}</strong></div><div className="http-stat"><span>Заголовков</span><strong>{allHeaders.length}</strong></div><div className="http-stat"><span>Cookies</span><strong>{analysis.cookies.length}</strong></div><div className="http-stat"><span>Проверок</span><strong><b className="metric-good">{counts.good}</b> / <b className="metric-warn">{counts.warn}</b> / <b className="metric-bad">{counts.bad}</b></strong></div></section>

    <div className="http-tabs"><button className={activeTab==='overview'?'active':''} onClick={()=>setActiveTab('overview')}>Обзор</button><button className={activeTab==='headers'?'active':''} onClick={()=>setActiveTab('headers')}>Headers</button><button className={activeTab==='cookies'?'active':''} onClick={()=>setActiveTab('cookies')}>Cookies</button><button className={activeTab==='csp'?'active':''} onClick={()=>setActiveTab('csp')}>CSP / CORS</button><button className={activeTab==='raw'?'active':''} onClick={()=>setActiveTab('raw')}>Raw HTTP</button></div>

    {activeTab==='overview' && <div className="http-results-grid"><section className="http-results"><div className="http-section-title"><ShieldAlert size={18}/> SECURITY FINDINGS <span>{analysis.findings.length}</span></div>{analysis.findings.map(f=><div className={`header-result state-${f.state}`} key={f.key} onClick={()=>setExpanded(expanded===f.key?null:f.key)}><div className="header-icon"><StateIcon state={f.state}/></div><div className="header-main"><strong>{f.name}</strong><span>{f.value||'Не найдено'}</span><small>{f.group} · вес {f.weight}</small>{expanded===f.key&&<div className="finding-detail"><p>{explain(f)}</p><b>Рекомендация:</b><p>{f.rec}</p></div>}</div><em>{f.state==='good'?'PASS':f.state==='warn'?'WARNING':'MISSING'}</em><ChevronDown size={15} className={expanded===f.key?'rotated':''}/></div>)}</section><aside className="http-recommendations"><div className="http-section-title"><Info size={18}/> ЧТО ИСПРАВИТЬ СНАЧАЛА</div>{topFindings.length?topFindings.map(f=><div className={`recommendation risk-${f.state}`} key={f.key}><strong>{f.name}</strong><span>{f.state==='bad'?'критично':'внимание'}</span><p>{f.rec}</p></div>):<div className="http-empty"><CheckCircle2 size={26}/><strong>Критичных замечаний нет</strong><span>Проверьте значения политик и контекст приложения.</span></div>}<div className="http-learn"><Lock size={17}/><div><strong>Учебная подсказка</strong><span>Наличие заголовка само по себе не гарантирует безопасность. Важны его значение, контекст приложения и настройки браузера.</span></div></div></aside></div>}

    {activeTab==='headers' && <section className="http-results"><div className="http-section-title"><Search size={18}/> HEADER INSPECTOR <span>{filteredHeaders.length}</span></div><div className="http-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по имени или значению..."/></div>{filteredHeaders.map(([key,value],i)=><div className="all-header-row" key={`${key}-${i}`}><strong>{key}</strong><span>{value}</span></div>)}</section>}

    {activeTab==='cookies' && <section className="http-results"><div className="http-section-title"><Cookie size={18}/> COOKIE SECURITY <span>{analysis.cookies.length}</span></div>{analysis.cookies.length?analysis.cookies.map(c=><div className="cookie-card" key={c.id}><div className="cookie-title"><strong>{c.name}</strong><span>{c.sameSite?`SameSite=${c.sameSite}`:'SameSite missing'}</span></div><div className="cookie-flags"><b className={c.secure?'yes':'no'}>{c.secure?'✓':'✕'} Secure</b><b className={c.httpOnly?'yes':'no'}>{c.httpOnly?'✓':'✕'} HttpOnly</b><b className={c.sameSite?'yes':'no'}>{c.sameSite?'✓':'✕'} SameSite</b><b>Path={c.path||'/'}</b></div><code>{c.raw}</code></div>):<div className="http-empty"><Cookie size={26}/><strong>Set-Cookie не найден</strong><span>Добавьте Set-Cookie в HTTP-ответ для анализа атрибутов.</span></div>}</section>}

    {activeTab==='csp' && <div className="special-grid"><section className="http-results"><div className="http-section-title"><ShieldCheck size={18}/> CSP INSPECTOR</div><div className="policy-box"><strong>Content-Security-Policy</strong><code>{csp||'Не найден'}</code>{csp&&<div className="policy-flags"><span className={/unsafe-inline/i.test(csp)?'flag-bad':'flag-good'}>{/unsafe-inline/i.test(csp)?'⚠ unsafe-inline':'✓ no unsafe-inline'}</span><span className={/object-src\s+'none'/i.test(csp)?'flag-good':'flag-warn'}>{/object-src\s+'none'/i.test(csp)?'✓ object-src none':'⚠ object-src not restricted'}</span><span className={/frame-ancestors/i.test(csp)?'flag-good':'flag-warn'}>{/frame-ancestors/i.test(csp)?'✓ frame-ancestors':'⚠ frame-ancestors not set'}</span></div>}</div></section><section className="http-results"><div className="http-section-title"><Globe2 size={18}/> CORS INSPECTOR</div><div className="policy-box"><strong>Access-Control-Allow-Origin</strong><code>{cors||'Не найден'}</code>{cors&&<p>{cors.trim()==='*'?'⚠ Wildcard origin: проверьте, действительно ли ресурс публичный.':'✓ Конкретный origin указан. Дополнительно проверьте credentials и Vary: Origin.'}</p>}</div></section></div>}

    {activeTab==='raw' && <section className="http-results"><div className="http-section-title"><FileSearch size={18}/> RAW HTTP RESPONSE</div><pre className="raw-http">{raw||'Пусто'}</pre></section>}
    <div className="http-note"><strong>Учебный режим.</strong> URL запрашивается внутри отдельного Docker sandbox-контейнера с ограничениями CPU/RAM и SSRF-фильтрацией. HTML и JavaScript целевого сайта не исполняются. Полученные заголовки анализируются локально во frontend. Не вводите URL с секретами в query string.</div>
  </div>;
}

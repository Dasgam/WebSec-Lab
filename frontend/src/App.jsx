import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, fetchLabs, fetchLab, fetchProgress, completeLabApi, healthApi, startLabRuntimeApi, runtimeStatusApi, stopLabRuntimeApi, loginApi, registerApi, meApi, logoutApi, updateProfileApi, changePasswordApi } from "./api";
import {
  Activity, BookOpen, Check, ChevronRight, Clock3, Code2,
  Folder, Globe, Home as HomeIcon, LockKeyhole, Maximize2, Minus,
  MoreHorizontal, Network, Power, RotateCcw, Search, Settings,
  Shield, User, X, Zap
} from "lucide-react";
import HttpAnalyzerApp from "./httpAnalyzer";

const LABS = [
  {
    id: "xss-reflected",
    title: "Reflected XSS",
    type: "XSS",
    difficulty: "Легкий",
    time: 15,
    status: "available",
    description: "Исследуйте отражение пользовательского ввода и найдите небезопасную обработку данных.",
    objective: "Найдите место, где пользовательский ввод возвращается в HTML без безопасного экранирования.",
    color: "green"
  },
  {
    id: "xss-stored",
    title: "Stored XSS",
    type: "XSS",
    difficulty: "Средний",
    time: 20,
    status: "available",
    description: "Изучите сохранение пользовательского ввода и влияние данных на других пользователей.",
    objective: "Определите точку сохранения данных и найдите небезопасный вывод.",
    color: "green"
  },
  {
    id: "csrf",
    title: "CSRF",
    type: "CSRF",
    difficulty: "Средний",
    time: 25,
    status: "available",
    description: "Разберитесь, как отсутствие защиты запроса позволяет выполнить действие от имени пользователя.",
    objective: "Определите действие, которое можно выполнить без корректной проверки источника запроса.",
    color: "cyan"
  },
  {
    id: "sqli",
    title: "SQL Injection",
    type: "SQL Injection",
    difficulty: "Сложный",
    time: 35,
    status: "available",
    description: "Исследуйте небезопасное формирование SQL-запроса из пользовательского ввода.",
    objective: "Найдите параметр, который напрямую влияет на структуру SQL-запроса.",
    color: "purple"
  }
];

const DESKTOP_APPS = [
  { id: "labs", label: "Лаборатории", icon: Folder },
  { id: "http", label: "HTTP-анализ", icon: Network },
  { id: "settings", label: "Настройки", icon: Settings }
];

function Window({ title, icon: Icon, children, onClose, onMinimize, onMaximize, maximized, zIndex, onFocus }) {
  const [position, setPosition] = useState({ x: 150, y: 82 });
  const [size, setSize] = useState({ width: 920, height: 610 });
  const [lastNormal, setLastNormal] = useState(null);
  const drag = useRef(null);
  const resize = useRef(null);

  const clampToWorkspace = (x, y, width, height, workspace) => ({
    x: Math.max(8, Math.min(x, Math.max(8, workspace.clientWidth - width - 8))),
    y: Math.max(8, Math.min(y, Math.max(8, workspace.clientHeight - height - 8)))
  });

  const beginDrag = (e) => {
    if (maximized || e.target.closest("button")) return;
    const workspace = e.currentTarget.closest(".workspace");
    if (!workspace) return;
    onFocus();
    drag.current = { offsetX: e.clientX - position.x, offsetY: e.clientY - position.y };
    const move = (event) => {
      const next = clampToWorkspace(
        event.clientX - drag.current.offsetX,
        event.clientY - drag.current.offsetY,
        size.width,
        size.height,
        workspace
      );
      setPosition(next);
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const toggleMaximize = () => {
    if (!maximized) {
      setLastNormal({ position, size });
    } else if (lastNormal) {
      setPosition(lastNormal.position);
      setSize(lastNormal.size);
    }
    onMaximize();
  };

  const beginResize = (e, direction) => {
    if (maximized) return;
    e.preventDefault();
    e.stopPropagation();
    const workspace = e.currentTarget.closest(".workspace");
    if (!workspace) return;
    onFocus();
    resize.current = { direction, startX: e.clientX, startY: e.clientY, position, size };

    const move = (event) => {
      const r = resize.current;
      const dx = event.clientX - r.startX;
      const dy = event.clientY - r.startY;
      const minW = 560;
      const minH = 360;
      let x = r.position.x;
      let y = r.position.y;
      let width = r.size.width;
      let height = r.size.height;

      if (direction.includes("e")) width = Math.max(minW, Math.min(r.size.width + dx, workspace.clientWidth - x - 8));
      if (direction.includes("s")) height = Math.max(minH, Math.min(r.size.height + dy, workspace.clientHeight - y - 8));
      if (direction.includes("w")) {
        const maxDx = r.size.width - minW;
        const actualDx = Math.min(dx, maxDx);
        x = Math.max(8, Math.min(r.position.x + actualDx, r.position.x + r.size.width - minW));
        width = r.size.width - (x - r.position.x);
      }
      if (direction.includes("n")) {
        const maxDy = r.size.height - minH;
        const actualDy = Math.min(dy, maxDy);
        y = Math.max(8, Math.min(r.position.y + actualDy, r.position.y + r.size.height - minH));
        height = r.size.height - (y - r.position.y);
      }
      setPosition({ x, y });
      setSize({ width, height });
    };
    const up = () => {
      resize.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handleTitleDoubleClick = (e) => {
    if (e.target.closest("button")) return;
    toggleMaximize();
  };

  const style = maximized
    ? { zIndex, left: 8, top: 8, width: "calc(100% - 16px)", height: "calc(100% - 16px)" }
    : { zIndex, left: position.x, top: position.y, width: size.width, height: size.height };

  return (
    <section className={`app-window ${maximized ? "maximized" : ""}`} style={style} onPointerDown={onFocus}>
      {!maximized && <>
        <span className="resize-handle n" onPointerDown={(e) => beginResize(e, "n")} />
        <span className="resize-handle e" onPointerDown={(e) => beginResize(e, "e")} />
        <span className="resize-handle s" onPointerDown={(e) => beginResize(e, "s")} />
        <span className="resize-handle w" onPointerDown={(e) => beginResize(e, "w")} />
        <span className="resize-handle ne" onPointerDown={(e) => beginResize(e, "ne")} />
        <span className="resize-handle se" onPointerDown={(e) => beginResize(e, "se")} />
        <span className="resize-handle sw" onPointerDown={(e) => beginResize(e, "sw")} />
        <span className="resize-handle nw" onPointerDown={(e) => beginResize(e, "nw")} />
      </>}
      <header className="window-bar" onPointerDown={beginDrag} onDoubleClick={handleTitleDoubleClick}>
        <div className="window-app">
          <div className="traffic"><i/><i/><i/></div>
          <Icon size={14} />
          <span>{title}</span>
        </div>
        <div className="window-controls">
          <button onClick={onMinimize} aria-label="Свернуть"><Minus size={14}/></button>
          <button onClick={toggleMaximize} aria-label={maximized ? "Восстановить" : "Развернуть"}><Maximize2 size={13}/></button>
          <button className="close" onClick={onClose} aria-label="Закрыть"><X size={14}/></button>
        </div>
      </header>
      <div className="window-content">{children}</div>
    </section>
  );
}

function AuthWindow({ mode = "login", onSuccess, onClose }) {
  const [register, setRegister] = useState(mode === "register");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = register
        ? await registerApi(username, email, password)
        : await loginApi(username, password);
      localStorage.setItem("webseclab_token", data.token);
      localStorage.setItem("webseclab_user", JSON.stringify(data.user));
      onSuccess(data.user);
    } catch (err) {
      setError(err.message || "Не удалось выполнить операцию.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <button className="auth-close" onClick={onClose} aria-label="Закрыть">×</button>
        <div className="auth-logo"><Shield size={30}/><span>WebSec <b>Lab</b></span></div>
        <span className="course-kicker">{register ? "CREATE ACCOUNT" : "STUDENT LOGIN"}</span>
        <h1>{register ? "Создать аккаунт" : "Войти в WebSec Lab"}</h1>
        <p>{register ? "Аккаунт нужен для сохранения прогресса и XP." : "Войдите, чтобы продолжить обучение и сохранить результаты."}</p>
        <form onSubmit={submit}>
          <label>ЛОГИН<input autoFocus value={username} onChange={e => setUsername(e.target.value)} placeholder="student" required /></label>
          {register && <label>EMAIL<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="student@example.com" /></label>}
          <label>ПАРОЛЬ<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6}/></label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn-primary auth-submit" disabled={loading}>{loading ? "Подождите..." : register ? "Создать аккаунт" : "Войти"}</button>
        </form>
        <button className="auth-switch" onClick={() => { setRegister(v => !v); setError(""); }}>
          {register ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
        </button>
      </div>
    </div>
  );
}

function BrowserApp({ lab }) {
  const [runtimeUrl, setRuntimeUrl] = useState("");
  const [browserUrl, setBrowserUrl] = useState("");
  const [address, setAddress] = useState("");
  const [runtimeState, setRuntimeState] = useState("stopped");
  const [loading, setLoading] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const frameRef = React.useRef(null);

  const browserOrigin = `${API_BASE}/runtime/${lab?.id || ""}/browser/`;
  const makeProxyUrl = target => `${browserOrigin}?url=${encodeURIComponent(target)}&token=${encodeURIComponent(localStorage.getItem("webseclab_token") || "")}`;

  useEffect(() => {
    const onBrowserMessage = event => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      if (event.data?.type !== "webseclab-browser-url") return;
      const target = String(event.data.url || "").trim();
      if (!target || !/^https?:\/\//i.test(target)) return;
      setAddress(target);
      setHistory(current => {
        const currentItem = current[historyIndex];
        if (currentItem?.target === target) return current;
        const next = current.slice(0, historyIndex + 1);
        next.push({ target, proxyTarget: makeProxyUrl(target) });
        setHistoryIndex(next.length - 1);
        return next;
      });
    };
    window.addEventListener("message", onBrowserMessage);
    return () => window.removeEventListener("message", onBrowserMessage);
  }, [historyIndex, lab?.id]);

  const navigate = (value, { replace = false } = {}) => {
    let target = String(value || "").trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) {
      target = target.startsWith("/") ? target : `/${target}`;
      if (runtimeUrl) {
        try {
          target = new URL(target, runtimeUrl).toString();
        } catch (_) {}
      }
    }

    // The actual lab page is loaded through a same-origin Django proxy.
    // This makes the embedded Browser's own back/forward/reload controls reliable,
    // while the lab itself remains in its isolated Docker container.
    const proxyTarget = target.startsWith(browserOrigin)
      ? target
      : makeProxyUrl(target);

    if (replace && historyIndex >= 0) {
      setHistory(h => h.map((item, i) => i === historyIndex ? { target, proxyTarget } : item));
    } else {
      const next = history.slice(0, historyIndex + 1);
      next.push({ target, proxyTarget });
      setHistory(next);
      setHistoryIndex(next.length - 1);
    }
    setBrowserUrl(proxyTarget);
    setAddress(target);
    setFrameKey(k => k + 1);
  };

  const start = async () => {
    if (!lab?.id) return;
    if (!localStorage.getItem("webseclab_token")) {
      setRuntimeState("error");
      setAddress("");
      return;
    }
    setLoading(true);
    try {
      const result = await startLabRuntimeApi(lab.id);
      setRuntimeUrl(result.url || "");
      setRuntimeState(result.status || "running");
      if (result.url) {
        const next = [{ target: result.url, proxyTarget: makeProxyUrl(result.url) }];
        setHistory(next);
        setHistoryIndex(0);
        setAddress(result.url);
        setBrowserUrl(next[0].proxyTarget);
        setFrameKey(k => k + 1);
      }
    } catch (err) {
      setRuntimeState("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!lab?.id || !localStorage.getItem("webseclab_token")) return;
    runtimeStatusApi(lab.id).then(result => {
      if (result.status === "running" && result.url) {
        setRuntimeUrl(result.url);
        setRuntimeState("running");
        const item = { target: result.url, proxyTarget: makeProxyUrl(result.url) };
        setHistory([item]);
        setHistoryIndex(0);
        setAddress(result.url);
        setBrowserUrl(item.proxyTarget);
      }
    }).catch(() => {});
  }, [lab?.id]);

  const back = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const item = history[nextIndex];
    setHistoryIndex(nextIndex);
    setAddress(item.target);
    setBrowserUrl(item.proxyTarget);
    setFrameKey(k => k + 1);
  };

  const forward = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const item = history[nextIndex];
    setHistoryIndex(nextIndex);
    setAddress(item.target);
    setBrowserUrl(item.proxyTarget);
    setFrameKey(k => k + 1);
  };

  const reload = () => setFrameKey(k => k + 1);

  const submitAddress = e => {
    e?.preventDefault();
    if (address.trim()) navigate(address);
  };

  if (runtimeUrl) {
    return <div className="browser-view runtime-browser">
      <form className="browser-toolbar" onSubmit={submitAddress}>
        <button type="button" onClick={back} disabled={historyIndex <= 0} title="Назад">←</button>
        <button type="button" onClick={forward} disabled={historyIndex >= history.length - 1} title="Вперёд">→</button>
        <button type="button" onClick={reload} title="Обновить">↻</button>
        <div className="address address-editable">
          <LockKeyhole size={12}/>
          <input value={address} onChange={e => setAddress(e.target.value)} onFocus={e => e.target.select()} aria-label="Адрес учебной страницы" />
        </div>
        <button className="address-go" type="submit">Перейти</button>
        <span className="runtime-pill">● isolated</span>
      </form>
      <iframe
        key={frameKey}
        ref={frameRef}
        title={`Учебное приложение ${lab.title}`}
        src={browserUrl}
        className="runtime-frame"
        sandbox="allow-forms allow-scripts allow-modals"
      />
    </div>;
  }

  return (
    <div className="browser-view">
      <div className="browser-toolbar">
        <button type="button" disabled>←</button><button type="button" disabled>→</button><button type="button" onClick={start}>↻</button>
        <div className="address"><LockKeyhole size={12}/> lab://{lab?.id || "demo"}</div>
        <MoreHorizontal size={16}/>
      </div>
      <div className="browser-page">
        <div className="browser-brand"><Shield size={25}/> <span>LAB APPLICATION</span></div>
        <div className="fake-login">
          <div className="fake-badge">DOCKER TRAINING ENVIRONMENT</div>
          <h2>{lab?.title || "Web Security Demo"}</h2>
          <p>{runtimeState === "error" ? "Не удалось запустить учебное окружение." : "Учебное окружение не запущено."}</p>
          <div className="runtime-status"><span className={`runtime-dot ${runtimeState}`}></span><strong>{runtimeState === "error" ? "Ошибка" : runtimeState === "starting" ? "Запускается" : "Не запущено"}</strong><small>контейнер: 0.5 CPU · 256 MB · localhost-only</small></div>
          <button onClick={start} disabled={loading}>{loading ? "Запускаем..." : "Запустить лабораторию"}</button>
        </div>
      </div>
    </div>
  );
}

const THEORY_CODE = {
  "xss-reflected": [
    { lang: "HTML / уязвимый вывод", code: `<div>Результат поиска: ${'{'}userInput{'}'}</div>` },
    { lang: "Python / безопаснее", code: `from html import escape\nsafe = escape(user_input)\nhtml = f"<div>{'{'}safe{'}'}</div>"` },
  ],
  "xss-stored": [
    { lang: "Python / сохранение", code: `conn.execute(\"INSERT INTO comments(body) VALUES (?)\", (body,))` },
    { lang: "HTML / опасный вывод", code: `<article><div>${'{'}body{'}'}</div></article>` },
    { lang: "Python / безопасный вывод", code: `from html import escape\nhtml_body = escape(body)` },
  ],
  "csrf": [
    { lang: "HTTP / изменяющий состояние запрос", code: `POST /account/email\nCookie: session=...\n\nemail=student@example.local` },
    { lang: "HTML / защита формы", code: `<input type="hidden" name="csrf_token" value="...">` },
  ],
  "sqli": [
    { lang: "SQL / небезопасная граница", code: `SELECT id, name, price\nFROM products\nWHERE id = '${'{'}user_input{'}'}'` },
    { lang: "Python / параметризованный запрос", code: `cursor.execute(\n    "SELECT id, name, price FROM products WHERE id = ?",\n    (user_input,)\n)` },
  ],
};

function renderTheory(theory, labId) {
  const blocks = [];
  const parts = (theory || "").split(/\n\s*\n/);
  parts.forEach((part, index) => {
    const match = part.match(/^```([^\n]*)\n([\s\S]*?)```$/);
    if (match) {
      blocks.push(<div className="theory-code" key={`code-${index}`}><div className="theory-code-head"><Code2 size={13}/><span>{match[1] || "Пример кода"}</span></div><pre><code>{match[2]}</code></pre></div>);
    } else if (part.trim()) {
      blocks.push(<p key={`p-${index}`}>{part}</p>);
    }
  });
  const snippets = THEORY_CODE[labId] || [];
  return <>
    <div className="theory-reading">{blocks}</div>
    {snippets.length > 0 && <div className="theory-examples">
      <div className="theory-examples-title"><Code2 size={14}/> Код, который стоит разобрать</div>
      {snippets.map((item, index) => <div className="theory-code" key={`snippet-${index}`}><div className="theory-code-head"><Code2 size={13}/><span>{item.lang}</span></div><pre><code>{item.code}</code></pre></div>)}
    </div>}
  </>;
}

function LabWindow({ lab, onClose, onComplete, completed = false, settings }) {
  const [step, setStep] = useState(0);
  const [hint, setHint] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState("error");
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [finished, setFinished] = useState(completed);

  const steps = [
    { title: "Теория", icon: BookOpen },
    { title: "Практика", icon: Globe },
    { title: "Результат", icon: Check }
  ];
  const theory = lab.theory || "Теория для этой лаборатории пока не заполнена.";
  const hints = settings?.showHints === false ? [] : (Array.isArray(lab.hints) ? lab.hints : []);

  useEffect(() => () => {
    if (lab?.id && localStorage.getItem("webseclab_token")) stopLabRuntimeApi(lab.id).catch(() => {});
  }, [lab?.id]);

  useEffect(() => {
    if (step !== 1 || !lab?.id || !localStorage.getItem('webseclab_token')) return;
    let alive = true;
    const poll = async () => {
      try { const result = await runtimeStatusApi(lab.id); if (alive && result.verified) setVerified(true); } catch {}
    };
    poll();
    const timer = setInterval(poll, 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [step, lab?.id]);

  const checkPractice = async () => {
    if (checking || !lab?.id) return;
    setChecking(true);
    setFeedbackType('info');
    setFeedback('Проверяем выполнение в Docker…');
    try {
      const result = await runtimeStatusApi(lab.id);
      if (result.verified) {
        setVerified(true);
        setFeedbackType('success');
        setFeedback('✓ Практическое действие подтверждено. Теперь можно завершить лабораторию.');
      } else {
        setVerified(false);
        setFeedbackType('warning');
        setFeedback('Пока не найдено подтверждение. Выполните действие в Browser и нажмите «Проверить выполнение» ещё раз.');
      }
    } catch (err) {
      setFeedbackType('error');
      setFeedback(err.message || 'Не удалось проверить лабораторию.');
    } finally {
      setChecking(false);
    }
  };

  const complete = async () => {
    if (completing) return;
    if (settings?.confirmComplete && !window.confirm("Завершить лабораторию и сохранить её как выполненную?")) return;
    if (!verified) { setFeedbackType('warning'); setFeedback('Лаборатория ещё не подтверждена. Выполните практическое действие в Browser — просто открыть страницу недостаточно.'); return; }
    if (!localStorage.getItem('webseclab_token')) { setFeedbackType('error'); setFeedback('Войдите в аккаунт, чтобы сохранить результат лаборатории.'); return; }
    setCompleting(true); setFeedback(''); setFeedbackType('info');
    try { await onComplete?.(lab.id); setFinished(true); setStep(2); }
    catch (err) { setFeedbackType('error'); setFeedback(err.message || 'Не удалось сохранить результат.'); }
    finally { setCompleting(false); }
  };

  const reset = () => {
    setHint(0);
    setCompleting(false);
    setChecking(false);
    setFeedback("");
    setFeedbackType('error');
    setVerified(false);
    setStep(0);
  };

  return (
    <div className="lab-layout lab-course">
      <aside className="lab-sidebar">
        <div className="lab-code">LAB-{lab.id.toUpperCase()}</div>
        <h2>{lab.title}</h2>
        <div className="lab-meta"><span>{lab.type}</span><span>{lab.difficulty}</span><span><Clock3 size={12}/> {lab.time} мин</span></div>
        <div className="course-steps">
          {steps.map((item, i) => { const Icon = item.icon; const disabled = i === 2 && !finished; return <button key={item.title} disabled={disabled} className={`${step === i ? "current" : step > i ? "done" : ""} ${disabled ? "locked" : ""}`} onClick={() => !disabled && setStep(i)}><span>{step > i ? <Check size={12}/> : <Icon size={12}/>}</span>{item.title}</button>; })}
        </div>
        <div className="lab-section">
          <label>ЦЕЛЬ</label><p>{lab.objective}</p>
        </div>
        <div className="lab-section">
          <label>ПОДСКАЗКИ</label>
          {hints.map((text, index) => { const n = index + 1; return <button key={n} className={`hint-row ${hint >= n ? "open" : ""}`} onClick={() => setHint(Math.max(hint, n))}>
            {hint >= n ? <Zap size={13}/> : <LockKeyhole size={13}/>} Подсказка {n}
            {hint >= n && <small>{text}</small>}
          </button>; })}
        </div>
        <div className="lab-actions">
          {step === 1 && <button className="btn-primary" onClick={complete} disabled={completing || !verified}><Check size={15}/> {completing ? "Сохраняем..." : verified ? "Завершить лабораторию" : "Сначала выполнить практику"}</button>}
          <button className="btn-secondary" onClick={reset}><RotateCcw size={14}/> К теории</button>
        </div>
      </aside>

      <div className="lab-workspace">
        <div className="course-header">
          <div><span className="path">~/WebSec-Lab/Labs/{lab.id}</span><strong>{steps[step].title}</strong></div>
          <span>{step + 1} / {steps.length}</span>
        </div>
        {step === 0 && <div className="course-page"><span className="course-kicker">THEORY</span><h1>Основы: {lab.title}</h1>{renderTheory(theory, lab.id)}<div className="theory-card"><Shield size={20}/><div><strong>Работа только в учебной среде</strong><span>Лаборатория имитирует уязвимое приложение. Изучите теорию, затем исследуйте приложение самостоятельно.</span></div></div><button className="btn-primary next-btn" onClick={() => setStep(1)}>Запустить практику <ChevronRight size={15}/></button></div>}
        {step === 1 && <div className="practice-screen"><div className="split-head"><span><Globe size={13}/> Browser</span><small>Изолированное учебное приложение</small></div><div className="lab-split"><BrowserApp lab={lab}/></div>{feedback && <div className={`checker-feedback checker-${feedbackType}`}>{feedback}</div>}<div className="practice-footer"><span className={verified ? 'verified-text' : ''}>{verified ? '✓ Практическое действие подтверждено' : 'Выполните практическое действие внутри Browser'}</span><div className="practice-actions"><button className="btn-secondary" onClick={() => setStep(0)}>К теории</button><button className="btn-secondary" onClick={checkPractice} disabled={checking}>{checking ? 'Проверяем…' : 'Проверить выполнение'} <Shield size={14}/></button><button className="btn-primary" onClick={complete} disabled={completing || !verified}>{completing ? "Сохраняем..." : verified ? "Завершить лабораторию" : "Сначала выполнить практику"} <Check size={14}/></button></div></div></div>}
        {step === 2 && <div className="course-page result-page"><div className="result-icon"><Check size={30}/></div><span className="course-kicker">LAB COMPLETE</span><h1>Лаборатория завершена</h1><p>Практика завершена. Результат сохранён в вашем прогрессе.</p><div className="result-stats"><div><strong>+{lab.xp || 0} XP</strong><span>Награда</span></div><div><strong>{lab.time} мин</strong><span>Оценочное время</span></div><div><strong>100%</strong><span>Прогресс</span></div></div><button className="btn-primary next-btn" onClick={onClose}>Вернуться к лабораториям</button></div>}
      </div>
    </div>
  );
}

function LabsApp({ onOpenLab, labs = LABS, completedLabs = [], progressDetails = [] }) {
  const [filter, setFilter] = useState("Все");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => labs.filter(lab => {
    const matchesFilter = filter === "Все" || lab.type === filter;
    const matchesSearch = lab.title.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  }), [filter, search]);

  return (
    <div className="labs-app">
      <header className="content-header">
        <div>
          <span className="path">~/WebSec-Lab/Labs</span>
          <h1>Лаборатории</h1>
          <p>Выберите учебное окружение и запустите практическое задание.</p>
        </div>
        <div className="lab-count"><strong>{labs.length}</strong><span>лаборатории MVP</span></div>
      </header>

      <div className="lab-progress-banner">
        <div className="lab-progress-copy"><strong>{completedLabs.length} / {labs.length}</strong><span>лабораторий завершено</span></div>
        <div className="lab-progress-track"><i style={{ width: `${labs.length ? Math.round((completedLabs.length / labs.length) * 100) : 0}%` }}/></div>
        <span className="lab-progress-percent">{labs.length ? Math.round((completedLabs.length / labs.length) * 100) : 0}%</span>
      </div>

      <div className="lab-toolbar">
        <div className="search-box"><Search size={15}/><input placeholder="Поиск лаборатории..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="filters">
          {["Все", "XSS", "CSRF", "SQL Injection"].map(item => (
            <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
      </div>

      <div className="labs-list">
        {filtered.map(lab => (
          <button className={`lab-card ${completedLabs.includes(lab.id) ? "completed" : ""}`} key={lab.id} onClick={() => onOpenLab(lab)}>
            <div className={`lab-symbol ${lab.color}`}><Shield size={22}/></div>
            <div className="lab-info">
              <div className="lab-title-row"><strong>{lab.title}</strong>{completedLabs.includes(lab.id) ? <span className="completed-badge"><Check size={11}/> Выполнено</span> : <span className="available"><i/> Доступна</span>}</div>
              <div className="lab-tags"><span>{lab.type}</span><span>{lab.difficulty}</span><span><Clock3 size={11}/> {lab.time} мин</span></div>
              <p>{lab.description}</p>{completedLabs.includes(lab.id) && (() => { const info = progressDetails.find(item => item.lab_id === lab.id); return <small className="lab-completed-date">{info?.completed_at ? `Завершено: ${new Date(info.completed_at).toLocaleDateString("ru-RU")}` : "Результат сохранён"}{info?.attempts ? ` · попыток: ${info.attempts}` : ""}{info?.xp_earned ? ` · +${info.xp_earned} XP` : ""}</small>; })()}
            </div>
            <ChevronRight className="card-arrow" size={19}/>
          </button>
        ))}
      </div>
    </div>
  );
}

function AppMenu({ openApp, onClose }) {
  const [query, setQuery] = useState("");
  const apps = DESKTOP_APPS.filter(app => app.label.toLowerCase().includes(query.toLowerCase()));
  return <div className="app-menu" onClick={onClose}>
    <div className="app-menu-brand"><Shield size={17}/><strong>WebSec Lab</strong><span>OS</span></div>
    <div className="app-menu-search"><Search size={14}/><input autoFocus placeholder="Поиск приложений..." value={query} onChange={e => setQuery(e.target.value)} onClick={e=>e.stopPropagation()}/></div>
    <div className="app-menu-label">ПРИЛОЖЕНИЯ</div>
    {apps.length ? apps.map(({id,label,icon:Icon}) => <button key={id} className="menu-app" onClick={(e)=>{e.stopPropagation();openApp(id);onClose();}}><span><Icon size={17}/></span><div><strong>{label}</strong><small>WebSec Lab application</small></div><ChevronRight size={13}/></button>) : <div className="app-menu-empty">Ничего не найдено</div>}
  </div>;
}

function HomeScreen({ openApp }) {
  return (
    <div className="home-center">
      <div className="shield-large"><Shield size={72}/></div>
      <div className="home-title">WebSec <b>Lab</b></div>
      <p>Виртуальный учебный компьютер<br/>для практического изучения веб-безопасности</p>
      <div className="home-actions">
        <button className="btn-primary home-btn" onClick={() => openApp("labs")}>Открыть лаборатории <ChevronRight size={17}/></button>
        <button className="btn-secondary home-tool-btn" onClick={() => openApp("http")}><Network size={16}/> HTTP-анализатор</button>
      </div>
    </div>
  );
}

function SettingsApp({ settings, setSettings, user, onUserUpdate }) {
  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));
  const [profileName, setProfileName] = useState(user?.username || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profileStatus, setProfileStatus] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    setProfileName(user?.username || '');
    setProfileEmail(user?.email || '');
  }, [user?.username, user?.email]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!user) return;
    setProfileStatus(''); setProfileError(''); setProfileSaving(true);
    try {
      const nextUser = await updateProfileApi(profileName.trim(), profileEmail.trim());
      localStorage.setItem('webseclab_user', JSON.stringify(nextUser));
      onUserUpdate?.(nextUser);
      setProfileStatus('Профиль сохранён.');
    } catch (err) {
      setProfileError(err.message || 'Не удалось сохранить профиль.');
    } finally { setProfileSaving(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPasswordStatus(''); setPasswordError('');
    if (newPassword.length < 8) { setPasswordError('Новый пароль должен содержать минимум 8 символов.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Новые пароли не совпадают.'); return; }
    setPasswordSaving(true);
    try {
      const result = await changePasswordApi(currentPassword, newPassword, confirmPassword);
      localStorage.setItem('webseclab_token', result.token);
      localStorage.setItem('webseclab_user', JSON.stringify(result.user));
      onUserUpdate?.(result.user);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPasswordStatus('Пароль изменён. Сессия продолжена с новым токеном.');
    } catch (err) {
      setPasswordError(err.message || 'Не удалось изменить пароль.');
    } finally { setPasswordSaving(false); }
  };

  return (
    <div className="settings-view">
      <div className="content-header">
        <div><span className="path">~/WebSec-Lab/Settings</span><h1>Настройки</h1><p>Параметры рабочего окружения и профиля пользователя.</p></div>
      </div>
      <div className="settings-grid">
        <section className="settings-card settings-profile-card">
          <div className="settings-card-head"><User size={17}/><div><strong>Профиль</strong><span>Данные аккаунта WebSec Lab</span></div></div>
          {user ? <form onSubmit={saveProfile}>
            <label>ЛОГИН<input value={profileName} onChange={e=>setProfileName(e.target.value)} minLength={3} required /></label>
            <label>EMAIL<input type="email" value={profileEmail} onChange={e=>setProfileEmail(e.target.value)} placeholder="student@example.com" /></label>
            {profileError && <div className="profile-form-error">{profileError}</div>}
            {profileStatus && <div className="profile-form-success">✓ {profileStatus}</div>}
            <button className="btn-primary" type="submit" disabled={profileSaving}>{profileSaving ? 'Сохраняем...' : 'Сохранить профиль'}</button>
          </form> : <div className="settings-info"><User size={15}/><span>Войдите в аккаунт через аватар справа сверху, чтобы изменить данные профиля.</span></div>}
        </section>
        <section className="settings-card settings-password-card">
          <div className="settings-card-head"><LockKeyhole size={17}/><div><strong>Пароль</strong><span>Изменение пароля аккаунта</span></div></div>
          {user ? <form onSubmit={changePassword}>
            <label>ТЕКУЩИЙ ПАРОЛЬ<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password" required /></label>
            <label>НОВЫЙ ПАРОЛЬ<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
            <div className="password-hint">Минимум 8 символов. Новый пароль должен отличаться от текущего.</div>
            <label>ПОВТОРИТЕ НОВЫЙ ПАРОЛЬ<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
            {passwordError && <div className="profile-form-error">{passwordError}</div>}
            {passwordStatus && <div className="profile-form-success">✓ {passwordStatus}</div>}
            <button className="btn-primary" type="submit" disabled={passwordSaving}>{passwordSaving ? 'Меняем пароль...' : 'Изменить пароль'}</button>
          </form> : <div className="settings-info"><LockKeyhole size={15}/><span>Войдите в аккаунт, чтобы изменить пароль.</span></div>}
        </section>
        <section className="settings-card"><div className="settings-card-head"><Settings size={17}/><div><strong>Внешний вид</strong><span>Цвет и читаемость интерфейса</span></div></div>
          <label>Тема<select value={settings.theme} onChange={e=>update('theme',e.target.value)}><option value="neon">Neon Dark</option><option value="graphite">Graphite</option><option value="contrast">High Contrast</option></select></label>
          <label>Размер текста<select value={settings.fontSize} onChange={e=>update('fontSize',e.target.value)}><option value="small">Маленький</option><option value="normal">Обычный</option><option value="large">Крупный</option></select></label>
        </section>
        <section className="settings-card"><div className="settings-card-head"><Globe size={17}/><div><strong>Лабораторное рабочее место</strong><span>Browser открывается только внутри лаборатории</span></div></div>
          <div className="settings-info"><Globe size={15}/><span>Отдельного Browser на рабочем столе нет. Практическая работа выполняется только во встроенном Browser выбранной лаборатории.</span></div>
          <label className="settings-toggle"><input type="checkbox" checked={settings.reduceMotion} onChange={e=>update('reduceMotion',e.target.checked)}/><span>Уменьшить анимации</span></label>
          <label className="settings-toggle"><input type="checkbox" checked={settings.showHints} onChange={e=>update('showHints',e.target.checked)}/><span>Показывать подсказки в лабораториях</span></label>
          <label className="settings-toggle"><input type="checkbox" checked={settings.confirmComplete} onChange={e=>update('confirmComplete',e.target.checked)}/><span>Подтверждать завершение лаборатории</span></label>
        </section>
        <section className="settings-card"><div className="settings-card-head"><Shield size={17}/><div><strong>Безопасность Analyzer</strong><span>Sandbox для внешних HTTP-запросов</span></div></div>
          <div className="settings-info"><Shield size={15}/><span>HTTP Analyzer выполняет сетевой запрос в отдельном Docker-контейнере с лимитами CPU/RAM/PID, read-only файловой системой и SSRF-фильтрацией.</span></div>
        </section>
        <section className="settings-card"><div className="settings-card-head"><RotateCcw size={17}/><div><strong>Сброс</strong><span>Вернуть стандартные параметры</span></div></div>
          <button className="btn-secondary" onClick={()=>setSettings({theme:'neon',fontSize:'normal',reduceMotion:false,showHints:true,confirmComplete:false})}>Сбросить настройки</button>
        </section>
      </div>
    </div>
  );
}

function App() {
  const [windows, setWindows] = useState([]);
  const [z, setZ] = useState(10);
  const [time, setTime] = useState(new Date());
  const [online, setOnline] = useState(true);
  const [labProgress, setLabProgress] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [completedLabs, setCompletedLabs] = useState([]);
  const [progressDetails, setProgressDetails] = useState([]);
  const [labsData, setLabsData] = useState(LABS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem("webseclab_user") || "null"); } catch { return null; } });
  const [authOpen, setAuthOpen] = useState(false);
  const [settings, setSettings] = useState(() => {
    try { return { theme: 'neon', fontSize: 'normal', reduceMotion: false, showHints: true, confirmComplete: false, ...JSON.parse(localStorage.getItem('webseclab_settings') || '{}') }; }
    catch { return { theme: 'neon', fontSize: 'normal', reduceMotion: false, showHints: true, confirmComplete: false }; }
  });

  useEffect(() => {
    localStorage.setItem('webseclab_settings', JSON.stringify(settings));
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.fontSize = settings.fontSize;
    document.documentElement.dataset.reduceMotion = settings.reduceMotion ? 'true' : 'false';
  }, [settings]);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    healthApi().then(() => setOnline(true)).catch(() => setOnline(false));
    fetchLabs().then(data => setLabsData(data)).catch(() => setLabsData(LABS));
    if (localStorage.getItem("webseclab_token")) {
      meApi().then(setUser).catch(() => { localStorage.removeItem("webseclab_token"); localStorage.removeItem("webseclab_user"); setUser(null); });
      fetchProgress().then(data => {
        setCompletedLabs(data.completed_labs || []);
        setProgressDetails(data.details || []);
        setTotalXp(Number(data.xp || 0));
        setLabProgress(Math.round(((data.completed_labs?.length || 0) / Math.max(1, labsData.length || LABS.length)) * 100));
      }).catch(() => {});
    }
  }, []);

  const openApp = (type, data = null) => {
    const existing = windows.find(w => w.type === type && (type !== "lab" || w.data?.id === data?.id));
    if (existing) {
      focus(existing.id);
      return;
    }
    const id = `${type}-${Date.now()}`;
    setWindows(prev => [...prev, { id, type, data, minimized: false, maximized: type === "lab" }]);
    setZ(v => v + 1);
    if (type === "lab" && data?.id) {
      fetchLab(data.id).then(freshLab => {
        setWindows(prev => prev.map(w => w.id === id ? { ...w, data: freshLab } : w));
      }).catch(() => {});
    }
  };

  const close = id => setWindows(prev => prev.filter(w => w.id !== id));
  const minimize = id => setWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: true } : w));
  const restore = id => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: false } : w));
    focus(id);
  };
  const maximize = id => setWindows(prev => prev.map(w => w.id === id ? { ...w, maximized: !w.maximized, minimized: false } : w));
  function focus(id) {
    setZ(prevZ => {
      const nextZ = prevZ + 1;
      setWindows(prev => prev.map(w => w.id === id ? { ...w, z: nextZ, minimized: false } : w));
      return nextZ;
    });
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        const visible = windows.filter(w => !w.minimized).sort((a, b) => (b.z || 0) - (a.z || 0));
        if (visible[0]) close(visible[0].id);
      }
      if (event.altKey && event.key === "Tab") {
        event.preventDefault();
        const ordered = [...windows].sort((a, b) => (b.z || 0) - (a.z || 0));
        if (ordered.length > 1) {
          const current = ordered[0];
          const next = ordered[1];
          focus(next.id);
          if (current) setWindows(prev => prev.map(w => w.id === current.id ? { ...w, minimized: false } : w));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [windows]);

  const completeLab = async (labId) => {
    if (!user) { setAuthOpen(true); throw new Error('Войдите в аккаунт, чтобы сохранить прогресс.'); }
    const result = await completeLabApi(labId);
    const nextCompleted = completedLabs.includes(labId) ? completedLabs : [...completedLabs, labId];
    setCompletedLabs(nextCompleted);
    setProgressDetails(prev => {
      const next = prev.filter(item => item.lab_id !== labId);
      return [...next, { lab_id: labId, completed: true, attempts: result.attempts || 0, xp_earned: result.xp_earned || 0, completed_at: result.completed_at || new Date().toISOString() }];
    });
    setLabProgress(Math.round((nextCompleted.length / Math.max(1, labsData.length || LABS.length)) * 100));
    if (typeof result.total_xp === 'number') setTotalXp(result.total_xp);
    return result;
  };

  return (
    <div className="desktop">
      <header className="topbar">
        <div className="brand clickable-brand" onClick={() => setMenuOpen(v => !v)}><Shield size={18}/><span>WebSec</span><b>Lab</b></div>
        {menuOpen && <AppMenu openApp={openApp} onClose={() => setMenuOpen(false)}/>}
        <nav>
          <button onClick={() => openApp("labs")}>Лаборатории</button>
        </nav>
        <div className="top-status">
          <span className={online ? "status-dot live" : "status-dot"} />
          <span>{online ? "SYSTEM ONLINE" : "OFFLINE"}</span>
          <span className="time">{time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
          <button className="avatar top-avatar" onClick={() => setAuthOpen(v => !v)} aria-label={user ? "Открыть профиль" : "Войти или зарегистрироваться"}><User size={13}/></button>
          <button className="top-user-name" onClick={() => setAuthOpen(v => !v)}>{user?.username || "guest"}</button>
        </div>
      </header>

      <aside className="dock">
        <button className="active" onClick={() => {}}><HomeIcon/><small>Главная</small></button>
        <button onClick={() => openApp("labs")}><Folder/><small>Лабы</small></button>
        <button onClick={() => openApp("http")}><Network/><small>HTTP</small></button>
        <button onClick={() => openApp("settings")}><Settings/><small>Настройки</small></button>
      </aside>

      <main className="workspace">
        <div className="wallpaper-grid"/>
        <div className="desktop-icons">
          {DESKTOP_APPS.map(({ id, label, icon: Icon }) => (
            <button key={id} onDoubleClick={() => openApp(id)}>
              <span className="icon-tile"><Icon size={29}/></span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <HomeScreen openApp={openApp}/>

        <aside className="right-panel">
          <div className="panel-head"><Activity size={14}/> СИСТЕМНАЯ АКТИВНОСТЬ <span>•••</span></div>
          <div className="activity-item"><i className="green"/><div><strong>Reflected XSS</strong><span>Лаборатория доступна</span></div><em>READY</em></div>
          <div className="activity-item"><i className="cyan"/><div><strong>Учебная среда</strong><span>Изолированная сеть</span></div><em>SAFE</em></div>
          <div className="activity-item"><i className="purple"/><div><strong>База результатов</strong><span>Прогресс и выполненные лабы</span></div><em>READY</em></div>
          <div className="panel-divider"/>
          <div className="progress-head"><span>МОЙ ПРОГРЕСС</span><b>{completedLabs.length} / {labsData.length || LABS.length}</b></div>
          <div className="big-progress"><i style={{ width: `${labProgress}%` }}/></div>
          <div className="progress-caption"><span>{labProgress}% завершено</span><span>{totalXp} XP</span></div>
          <div className="completed-summary"><Check size={13}/><span>Выполнено: <b>{completedLabs.length}</b></span><button onClick={() => openApp("labs")}>Открыть список</button></div>
          <button className="quick-lab" onClick={() => openApp("labs")}><Folder size={15}/><span>Каталог лабораторий</span><ChevronRight size={14}/></button>
          <button className="quick-lab" onClick={() => openApp("labs")}><BookOpen size={15}/><span>Теория в лабораториях</span><ChevronRight size={14}/></button>
        </aside>

        {authOpen && !user && <div className="auth-overlay"><AuthWindow onClose={() => setAuthOpen(false)} onSuccess={(nextUser) => { setUser(nextUser); setAuthOpen(false); fetchProgress().then(data => { setCompletedLabs(data.completed_labs || []); setProgressDetails(data.details || []); setTotalXp(Number(data.xp || 0)); setLabProgress(Math.round(((data.completed_labs?.length || 0) / Math.max(1, labsData.length || LABS.length)) * 100)); }).catch(() => {}); }} /></div>}
        {user && authOpen && <div className="profile-popover"><div className="profile-avatar"><User size={22}/></div><strong>{user.username}</strong><span>{user.email || "Учебный аккаунт"}</span><div className="profile-xp">{totalXp} XP</div><button className="profile-settings-btn" onClick={() => { setAuthOpen(false); openApp("settings"); }}>Настройка профиля</button><button onClick={async () => { await logoutApi().catch(() => {}); localStorage.removeItem("webseclab_token"); localStorage.removeItem("webseclab_user"); setUser(null); setCompletedLabs([]); setProgressDetails([]); setTotalXp(0); setLabProgress(0); setAuthOpen(false); }}>Выйти</button><button className="profile-close" onClick={() => setAuthOpen(false)}>Закрыть</button></div>}

        {windows.map((w, index) => {
          if (w.minimized) return null;
          const common = {
            onClose: () => close(w.id),
            onMinimize: () => minimize(w.id),
            onMaximize: () => maximize(w.id),
            maximized: w.maximized,
            zIndex: w.z || z + index,
            onFocus: () => focus(w.id)
          };
          if (w.type === "labs") return <Window key={w.id} {...common} title="Лаборатории" icon={Folder}><LabsApp labs={labsData} completedLabs={completedLabs} progressDetails={progressDetails} onOpenLab={lab => openApp("lab", lab)}/></Window>;
          if (w.type === "http") return <Window key={w.id} {...common} title="HTTP-анализатор" icon={Network}><HttpAnalyzerApp /></Window>;
          if (w.type === "settings") return <Window key={w.id} {...common} title="Настройки" icon={Settings}><SettingsApp settings={settings} setSettings={setSettings} user={user} onUserUpdate={setUser}/></Window>;
          if (w.type === "lab") return <Window key={w.id} {...common} title={`Lab: ${w.data.title}`} icon={Shield}><LabWindow lab={w.data} completed={completedLabs.includes(w.data.id)} settings={settings} onClose={() => close(w.id)} onComplete={completeLab}/></Window>;
          return null;
        })}
      </main>

      <footer className="taskbar">
        <div className="task-left"><Shield size={13}/><span>WebSec Lab OS</span></div>
        <div className="task-center">
          {windows.map(w => (
            <button key={w.id} className={`${w.minimized ? "minimized" : ""} ${(w.z || 0) === Math.max(0, ...windows.map(item => item.z || 0)) ? "task-active" : ""}`} onClick={() => w.minimized ? restore(w.id) : focus(w.id)}>
              {w.type === "labs" ? <Folder/> : w.type === "http" ? <Network/> : w.type === "settings" ? <Settings/> : <Shield/>}
            </button>
          ))}
        </div>
        <div className="task-right"><span>Docker <b>●</b></span><span>DB <b>●</b></span><span>{time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span><Power size={13}/></div>
      </footer>
    </div>
  );
}

export default App;

import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  X,
  Send,
  KeyRound,
  Loader2,
  RotateCcw,
  Building2,
  Phone,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Plus,
  ArrowLeft,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
} from 'lucide-react';
import { inputClass, labelClass, primaryButton, secondaryButton } from '../lib/styles';

// ------------------------------------------------------------------ protocolo con /api/ai
interface ChatContent {
  role: 'user' | 'model';
  parts: Record<string, unknown>[];
}

interface PotentialLead {
  company_name: string;
  industry: string;
  phone: string | null;
  website: string | null;
  address: string;
  location: string;
}

interface SearchEvent {
  tool: 'search_potential_leads';
  args: Record<string, unknown>;
  result: { source: 'google_places' | 'demo'; note: string; results: PotentialLead[] };
}

interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
  executedOn: 'server' | 'client';
  result?: Record<string, unknown>;
}

type ChatResponse =
  | { type: 'message'; text: string; contents: ChatContent[]; events: SearchEvent[]; model?: string }
  | { type: 'tool_calls'; calls: ToolCall[]; contents: ChatContent[]; events: SearchEvent[]; model?: string }
  | { type: 'error'; error: string };

interface AiStatus {
  serverKeyConfigured: boolean;
  model: string;
  leadSource: 'google_places' | 'demo';
}

// ------------------------------------------------------------------ mensajes visibles
type ChatMessage =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'error'; text: string }
  | { id: string; kind: 'search'; event: SearchEvent }
  | { id: string; kind: 'saved'; ok: boolean; text: string };

interface AiChatWidgetProps {
  userId: string;
  userName: string;
  tenantName: string;
  // Países habilitados del CRM con sus zonas: la IA solo busca y guarda leads en ellos
  countries: { code: string; name: string; zoneLabel: string; currency: string; zones: string[] }[];
  onSaveLead: (args: Record<string, unknown>) => Record<string, unknown>;
  // Buscar y mover leads existentes: sin estas dos, "mueve a X a descartado" terminaba creando un duplicado
  onFindLeads: (args: Record<string, unknown>) => Record<string, unknown>;
  onUpdateLeadStage: (args: Record<string, unknown>) => Record<string, unknown>;
}

const KEY_STORAGE = 'geocrm-gemini-key';

// Resumen de una acción sobre el CRM para mostrarla en el chat. La búsqueda no deja rastro:
// solo se anuncian los cambios y los errores.
function describeToolResult(
  name: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>
): string | null {
  const ok = result.ok === true;
  if (name === 'find_leads_in_crm') {
    if (ok) return null;
    return `No se pudo buscar: ${String(result.error ?? 'error desconocido')}`;
  }
  if (name === 'update_lead_stage') {
    const quien = String(result.contact_name ?? result.company_name ?? 'lead');
    if (!ok) return `No se pudo mover el lead: ${String(result.error ?? 'error desconocido')}`;
    if (result.action === 'unchanged') return `${quien} ya estaba en ${String(result.status ?? '')}`;
    return `Lead movido: ${quien} · ${String(result.previous_status ?? '')} → ${String(result.status ?? '')}`;
  }
  const company = String(args.company_name ?? 'lead');
  if (ok) {
    return `${result.action === 'updated' ? 'Lead actualizado' : 'Lead guardado'}: ${company} · ${String(result.status ?? '')} · ID ${String(result.lead_id ?? '')}`;
  }
  if (result.needs_confirmation === true) return `No se creó ${company}: ya hay leads parecidos en el CRM`;
  return `No se pudo guardar ${company}: ${String(result.error ?? 'error desconocido')}`;
}

// ------------------------------------------------------------------ posición y tamaño del panel
interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragMode = 'move' | 'resize-nw' | 'resize-se';

const LAYOUT_STORAGE = 'geocrm-ai-chat-layout';
const MARGIN = 16;
const MIN_W = 340;
const MIN_H = 420;
const DEFAULT_W = 420;
const DEFAULT_H = 640;
const FAB_SPACE = 96; // espacio reservado sobre el botón flotante

const clampRect = (rect: PanelRect): PanelRect => {
  const maxW = Math.max(260, window.innerWidth - MARGIN * 2);
  const maxH = Math.max(320, window.innerHeight - MARGIN * 2);
  const w = Math.min(Math.max(rect.w, Math.min(MIN_W, maxW)), maxW);
  const h = Math.min(Math.max(rect.h, Math.min(MIN_H, maxH)), maxH);
  return {
    w,
    h,
    x: Math.min(Math.max(rect.x, MARGIN), window.innerWidth - w - MARGIN),
    y: Math.min(Math.max(rect.y, MARGIN), window.innerHeight - h - MARGIN),
  };
};

const dockedRect = (side: 'left' | 'right', w: number, h: number): PanelRect =>
  clampRect({
    w,
    h,
    x: side === 'right' ? window.innerWidth - w - MARGIN : MARGIN,
    y: window.innerHeight - Math.min(h, window.innerHeight - FAB_SPACE - MARGIN) - FAB_SPACE,
  });

const readLayout = (): PanelRect => {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE) ?? 'null') as PanelRect | null;
    if (saved && [saved.x, saved.y, saved.w, saved.h].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return clampRect(saved);
    }
  } catch {
    // diseño guardado ilegible: se usa el predeterminado
  }
  return dockedRect('right', DEFAULT_W, DEFAULT_H);
};
const MAX_CLIENT_STEPS = 6;

const SUGGESTIONS = [
  'Búscame maestranzas y talleres de contenedores en San Bernardo',
  'Busca agencias de marketing en Providencia',
  'Busca constructoras en Las Condes',
];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// La clave personal se guarda por usuario: no se comparte entre cuentas del mismo navegador
const readKey = (storageKey: string) => {
  try {
    return sessionStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
};

// Negritas **texto** sin interpretar HTML
function renderText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith('**') && chunk.endsWith('**') ? <strong key={i}>{chunk.slice(2, -2)}</strong> : chunk
  );
}

export const AiChatWidget: React.FC<AiChatWidgetProps> = ({
  userId,
  userName,
  tenantName,
  countries,
  onSaveLead,
  onFindLeads,
  onUpdateLeadStage,
}) => {
  const keyStorage = `${KEY_STORAGE}:${userId}`;
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contents, setContents] = useState<ChatContent[]>([]);
  const [input, setInput] = useState('');
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [personalKey, setPersonalKey] = useState(() => readKey(keyStorage));
  const [keyDraft, setKeyDraft] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Posición/tamaño del panel: se puede mover, redimensionar, agrandar y cambiar de lado
  const [rect, setRect] = useState<PanelRect>(readLayout);
  const [restoreRect, setRestoreRect] = useState<PanelRect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; start: PanelRect } | null>(null);

  const side: 'left' | 'right' = rect.x + rect.w / 2 < window.innerWidth / 2 ? 'left' : 'right';
  const isExpanded = restoreRect !== null;

  useEffect(() => {
    const onResize = () => setRect((current) => clampRect(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (isDragging) return;
    try {
      localStorage.setItem(LAYOUT_STORAGE, JSON.stringify(rect));
    } catch {
      // sin almacenamiento: el diseño dura mientras la página esté abierta
    }
  }, [rect, isDragging]);

  const startDrag = (mode: DragMode) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if (mode === 'move' && (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // el puntero ya no está activo: el arrastre sigue con los eventos del propio elemento
    }
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, start: rect };
    setIsDragging(true);
  };

  const onDrag = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const { start } = drag;

    if (drag.mode === 'move') {
      setRect(clampRect({ ...start, x: start.x + dx, y: start.y + dy }));
    } else if (drag.mode === 'resize-se') {
      setRect(clampRect({ ...start, w: start.w + dx, h: start.h + dy }));
    } else {
      // Esquina superior izquierda: crece hacia arriba/izquierda manteniendo fija la esquina opuesta
      const next = clampRect({ ...start, w: start.w - dx, h: start.h - dy });
      setRect(clampRect({ ...next, x: start.x + start.w - next.w, y: start.y + start.h - next.h }));
    }
    setRestoreRect(null);
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setIsDragging(false);
  };

  const toggleExpanded = () => {
    if (restoreRect) {
      setRect(clampRect(restoreRect));
      setRestoreRect(null);
      return;
    }
    setRestoreRect(rect);
    setRect(dockedRect(side, Math.min(820, window.innerWidth - MARGIN * 2), window.innerHeight - MARGIN * 2));
  };

  const switchSide = () => {
    const target = side === 'right' ? 'left' : 'right';
    setRect((current) => dockedRect(target, current.w, current.h));
    setRestoreRect((saved) => (saved ? dockedRect(target, saved.w, saved.h) : null));
  };

  const isLoading = loadingLabel !== null;
  const hasKey = Boolean(personalKey || status?.serverKeyConfigured);

  useEffect(() => {
    if (!isOpen || status) return;
    fetch('/api/ai/status')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: AiStatus) => {
        setStatus(data);
        setStatusError(false);
      })
      .catch(() => setStatusError(true));
  }, [isOpen, status]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loadingLabel]);

  useEffect(() => {
    if (isOpen && !showSettings) inputRef.current?.focus();
  }, [isOpen, showSettings]);

  const push = (...items: ChatMessage[]) => setMessages((prev) => [...prev, ...items]);

  const postChat = async (history: ChatContent[]): Promise<ChatResponse> => {
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(personalKey ? { 'X-Gemini-Api-Key': personalKey } : {}),
        },
        body: JSON.stringify({ contents: history, context: { userName, tenantName, countries } }),
      });
      const data = (await response.json().catch(() => null)) as ChatResponse | null;
      if (!data) return { type: 'error', error: `El servidor del asistente respondió ${response.status}.` };
      return data;
    } catch {
      return { type: 'error', error: 'No se pudo conectar con el servidor del asistente. ¿Está corriendo "npm run dev"?' };
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || isLoading) return;

    setInput('');
    push({ id: uid(), kind: 'user', text: message });
    const previousContents = contents;
    let history: ChatContent[] = [...contents, { role: 'user', parts: [{ text: message }] }];
    setLoadingLabel('Pensando…');

    try {
      for (let step = 0; step < MAX_CLIENT_STEPS; step++) {
        const data = await postChat(history);
        if (data.type === 'error') throw new Error(data.error);

        history = data.contents;
        if (data.model) setActiveModel(data.model);
        if (data.events.length) push(...data.events.map((event) => ({ id: uid(), kind: 'search' as const, event })));

        if (data.type === 'message') {
          push({ id: uid(), kind: 'assistant', text: data.text });
          setContents(history);
          return;
        }

        // Ejecuta en el navegador las tools que leen o modifican el CRM y devuelve los resultados al modelo
        setLoadingLabel(data.calls.some((c) => c.name === 'find_leads_in_crm') ? 'Buscando en el CRM…' : 'Guardando en el CRM…');
        const parts = data.calls.map((call) => {
          let result = call.result ?? {};
          if (call.executedOn === 'client') {
            if (call.name === 'save_lead_to_crm') result = onSaveLead(call.args);
            else if (call.name === 'find_leads_in_crm') result = onFindLeads(call.args);
            else if (call.name === 'update_lead_stage') result = onUpdateLeadStage(call.args);
            else result = { ok: false, error: `Herramienta no soportada: ${call.name}` };
            const chip = describeToolResult(call.name, call.args, result);
            if (chip) push({ id: uid(), kind: 'saved', ok: result.ok === true, text: chip });
          }
          return { functionResponse: { id: call.id, name: call.name, response: result } };
        });
        history = [...history, { role: 'user', parts }];
        setLoadingLabel('Pensando…');
      }
      push({ id: uid(), kind: 'error', text: 'La solicitud requirió demasiados pasos. Prueba con una instrucción más concreta.' });
      setContents(history);
    } catch (error) {
      // Se descarta el turno fallido para poder reintentar con un historial válido
      setContents(previousContents);
      push({ id: uid(), kind: 'error', text: (error as Error).message });
    } finally {
      setLoadingLabel(null);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setContents([]);
  };

  const saveKey = () => {
    const key = keyDraft.trim();
    if (!key) return;
    try {
      sessionStorage.setItem(keyStorage, key);
    } catch {
      // sin almacenamiento de sesión: la clave dura mientras la página esté abierta
    }
    setPersonalKey(key);
    setKeyDraft('');
    setShowSettings(false);
  };

  const removeKey = () => {
    try {
      sessionStorage.removeItem(keyStorage);
    } catch {
      // nada que limpiar
    }
    setPersonalKey('');
  };

  return (
    <>
      {isOpen && (
        <section
          aria-label="Asistente de prospección"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          className={`fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl ${
            isDragging ? 'select-none ring-2 ring-indigo-500/50' : ''
          }`}
        >
          {/* Esquinas para cambiar el tamaño */}
          <div
            onPointerDown={startDrag('resize-nw')}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            title="Arrastra para cambiar el tamaño"
            className="absolute left-0 top-0 z-10 h-5 w-5 cursor-nwse-resize touch-none"
          >
            <span className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-tl-sm border-l-2 border-t-2 border-slate-500" />
          </div>
          <div
            onPointerDown={startDrag('resize-se')}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            title="Arrastra para cambiar el tamaño"
            className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-nwse-resize touch-none"
          >
            <span className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-br-sm border-b-2 border-r-2 border-slate-500" />
          </div>

          {/* Encabezado (arrastrable) */}
          <header
            onPointerDown={startDrag('move')}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={(e) => {
              if (!(e.target as HTMLElement).closest('button')) toggleExpanded();
            }}
            title="Arrastra para mover · doble clic para agrandar"
            className={`flex touch-none items-center gap-2 border-b border-slate-700 px-4 py-3 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          >
            {showSettings ? (
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                aria-label="Volver al chat"
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                <Bot className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-slate-100">{showSettings ? 'Configuración' : 'Asistente de prospección'}</p>
              <p className="truncate text-sm text-slate-400">
                {statusError
                  ? 'Servidor del asistente no disponible'
                  : status
                    ? `Gemini · ${activeModel ?? status.model}${hasKey ? '' : ' · falta API key'}`
                    : 'Conectando…'}
              </p>
            </div>
            {!showSettings && (
              <>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  title="Configurar API key de Gemini"
                  aria-label="Configurar API key de Gemini"
                  className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  <KeyRound className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={resetChat}
                  disabled={isLoading || messages.length === 0}
                  title="Nueva conversación"
                  aria-label="Nueva conversación"
                  className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={switchSide}
              title={side === 'right' ? 'Mover a la izquierda' : 'Mover a la derecha'}
              aria-label={side === 'right' ? 'Mover el chat a la izquierda' : 'Mover el chat a la derecha'}
              className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              {side === 'right' ? <PanelLeft className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={toggleExpanded}
              title={isExpanded ? 'Restaurar tamaño' : 'Agrandar'}
              aria-label={isExpanded ? 'Restaurar tamaño del chat' : 'Agrandar chat'}
              aria-pressed={isExpanded}
              className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              {isExpanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar asistente"
              className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {showSettings ? (
            /* Configuración de API key */
            <div className="flex-1 space-y-5 overflow-y-auto p-5 text-[15px]">
              <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                <p className="font-semibold text-slate-200">Estado</p>
                <p className="mt-1 text-slate-400">
                  API key del servidor: {status?.serverKeyConfigured ? 'configurada ✓' : 'no configurada'}
                </p>
                <p className="text-slate-400">API key personal: {personalKey ? 'en uso ✓' : 'no ingresada'}</p>
                <p className="text-slate-400">
                  Búsqueda de empresas: {status?.leadSource === 'google_places' ? 'Google Places (real)' : 'datos de demostración'}
                </p>
              </div>

              <div>
                <label htmlFor="gemini-key" className={labelClass}>
                  API key personal de Gemini
                </label>
                <input
                  id="gemini-key"
                  type="password"
                  autoComplete="off"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="AIza…"
                  className={inputClass}
                />
                <p className="mt-1.5 text-sm text-slate-400">
                  Se guarda solo en esta pestaña (se borra al cerrarla) y se envía a tu servidor, nunca directo a
                  terceros. Para producción, usa GEMINI_API_KEY en el servidor.
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={saveKey} disabled={!keyDraft.trim()} className={primaryButton}>
                    Guardar clave
                  </button>
                  {personalKey && (
                    <button type="button" onClick={removeKey} className={secondaryButton}>
                      Quitar clave
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 p-4 text-sm text-slate-300">
                <p className="font-semibold text-slate-200">¿Cómo obtener una API key gratis?</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>
                    Entra a{' '}
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="font-semibold text-indigo-300 underline">
                      aistudio.google.com/apikey
                    </a>{' '}
                    con tu cuenta Google.
                  </li>
                  <li>Pulsa «Create API key» y copia la clave.</li>
                  <li>Pégala en .env.local como GEMINI_API_KEY y reinicia «npm run dev», o pégala aquí arriba.</li>
                </ol>
              </div>
            </div>
          ) : (
            <>
              {/* Mensajes */}
              <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-slate-950/50 p-4 text-[15px] text-slate-300">
                      <p className="flex items-center gap-2 font-semibold text-slate-100">
                        <Sparkles className="h-4 w-4 text-indigo-400" /> Hola{userName ? `, ${userName.split(' ')[0]}` : ''}
                      </p>
                      <p className="mt-1">
                        Puedo buscar empresas por rubro y zona y registrar en el CRM las que me indiques.
                      </p>
                    </div>
                    {!hasKey && status && (
                      <button
                        type="button"
                        onClick={() => setShowSettings(true)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-300"
                      >
                        <KeyRound className="h-4 w-4 shrink-0" />
                        Falta la API key de Gemini. Pulsa aquí para configurarla.
                      </button>
                    )}
                    <p className="text-sm font-semibold text-slate-400">Prueba con:</p>
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => send(suggestion)}
                        disabled={isLoading}
                        className="block w-full cursor-pointer rounded-xl border border-slate-600 px-3.5 py-2.5 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}

                {messages.map((message) => {
                  if (message.kind === 'user') {
                    return (
                      <div key={message.id} className="flex justify-end">
                        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2.5 text-[15px] text-[#fff]">
                          {message.text}
                        </p>
                      </div>
                    );
                  }
                  if (message.kind === 'assistant') {
                    return (
                      <div key={message.id} className="flex justify-start">
                        <p className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-slate-800 px-3.5 py-2.5 text-[15px] text-slate-100">
                          {renderText(message.text)}
                        </p>
                      </div>
                    );
                  }
                  if (message.kind === 'error') {
                    return (
                      <p
                        key={message.id}
                        role="alert"
                        className="flex gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {message.text}
                      </p>
                    );
                  }
                  if (message.kind === 'saved') {
                    return (
                      <p
                        key={message.id}
                        className={`flex gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
                          message.ok
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                        }`}
                      >
                        {message.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                        {message.text}
                      </p>
                    );
                  }

                  const { result, args } = message.event;
                  return (
                    <div key={message.id} className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-300">
                        <Building2 className="h-4 w-4 text-indigo-400" />
                        {result.results.length} resultado{result.results.length === 1 ? '' : 's'} · {String(args.industry || args.query || '')}{' '}
                        en {String(args.location || '')}
                        {result.source === 'demo' && (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                            demo
                          </span>
                        )}
                      </p>
                      <ul className="mt-2 space-y-2">
                        {result.results.map((lead) => (
                          <li key={`${lead.company_name}-${lead.phone}`} className="rounded-lg bg-slate-900 p-2.5 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-slate-100">{lead.company_name}</p>
                              <button
                                type="button"
                                onClick={() => send(`Guarda "${lead.company_name}" como lead nuevo`)}
                                disabled={isLoading}
                                title={`Guardar ${lead.company_name} en el CRM`}
                                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-indigo-500/40 px-2 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-40"
                              >
                                <Plus className="h-3.5 w-3.5" /> Guardar
                              </button>
                            </div>
                            {lead.phone && (
                              <p className="mt-1 flex items-center gap-1.5 text-slate-400">
                                <Phone className="h-3.5 w-3.5" /> {lead.phone}
                              </p>
                            )}
                            {lead.address && (
                              <p className="flex items-center gap-1.5 text-slate-400">
                                <MapPin className="h-3.5 w-3.5" /> {lead.address}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

                {isLoading && (
                  <p className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-slate-800 px-3.5 py-2.5 text-sm text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                    {loadingLabel}
                  </p>
                )}
              </div>

              {/* Entrada */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-end gap-2 border-t border-slate-700 p-3"
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  maxLength={4000}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder={hasKey ? 'Escribe un mensaje…' : 'Configura la API key para empezar'}
                  aria-label="Mensaje para el asistente"
                  className={`${inputClass} max-h-32 resize-none`}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  aria-label="Enviar mensaje"
                  className={`${primaryButton} h-[46px] w-[46px] shrink-0 px-0`}
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </form>
            </>
          )}
        </section>
      )}

      {/* Botón flotante: se oculta con el chat abierto para no tapar el panel (que tiene su propio botón de cerrar) */}
      {!isOpen && (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Abrir asistente de prospección"
        aria-expanded={false}
        className={`fixed bottom-4 ${side === 'left' ? 'left-4' : 'right-4'} z-40 flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-indigo-600 text-[#fff] shadow-xl shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-95`}
      >
        <Bot className="h-7 w-7" />
      </button>
      )}
    </>
  );
};

import React, { Component, Suspense, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';

interface SeccionProps {
  children: ReactNode;
  /** Qué se está cargando, para el aviso: "el mapa", "esta sección"… */
  nombre?: string;
  /** Alto mínimo mientras carga, para que la página no salte */
  alto?: string;
  /** Sin aviso mientras carga (ventanas y botones flotantes) */
  silenciosa?: boolean;
}

interface EstadoError {
  fallo: boolean;
}

// Si un módulo no alcanza a bajar (sin conexión, o se publicó una versión nueva con la pestaña
// abierta), se ofrece recargar en vez de dejar la pantalla en blanco.
class ResguardoDeCarga extends Component<SeccionProps, EstadoError> {
  state: EstadoError = { fallo: false };

  static getDerivedStateFromError(): EstadoError {
    return { fallo: true };
  }

  render() {
    if (!this.state.fallo) return this.props.children;
    if (this.props.silenciosa) return null;
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-center text-[15px] text-amber-200 ${this.props.alto ?? ''}`}
      >
        <span className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-5 w-5" />
          No se pudo cargar {this.props.nombre ?? 'esta sección'}.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-500/50 px-3 py-1.5 font-semibold hover:bg-amber-500/15"
        >
          <RotateCw className="h-4 w-4" />
          Recargar
        </button>
      </div>
    );
  }
}

/** Muestra un módulo que se descarga al abrirlo, con aviso mientras carga y resguardo si falla. */
export const Seccion: React.FC<SeccionProps> = ({ children, nombre, alto, silenciosa }) => (
  <ResguardoDeCarga nombre={nombre} alto={alto} silenciosa={silenciosa}>
    <Suspense
      fallback={
        silenciosa ? null : (
          <div role="status" className={`flex items-center justify-center gap-2 py-16 text-[15px] text-slate-400 ${alto ?? ''}`}>
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando {nombre ?? 'la sección'}…
          </div>
        )
      }
    >
      {children}
    </Suspense>
  </ResguardoDeCarga>
);

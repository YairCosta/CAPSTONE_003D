// Servidor de la imagen Docker: entrega la aplicación ya compilada (dist/) y atiende la API (/api/*) con el mismo
// manejador que la función de Vercel (server/api.ts), así que el comportamiento es el de la app publicada. Las claves
// llegan de las variables de entorno del contenedor (docker-compose.yml), nunca de la imagen.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { createApiHandler } from './api.ts';

const PUERTO = Number(process.env.PORT) || 8080;
const RAIZ = join(process.cwd(), 'dist');
const api = createApiHandler(process.env);

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const CABECERAS_DE_SEGURIDAD = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' };

function rechazar(res: ServerResponse, codigo: number, mensaje: string) {
  res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8', ...CABECERAS_DE_SEGURIDAD });
  res.end(mensaje);
}

function servir(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://revela.local');
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return api(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return rechazar(res, 405, 'Método no permitido.');

  let pedido: string;
  try {
    pedido = normalize(decodeURIComponent(url.pathname));
  } catch {
    return rechazar(res, 400, 'Dirección inválida.');
  }
  let archivo = join(RAIZ, pedido);
  // Nunca se sirve nada fuera de dist (../, %2e%2e/…)
  if (archivo !== RAIZ && !archivo.startsWith(RAIZ + sep)) return rechazar(res, 403, 'Prohibido.');
  // Las rutas de la aplicación (/demo, enlaces de invitación…) caen en la página principal, igual que en Vercel
  if (!existsSync(archivo) || statSync(archivo).isDirectory()) archivo = join(RAIZ, 'index.html');

  const enAssets = archivo.startsWith(join(RAIZ, 'assets') + sep);
  res.writeHead(200, {
    'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream',
    // Los archivos de /assets llevan un código en el nombre: cambian cuando cambia su contenido
    'Cache-Control': enAssets ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...CABECERAS_DE_SEGURIDAD,
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(archivo).pipe(res);
}

createServer(servir).listen(PUERTO, () => console.log(`Revela escuchando en http://localhost:${PUERTO}`));

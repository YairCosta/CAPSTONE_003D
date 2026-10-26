// Función de Vercel que atiende toda la API (/api/*) de la app publicada. Se empaqueta en un solo
// archivo JavaScript con scripts/build-vercel.mjs; las claves llegan de las variables de entorno del
// proyecto en Vercel, nunca del código.
import { createApiHandler } from './api.ts';

export default createApiHandler(process.env);

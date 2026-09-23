// Búsqueda de empresas potenciales para el asistente IA.
// Con GOOGLE_PLACES_API_KEY usa Google Places (Text Search). Sin ella devuelve datos de demostración
// claramente ficticios (teléfonos 5555 01xx y dominios .demo) para no confundirlos con empresas reales.
// La búsqueda se limita a los países habilitados para el CRM (plan Internacional).

export interface PotentialLead {
  company_name: string;
  industry: string;
  phone: string | null;
  website: string | null;
  address: string;
  location: string;
  country?: string;
}

export interface LeadSearchResult {
  source: 'google_places' | 'demo';
  note: string;
  results: PotentialLead[];
}

interface SearchArgs {
  query: string;
  location: string;
  industry: string;
  countryCode: string;
  countryName: string;
}

export interface SearchCountry {
  code: string;
  name: string;
}

// Datos por país para búsquedas: prefijo de los teléfonos ficticios y ciudad por defecto
const DEMO_BY_COUNTRY: Record<string, { phone: string; city: string; companySuffix: string }> = {
  CL: { phone: '+56 9 5555 01', city: 'Santiago', companySuffix: 'SpA' },
  PE: { phone: '+51 955 501 0', city: 'Lima', companySuffix: 'SAC' },
};

const text = (value: unknown, max = 120) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const capitalize = (value: string) =>
  value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

export async function searchPotentialLeads(
  rawArgs: Record<string, unknown> | undefined,
  placesApiKey?: string,
  allowedCountries: SearchCountry[] = [{ code: 'CL', name: 'Chile' }]
): Promise<LeadSearchResult> {
  const requested = normalize(text(rawArgs?.country, 60));
  const country = requested
    ? allowedCountries.find((c) => normalize(c.name) === requested || normalize(c.code) === requested)
    : allowedCountries[0];

  if (!country) {
    return {
      source: 'demo',
      note: `El país "${text(rawArgs?.country, 60)}" no está habilitado para este CRM.`,
      results: [],
    };
  }

  const args: SearchArgs = {
    query: text(rawArgs?.query),
    location: text(rawArgs?.location),
    industry: text(rawArgs?.industry),
    countryCode: country.code,
    countryName: country.name,
  };

  if (!args.location && !args.query && !args.industry) {
    return { source: 'demo', note: 'Faltan términos de búsqueda: indica rubro y zona.', results: [] };
  }

  if (placesApiKey) {
    try {
      return await searchWithGooglePlaces(args, placesApiKey);
    } catch (error) {
      console.error('[ai] Google Places falló, se usan datos de demostración:', (error as Error).message);
      const demo = searchDemo(args);
      return { ...demo, note: `Google Places no respondió; ${demo.note}` };
    }
  }

  return searchDemo(args);
}

async function searchWithGooglePlaces(args: SearchArgs, apiKey: string): Promise<LeadSearchResult> {
  const textQuery = [args.query, args.industry, args.location && `en ${args.location}`, args.countryName]
    .filter(Boolean)
    .join(' ');

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName',
    },
    body: JSON.stringify({ textQuery, languageCode: 'es', regionCode: args.countryCode, pageSize: 5 }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = (await response.json()) as {
    places?: {
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      internationalPhoneNumber?: string;
      websiteUri?: string;
      primaryTypeDisplayName?: { text?: string };
    }[];
  };

  const results = (data.places ?? []).map((place) => ({
    company_name: place.displayName?.text ?? 'Sin nombre',
    industry: place.primaryTypeDisplayName?.text ?? args.industry,
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    address: place.formattedAddress ?? '',
    location: args.location,
    country: args.countryName,
  }));

  return {
    source: 'google_places',
    note: results.length ? 'Resultados reales de Google Places.' : 'Google Places no encontró resultados.',
    results,
  };
}

const DEMO_SUFFIXES = ['Los Aromos', 'del Maipo', 'Andes', 'Cordillera', 'Pacífico', 'Central'];
const DEMO_STREETS = ['Av. Industrial', 'Calle Los Talleres', 'Camino Principal', 'Av. Las Fábricas', 'Pasaje El Progreso'];

function searchDemo(args: SearchArgs): LeadSearchResult {
  const industry = capitalize(args.industry || args.query || 'Servicios');
  const demo = DEMO_BY_COUNTRY[args.countryCode] ?? DEMO_BY_COUNTRY.CL;
  const location = capitalize(args.location || demo.city);
  const seed = hashString(`${industry}|${location}`);
  const count = 3 + (seed % 2);

  const names = [
    `${industry} ${location}`,
    `${industry} ${DEMO_SUFFIXES[seed % DEMO_SUFFIXES.length]} ${demo.companySuffix}`,
    `Servicios ${industry} ${DEMO_SUFFIXES[(seed + 2) % DEMO_SUFFIXES.length]}`,
    `${industry} y Compañía ${location} Ltda.`,
  ];

  const results = names.slice(0, count).map((name, i) => ({
    company_name: name,
    industry,
    phone: `${demo.phone}${String((seed + i * 7) % 100).padStart(2, '0')}`,
    website: `https://${slug(name)}.demo`,
    address: `${DEMO_STREETS[(seed + i) % DEMO_STREETS.length]} ${100 + ((seed >> (i + 1)) % 900)}, ${location}`,
    location,
  }));

  return {
    source: 'demo',
    note: 'Datos de demostración ficticios (configura GOOGLE_PLACES_API_KEY para resultados reales).',
    results,
  };
}

// Pruebas de la exportación de datos de un CRM (portabilidad).
// Genera el Excel real a partir de los datos de TODOS los CRMs y verifica que solo contenga los del CRM exportado.
// Ejecutar: npm run test:export
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import writeXlsxFile from 'write-excel-file/node';
import { buildTenantExport, toWorkbookSheets } from '../src/lib/tenantExport.ts';
import {
  mockActivities,
  mockCatalogItems,
  mockClientAccounts,
  mockCompanies,
  mockLeads,
  mockTerritories,
  mockUsers,
  defaultStageConfigs,
  TENANT_GEODEMO_ID,
  TENANT_NORTE_ID,
} from '../src/data/mockGeoData.ts';

const results: { name: string; ok: boolean; error?: string }[] = [];
const test = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: (error as Error).message });
  }
};

const exportFor = (companyId: string) =>
  buildTenantExport({
    company: mockCompanies.find((c) => c.id === companyId)!,
    users: mockUsers,
    accounts: mockClientAccounts,
    leads: mockLeads,
    activities: mockActivities,
    catalog: mockCatalogItems,
    stageConfigs: defaultStageConfigs,
    territories: mockTerritories,
    exportedBy: 'Administrador GeoCRM (admin@geocrm.cl)',
    now: new Date('2026-09-16T12:00:00Z'),
  });

// Texto de todas las celdas del .xlsx real (descomprimido)
const xlsxText = async (companyId: string) => {
  const buffer = await writeXlsxFile(toWorkbookSheets(exportFor(companyId))).toBuffer();
  const files = unzipSync(new Uint8Array(buffer));
  return {
    names: Object.keys(files),
    text: Object.entries(files)
      .filter(([path]) => path.endsWith('.xml'))
      .map(([, content]) => strFromU8(content))
      .join('\n'),
  };
};

const sheet = (companyId: string, name: string) => exportFor(companyId).sheets.find((s) => s.name === name)!;
const allCells = (companyId: string) =>
  exportFor(companyId)
    .sheets.flatMap((s) => s.rows.flat())
    .map((v) => String(v ?? ''))
    .join('\n');

await test('GeoDemo: exporta todas sus filas (leads de Chile y Perú, empresas, catálogo, actividades)', () => {
  const geo = exportFor(TENANT_GEODEMO_ID);
  const count = (label: string) => geo.counts.find((c) => c.label === label)?.count;
  assert.equal(count('Leads'), mockLeads.filter((l) => l.companyId === TENANT_GEODEMO_ID).length);
  assert.equal(count('Empresas cliente'), mockClientAccounts.filter((a) => a.companyId === TENANT_GEODEMO_ID).length);
  assert.equal(count('Catálogo'), mockCatalogItems.filter((i) => i.companyId === TENANT_GEODEMO_ID).length);
  assert.equal(count('Actividades'), 6);
  assert.equal(count('Usuarios'), 3);
  assert.ok((count('Productos por lead') ?? 0) > 0);
  assert.equal(geo.fileName, 'geocrm-export_retail-geodemo_2026-09-16.xlsx');
});

await test('GeoDemo: el archivo NO contiene datos de Constructora Norte', () => {
  const text = allCells(TENANT_GEODEMO_ID);
  for (const foreign of ['Rocío Aguilera', 'Minera Atacama Norte', 'Hotel Costanera', 'Hormigón premezclado', 'gerente@nortedemo.cl', 'lead-n1']) {
    assert.ok(!text.includes(foreign), `aparece "${foreign}"`);
  }
});

await test('Norte: el archivo NO contiene datos de GeoDemo ni zonas de Perú', () => {
  const text = allCells(TENANT_NORTE_ID);
  for (const foreign of ['Antonia Morales Valdés', 'Consultora Andes', 'Terminal POS Retail', 'Lucía Fernández', 'Miraflores', 'vendedor@geodemo.cl']) {
    assert.ok(!text.includes(foreign), `aparece "${foreign}"`);
  }
  assert.ok(text.includes('Rocío Aguilera'));
});

await test('No incluye contraseñas', () => {
  for (const id of [TENANT_GEODEMO_ID, TENANT_NORTE_ID]) {
    const text = allCells(id);
    for (const password of ['dev-admin-solo-local', 'dev-gerente-local', 'dev-base-local']) assert.ok(!text.includes(password), `aparece "${password}"`);
    assert.ok(!sheet(id, 'Usuarios').columns.some((c) => /contraseña|password/i.test(c.header)));
  }
});

await test('Relaciones: cada lead apunta a empresas, zonas e ítems presentes en el mismo archivo', () => {
  const accounts = new Set(sheet(TENANT_GEODEMO_ID, 'Empresas cliente').rows.map((r) => r[0]));
  const zones = new Set(sheet(TENANT_GEODEMO_ID, 'Zonas').rows.map((r) => r[0]));
  const items = new Set(sheet(TENANT_GEODEMO_ID, 'Catálogo').rows.map((r) => r[0]));
  const leads = sheet(TENANT_GEODEMO_ID, 'Leads');
  const leadIds = new Set(leads.rows.map((r) => r[0]));
  const col = (name: string) => leads.columns.findIndex((c) => c.header === name);
  for (const row of leads.rows) {
    if (row[col('ID empresa cliente')]) assert.ok(accounts.has(row[col('ID empresa cliente')]), `empresa ${row[col('ID empresa cliente')]}`);
    if (row[col('ID zona')]) assert.ok(zones.has(row[col('ID zona')]), `zona ${row[col('ID zona')]}`);
  }
  for (const row of sheet(TENANT_GEODEMO_ID, 'Productos por lead').rows) {
    assert.ok(leadIds.has(row[0]) && items.has(row[2]));
  }
  for (const row of sheet(TENANT_GEODEMO_ID, 'Actividades').rows) assert.ok(leadIds.has(row[1]));
});

await test('Montos en moneda local y origen del valor (Calculado / Manual)', () => {
  const leads = sheet(TENANT_GEODEMO_ID, 'Leads');
  const col = (name: string) => leads.columns.findIndex((c) => c.header === name);
  const peru = leads.rows.find((r) => r[0] === 'lead-p1')!;
  assert.equal(peru[col('Moneda')], 'PEN');
  assert.equal(typeof peru[col('Valor estimado')], 'number');
  assert.equal(leads.rows.find((r) => r[0] === 'lead-2')![col('Origen del valor')], 'Manual');
  assert.equal(leads.rows.find((r) => r[0] === 'lead-1')![col('Origen del valor')], 'Calculado');
});

await test('Excel real: se genera un .xlsx válido con Léeme, hojas de datos y Diccionario', async () => {
  const { names, text } = await xlsxText(TENANT_GEODEMO_ID);
  assert.ok(names.includes('xl/workbook.xml'));
  for (const name of ['Léeme', 'Empresas cliente', 'Leads', 'Productos por lead', 'Catálogo', 'Actividades', 'Etapas pipeline', 'Zonas', 'Usuarios', 'Diccionario']) {
    assert.ok(text.includes(`name="${name}"`), `falta la hoja ${name}`);
  }
  assert.ok(text.includes('Antonia Morales Valdés') && text.includes('Lucía Fernández'));
  assert.ok(!text.includes('Rocío Aguilera') && !text.includes('dev-gerente-local'));
  for (const sheetDef of exportFor(TENANT_GEODEMO_ID).sheets) assert.ok(sheetDef.name.length <= 31);
});

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.error ? `\n    ${r.error}` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} pruebas de exportación OK`);
process.exit(failed ? 1 : 0);

// Descarga del Excel en el navegador. La librería se carga solo al exportar (no pesa en la carga inicial).

import { toWorkbookSheets, type TenantExport } from './tenantExport';

export async function downloadTenantExport(result: TenantExport): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(toWorkbookSheets(result)).toFile(result.fileName);
}

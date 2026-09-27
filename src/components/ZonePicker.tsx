import { useMemo, useState } from 'react';
import { COUNTRIES, type CountryCode } from '../data/countries';
import { groupZonesForSelect, regionsOf, type ZoneInfo } from '../lib/zones';
import { inputClass, labelClass } from '../lib/styles';

interface ZonePickerProps<T extends ZoneInfo> {
  /** id del selector de zona; el de región usa `${id}-region` */
  id: string;
  /** Zonas del país del lead */
  zones: T[];
  countryCode: CountryCode;
  value: string;
  onChange: (zoneId: string) => void;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  errorClassName?: string;
}

// Región primero y después la zona. La región es un filtro: sin elegirla, la lista de zonas trae
// todas, agrupadas por región, así el campo de zona sirve siempre por sí solo.
export function ZonePicker<T extends ZoneInfo>({
  id,
  zones,
  countryCode,
  value,
  onChange,
  required = false,
  invalid = false,
  describedBy,
  errorClassName = '',
}: ZonePickerProps<T>) {
  const country = COUNTRIES[countryCode];
  const regiones = useMemo(() => regionsOf(zones), [zones]);
  const regionDeLaZona = zones.find((z) => z.territoryId === value)?.regionCode ?? '';
  const [regionElegida, setRegionElegida] = useState(regionDeLaZona);
  // Si la zona cambia desde fuera (otro país, otra zona), manda su región
  const region = regionDeLaZona || (regiones.some((r) => r.code === regionElegida) ? regionElegida : '');
  const grupos = useMemo(() => groupZonesForSelect(zones, region || undefined), [zones, region]);
  const unSoloGrupo = grupos.length === 1;

  return (
    <div className="space-y-2">
      {regiones.length > 1 && (
        <div>
          <label htmlFor={`${id}-region`} className={labelClass}>
            {country.regionLabel.singular}
          </label>
          <select
            id={`${id}-region`}
            value={region}
            onChange={(e) => {
              setRegionElegida(e.target.value);
              const zona = zones.find((z) => z.territoryId === value);
              if (zona && e.target.value && zona.regionCode !== e.target.value) onChange('');
            }}
            className={inputClass}
          >
            <option value="">Todas ({regiones.length} {country.regionLabel.plural.toLowerCase()})</option>
            {regiones.map((r) => (
              <option key={r.code || 'otras'} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor={id} className={labelClass}>
          {country.zoneLabel.singular}
          {required ? ' *' : ''}
        </label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`${inputClass} ${invalid ? errorClassName : ''}`}
        >
          <option value="">Selecciona…</option>
          {unSoloGrupo
            ? grupos[0].zones.map((z) => (
                <option key={z.territoryId} value={z.territoryId}>
                  {z.territoryName}
                </option>
              ))
            : grupos.map((grupo) => (
                <optgroup key={grupo.label} label={grupo.label}>
                  {grupo.zones.map((z) => (
                    <option key={z.territoryId} value={z.territoryId}>
                      {z.territoryName}
                    </option>
                  ))}
                </optgroup>
              ))}
        </select>
      </div>
    </div>
  );
}

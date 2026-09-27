import React, { useState } from 'react';
import type { CatalogItem, Lead } from '../types/crm';
import { MapPin, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { COUNTRIES } from '../data/countries';
import { formatLeadMoney } from '../lib/currency';
import { useMoney } from '../lib/money';
import { STATUS_LABEL } from '../lib/stages';
import { CountryFlag } from './CountryFlag';
import { ManualValueTag } from './ui';
import { isManualValue } from '../lib/catalog';
import { extraContactsCount, leadSubtitle, leadTitle } from '../lib/contacts';

interface LeadsTableProps {
  leads: Lead[];
  onSelectLead?: (lead: Lead) => void;
  showCountry?: boolean; // plan Internacional: columna País
  catalog?: CatalogItem[];
}

export const LeadsTable: React.FC<LeadsTableProps> = ({ leads, showCountry = false, catalog = [] }) => {
  const money = useMoney();
  const itemsText = (lead: Lead) =>
    (lead.items ?? [])
      .map((line) => `${catalog.find((i) => i.id === line.itemId)?.name ?? 'Ítem'} ×${line.quantity}`)
      .join(', ');
  const [isExpanded, setIsExpanded] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredLeads = filterStatus === 'all'
    ? leads
    : leads.filter((l) => l.commercialStatus === filterStatus);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'won':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'pending_payment':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'proposal':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'qualified':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'contacted':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-600';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/90 shadow-2xl backdrop-blur-md overflow-hidden">
      {/* Table Header / Toggle Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <div className="flex items-center space-x-3">
          <h3 className="text-[15px] font-bold text-white">
            Registro Operacional de Leads
          </h3>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-sm font-semibold text-slate-300">
            {leads.length} leads
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1 text-sm text-slate-300 focus:outline-none"
          >
            <option value="all">Todos los estados</option>
            <option value="new">Nuevos</option>
            <option value="contacted">Toma de Contacto</option>
            <option value="qualified">Calificados</option>
            <option value="proposal">Propuestas</option>
            <option value="pending_payment">Pendientes de Pago</option>
            <option value="won">Cerrados (Ganados)</option>
            <option value="lost">Perdidos</option>
          </select>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-1 text-sm font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
          >
            <span>{isExpanded ? 'Contraer' : 'Expandir Tabla'}</span>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Table Body */}
      {isExpanded && (
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-950/40 text-[13px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-3">Nombre / Contacto</th>
                {showCountry && <th className="px-6 py-3">País</th>}
                <th className="px-6 py-3">Dirección Registrada</th>
                <th className="px-6 py-3">Estado Comercial</th>
                <th className="px-6 py-3">Geocodificación PostGIS</th>
                <th className="px-6 py-3 text-right">Valor Estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/70">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-800/30 transition">
                  <td className="px-6 py-3">
                    <div className="font-semibold text-slate-200">{leadTitle(lead)}</div>
                    {leadSubtitle(lead) && <div className="text-[13px] text-slate-400">{leadSubtitle(lead)}</div>}
                    {extraContactsCount(lead) > 0 && (
                      <div className="text-[13px] font-semibold text-indigo-300">
                        +{extraContactsCount(lead)} {extraContactsCount(lead) === 1 ? 'contacto' : 'contactos'}
                      </div>
                    )}
                    <div className="text-[13px] text-slate-400">{lead.email || lead.phone || 'Sin contacto'}</div>
                  </td>
                  {showCountry && (
                    <td className="px-6 py-3 whitespace-nowrap text-slate-300">
                      <span className="inline-flex items-center gap-2">
                        <CountryFlag code={lead.countryCode} />
                        {COUNTRIES[lead.countryCode].name}
                      </span>
                    </td>
                  )}
                  <td className="px-6 py-3 text-slate-300 max-w-xs truncate">
                    <div className="flex items-center space-x-1.5">
                      <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="truncate">{lead.rawAddress}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase ${getStatusBadge(lead.commercialStatus)}`}>
                      {STATUS_LABEL[lead.commercialStatus]}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {lead.geocodingStatus === 'success' ? (
                      <span className="inline-flex items-center space-x-1 text-emerald-400 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>En su {COUNTRIES[lead.countryCode].zoneLabel.singular.toLowerCase()}</span>
                      </span>
                    ) : lead.geocodingStatus === 'pending' ? (
                      <span className="inline-flex items-center space-x-1 text-amber-400 font-medium">
                        <Clock className="h-4 w-4" />
                        <span>Sin {COUNTRIES[lead.countryCode].zoneLabel.singular.toLowerCase()}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-rose-400 font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Sin {COUNTRIES[lead.countryCode].zoneLabel.singular.toLowerCase()}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="whitespace-nowrap font-bold text-slate-100">
                      {money.fmtLead(lead)}
                      {money.isForeign(lead) && (
                        <div className="text-[13px] font-normal text-slate-400">negociado en {formatLeadMoney(lead)}</div>
                      )}
                      {isManualValue(lead) && <ManualValueTag />}
                    </div>
                    {(lead.items?.length ?? 0) > 0 && (
                      <div className="text-[13px] text-slate-400" title={itemsText(lead)}>
                        {lead.items!.length} {lead.items!.length === 1 ? 'ítem' : 'ítems'}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

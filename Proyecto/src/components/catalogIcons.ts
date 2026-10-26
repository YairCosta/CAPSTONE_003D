import { Package, Wrench } from 'lucide-react';
import type { CatalogItemType } from '../types/crm';

export const TYPE_ICON: Record<CatalogItemType, typeof Package> = { product: Package, service: Wrench };

export type GridConfig = {
  id: string;
  name: string;
  description: string;
  preview: { cols: number; rows: number; size: '1x1' | '2x2' | 'passport' }[];
  price: number;
  popular?: boolean;
};

export const TILE_DIMENSIONS = {
  '1x1': { width: 300, height: 300 },
  '2x2': { width: 600, height: 600 },
  passport: { width: 413, height: 531 },
} as const;

export type GeneratedImage = {
  key: string;
  mimeType: string;
  data: string;
};

// Prices are in PHP and are the single source of truth for both frontend and backend.
export const gridConfigs: GridConfig[] = [
  {
    id: 'solo-a',
    name: 'SOLO A',
    description: '6x Passport Photos (35x45mm)',
    preview: [
      ...Array(6).fill({ cols: 1, rows: 1, size: 'passport' as const }),
    ],
    price: 80,
  },
  {
    id: 'solo-b',
    name: 'SOLO B',
    description: '6x 2x2 Photos',
    preview: [
      ...Array(6).fill({ cols: 2, rows: 2, size: '2x2' as const }),
    ],
    price: 80,
  },
  {
    id: 'combo-c',
    name: 'COMBO C',
    description: '4x 2x2 + 8x 1x1 Photos',
    preview: [
      ...Array(4).fill({ cols: 2, rows: 2, size: '2x2' as const }),
      ...Array(8).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 90,
    popular: true,
  },
  {
    id: 'combo-d',
    name: 'COMBO D',
    description: '2x 2x2 + 16x 1x1 Photos',
    preview: [
      ...Array(2).fill({ cols: 2, rows: 2, size: '2x2' as const }),
      ...Array(16).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 100,
  },
  {
    id: 'solo-c',
    name: 'SOLO C',
    description: '24x 1x1 Photos',
    preview: [
      ...Array(24).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 100,
  },
];

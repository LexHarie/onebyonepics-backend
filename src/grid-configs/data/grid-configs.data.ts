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

export const gridConfigs: GridConfig[] = [
  {
    id: 'passport-plus',
    name: 'Passport Plus',
    description: '6x Passport + 4x 1x1 photos',
    preview: [
      ...Array(6).fill({ cols: 1, rows: 1, size: 'passport' as const }),
      ...Array(4).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 7.99,
  },
  {
    id: '6x-passport',
    name: '6x Passport',
    description: 'Maximum passport photos (35x45mm)',
    preview: [
      ...Array(6).fill({ cols: 1, rows: 1, size: 'passport' as const }),
    ],
    price: 7.99,
    popular: true,
  },
  {
    id: 'complete-pack',
    name: 'Complete Pack',
    description: '4x Passport + 1x 2x2 + 4x 1x1',
    preview: [
      ...Array(4).fill({ cols: 1, rows: 1, size: 'passport' as const }),
      { cols: 2, rows: 2, size: '2x2' as const },
      ...Array(4).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 7.99,
  },
  {
    id: 'visa-application-pack',
    name: 'Visa Application Pack',
    description: '4x Passport + 8x 1x1 for applications',
    preview: [
      ...Array(4).fill({ cols: 1, rows: 1, size: 'passport' as const }),
      ...Array(8).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 7.99,
  },
  {
    id: 'passport-standard',
    name: 'Passport Standard',
    description: '4x Passport + 4x 1x1 photos',
    preview: [
      ...Array(4).fill({ cols: 1, rows: 1, size: 'passport' as const }),
      ...Array(4).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 7.99,
  },
  {
    id: '4x-passport',
    name: '4x Passport',
    description: 'Four passport photos',
    preview: [
      { cols: 1, rows: 1, size: 'passport' },
      { cols: 1, rows: 1, size: 'passport' },
      { cols: 1, rows: 1, size: 'passport' },
      { cols: 1, rows: 1, size: 'passport' },
    ],
    price: 4.99,
  },
  {
    id: 'mixed-pack',
    name: 'Mixed Pack',
    description: '2x Passport + 2x 2x2 + 2x 1x1',
    preview: [
      ...Array(2).fill({ cols: 1, rows: 1, size: 'passport' as const }),
      ...Array(2).fill({ cols: 2, rows: 2, size: '2x2' as const }),
      ...Array(2).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 7.99,
  },
  {
    id: 'passport-row-plus-1x1',
    name: 'Passport Row + 1x1',
    description: '2x Passport + 16x 1x1',
    preview: [
      ...Array(2).fill({ cols: 1, rows: 1, size: 'passport' as const }),
      ...Array(16).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 9.99,
  },
  {
    id: 'passport-lite',
    name: 'Passport Lite',
    description: '2x Passport + 4x 1x1 photos',
    preview: [
      ...Array(2).fill({ cols: 1, rows: 1, size: 'passport' as const }),
      ...Array(4).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 4.99,
  },
  {
    id: 'application-basic',
    name: 'Application Basic',
    description: '2x Passport + 2x 1x1',
    preview: [
      { cols: 1, rows: 1, size: '1x1' },
      { cols: 1, rows: 1, size: '1x1' },
      { cols: 1, rows: 1, size: 'passport' },
      { cols: 1, rows: 1, size: 'passport' },
    ],
    price: 4.99,
  },
  {
    id: '2x-passport',
    name: '2x Passport',
    description: 'Two passport photos',
    preview: [
      { cols: 1, rows: 1, size: 'passport' },
      { cols: 1, rows: 1, size: 'passport' },
    ],
    price: 4.99,
  },
  {
    id: '6x-2x2',
    name: '6x 2x2',
    description: 'Maximum 2x2 photos - fills entire 4R',
    preview: [
      ...Array(6).fill({ cols: 2, rows: 2, size: '2x2' as const }),
    ],
    price: 9.99,
  },
  {
    id: 'combo-d',
    name: 'Combo D',
    description: '4x 2x2 + 8x 1x1 photos',
    preview: [
      ...Array(4).fill({ cols: 2, rows: 2, size: '2x2' as const }),
      ...Array(8).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 9.99,
  },
  {
    id: '4x-2x2',
    name: '4x 2x2',
    description: 'Four large format photos',
    preview: [
      { cols: 2, rows: 2, size: '2x2' },
      { cols: 2, rows: 2, size: '2x2' },
      { cols: 2, rows: 2, size: '2x2' },
      { cols: 2, rows: 2, size: '2x2' },
    ],
    price: 7.99,
  },
  {
    id: 'top-2x2-plus-1x1-fill',
    name: 'Top 2x2 + 1x1 Fill',
    description: '2x 2x2 + 16x 1x1',
    preview: [
      ...Array(2).fill({ cols: 2, rows: 2, size: '2x2' as const }),
      ...Array(16).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 9.99,
  },
  {
    id: 'combo-b',
    name: 'Combo B',
    description: '2x 2x2 + 8x 1x1 photos',
    preview: [
      ...Array(2).fill({ cols: 2, rows: 2, size: '2x2' as const }),
      ...Array(8).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 7.99,
  },
  {
    id: 'combo-a',
    name: 'Combo A',
    description: '2x 2x2 + 4x 1x1 photos',
    preview: [
      ...Array(2).fill({ cols: 2, rows: 2, size: '2x2' as const }),
      ...Array(4).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 7.99,
    popular: true,
  },
  {
    id: '2x-2x2',
    name: '2x 2x2',
    description: 'Two large format photos',
    preview: [
      { cols: 2, rows: 2, size: '2x2' },
      { cols: 2, rows: 2, size: '2x2' },
    ],
    price: 4.99,
  },
  {
    id: 'combo-c',
    name: 'Combo C',
    description: '1x 2x2 + 8x 1x1 photos',
    preview: [
      { cols: 2, rows: 2, size: '2x2' as const },
      ...Array(8).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 7.99,
  },
  {
    id: 'portrait-plus-id',
    name: 'Portrait + ID',
    description: '1x 2x2 + 4x 1x1 photos',
    preview: [
      { cols: 2, rows: 2, size: '2x2' as const },
      ...Array(4).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 4.99,
  },
  {
    id: '24x-1x1',
    name: '24x 1x1',
    description: 'Maximum 1x1 photos - fills entire 4R',
    preview: [
      ...Array(24).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 9.99,
    popular: true,
  },
  {
    id: '16x-1x1',
    name: '16x 1x1',
    description: 'Popular ID photo count',
    preview: [
      ...Array(16).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 7.99,
  },
  {
    id: '12x-1x1',
    name: '12x 1x1',
    description: 'Dozen ID photos',
    preview: [
      ...Array(12).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 7.99,
  },
  {
    id: '8x-1x1',
    name: '8x 1x1',
    description: 'Basic ID photo pack',
    preview: [
      ...Array(8).fill({ cols: 1, rows: 1, size: '1x1' as const }),
    ],
    price: 4.99,
    popular: true,
  },
  {
    id: '4x-1x1',
    name: '4x 1x1',
    description: 'Minimal ID photo pack',
    preview: [
      { cols: 1, rows: 1, size: '1x1' },
      { cols: 1, rows: 1, size: '1x1' },
      { cols: 1, rows: 1, size: '1x1' },
      { cols: 1, rows: 1, size: '1x1' },
    ],
    price: 4.99,
  },
];

export interface OrderItem {
  id: string;
  orderId: string;
  gridConfigId: string;
  generationJobId: string | null;
  tileAssignments: Record<number, number>;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  composedImageKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  grid_config_id: string;
  generation_job_id: string | null;
  tile_assignments: Record<number, number>;
  quantity: number;
  unit_price: number;
  line_total: number;
  composed_image_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export function rowToOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    gridConfigId: row.grid_config_id,
    generationJobId: row.generation_job_id,
    tileAssignments: row.tile_assignments,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    lineTotal: row.line_total,
    composedImageKey: row.composed_image_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

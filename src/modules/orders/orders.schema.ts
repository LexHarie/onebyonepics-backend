import { t } from 'elysia';

const tileAssignments = t.Record(t.String(), t.Number());

export const ordersSchema = {
  params: t.Object({
    id: t.String(),
  }),
  orderNumberParams: t.Object({
    orderNumber: t.String(),
  }),
  query: t.Object({
    sessionId: t.Optional(t.String()),
    itemId: t.Optional(t.String()),
  }),
  create: t.Object({
    customerName: t.String(),
    customerEmail: t.String(),
    customerPhone: t.String(),
    streetAddress: t.String(),
    barangay: t.String(),
    city: t.String(),
    province: t.String(),
    postalCode: t.String(),
    deliveryZone: t.Union([
      t.Literal('cebu-city'),
      t.Literal('outside-cebu'),
      t.Literal('digital-only'),
    ]),
    gridConfigId: t.Optional(t.String()),
    generationJobId: t.Optional(t.String()),
    tileAssignments: t.Optional(tileAssignments),
    items: t.Optional(
      t.Array(
        t.Object({
          gridConfigId: t.String(),
          generationJobId: t.String(),
          tileAssignments,
          quantity: t.Number({ minimum: 1 }),
        }),
      ),
    ),
    isDigitalOnly: t.Optional(t.Boolean()),
    sessionId: t.Optional(t.String()),
  }),
  guestLookup: t.Object({
    orderNumber: t.String(),
    customerEmail: t.String(),
  }),
};

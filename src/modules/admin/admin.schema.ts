import { t } from 'elysia';

const orderStatus = t.Union([
  t.Literal('pending'),
  t.Literal('processing'),
  t.Literal('shipped'),
  t.Literal('delivered'),
  t.Literal('cancelled'),
]);

const paymentStatus = t.Union([
  t.Literal('pending'),
  t.Literal('paid'),
  t.Literal('failed'),
  t.Literal('refunded'),
]);

const generationStatus = t.Union([
  t.Literal('pending'),
  t.Literal('processing'),
  t.Literal('completed'),
  t.Literal('failed'),
]);

const pagination = {
  page: t.Optional(t.Number({ minimum: 1 })),
  pageSize: t.Optional(t.Number({ minimum: 1 })),
};

export const adminSchema = {
  idParams: t.Object({
    id: t.String(),
  }),
  orderQuery: t.Object({
    search: t.Optional(t.String()),
    status: t.Optional(orderStatus),
    paymentStatus: t.Optional(paymentStatus),
    dateFrom: t.Optional(t.String()),
    dateTo: t.Optional(t.String()),
    ...pagination,
  }),
  usersQuery: t.Object({
    search: t.Optional(t.String()),
    ...pagination,
  }),
  generationQuery: t.Object({
    status: t.Optional(generationStatus),
    dateFrom: t.Optional(t.String()),
    dateTo: t.Optional(t.String()),
    ...pagination,
  }),
  analyticsRevenueQuery: t.Object({
    period: t.Optional(t.String()),
    range: t.Optional(t.Number({ minimum: 1 })),
  }),
  auditLogsQuery: t.Object({
    ...pagination,
  }),
  webhooksQuery: t.Object({
    limit: t.Optional(t.Number({ minimum: 1 })),
  }),
  updateOrderStatus: t.Object({
    status: orderStatus,
  }),
  updatePaymentStatus: t.Object({
    status: paymentStatus,
    mayaPaymentId: t.Optional(t.String()),
  }),
  bulkDownload: t.Object({
    orderIds: t.Array(t.String({ format: 'uuid' }), { minItems: 1 }),
  }),
  verifyPayment: t.Object({
    force: t.Optional(t.Boolean()),
  }),
};

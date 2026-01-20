import { Elysia } from 'elysia';
import { getAuthSession } from '../../lib/auth-session';
import { OrdersService } from './orders.service';
import { createOrdersRepository } from './orders.repository';
import { ordersSchema } from './orders.schema';
import { PayMongoService } from '../payments/paymongo.service';
import { gridConfigs } from '../grid-configs/domain/data/grid-configs.data';
import { StorageService } from '../storage/storage.service';
import { CompositionService } from '../composition/composition.service';
import { generationService } from '../generation';
import { authContextPlugin } from '../../plugins/auth.plugin';
import { AppLogger } from '../../lib/logger';

export const ordersService = new OrdersService(
  createOrdersRepository(),
  new StorageService(),
  generationService,
  new CompositionService(new StorageService()),
);

generationService.setOrdersService(ordersService);

const paymongoService = new PayMongoService();
const logger = new AppLogger('OrdersController');

export const ordersModule = new Elysia({ name: 'orders' })
  .use(authContextPlugin)
  .decorate('orders', ordersService)
  .post(
    '/orders',
    async ({ body, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;

      const order = await ordersService.createOrder(body, user ?? undefined, body.sessionId);

      // For COD orders, skip payment gateway and return success immediately
      if (body.paymentMethod === 'cod') {
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus,
          paymentMethod: 'cod' as const,
          checkoutUrl: null,
        };
      }

      const orderItems = body.items?.length
        ? body.items
        : body.gridConfigId
          ? [{ gridConfigId: body.gridConfigId }]
          : [];

      let gridConfigName = 'Order';
      if (orderItems.length === 1) {
        const gridConfig = gridConfigs.find(
          (cfg) => cfg.id === orderItems[0].gridConfigId,
        );
        gridConfigName = gridConfig?.name || orderItems[0].gridConfigId;
      } else if (orderItems.length > 1) {
        gridConfigName = `${orderItems.length} items`;
      }

      if (!paymongoService.isConfigured()) {
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paymentMethod: 'online' as const,
          checkoutUrl: null,
          message: 'Payment gateway not configured. Please contact support.',
        };
      }

      try {
        const checkout = await paymongoService.createCheckoutSession({
          orderNumber: order.orderNumber,
          orderId: order.id,
          amount: order.totalAmount,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          gridConfigName,
        });

        await ordersService.setPayMongoCheckoutId(order.id, checkout.checkoutSessionId);

        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paymentMethod: 'online' as const,
          checkoutUrl: checkout.checkoutUrl,
        };
      } catch (error) {
        logger.error('PayMongo checkout creation failed', error);
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paymentMethod: 'online' as const,
          checkoutUrl: null,
          error: 'Failed to create payment session. Please try again.',
        };
      }
    },
    {
      body: ordersSchema.create,
    },
  )
  .post(
    '/orders/guest-lookup',
    async ({ body }) => {
      const order = await ordersService.guestLookup(
        body.orderNumber,
        body.customerEmail,
      );

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        gridConfigId: order.gridConfigId ?? null,
        deliveryZone: order.deliveryZone,
        productPrice: order.productPrice,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
      };
    },
    {
      body: ordersSchema.guestLookup,
    },
  )
  .get(
    '/orders/number/:orderNumber',
    async ({ params, query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;
      const order = await ordersService.getOrderByNumber(
        params.orderNumber,
        user ?? undefined,
        query.sessionId,
      );

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        gridConfigId: order.gridConfigId,
        deliveryZone: order.deliveryZone,
        productPrice: order.productPrice,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        itemCount: order.itemCount,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        downloadCount: order.downloadCount,
        maxDownloads: order.maxDownloads,
        composedImageKey: order.composedImageKey,
        items: order.items?.map((item) => ({
          id: item.id,
          gridConfigId: item.gridConfigId,
          generationJobId: item.generationJobId,
          tileAssignments: item.tileAssignments,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          composedImageKey: item.composedImageKey,
        })),
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        isDigitalOnly: order.isDigitalOnly,
        paymentMethod: order.paymentMethod,
      };
    },
    {
      params: ordersSchema.orderNumberParams,
      query: ordersSchema.query,
    },
  )
  .get(
    '/orders/by-number/:orderNumber',
    async ({ params, query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;
      const order = await ordersService.getOrderByNumber(
        params.orderNumber,
        user ?? undefined,
        query.sessionId,
      );

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        gridConfigId: order.gridConfigId,
        deliveryZone: order.deliveryZone,
        productPrice: order.productPrice,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        itemCount: order.itemCount,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        downloadCount: order.downloadCount,
        maxDownloads: order.maxDownloads,
        composedImageKey: order.composedImageKey,
        items: order.items?.map((item) => ({
          id: item.id,
          gridConfigId: item.gridConfigId,
          generationJobId: item.generationJobId,
          tileAssignments: item.tileAssignments,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          composedImageKey: item.composedImageKey,
        })),
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        isDigitalOnly: order.isDigitalOnly,
        paymentMethod: order.paymentMethod,
      };
    },
    {
      params: ordersSchema.orderNumberParams,
      query: ordersSchema.query,
    },
  )
  .get(
    '/orders/:id',
    async ({ params, query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;
      const order = await ordersService.getOrder(
        params.id,
        user ?? undefined,
        query.sessionId,
      );

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        gridConfigId: order.gridConfigId,
        deliveryZone: order.deliveryZone,
        productPrice: order.productPrice,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        itemCount: order.itemCount,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        downloadCount: order.downloadCount,
        maxDownloads: order.maxDownloads,
        composedImageKey: order.composedImageKey,
        items: order.items?.map((item) => ({
          id: item.id,
          gridConfigId: item.gridConfigId,
          generationJobId: item.generationJobId,
          tileAssignments: item.tileAssignments,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          composedImageKey: item.composedImageKey,
        })),
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        isDigitalOnly: order.isDigitalOnly,
        paymentMethod: order.paymentMethod,
      };
    },
    {
      params: ordersSchema.params,
      query: ordersSchema.query,
    },
  )
  .get(
    '/orders/:id/items',
    async ({ params, query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;
      const order = await ordersService.getOrder(
        params.id,
        user ?? undefined,
        query.sessionId,
      );
      return order.items ?? [];
    },
    {
      params: ordersSchema.params,
      query: ordersSchema.query,
    },
  )
  .get(
    '/orders/:id/download',
    async ({ params, query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;
      return ordersService.getDownloadUrl(
        params.id,
        user ?? undefined,
        query.sessionId,
        query.itemId,
      );
    },
    {
      params: ordersSchema.params,
      query: ordersSchema.query,
    },
  )
  .get(
    '/orders',
    async ({ query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;
      const orders = await ordersService.getOrders(
        user ?? undefined,
        query.sessionId,
      );

      return orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        gridConfigId: order.gridConfigId,
        totalAmount: order.totalAmount,
        itemCount: order.itemCount,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        createdAt: order.createdAt,
        isDigitalOnly: order.isDigitalOnly,
      }));
    },
    {
      query: ordersSchema.query,
    },
  );

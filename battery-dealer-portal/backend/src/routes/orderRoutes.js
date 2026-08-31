const express = require("express");
const database = require("../config/database");
const {
  refreshDealerOrderStatuses,
  syncOrderToSalesforce,
} = require("../services/salesforceSyncService");

const router = express.Router();

function requireLogin(request, response) {
  if (!request.session?.user) {
    response.status(401).json({
      message: "Authentication required.",
    });

    return false;
  }

  return true;
}

router.post("/", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  const { delivery, paymentMethod, items } = request.body;

  if (!delivery || !Array.isArray(items) || items.length === 0) {
    return response.status(400).json({
      message: "Delivery information and order items are required.",
    });
  }

  const requiredFields = [
    "companyName",
    "contactName",
    "phone",
    "address",
    "city",
    "state",
    "pincode",
  ];

  const missingField = requiredFields.some(
    (field) =>
      typeof delivery[field] !== "string" ||
      !delivery[field].trim(),
  );

  if (missingField) {
    return response.status(400).json({
      message: "Please complete all delivery fields.",
    });
  }

  const submittedItems = new Map();

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);

    if (
      !Number.isInteger(productId) ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return response.status(400).json({
        message: "Invalid product or quantity.",
      });
    }

    submittedItems.set(
      productId,
      (submittedItems.get(productId) || 0) + quantity,
    );
  }

  const productIds = [...submittedItems.keys()];
  const placeholders = productIds.map(() => "?").join(", ");

  let connection;

  try {
    connection = await database.getConnection();
    await connection.beginTransaction();

    const [products] = await connection.execute(
      `
        SELECT
          id,
          product_code,
          product_name,
          dealer_price,
          stock_quantity
        FROM products
        WHERE id IN (${placeholders})
          AND status = 'ACTIVE'
        FOR UPDATE
      `,
      productIds,
    );

    if (products.length !== productIds.length) {
      const error = new Error(
        "One or more selected products are unavailable.",
      );

      error.statusCode = 400;
      throw error;
    }

    let subtotal = 0;
    const orderItems = [];

    for (const product of products) {
      const quantity = submittedItems.get(Number(product.id));
      const price = Number(product.dealer_price);

      if (quantity > product.stock_quantity) {
        const error = new Error(
          `${product.product_name} does not have enough stock.`,
        );

        error.statusCode = 400;
        throw error;
      }

      const lineTotal = price * quantity;
      subtotal += lineTotal;

      orderItems.push({
        productId: product.id,
        code: product.product_code,
        name: product.product_name,
        quantity,
        price,
        lineTotal,
      });
    }

    const taxAmount = Number((subtotal * 0.18).toFixed(2));
    const totalAmount = subtotal + taxAmount;

    const databasePaymentMethod =
      paymentMethod === "razorpay"
        ? "RAZORPAY"
        : "CREDIT";

    const orderNumber = `DORD-${Date.now()
      .toString()
      .slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;

    const [orderResult] = await connection.execute(
      `
        INSERT INTO dealer_orders (
          order_number,
          dealer_id,
          dealer_user_id,
          subtotal,
          tax_amount,
          total_amount,
          payment_method,
          payment_status,
          shipping_address
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
      `,
      [
        orderNumber,
        request.session.user.dealerId,
        request.session.user.userId,
        subtotal,
        taxAmount,
        totalAmount,
        databasePaymentMethod,
        JSON.stringify(delivery),
      ],
    );

    for (const item of orderItems) {
      await connection.execute(
        `
          INSERT INTO dealer_order_items (
            order_id,
            product_id,
            product_code,
            product_name,
            quantity,
            unit_price,
            line_total
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          orderResult.insertId,
          item.productId,
          item.code,
          item.name,
          item.quantity,
          item.price,
          item.lineTotal,
        ],
      );

      await connection.execute(
        `
          UPDATE products
          SET stock_quantity = stock_quantity - ?
          WHERE id = ?
        `,
        [item.quantity, item.productId],
      );
    }

    await connection.commit();

    let salesforceSyncStatus = "SYNCED";

    try {
      await syncOrderToSalesforce(orderResult.insertId);
    } catch (salesforceError) {
      salesforceSyncStatus = "PENDING";
      console.error(
        "Salesforce order sync failed:",
        salesforceError.message,
      );
    }

    return response.status(201).json({
      message: "Order created successfully.",
      order: {
        orderNumber,
        subtotal,
        gst: taxAmount,
        total: totalAmount,
        salesforceSyncStatus,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    if (error.statusCode) {
      return response.status(error.statusCode).json({
        message: error.message,
      });
    }

    next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.get("/", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  try {
    try {
      await refreshDealerOrderStatuses(
        request.session.user.dealerId,
      );
    } catch (salesforceError) {
      console.error(
        "Salesforce order status refresh failed:",
        salesforceError.message,
      );
    }

    const [orders] = await database.execute(
      `
        SELECT
          id,
          order_number,
          status,
          subtotal,
          tax_amount,
          total_amount,
          payment_status,
          shipping_address,
          created_at
        FROM dealer_orders
        WHERE dealer_id = ?
        ORDER BY created_at DESC
      `,
      [request.session.user.dealerId],
    );

    if (orders.length === 0) {
      return response.status(200).json({
        orders: [],
      });
    }

    const orderIds = orders.map((order) => order.id);
    const placeholders = orderIds.map(() => "?").join(", ");

    const [items] = await database.execute(
      `
        SELECT
          order_item.order_id,
          order_item.product_id AS id,
          order_item.product_code AS code,
          order_item.product_name AS name,
          order_item.quantity,
          order_item.unit_price AS price,
          product.image_url AS image
        FROM dealer_order_items AS order_item
        INNER JOIN products AS product
          ON product.id = order_item.product_id
        WHERE order_item.order_id IN (${placeholders})
        ORDER BY order_item.id
      `,
      orderIds,
    );

    const statusLabels = {
      PENDING: "Order Placed",
      CONFIRMED: "Confirmed",
      PROCESSING: "Processing",
      SHIPPED: "Shipped",
      DELIVERED: "Delivered",
      CANCELLED: "Cancelled",
    };

    const paymentLabels = {
      PENDING: "Pending",
      PAID: "Paid",
      FAILED: "Failed",
      REFUNDED: "Refunded",
    };

    const formattedOrders = orders.map((order) => {
      let dealer = {};

      try {
        dealer = JSON.parse(order.shipping_address);
      } catch {
        dealer = {};
      }

      return {
        orderNumber: order.order_number,
        orderDate: new Date(order.created_at).toLocaleDateString(
          "en-IN",
        ),
        dealer,
        items: items
          .filter(
            (item) =>
              Number(item.order_id) === Number(order.id),
          )
          .map((item) => ({
            ...item,
            price: Number(item.price),
          })),
        subtotal: Number(order.subtotal),
        gst: Number(order.tax_amount),
        total: Number(order.total_amount),
        paymentStatus:
          paymentLabels[order.payment_status] ||
          order.payment_status,
        orderStatus:
          statusLabels[order.status] || order.status,
      };
    });

    return response.status(200).json({
      orders: formattedOrders,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

const express = require("express");
const database = require("../config/database");
const {
  refreshDealerOrderStatuses,
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

function getOrderStatusLabel(status) {
  const labels = {
    PENDING: "Order Placed",
    CONFIRMED: "Confirmed",
    PROCESSING: "Processing",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
  };

  return labels[status] || status;
}

function getPaymentStatusLabel(status) {
  const labels = {
    PENDING: "Pending",
    PAID: "Paid",
    FAILED: "Failed",
    REFUNDED: "Refunded",
  };

  return labels[status] || status;
}

router.get("/", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  try {
    const dealerId = request.session.user.dealerId;

    try {
      await refreshDealerOrderStatuses(dealerId);
    } catch (salesforceError) {
      console.error(
        "Salesforce dashboard order refresh failed:",
        salesforceError.message,
      );
    }

    const [[stock]] = await database.execute(`
      SELECT COALESCE(SUM(stock_quantity), 0) AS available
      FROM products
      WHERE status = 'ACTIVE'
    `);
    const [[orderSummary]] = await database.execute(
      `
        SELECT
          SUM(
            CASE
              WHEN status IN (
                'PENDING',
                'CONFIRMED',
                'PROCESSING',
                'SHIPPED'
              ) THEN 1
              ELSE 0
            END
          ) AS pending_orders,
          SUM(
            CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END
          ) AS completed_orders,
          COALESCE(
            SUM(
              CASE
                WHEN payment_status = 'PENDING'
                  THEN total_amount
                ELSE 0
              END
            ),
            0
          ) AS outstanding_payment
        FROM dealer_orders
        WHERE dealer_id = ?
      `,
      [dealerId],
    );
    const [[serviceSummary]] = await database.execute(
      `
        SELECT COUNT(*) AS open_requests
        FROM service_requests
        WHERE dealer_id = ?
          AND status NOT IN ('RESOLVED', 'CLOSED')
      `,
      [dealerId],
    );
    const [recentOrders] = await database.execute(
      `
        SELECT
          order_number,
          created_at,
          total_amount,
          payment_status,
          status
        FROM dealer_orders
        WHERE dealer_id = ?
        ORDER BY created_at DESC
        LIMIT 5
      `,
      [dealerId],
    );

    const sessionUser = request.session.user;
    const displayName = [
      sessionUser.firstName,
      sessionUser.lastName,
    ]
      .filter(Boolean)
      .join(" ");

    return response.status(200).json({
      dealer: {
        dealerCode: sessionUser.dealerCode,
        companyName: sessionUser.companyName,
        displayName: displayName || sessionUser.companyName,
      },
      summary: {
        availableBatteries: Number(stock.available || 0),
        pendingOrders: Number(orderSummary.pending_orders || 0),
        completedOrders: Number(
          orderSummary.completed_orders || 0,
        ),
        outstandingPayment: Number(
          orderSummary.outstanding_payment || 0,
        ),
        openServiceRequests: Number(
          serviceSummary.open_requests || 0,
        ),
      },
      recentOrders: recentOrders.map((order) => ({
        orderNumber: order.order_number,
        orderDate: new Date(order.created_at).toLocaleDateString(
          "en-IN",
          {
            day: "2-digit",
            month: "short",
            year: "numeric",
          },
        ),
        amount: Number(order.total_amount),
        paymentStatus: getPaymentStatusLabel(
          order.payment_status,
        ),
        orderStatus: getOrderStatusLabel(order.status),
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

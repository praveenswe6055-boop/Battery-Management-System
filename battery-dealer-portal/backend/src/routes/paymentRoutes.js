const express = require("express");
const Razorpay = require("razorpay");
const {
  validatePaymentVerification,
} = require("razorpay/dist/utils/razorpay-utils");
const database = require("../config/database");
const {
  syncPaymentTransaction,
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

function getRazorpayClient() {
  if (
    !process.env.RAZORPAY_KEY_ID ||
    !process.env.RAZORPAY_KEY_SECRET
  ) {
    const error = new Error(
      "Razorpay Test Mode credentials are not configured.",
    );

    error.statusCode = 503;
    throw error;
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

function sendKnownError(error, response, next) {
  const providerMessage =
    error.error?.description ||
    error.description ||
    error.message ||
    "Payment provider request failed.";

  if (error.statusCode) {
    return response.status(error.statusCode).json({
      message: providerMessage,
    });
  }

  if (error.error?.description || error.description) {
    return response.status(502).json({
      message: providerMessage,
    });
  }

  return next(error);
}

router.get("/", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  try {
    const [orders] = await database.execute(
      `
        SELECT
          dealer_order.order_number,
          dealer_order.total_amount,
          dealer_order.payment_status,
          dealer_order.payment_method,
          dealer_order.created_at,
          (
            SELECT payment.paid_at
            FROM payment_transactions AS payment
            WHERE payment.order_id = dealer_order.id
              AND payment.status = 'CAPTURED'
            ORDER BY payment.id DESC
            LIMIT 1
          ) AS paid_at
        FROM dealer_orders AS dealer_order
        WHERE dealer_order.dealer_id = ?
        ORDER BY dealer_order.created_at DESC
      `,
      [request.session.user.dealerId],
    );

    const paymentLabels = {
      PENDING: "Pending",
      PAID: "Paid",
      FAILED: "Failed",
      REFUNDED: "Refunded",
    };

    const methodLabels = {
      RAZORPAY: "Razorpay",
      BANK_TRANSFER: "Bank Transfer",
      CREDIT: "Dealer Credit",
    };

    return response.status(200).json({
      orders: orders.map((order) => ({
        orderNumber: order.order_number,
        orderDate: new Date(
          order.created_at,
        ).toLocaleDateString("en-IN"),
        total: Number(order.total_amount),
        paymentStatus:
          paymentLabels[order.payment_status] ||
          order.payment_status,
        paymentMethod:
          methodLabels[order.payment_method] ||
          order.payment_method,
        paidDate: order.paid_at
          ? new Date(order.paid_at).toLocaleDateString("en-IN")
          : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/create-order", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  try {
    const orderNumber = String(
      request.body.orderNumber || "",
    ).trim();

    if (!orderNumber) {
      return response.status(400).json({
        message: "Order number is required.",
      });
    }

    const [orders] = await database.execute(
      `
        SELECT id, order_number, total_amount, payment_status
        FROM dealer_orders
        WHERE order_number = ?
          AND dealer_id = ?
        LIMIT 1
      `,
      [orderNumber, request.session.user.dealerId],
    );

    if (orders.length === 0) {
      return response.status(404).json({
        message: "Order not found.",
      });
    }

    const portalOrder = orders[0];

    if (portalOrder.payment_status === "PAID") {
      return response.status(400).json({
        message: "This order is already paid.",
      });
    }

    const amountInPaise = Math.round(
      Number(portalOrder.total_amount) * 100,
    );

    const razorpay = getRazorpayClient();
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `${portalOrder.order_number}-${Date.now()
        .toString()
        .slice(-6)}`,
      notes: {
        portalOrderNumber: portalOrder.order_number,
        dealerId: String(request.session.user.dealerId),
      },
    });

    const razorpayOrderId = razorpayOrder.id;

    const [paymentResult] = await database.execute(
      `
        INSERT INTO payment_transactions (
          order_id,
          provider,
          amount,
          currency,
          status,
          razorpay_order_id
        )
        VALUES (?, 'RAZORPAY', ?, 'INR', 'CREATED', ?)
      `,
      [portalOrder.id, portalOrder.total_amount, razorpayOrderId],
    );

    let salesforceSyncStatus = "SYNCED";

    try {
      await syncPaymentTransaction(paymentResult.insertId);
    } catch (salesforceError) {
      salesforceSyncStatus = "PENDING";
      console.error(
        "Salesforce payment sync failed:",
        salesforceError.message,
      );
    }

    return response.status(200).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId,
      amount: amountInPaise,
      currency: "INR",
      orderNumber: portalOrder.order_number,
      salesforceSyncStatus,
      companyName: "VoltCore Batteries",
      description: `Payment for ${portalOrder.order_number}`,
      customer: {
        name: [
          request.session.user.firstName,
          request.session.user.lastName,
        ]
          .filter(Boolean)
          .join(" "),
        email: request.session.user.email,
      },
    });
  } catch (error) {
    sendKnownError(error, response, next);
  }
});

router.post("/verify", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  const {
    orderNumber,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  } = request.body;

  if (
    !orderNumber ||
    !razorpayOrderId ||
    !razorpayPaymentId ||
    !razorpaySignature
  ) {
    return response.status(400).json({
      message: "Complete Razorpay payment details are required.",
    });
  }

  let connection;

  try {
    const [records] = await database.execute(
      `
        SELECT
          dealer_order.id AS order_id,
          dealer_order.total_amount,
          dealer_order.payment_status,
          payment.id AS transaction_id
        FROM dealer_orders AS dealer_order
        INNER JOIN payment_transactions AS payment
          ON payment.order_id = dealer_order.id
        WHERE dealer_order.order_number = ?
          AND dealer_order.dealer_id = ?
          AND payment.razorpay_order_id = ?
        ORDER BY payment.id DESC
        LIMIT 1
      `,
      [
        orderNumber,
        request.session.user.dealerId,
        razorpayOrderId,
      ],
    );

    if (records.length === 0) {
      return response.status(404).json({
        message: "Payment transaction not found.",
      });
    }

    const record = records[0];

    if (record.payment_status === "PAID") {
      return response.status(200).json({
        message: "Payment was already verified.",
      });
    }

    const signatureIsValid = validatePaymentVerification(
      {
        order_id: razorpayOrderId,
        payment_id: razorpayPaymentId,
      },
      razorpaySignature,
      process.env.RAZORPAY_KEY_SECRET,
    );

    if (!signatureIsValid) {
      return response.status(400).json({
        message: "Razorpay signature verification failed.",
      });
    }

    const razorpay = getRazorpayClient();
    const expectedAmount = Math.round(
      Number(record.total_amount) * 100,
    );

    let payment = await razorpay.payments.fetch(
      razorpayPaymentId,
    );

    if (
      payment.order_id !== razorpayOrderId ||
      Number(payment.amount) !== expectedAmount ||
      payment.currency !== "INR"
    ) {
      return response.status(400).json({
        message: "Razorpay payment details do not match the order.",
      });
    }

    if (payment.status === "authorized") {
      payment = await razorpay.payments.capture(
        razorpayPaymentId,
        expectedAmount,
        "INR",
      );
    }

    if (payment.status !== "captured") {
      return response.status(400).json({
        message: "The Razorpay payment has not been captured.",
      });
    }

    connection = await database.getConnection();
    await connection.beginTransaction();

    await connection.execute(
      `
        UPDATE payment_transactions
        SET
          razorpay_payment_id = ?,
          razorpay_signature = ?,
          status = 'CAPTURED',
          paid_at = CURRENT_TIMESTAMP,
          failure_reason = NULL
        WHERE id = ?
      `,
      [
        razorpayPaymentId,
        razorpaySignature,
        record.transaction_id,
      ],
    );

    await connection.execute(
      `
        UPDATE dealer_orders
        SET
          payment_status = 'PAID',
          payment_method = 'RAZORPAY'
        WHERE id = ?
      `,
      [record.order_id],
    );

    await connection.commit();

    try {
      await syncPaymentTransaction(record.transaction_id);
    } catch (salesforceError) {
      console.error(
        "Salesforce captured payment sync failed:",
        salesforceError.message,
      );
    }

    return response.status(200).json({
      message: "Payment verified successfully.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    sendKnownError(error, response, next);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

module.exports = router;

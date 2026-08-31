const express = require("express");
const Razorpay = require("razorpay");
const database = require("../config/database");
const {
  syncCustomerCollection,
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

function getProviderMessage(error) {
  return (
    error.error?.description ||
    error.description ||
    error.message ||
    "Razorpay Payment Link request failed."
  );
}

function normalizePhone(value) {
  const original = String(value || "").trim();

  if (!original) {
    return "";
  }

  const digits = original.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (original.startsWith("+") && digits.length >= 10) {
    return `+${digits}`;
  }

  return original;
}

async function synchronizeRequestStatus(razorpay, paymentRequest) {
  try {
    const paymentLink = await razorpay.paymentLink.fetch(
      paymentRequest.razorpay_payment_link_id,
    );

    const statusMap = {
      created: "SENT",
      paid: "PAID",
      expired: "EXPIRED",
      cancelled: "CANCELLED",
    };

    const databaseStatus = statusMap[paymentLink.status];

    if (!databaseStatus) {
      return;
    }

    const capturedPayment = Array.isArray(paymentLink.payments)
      ? paymentLink.payments.find(
          (payment) => payment.status === "captured",
        ) || paymentLink.payments[0]
      : null;

    const paymentId =
      capturedPayment?.payment_id || capturedPayment?.id || null;

    await database.execute(
      `
        UPDATE customer_payment_requests
        SET
          status = ?,
          razorpay_payment_id = COALESCE(?, razorpay_payment_id),
          paid_at = CASE
            WHEN ? = 'PAID' AND paid_at IS NULL
              THEN CURRENT_TIMESTAMP
            ELSE paid_at
          END
        WHERE id = ?
      `,
      [
        databaseStatus,
        paymentId,
        databaseStatus,
        paymentRequest.id,
      ],
    );

    try {
      await syncCustomerCollection(paymentRequest.id);
    } catch (salesforceError) {
      console.error(
        `Salesforce collection sync failed for request ${paymentRequest.id}:`,
        salesforceError.message,
      );
    }
  } catch (error) {
    console.error(
      `Payment Link sync failed for request ${paymentRequest.id}:`,
      getProviderMessage(error),
    );
  }
}

router.get("/", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  try {
    const [openRequests] = await database.execute(
      `
        SELECT id, razorpay_payment_link_id
        FROM customer_payment_requests
        WHERE dealer_id = ?
          AND status IN ('CREATED', 'SENT')
          AND razorpay_payment_link_id IS NOT NULL
      `,
      [request.session.user.dealerId],
    );

    if (openRequests.length > 0) {
      const razorpay = getRazorpayClient();

      await Promise.all(
        openRequests.map((paymentRequest) =>
          synchronizeRequestStatus(razorpay, paymentRequest),
        ),
      );
    }

    const [paymentRequests] = await database.execute(
      `
        SELECT
          id,
          reference_number,
          customer_invoice_number,
          customer_name,
          customer_email,
          customer_phone,
          description,
          amount,
          currency,
          status,
          short_url,
          razorpay_payment_id,
          expires_at,
          paid_at,
          created_at
        FROM customer_payment_requests
        WHERE dealer_id = ?
        ORDER BY created_at DESC
      `,
      [request.session.user.dealerId],
    );

    return response.status(200).json({
      paymentRequests: paymentRequests.map((item) => ({
        id: item.id,
        referenceNumber: item.reference_number,
        invoiceNumber: item.customer_invoice_number,
        customerName: item.customer_name,
        customerEmail: item.customer_email,
        customerPhone: item.customer_phone,
        description: item.description,
        amount: Number(item.amount),
        currency: item.currency,
        status: item.status,
        shortUrl: item.short_url,
        razorpayPaymentId: item.razorpay_payment_id,
        expiresAt: item.expires_at,
        paidAt: item.paid_at,
        createdAt: item.created_at,
      })),
    });
  } catch (error) {
    if (error.statusCode) {
      return response.status(error.statusCode).json({
        message: error.message,
      });
    }

    next(error);
  }
});

router.post("/", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  try {
    const customerName = String(
      request.body.customerName || "",
    ).trim();
    const customerEmail = String(
      request.body.customerEmail || "",
    )
      .trim()
      .toLowerCase();
    const customerPhone = normalizePhone(
      request.body.customerPhone,
    );
    const invoiceNumber = String(
      request.body.invoiceNumber || "",
    ).trim();
    const description = String(
      request.body.description || "",
    ).trim();
    const amount = Number(request.body.amount);

    if (!customerName || !description) {
      return response.status(400).json({
        message: "Customer name and description are required.",
      });
    }

    if (!customerEmail && !customerPhone) {
      return response.status(400).json({
        message: "Customer email or phone number is required.",
      });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return response.status(400).json({
        message: "Enter a valid payment amount.",
      });
    }

    const amountInPaise = Math.round(amount * 100);
    const referenceNumber = `CPR-${
      request.session.user.dealerId
    }-${Date.now().toString().slice(-10)}-${Math.floor(
      Math.random() * 90 + 10,
    )}`;
    const expireBy = Math.floor(Date.now() / 1000) + 7 * 86400;
    const razorpay = getRazorpayClient();

    const paymentLink = await razorpay.paymentLink.create({
      amount: amountInPaise,
      currency: "INR",
      accept_partial: false,
      expire_by: expireBy,
      reference_id: referenceNumber,
      description,
      customer: {
        name: customerName,
        ...(customerEmail ? { email: customerEmail } : {}),
        ...(customerPhone ? { contact: customerPhone } : {}),
      },
      notify: {
        sms: Boolean(customerPhone),
        email: Boolean(customerEmail),
      },
      reminder_enable: true,
      notes: {
        portalReference: referenceNumber,
        dealerId: String(request.session.user.dealerId),
        invoiceNumber: invoiceNumber || "Not provided",
      },
    });

    const [result] = await database.execute(
      `
        INSERT INTO customer_payment_requests (
          dealer_id,
          created_by_user_id,
          reference_number,
          customer_invoice_number,
          customer_name,
          customer_email,
          customer_phone,
          description,
          amount,
          currency,
          status,
          razorpay_payment_link_id,
          short_url,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', 'SENT', ?, ?,
          FROM_UNIXTIME(?))
      `,
      [
        request.session.user.dealerId,
        request.session.user.userId,
        referenceNumber,
        invoiceNumber || null,
        customerName,
        customerEmail || null,
        customerPhone || null,
        description,
        amount,
        paymentLink.id,
        paymentLink.short_url,
        expireBy,
      ],
    );

    let salesforceSyncStatus = "SYNCED";

    try {
      await syncCustomerCollection(result.insertId);
    } catch (salesforceError) {
      salesforceSyncStatus = "PENDING";
      console.error(
        "Salesforce customer collection sync failed:",
        salesforceError.message,
      );
    }

    return response.status(201).json({
      message: "Customer payment link created successfully.",
      paymentRequest: {
        id: result.insertId,
        referenceNumber,
        customerName,
        amount,
        status: "SENT",
        shortUrl: paymentLink.short_url,
        salesforceSyncStatus,
      },
    });
  } catch (error) {
    const providerMessage = getProviderMessage(error);

    if (
      error.statusCode ||
      error.error?.description ||
      error.description
    ) {
      return response.status(error.statusCode || 502).json({
        message: providerMessage,
      });
    }

    next(error);
  }
});

module.exports = router;

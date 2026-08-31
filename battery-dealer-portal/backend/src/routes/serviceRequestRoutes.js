const express = require("express");
const database = require("../config/database");
const {
  refreshDealerServiceRequestStatuses,
  syncServiceRequest,
} = require("../services/salesforceSyncService");

const router = express.Router();

const allowedRequestTypes = new Set([
  "Warranty Claim",
  "Installation Support",
  "Battery Replacement",
  "Technical Issue",
  "Delivery Damage",
  "Other",
]);
const allowedPriorities = new Set([
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
]);

function requireLogin(request, response) {
  if (!request.session?.user) {
    response.status(401).json({
      message: "Authentication required.",
    });
    return false;
  }

  return true;
}

function getStatusLabel(status) {
  const labels = {
    OPEN: "Open",
    IN_PROGRESS: "In Progress",
    WAITING_FOR_CUSTOMER: "Waiting for Customer",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
  };

  return labels[status] || status;
}

function getPriorityLabel(priority) {
  return (
    priority.charAt(0) + priority.slice(1).toLowerCase()
  );
}

router.get("/", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  try {
    try {
      await refreshDealerServiceRequestStatuses(
        request.session.user.dealerId,
      );
    } catch (salesforceError) {
      console.error(
        "Salesforce Case status refresh failed:",
        salesforceError.message,
      );
    }

    const [requests] = await database.execute(
      `
        SELECT
          service_request.id,
          service_request.request_number,
          service_request.request_type,
          service_request.battery_serial_number,
          service_request.priority,
          service_request.description,
          service_request.status,
          service_request.salesforce_case_id,
          service_request.created_at,
          dealer_order.order_number
        FROM service_requests AS service_request
        LEFT JOIN dealer_orders AS dealer_order
          ON dealer_order.id = service_request.related_order_id
        WHERE service_request.dealer_id = ?
        ORDER BY service_request.created_at DESC
      `,
      [request.session.user.dealerId],
    );
    const [orders] = await database.execute(
      `
        SELECT order_number
        FROM dealer_orders
        WHERE dealer_id = ?
        ORDER BY created_at DESC
      `,
      [request.session.user.dealerId],
    );

    return response.status(200).json({
      requests: requests.map((item) => ({
        id: item.id,
        requestNumber: item.request_number,
        requestType: item.request_type,
        orderNumber: item.order_number || "",
        batterySerial: item.battery_serial_number,
        priority: getPriorityLabel(item.priority),
        description: item.description,
        status: getStatusLabel(item.status),
        salesforceCaseId: item.salesforce_case_id,
        createdDate: new Date(
          item.created_at,
        ).toLocaleDateString("en-IN"),
      })),
      orders: orders.map((order) => ({
        orderNumber: order.order_number,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  try {
    const requestType = String(
      request.body.requestType || "",
    ).trim();
    const orderNumber = String(
      request.body.orderNumber || "",
    ).trim();
    const batterySerial = String(
      request.body.batterySerial || "",
    ).trim();
    const priority = String(
      request.body.priority || "NORMAL",
    )
      .trim()
      .toUpperCase();
    const description = String(
      request.body.description || "",
    ).trim();

    if (
      !allowedRequestTypes.has(requestType) ||
      !batterySerial ||
      !description ||
      !allowedPriorities.has(priority)
    ) {
      return response.status(400).json({
        message: "Complete valid service request details are required.",
      });
    }

    let relatedOrderId = null;

    if (orderNumber) {
      const [orders] = await database.execute(
        `
          SELECT id
          FROM dealer_orders
          WHERE order_number = ?
            AND dealer_id = ?
          LIMIT 1
        `,
        [orderNumber, request.session.user.dealerId],
      );

      if (orders.length === 0) {
        return response.status(400).json({
          message: "The selected dealer order was not found.",
        });
      }

      relatedOrderId = orders[0].id;
    }

    const requestNumber = `SR-${
      request.session.user.dealerId
    }-${Date.now().toString().slice(-10)}-${Math.floor(
      Math.random() * 90 + 10,
    )}`;
    const [result] = await database.execute(
      `
        INSERT INTO service_requests (
          request_number,
          dealer_id,
          dealer_user_id,
          related_order_id,
          request_type,
          battery_serial_number,
          priority,
          description
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        requestNumber,
        request.session.user.dealerId,
        request.session.user.userId,
        relatedOrderId,
        requestType,
        batterySerial,
        priority,
        description,
      ],
    );

    let salesforceSyncStatus = "SYNCED";

    try {
      await syncServiceRequest(result.insertId);
    } catch (salesforceError) {
      salesforceSyncStatus = "PENDING";
      console.error(
        "Salesforce Case sync failed:",
        salesforceError.message,
      );
    }

    return response.status(201).json({
      message: "Service request created successfully.",
      serviceRequest: {
        id: result.insertId,
        requestNumber,
        salesforceSyncStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

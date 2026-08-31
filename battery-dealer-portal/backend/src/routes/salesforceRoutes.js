const express = require("express");
const {
  checkSalesforceConnection,
} = require("../config/salesforce");
const {
  syncDealerCatalog,
  syncDealerOrders,
  syncDealerPayments,
  syncDealerServiceRequests,
} = require("../services/salesforceSyncService");

const router = express.Router();

router.get("/health", async (request, response, next) => {
  try {
    await checkSalesforceConnection();

    response.status(200).json({
      status: "OK",
      message: "Salesforce sandbox is connected",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/sync/dealer-catalog", async (request, response, next) => {
  try {
    if (!request.session?.user) {
      return response.status(401).json({
        message: "Authentication required.",
      });
    }

    if (request.session.user.role !== "DEALER_ADMIN") {
      return response.status(403).json({
        message: "Dealer administrator access is required.",
      });
    }

    const result = await syncDealerCatalog(
      request.session.user.dealerId,
    );

    return response.status(200).json({
      status: "OK",
      message: "Dealer catalogue synced to Salesforce",
      synced: result,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/sync/orders", async (request, response, next) => {
  try {
    if (!request.session?.user) {
      return response.status(401).json({
        message: "Authentication required.",
      });
    }

    if (request.session.user.role !== "DEALER_ADMIN") {
      return response.status(403).json({
        message: "Dealer administrator access is required.",
      });
    }

    const result = await syncDealerOrders(
      request.session.user.dealerId,
    );

    return response.status(200).json({
      status: "OK",
      message: "Dealer orders synced to Salesforce",
      synced: result,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/sync/payments", async (request, response, next) => {
  try {
    if (!request.session?.user) {
      return response.status(401).json({
        message: "Authentication required.",
      });
    }

    if (request.session.user.role !== "DEALER_ADMIN") {
      return response.status(403).json({
        message: "Dealer administrator access is required.",
      });
    }

    const result = await syncDealerPayments(
      request.session.user.dealerId,
    );

    return response.status(200).json({
      status: "OK",
      message: "Dealer payments synced to Salesforce",
      synced: result,
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/sync/service-requests",
  async (request, response, next) => {
    try {
      if (!request.session?.user) {
        return response.status(401).json({
          message: "Authentication required.",
        });
      }

      if (request.session.user.role !== "DEALER_ADMIN") {
        return response.status(403).json({
          message: "Dealer administrator access is required.",
        });
      }

      const result = await syncDealerServiceRequests(
        request.session.user.dealerId,
      );

      return response.status(200).json({
        status: "OK",
        message: "Service requests synced to Salesforce",
        synced: result,
      });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;

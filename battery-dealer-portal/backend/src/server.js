const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");

dotenv.config();

const database = require("./config/database");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const customerPaymentRoutes = require("./routes/customerPaymentRoutes");
const salesforceRoutes = require("./routes/salesforceRoutes");
const serviceRequestRoutes = require("./routes/serviceRequestRoutes");
const profileRoutes = require("./routes/profileRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use(express.json());
app.use(
  session({
    name: "dealer.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: {
    message: "Too many requests. Please try again later.",
  },
});

app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/customer-payments", customerPaymentRoutes);
app.use("/api/salesforce", salesforceRoutes);
app.use("/api/service-requests", serviceRequestRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/api/health", (request, response) => {
  response.status(200).json({
    status: "OK",
    message: "Battery Dealer Portal backend is running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/database-health", async (request, response, next) => {
  try {
    await database.query("SELECT 1");

    response.status(200).json({
      status: "OK",
      message: "MySQL database is connected",
    });
  } catch (error) {
    next(error);
  }
});

app.use((request, response) => {
  response.status(404).json({
    message: "API endpoint not found",
  });
});

app.use((error, request, response, next) => {
  console.error("Backend error:", error.message);

  response.status(500).json({
    status: "ERROR",
    message: "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});

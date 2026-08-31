import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalSidebar from "../components/PortalSidebar";
import BrandLogo from "../components/BrandLogo";
import { apiUrl } from "../config/api";
import "./DashboardPage.css";

const defaultDashboard = {
  dealer: {
    dealerCode: "",
    companyName: "Dealer",
    displayName: "Dealer",
  },
  summary: {
    availableBatteries: 0,
    pendingOrders: 0,
    completedOrders: 0,
    outstandingPayment: 0,
    openServiceRequests: 0,
  },
  recentOrders: [],
};

function getInitials(name) {
  return String(name || "Dealer")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getOrderStatusClass(status) {
  const classes = {
    Delivered: "delivered",
    Processing: "processing",
    Confirmed: "processing",
    Shipped: "processing",
    Cancelled: "failed",
    "Order Placed": "waiting",
  };

  return classes[status] || "waiting";
}

function DashboardPage() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(defaultDashboard);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response = await fetch(
          apiUrl("/api/dashboard"),
          { credentials: "include" },
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.message || "Unable to load dashboard.",
          );
        }

        setDashboard(result);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const { dealer, summary, recentOrders } = dashboard;

  return (
    <div className="dashboard-layout">
      <PortalSidebar />

      <main className="dashboard-main">
        <section className="welcome-banner">
          <BrandLogo variant="dark" />
          <p>AUTHORIZED DEALER PORTAL</p>
          <h2>Welcome to VoltCore</h2>
          <span>Powering a smarter tomorrow</span>
        </section>

        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">
              DEALER DASHBOARD
            </p>
            <h1>Welcome back, {dealer.displayName}</h1>
            <p>
              Here is an overview of your dealership activity.
            </p>
          </div>

          <div className="dealer-badge">
            <span>{getInitials(dealer.companyName)}</span>

            <div>
              <strong>{dealer.companyName}</strong>
              <small>{dealer.dealerCode}</small>
            </div>
          </div>
        </header>

        {isLoading && (
          <p className="dashboard-message">
            Loading live dashboard data...
          </p>
        )}

        {error && (
          <p className="dashboard-message dashboard-error">
            {error}
          </p>
        )}

        <section className="summary-grid">
          <article className="summary-card">
            <span className="summary-icon blue">🔋</span>
            <div>
              <p>Available Batteries</p>
              <strong>{summary.availableBatteries}</strong>
            </div>
          </article>

          <article className="summary-card">
            <span className="summary-icon orange">📦</span>
            <div>
              <p>Pending Orders</p>
              <strong>{summary.pendingOrders}</strong>
            </div>
          </article>

          <article className="summary-card">
            <span className="summary-icon green">✓</span>
            <div>
              <p>Completed Orders</p>
              <strong>{summary.completedOrders}</strong>
            </div>
          </article>

          <article className="summary-card">
            <span className="summary-icon purple">₹</span>
            <div>
              <p>Outstanding Payment</p>
              <strong>
                ₹
                {summary.outstandingPayment.toLocaleString(
                  "en-IN",
                )}
              </strong>
            </div>
          </article>

          <article className="summary-card">
            <span className="summary-icon service">🛠</span>
            <div>
              <p>Open Service Requests</p>
              <strong>{summary.openServiceRequests}</strong>
            </div>
          </article>
        </section>

        <section className="dashboard-section">
          <div className="section-heading">
            <div>
              <h2>Recent Orders</h2>
              <p>Your latest battery orders</p>
            </div>

            <button
              type="button"
              onClick={() => navigate("/orders")}
            >
              View all orders
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order Number</th>
                  <th>Order Date</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.orderNumber}>
                    <td>{order.orderNumber}</td>
                    <td>{order.orderDate}</td>
                    <td>
                      ₹{order.amount.toLocaleString("en-IN")}
                    </td>
                    <td>
                      <span
                        className={`status ${order.paymentStatus.toLowerCase()}`}
                      >
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status ${getOrderStatusClass(
                          order.orderStatus,
                        )}`}
                      >
                        {order.orderStatus}
                      </span>
                    </td>
                  </tr>
                ))}

                {!isLoading && recentOrders.length === 0 && (
                  <tr>
                    <td colSpan="5" className="dashboard-empty">
                      No orders have been created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default DashboardPage;

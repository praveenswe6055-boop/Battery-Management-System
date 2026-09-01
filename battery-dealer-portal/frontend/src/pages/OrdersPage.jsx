import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalSidebar from "../components/PortalSidebar";
import { apiUrl } from "../config/api";
import "./OrdersPage.css";

function OrdersPage() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  async function loadOrders() {
    try {
      const response = await fetch(
        apiUrl("/api/orders"),
        {
          credentials: "include",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load orders.",
        );
      }

      setOrders(data.orders);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function handleSalesforceSync() {
    setIsSyncing(true);
    setSyncMessage("");

    try {
      const response = await fetch(
        apiUrl("/api/salesforce/sync/orders"),
        {
          method: "POST",
          credentials: "include",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to sync orders to CRM.",
        );
      }

      const syncedCount = data.synced?.orderCount || 0;
      setSyncMessage(
        `${syncedCount} order${syncedCount === 1 ? "" : "s"} synced to CRM successfully.`,
      );
      await loadOrders();
    } catch (error) {
      setSyncMessage(`CRM sync failed: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="dashboard-layout">
      <PortalSidebar />

      <main className="dashboard-main">
        <header className="orders-header">
          <div>
            <p className="dashboard-eyebrow">
              ORDER MANAGEMENT
            </p>

            <h1>My Orders</h1>

            <p>
              View and track your submitted battery orders.
            </p>
          </div>

          <div className="orders-header-actions">
            <button
              className="sync-orders-button"
              type="button"
              disabled={isSyncing}
              onClick={handleSalesforceSync}
            >
              {isSyncing ? "Syncing..." : "Sync to CRM"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/products")}
            >
              + New Order
            </button>
          </div>
        </header>

        {syncMessage && (
          <p
            className={
              syncMessage.startsWith("CRM sync failed")
                ? "orders-sync-message orders-sync-error"
                : "orders-sync-message orders-sync-success"
            }
            role="status"
          >
            {syncMessage}
          </p>
        )}

        {isLoading && (
          <section className="empty-orders">
            <h2>Loading orders...</h2>
          </section>
        )}

        {errorMessage && (
          <section className="empty-orders">
            <h2>Unable to load orders</h2>
            <p>{errorMessage}</p>
          </section>
        )}

        {!isLoading && !errorMessage && (orders.length === 0 ? (
          <section className="empty-orders">
            <span>📦</span>
            <h2>No orders available</h2>

            <p>
              Complete an order from Checkout to see it here.
            </p>

            <button
              type="button"
              onClick={() => navigate("/products")}
            >
              Browse Batteries
            </button>
          </section>
        ) : (
          <section className="orders-list">
            {orders.map((order) => (
              <article
                className="order-card"
                key={order.orderNumber}
              >
                <header className="order-card-header">
                  <div>
                    <small>ORDER NUMBER</small>
                    <h2>{order.orderNumber}</h2>
                  </div>

                  <span className="order-status">
                    {order.orderStatus}
                  </span>
                </header>

                <div className="order-information">
                  <div>
                    <small>Order Date</small>
                    <strong>{order.orderDate}</strong>
                  </div>

                  <div>
                    <small>Payment</small>

                    <strong
                      className={
                        order.paymentStatus === "Pending"
                          ? "payment-pending"
                          : "payment-required"
                      }
                    >
                      {order.paymentStatus}
                    </strong>
                  </div>

                  <div>
                    <small>Delivery City</small>
                    <strong>
                      {order.dealer?.city || "Not available"}
                    </strong>
                  </div>

                  <div>
                    <small>Order Total</small>
                    <strong>
                      ₹
                      {order.total.toLocaleString("en-IN")}
                    </strong>
                  </div>
                </div>

                <div className="ordered-products">
                  <h3>Ordered Batteries</h3>

                  {order.items.map((item) => (
                    <div
                      className="ordered-product"
                      key={item.id}
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                      />

                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.code}</small>
                      </div>

                      <span>
                        Quantity: {item.quantity}
                      </span>

                      <strong>
                        ₹
                        {(
                          item.price * item.quantity
                        ).toLocaleString("en-IN")}
                      </strong>
                    </div>
                  ))}
                </div>

                <footer className="order-card-footer">
                  <span>
                    GST included: ₹
                    {order.gst.toLocaleString("en-IN")}
                  </span>

                  <strong>
                    Total: ₹
                    {order.total.toLocaleString("en-IN")}
                  </strong>
                </footer>
              </article>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

export default OrdersPage;

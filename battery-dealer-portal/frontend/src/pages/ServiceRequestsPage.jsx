import { useEffect, useState } from "react";
import PortalSidebar from "../components/PortalSidebar";
import { apiUrl } from "../config/api";
import "./ServiceRequestsPage.css";

function ServiceRequestsPage() {
  const [orders, setOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    requestType: "Warranty Claim",
    orderNumber: "",
    batterySerial: "",
    priority: "Normal",
    description: "",
  });

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  async function loadServiceRequests() {
    try {
      setErrorMessage("");

      const response = await fetch(
        apiUrl("/api/service-requests"),
        { credentials: "include" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load service requests.",
        );
      }

      setRequests(data.requests || []);
      setOrders(data.orders || []);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadServiceRequests();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        apiUrl("/api/service-requests"),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to create service request.",
        );
      }

      setForm({
        requestType: "Warranty Claim",
        orderNumber: "",
        batterySerial: "",
        priority: "Normal",
        description: "",
      });
      await loadServiceRequests();
      alert(
        `Service request ${data.serviceRequest.requestNumber} created successfully.`,
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="dashboard-layout">
      <PortalSidebar />

      <main className="dashboard-main">
        <header className="service-header">
          <div>
            <p className="dashboard-eyebrow">
              DEALER SUPPORT
            </p>

            <h1>Service Requests</h1>

            <p>
              Create and track battery support requests.
            </p>
          </div>

          <div className="service-count">
            <small>OPEN REQUESTS</small>
            <strong>
              {
                requests.filter(
                  (request) => request.status === "Open",
                ).length
              }
            </strong>
          </div>
        </header>

        {errorMessage ? (
          <p className="service-demo-note">{errorMessage}</p>
        ) : null}

        <div className="service-layout">
          <section className="service-form-card">
            <h2>Create New Request</h2>

            <form onSubmit={handleSubmit}>
              <label>
                Request Type
                <select
                  name="requestType"
                  value={form.requestType}
                  onChange={handleChange}
                >
                  <option>Warranty Claim</option>
                  <option>Installation Support</option>
                  <option>Battery Replacement</option>
                  <option>Technical Issue</option>
                  <option>Delivery Damage</option>
                  <option>Other</option>
                </select>
              </label>

              <label>
                Related Order
                <select
                  name="orderNumber"
                  value={form.orderNumber}
                  onChange={handleChange}
                >
                  <option value="">
                    Select an order (optional)
                  </option>

                  {orders.map((order) => (
                    <option
                      key={order.orderNumber}
                      value={order.orderNumber}
                    >
                      {order.orderNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Battery Serial Number
                <input
                  name="batterySerial"
                  type="text"
                  placeholder="Example: VCB-2026-10001"
                  value={form.batterySerial}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                Priority
                <select
                  name="priority"
                  value={form.priority}
                  onChange={handleChange}
                >
                  <option>Low</option>
                  <option>Normal</option>
                  <option>High</option>
                  <option>Urgent</option>
                </select>
              </label>

              <label>
                Problem Description
                <textarea
                  name="description"
                  placeholder="Explain the battery problem"
                  value={form.description}
                  onChange={handleChange}
                  required
                />
              </label>

              <button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Submitting..."
                  : "+ Submit Service Request"}
              </button>
            </form>
          </section>

          <section className="service-history">
            <div className="service-history-heading">
              <h2>Request History</h2>
              <p>Your recently submitted requests.</p>
            </div>

            {isLoading ? (
              <div className="empty-service-requests">
                <p>Loading service requests...</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="empty-service-requests">
                <span>🛠️</span>
                <h3>No service requests</h3>

                <p>
                  Submitted requests will appear here.
                </p>
              </div>
            ) : (
              <div className="service-request-list">
                {requests.map((request) => (
                  <article
                    className="service-request-card"
                    key={request.requestNumber}
                  >
                    <header>
                      <div>
                        <small>REQUEST NUMBER</small>
                        <h3>{request.requestNumber}</h3>
                      </div>

                      <span className="service-status">
                        {request.status}
                      </span>
                    </header>

                    <div className="service-request-details">
                      <div>
                        <small>Request Type</small>
                        <strong>
                          {request.requestType}
                        </strong>
                      </div>

                      <div>
                        <small>Created Date</small>
                        <strong>
                          {request.createdDate}
                        </strong>
                      </div>

                      <div>
                        <small>Priority</small>

                        <strong
                          className={`priority-${request.priority.toLowerCase()}`}
                        >
                          {request.priority}
                        </strong>
                      </div>

                      <div>
                        <small>Related Order</small>

                        <strong>
                          {request.orderNumber ||
                            "Not selected"}
                        </strong>
                      </div>
                    </div>

                    <div className="service-description">
                      <small>Problem Description</small>
                      <p>{request.description}</p>
                    </div>

                    <footer>
                      Battery Serial:{" "}
                      <strong>
                        {request.batterySerial}
                      </strong>
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <p className="service-demo-note">
          Requests are stored in MySQL and synchronized with
          Salesforce Cases. Refresh this page to receive the latest
          Salesforce status.
        </p>
      </main>
    </div>
  );
}

export default ServiceRequestsPage;

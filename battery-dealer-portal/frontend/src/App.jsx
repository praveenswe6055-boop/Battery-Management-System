import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/CheckoutPage";
import OrdersPage from "./pages/OrdersPage";
import PaymentsPage from "./pages/PaymentsPage";
import CustomerPaymentsPage from "./pages/CustomerPaymentsPage";
import ServiceRequestsPage from "./pages/ServiceRequestsPage";
import DealerProfilePage from "./pages/DealerProfilePage";
import BrandLogo from "./components/BrandLogo";
import { apiUrl } from "./config/api";
import "./App.css";
import "./theme.css";

function LoginPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    dealerCode: "",
    email: "",
    password: "",
  });

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

 async function handleSubmit(event) {
  event.preventDefault();

  if (!form.dealerCode || !form.email || !form.password) {
    alert("Please complete all fields.");
    return;
  }

  try {
    const response = await fetch(
      apiUrl("/api/auth/login"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(form),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      alert(data.message || "Login failed.");
      return;
    }

    localStorage.setItem(
      "dealerDemoLoggedIn",
      "true",
    );

    localStorage.setItem(
      "dealerUser",
      JSON.stringify(data.user),
    );

    navigate("/dashboard");
  } catch (error) {
    alert(
      "Unable to connect to the backend. Please try again.",
    );
  }
}

  return (
    <main className="login-page">
      <section className="brand-panel">
        <div className="brand-content">
          <BrandLogo />
          <p className="brand-kicker">RELIABLE ENERGY. POWERFUL PERFORMANCE.</p>
          <h1>
            Powering every <span>journey</span>
          </h1>

          <p>
            Manage batteries, dealer orders, payments, deliveries and service
            requests through one secure dealer experience.
          </p>

          <ul>
            <li>View batteries and dealer prices</li>
            <li>Create and track orders</li>
            <li>Manage payments and invoices</li>
            <li>Submit warranty and service requests</li>
          </ul>
        </div>
      </section>

      <section className="form-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="mobile-brand-logo">
            <BrandLogo variant="dark" compact />
          </div>

          <p className="eyebrow">DEALER ACCESS</p>
          <h2>Welcome back</h2>

          <p className="description">
            Enter your approved dealer credentials to continue.
          </p>

          <label htmlFor="dealerCode">Dealer Code</label>
          <input
            id="dealerCode"
            name="dealerCode"
            type="text"
            placeholder="Example: DLR-1001"
            value={form.dealerCode}
            onChange={handleChange}
          />

          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="dealer@example.com"
            value={form.email}
            onChange={handleChange}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={handleChange}
          />

          <div className="form-options">
            <label className="remember">
              <input type="checkbox" />
              Remember me
            </label>

            <button className="forgot-button" type="button">
              Forgot password?
            </button>
          </div>

          <button className="login-button" type="submit">
            Sign in to portal
          </button>

          <p className="support">
            Access is available only to approved dealers.
          </p>
        </form>
      </section>
    </main>
  );
}

function ProtectedRoute({ children }) {
  const [authStatus, setAuthStatus] =
    useState("checking");

  useEffect(() => {
    let isActive = true;

    async function checkSession() {
      try {
        const response = await fetch(
          apiUrl("/api/auth/me"),
          {
            credentials: "include",
          },
        );

        if (!response.ok) {
          throw new Error("Authentication required");
        }

        const data = await response.json();

        if (isActive) {
          localStorage.setItem(
            "dealerDemoLoggedIn",
            "true",
          );

          localStorage.setItem(
            "dealerUser",
            JSON.stringify(data.user),
          );

          setAuthStatus("authenticated");
        }
      } catch (error) {
        if (isActive) {
          localStorage.removeItem(
            "dealerDemoLoggedIn",
          );

          localStorage.removeItem("dealerUser");
          setAuthStatus("unauthenticated");
        }
      }
    }

    checkSession();

    return () => {
      isActive = false;
    };
  }, []);

  if (authStatus === "checking") {
    return (
      <main className="auth-check-page">
        Checking secure session...
      </main>
    );
  }

  if (authStatus === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
  path="/products"
  element={
    <ProtectedRoute>
      <ProductsPage />
    </ProtectedRoute>
  }
/>
<Route
  path="/cart"
  element={
    <ProtectedRoute>
      <CartPage />
    </ProtectedRoute>
  }
/>
<Route
  path="/checkout"
  element={
    <ProtectedRoute>
      <CheckoutPage />
    </ProtectedRoute>
  }
/>
<Route path="/" element={<Navigate to="/login" replace />} />
<Route
  path="/orders"
  element={
    <ProtectedRoute>
      <OrdersPage />
    </ProtectedRoute>
  }
/>
<Route path="*" element={<Navigate to="/login" replace />} />
<Route
  path="/profile"
  element={
    <ProtectedRoute>
      <DealerProfilePage />
    </ProtectedRoute>
  }
/>
<Route
  path="/service-requests"
  element={
    <ProtectedRoute>
      <ServiceRequestsPage />
    </ProtectedRoute>
  }
/>
<Route
  path="/payments"
  element={
    <ProtectedRoute>
      <PaymentsPage />
    </ProtectedRoute>
  }
/>
<Route
  path="/customer-payments"
  element={
    <ProtectedRoute>
      <CustomerPaymentsPage />
    </ProtectedRoute>
  }
/>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

import { NavLink, useNavigate } from "react-router-dom";
import BrandLogo from "./BrandLogo";
import { apiUrl } from "../config/api";

function PortalSidebar() {
  const navigate = useNavigate();

 async function handleLogout() {
  try {
    await fetch(
      apiUrl("/api/auth/logout"),
      {
        method: "POST",
        credentials: "include",
      },
    );
  } finally {
    localStorage.removeItem("dealerDemoLoggedIn");
    localStorage.removeItem("dealerUser");
    navigate("/login");
  }
}

  return (
    <header className="portal-header">
      <div className="portal-brand-row">
        <BrandLogo />

        <div className="portal-account">
          <span className="portal-account__avatar">D</span>

          <div>
            <strong>Dealer User</strong>
            <small>DLR-1001</small>
          </div>
        </div>
      </div>

      <div className="portal-nav-row">
        <nav className="portal-nav" aria-label="Dealer portal navigation">
          <NavLink to="/dashboard">
            <span aria-hidden="true">⌂</span> Home
          </NavLink>

          <NavLink to="/products">Battery Catalogue</NavLink>
          <NavLink to="/cart">Cart</NavLink>

         <NavLink to="/orders">My Orders</NavLink>
          <NavLink to="/payments">Payments</NavLink>
          <NavLink to="/customer-payments">
            Customer Collections
          </NavLink>
          <NavLink to="/service-requests">
  Service Requests
</NavLink>
<NavLink to="/profile">
  Dealer Profile
</NavLink>
        </nav>

        <button
          className="logout-button"
          type="button"
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </header>
  );
}

export default PortalSidebar;

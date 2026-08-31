import { useEffect, useState } from "react";
import PortalSidebar from "../components/PortalSidebar";
import { apiUrl } from "../config/api";
import "./DealerProfilePage.css";

const defaultProfile = {
  dealerCode: "",
  companyName: "",
  email: "",
  phone: "",
  gstNumber: "",
  salesforceAccountId: "Pending sync",
  address: "",
  city: "",
  state: "",
  pincode: "",
  status: "",
  dealerType: "Authorized Dealer",
  creditLimit: 0,
  availableCredit: 0,
};

function DealerProfilePage() {
  const [profile, setProfile] = useState(defaultProfile);
  const [form, setForm] = useState(defaultProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await fetch(
          apiUrl("/api/profile"),
          { credentials: "include" },
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.message || "Unable to load dealer profile.",
          );
        }

        setProfile(result.profile);
        setForm(result.profile);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, []);

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  function handleEdit() {
    setForm(profile);
    setIsEditing(true);
  }

  function handleCancel() {
    setForm(profile);
    setIsEditing(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(
        apiUrl("/api/profile"),
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to update dealer profile.",
        );
      }

      setProfile(result.profile);
      setForm(result.profile);
      setIsEditing(false);

      const syncMessage =
        result.salesforceSyncStatus === "SYNCED"
          ? " MySQL and Salesforce are synchronized."
          : " Saved in MySQL; Salesforce sync is pending.";

      alert(result.message + syncMessage);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="dashboard-layout">
      <PortalSidebar />

      <main className="dashboard-main">
        <header className="profile-header">
          <div>
            <p className="dashboard-eyebrow">
              DEALER ACCOUNT
            </p>

            <h1>Dealer Profile</h1>

            <p>
              View and maintain dealership information.
            </p>
          </div>

          {!isEditing && (
            <button
              type="button"
              onClick={handleEdit}
              disabled={isLoading || Boolean(error)}
            >
              Edit Profile
            </button>
          )}
        </header>

        {isLoading && (
          <p className="profile-demo-note">
            Loading dealer profile...
          </p>
        )}

        {error && (
          <p className="profile-demo-note">{error}</p>
        )}

        <section className="profile-overview">
          <article className="dealer-identity-card">
            <div className="dealer-profile-avatar">
              VC
            </div>

            <h2>{profile.companyName}</h2>
            <p>{profile.dealerType}</p>

            <span>{profile.status}</span>

            <div className="dealer-identity-details">
              <div>
                <small>DEALER CODE</small>
                <strong>{profile.dealerCode}</strong>
              </div>

              <div>
                <small>SALESFORCE ACCOUNT ID</small>
                <strong>
                  {profile.salesforceAccountId}
                </strong>
              </div>

              <div>
                <small>GST NUMBER</small>
                <strong>{profile.gstNumber}</strong>
              </div>
            </div>
          </article>

          <div className="dealer-credit-area">
            <article>
              <small>Approved Credit Limit</small>

              <strong>
                ₹
                {Number(
                  profile.creditLimit,
                ).toLocaleString("en-IN")}
              </strong>
            </article>

            <article>
              <small>Available Credit</small>

              <strong>
                ₹
                {Number(
                  profile.availableCredit,
                ).toLocaleString("en-IN")}
              </strong>
            </article>

            <article>
              <small>Credit Used</small>

              <strong>
                ₹
                {(
                  Number(profile.creditLimit) -
                  Number(profile.availableCredit)
                ).toLocaleString("en-IN")}
              </strong>
            </article>
          </div>
        </section>

        <form
          className="profile-form-card"
          onSubmit={handleSubmit}
        >
          <div className="profile-form-heading">
            <div>
              <h2>Company and Contact Details</h2>

              <p>
                Dealer code and Salesforce ID cannot be
                modified.
              </p>
            </div>

            {isEditing && (
              <div>
                <button
                  className="profile-cancel-button"
                  type="button"
                  onClick={handleCancel}
                >
                  Cancel
                </button>

                <button
                  className="profile-save-button"
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            )}
          </div>

          <div className="profile-fields">
            <label>
              Dealer Code
              <input
                value={form.dealerCode}
                readOnly
              />
            </label>

            <label>
              Company Name
              <input
                name="companyName"
                value={form.companyName}
                onChange={handleChange}
                disabled={!isEditing}
                required
              />
            </label>

            <label>
              Email Address
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                disabled={!isEditing}
                required
              />
            </label>

            <label>
              Phone Number
              <input
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                disabled={!isEditing}
                required
              />
            </label>

            <label>
              GST Number
              <input
                name="gstNumber"
                value={form.gstNumber}
                onChange={handleChange}
                disabled={!isEditing}
                required
              />
            </label>

            <label>
              Salesforce Account ID
              <input
                value={form.salesforceAccountId}
                readOnly
              />
            </label>

            <label className="profile-full-field">
              Business Address
              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                disabled={!isEditing}
                required
              />
            </label>

            <label>
              City
              <input
                name="city"
                value={form.city}
                onChange={handleChange}
                disabled={!isEditing}
                required
              />
            </label>

            <label>
              State
              <input
                name="state"
                value={form.state}
                onChange={handleChange}
                disabled={!isEditing}
                required
              />
            </label>

            <label>
              PIN Code
              <input
                name="pincode"
                value={form.pincode}
                onChange={handleChange}
                disabled={!isEditing}
                required
              />
            </label>
          </div>
        </form>

        <p className="profile-demo-note">
          Profile changes are saved in MySQL and synchronized
          with the Salesforce Account and Contact.
        </p>
      </main>
    </div>
  );
}

export default DealerProfilePage;

import { Navigate, useLocation } from "react-router-dom";
import LpFrame from "../landing/LpFrame";
import "../landing/landing.css";

export default function AdminRoute({ user, admin, ready, children }) {
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!ready) {
    return (
      <LpFrame user={user} className="lp-profile">
        <div className="lp-profile-body">
          <div className="lp-profile-inner">
            <p className="lp-note">Checking admin access…</p>
          </div>
        </div>
      </LpFrame>
    );
  }

  if (!admin) return <Navigate to="/blog" replace />;

  return children;
}

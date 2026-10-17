import { Component, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { logPageView } from "./analytics";
import { useAdmin } from "./admins";
import { ensureUserProfile } from "./auth";
import AdminRoute from "./components/AdminRoute";
import Shell from "./components/Shell";
import ProtectedRoute from "./components/ProtectedRoute";
import { auth } from "./firebase";
import LandingPage from "./landing/LandingPage";
import { landingVariant } from "./landing/variant";
import AccountPage from "./pages/AccountPage";
import AdminPage from "./pages/AdminPage";
import { BillingCancel, BillingSuccess } from "./pages/BillingPages";
import BlogPage from "./pages/BlogPage";
import IndexPage from "./pages/IndexPage";
import LoginPage from "./pages/LoginPage";
import PostPage from "./pages/PostPage";
import SetupPage from "./pages/SetupPage";
import { site } from "./site";

class Boundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="narrow">
          <h1>This page hit an error</h1>
          <p className="lede">{this.state.error.message}</p>
        </main>
      );
    }
    return this.props.children;
  }
}

function TrackPageViews() {
  const location = useLocation();
  useEffect(() => {
    void logPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);
  return null;
}

export default function App() {
  const location = useLocation();
  const variant = landingVariant(location.pathname, location.search);
  const [user, setUser] = useState(auth ? undefined : null);
  const [profileError, setProfileError] = useState("");
  const { admin, ready } = useAdmin(user);

  useEffect(() => {
    document.title = site.template ? `${site.name} · setup` : site.name;
  }, []);

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, async (next) => {
      setUser(next);
      if (!next) {
        setProfileError("");
        return;
      }
      const error = await ensureUserProfile(next);
      setProfileError(error ? error.message : "");
    });
  }, []);

  if (variant) {
    const cleaned = location.pathname.replace(/\/+$/, "") || "/";
    const alias = cleaned !== "/" || new URLSearchParams(location.search).has("lp");
    if (variant === "option1" && alias) {
      return <Navigate to="/" replace />;
    }
    return (
      <>
        <TrackPageViews />
        <LandingPage variant={variant} user={user} />
      </>
    );
  }

  if (user === undefined) {
    return (
      <Shell user={null}>
        <main className="narrow">
          <p className="lede">Loading account…</p>
        </main>
      </Shell>
    );
  }

  return (
    <Shell user={user}>
      <TrackPageViews />
      <Boundary>
        <Routes>
          <Route path="/index" element={<IndexPage user={user} />} />
          <Route path="/blog" element={<BlogPage user={user} />} />
          <Route path="/blog/:slug" element={<PostPage user={user} admin={admin} />} />
          <Route
            path="/admin"
            element={
              <AdminRoute user={user} admin={admin} ready={ready}>
                <AdminPage user={user} />
              </AdminRoute>
            }
          />
          <Route path="/setup" element={<SetupPage user={user} profileError={profileError} />} />
          <Route path="/login" element={<LoginPage user={user} />} />
          <Route
            path="/account"
            element={
              <ProtectedRoute user={user}>
                <AccountPage user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing/success"
            element={
              <ProtectedRoute user={user}>
                <BillingSuccess user={user} />
              </ProtectedRoute>
            }
          />
          <Route path="/billing/cancel" element={<BillingCancel />} />
        </Routes>
      </Boundary>
    </Shell>
  );
}

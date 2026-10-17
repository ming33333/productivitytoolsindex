import { Link, NavLink } from "react-router-dom";
import { site } from "../site";

export default function Shell({ user, children }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="wordmark">
          {site.name}
        </Link>
        <nav>
          <NavLink to="/setup">Setup</NavLink>
          {user ? (
            <NavLink to="/account">Account</NavLink>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </nav>
      </header>
      <div className="shell-body">{children}</div>
    </div>
  );
}

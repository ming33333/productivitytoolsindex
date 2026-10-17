import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAdmin } from "../admins";
import { signOut } from "../auth";
import { site } from "../site";
import WaterPool from "./WaterPool";

const faqs = [
  {
    q: "What is this?",
    a: "A directory of productivity tools. Search for the kind of tool you want, or open Index to browse the full list.",
  },
  {
    q: "How does search work?",
    a: "Type what you need, such as a website blocker or a meeting agenda. Search matches the tool name, what it does, and its features.",
  },
  {
    q: "Do I need an account?",
    a: "No. Anyone can search, browse the index, and read the stories. Sign in with Google to add an app.",
  },
  {
    q: "Who makes these tools?",
    a: "Indie-made by people who needed the same tools.",
  },
  {
    q: "Who do I contact?",
    a: site.supportEmail
      ? `Email ${site.supportEmail}. To ask for a story, use the email on your profile.`
      : "Use the email on your profile.",
  },
];

export default function LpFrame({ user, className = "", waterRef = null, children }) {
  const { pathname, search } = useLocation();
  const { admin } = useAdmin(user);
  const [faqOpen, setFaqOpen] = useState(false);
  const onSearch = pathname === "/" || pathname.startsWith("/lp=") || new URLSearchParams(search).has("lp");
  const onIndex = pathname === "/index";
  const onBlog = pathname === "/blog" || pathname.startsWith("/blog/");
  const onAdmin = pathname === "/admin";
  const onAccount = pathname === "/account";
  const onLogin = pathname === "/login";
  const itemClass = (active) => (active ? "lp1-nav lp1-nav-here" : "lp1-nav");

  return (
    <main className={`lp1 ${className}`.trim()}>
      <WaterPool waterRef={waterRef} />
      <header className="lp1-top">
        <Link className={itemClass(onSearch)} to="/" aria-current={onSearch ? "page" : undefined}>
          Search
        </Link>
        <Link className={itemClass(onIndex)} to="/index" aria-current={onIndex ? "page" : undefined}>
          Index
        </Link>
        <Link className={itemClass(onBlog)} to="/blog" aria-current={onBlog ? "page" : undefined}>
          Stories
        </Link>
        <button
          type="button"
          className={itemClass(faqOpen)}
          aria-expanded={faqOpen}
          aria-controls="lp1-faq"
          onClick={() => setFaqOpen((open) => !open)}
        >
          FAQ
        </button>
        {admin ? (
          <Link className={itemClass(onAdmin)} to="/admin" aria-current={onAdmin ? "page" : undefined}>
            Admin
          </Link>
        ) : null}
        <Link
          className={itemClass(user ? onAccount : onLogin)}
          to={user ? "/account" : "/login"}
          aria-current={user ? (onAccount ? "page" : undefined) : onLogin ? "page" : undefined}
        >
          {user ? "Profile" : "Sign in"}
        </Link>
        {user ? (
          <button type="button" className="lp1-nav" onClick={() => signOut()}>
            Sign out
          </button>
        ) : null}
      </header>
      <div className="lp1-sheet">
      {faqOpen ? (
        <section className="lp1-faq" id="lp1-faq">
          <h2>FAQ</h2>
          {faqs.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>
      ) : null}
      {children}
      </div>
    </main>
  );
}

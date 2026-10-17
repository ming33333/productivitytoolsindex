import { useEffect, useMemo, useState } from "react";
import { getDocs } from "firebase/firestore";
import { entriesCollection } from "../collections";
import AppIcon from "../landing/AppIcon";
import LpFrame from "../landing/LpFrame";
import "../landing/landing.css";

export default function IndexPage({ user }) {
  const [tools, setTools] = useState(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("All");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    getDocs(entriesCollection())
      .then((snap) => {
        if (cancelled) return;
        const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        setTools(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "The index could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const names = new Set((tools || []).map((tool) => tool.category).filter(Boolean));
    return ["All", ...Array.from(names).sort()];
  }, [tools]);

  const shown = useMemo(() => {
    const text = filter.trim().toLowerCase();
    return (tools || []).filter((tool) => {
      if (category !== "All" && tool.category !== category) return false;
      if (!text) return true;
      const hay = [tool.name, tool.category, tool.summary, tool.description, ...(tool.features || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(text);
    });
  }, [tools, category, filter]);

  return (
    <LpFrame user={user} className="lp-profile">
      <div className="lp-profile-body">
        <div className="lp-profile-inner lp-wide">
          <p className="lp-kicker">Index</p>
          <h1>All tools</h1>
          <p className="lp-why">
            Indie-made by people who needed the same tools.  
          </p>
          <label className="lp-field">
            <span>Filter</span>
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Name, feature, or description"
            />
          </label>
          <div className="lp-chips">
            {categories.map((name) => (
              <button
                key={name}
                type="button"
                className={name === category ? "lp-chip is-on" : "lp-chip"}
                onClick={() => setCategory(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {error ? <p className="lp-form-error">{error}</p> : null}
          {!tools && !error ? <p className="lp-note">Loading the index…</p> : null}
          {tools && shown.length === 0 ? <p className="lp-note">Nothing in this view.</p> : null}
          <ul className="lp-app-list">
            {shown.map((tool) => (
              <li key={tool.id || tool.slug || tool.name}>
                <AppIcon src={tool.iconUrl} name={tool.name} />
                <div>
                  <p className="lp1-cat">{tool.category}</p>
                  <h3>{tool.name}</h3>
                  <p>{tool.summary}</p>
                  {tool.url ? (
                    <a href={tool.url} rel="noreferrer">
                      {tool.url.replace(/^https?:\/\//, "")}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </LpFrame>
  );
}

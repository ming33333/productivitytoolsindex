import { useEffect, useRef, useState } from "react";
import { getDocs, onSnapshot } from "firebase/firestore";
import { useAdmin } from "../admins";
import { bookingsFromAd, dateKey, publishAccountSlot, publishBookedAccounts } from "../ads";
import { adsCollection, entriesCollection } from "../collections";
import { firebaseReady } from "../firebase";
import { site } from "../site";
import AppIcon from "./AppIcon";
import LpFrame from "./LpFrame";
import { searchTools } from "./searchTools";

export default function Option1({ user }) {
  const { admin } = useAdmin(user);
  const loadRef = useRef(null);
  const [query, setQuery] = useState("");
  const resultsRef = useRef(null);
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [moreBelow, setMoreBelow] = useState(false);
  const [frontAds, setFrontAds] = useState([]);

  function updateMore() {
    const el = resultsRef.current;
    if (!el) {
      setMoreBelow(false);
      return;
    }
    setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 12);
  }

  function loadTools() {
    if (!firebaseReady) return Promise.reject(new Error("Firebase is not configured yet."));
    if (!loadRef.current) {
      loadRef.current = getDocs(entriesCollection())
        .then((snap) => snap.docs.map((doc) => doc.data()))
        .catch((error) => {
          loadRef.current = null;
          throw error;
        });
    }
    return loadRef.current;
  }

  useEffect(() => {
    if (!firebaseReady) return undefined;
    loadTools().catch(() => {});
    const today = dateKey();
    return onSnapshot(
      adsCollection(),
      (snap) => {
        const next = snap.docs
          .flatMap((item) => bookingsFromAd({ id: item.id, ...item.data() }))
          .filter((ad) => ad.date === today)
          .slice(0, 4);
        setFrontAds(next);
      },
      () => setFrontAds([]),
    );
  }, []);

  useEffect(() => {
    if (!firebaseReady || !user?.email) return undefined;
    publishAccountSlot(user.email).catch(() => {});
    return undefined;
  }, [user]);

  useEffect(() => {
    if (!firebaseReady || !admin) return undefined;
    publishBookedAccounts().catch(() => {});
    return undefined;
  }, [admin]);

  useEffect(() => {
    const el = resultsRef.current;
    if (!el) {
      setMoreBelow(false);
      return undefined;
    }
    updateMore();
    const observer = new ResizeObserver(updateMore);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [results]);

  return (
    <LpFrame user={user}>
      <div className="lp1-stage">
        <form
          className="lp1-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const text = query.trim();
            if (!text) {
              setResults(null);
              setSearchError("");
              return;
            }
            setSearching(true);
            setSearchError("");
            loadTools()
              .then((tools) => {
                setResults(searchTools(tools, text));
              })
              .catch(() => {
                setResults([]);
                setSearchError("The directory could not be loaded.");
              })
              .finally(() => setSearching(false));
          }}
        >
          {frontAds.length ? (
            <div className={`lp1-ads lp1-ads-${frontAds.length}`}>
              {frontAds.map((ad) => {
                const label = (ad.date || ad.id) === dateKey() ? "Today" : ad.date || ad.id;
                const card = (
                  <>
                    <AppIcon src={ad.iconUrl} name={ad.name} />
                    <span>
                      <span className="lp1-cat">{label}</span>
                      <strong>{ad.name}</strong>
                      {ad.summary ? <span className="lp1-ad-summary">{ad.summary}</span> : null}
                    </span>
                  </>
                );
                return ad.url ? (
                  <a key={ad.id} className="lp1-ad" href={ad.url} rel="noreferrer">
                    {card}
                  </a>
                ) : (
                  <div key={ad.id} className="lp1-ad">
                    {card}
                  </div>
                );
              })}
            </div>
          ) : null}
          <h1>Productivity Tools Index</h1>
          <p className="lp1-why">
            Indie-made by people who needed the same tools.
          </p>
          <label className="lp1-label" htmlFor="lp1-query">
            Search productivity tools
          </label>
          <input
            id="lp1-query"
            autoFocus
            value={query}
            placeholder="Example: block distracting websites"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          <div className="lp1-mirror" aria-hidden="true" />
          {site.tagline ? <p>{site.tagline}</p> : null}
          {searching ? <p className="lp1-status">Searching the directory…</p> : null}
          {searchError ? <p className="lp1-status">{searchError}</p> : null}
          {results ? (
            <div className="lp1-results-wrap">
              <div className="lp1-results" ref={resultsRef} onScroll={updateMore}>
                {results.length === 0 ? (
                  <p className="lp1-status">Nothing in the directory matches that.</p>
                ) : (
                  <ul>
                    {results.map(({ tool, match }) => (
                      <li key={tool.slug || tool.name} className="lp1-result">
                        <AppIcon src={tool.iconUrl} name={tool.name} />
                        <div>
                          <div className="lp1-result-top">
                            <p className="lp1-cat">{tool.category}</p>
                            <p className="lp1-match">{match}% match</p>
                          </div>
                          <h2>{tool.name}</h2>
                        <p>{tool.summary}</p>
                        {tool.features?.length ? (
                          <p className="lp1-features">{tool.features.slice(0, 3).join(" · ")}</p>
                        ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {moreBelow ? (
                <button
                  type="button"
                  className="lp1-more"
                  aria-label="Scroll for more results"
                  onClick={() => resultsRef.current?.scrollBy({ top: 140, behavior: "smooth" })}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>
    </LpFrame>
  );
}

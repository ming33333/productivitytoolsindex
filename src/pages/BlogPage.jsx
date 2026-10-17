import { useEffect, useState } from "react";
import { getDocs, query, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { postsCollection } from "../collections";
import LpFrame from "../landing/LpFrame";
import "../landing/landing.css";

function when(value) {
  const date = value?.toDate ? value.toDate() : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

export default function BlogPage({ user }) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getDocs(query(postsCollection(), where("published", "==", true)))
      .then((snap) => {
        if (cancelled) return;
        const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setPosts(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Stories could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <LpFrame user={user} className="lp-profile">
      <div className="lp-profile-body">
        <div className="lp-profile-inner">
          <p className="lp-kicker">Stories</p>
          <h1>Stories</h1>
          <p className="lp-note">Written by the site, about the tools and the people who made them.</p>

          {error ? <p className="lp-form-error">{error}</p> : null}
          {!posts && !error ? <p className="lp-note">Loading stories…</p> : null}
          {posts && posts.length === 0 ? <p className="lp-note">No stories yet.</p> : null}
          <ul className="lp-app-list">
            {(posts || []).map((post) => (
              <li key={post.id}>
                <div>
                  <p className="lp1-cat">{when(post.createdAt)}</p>
                  <h3>
                    <Link to={`/blog/${post.slug || post.id}`}>{post.title}</Link>
                  </h3>
                  <p>{String(post.body || "").slice(0, 180)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </LpFrame>
  );
}

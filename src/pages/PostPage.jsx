import { useEffect, useState } from "react";
import { getDoc } from "firebase/firestore";
import { Link, useParams } from "react-router-dom";
import { postDoc } from "../collections";
import LpFrame from "../landing/LpFrame";
import "../landing/landing.css";

export default function PostPage({ user, admin = false }) {
  const { slug } = useParams();
  const [post, setPost] = useState(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getDoc(postDoc(slug))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setPost(null);
          return;
        }
        const data = snap.data();
        if (!data.published && !admin) {
          setPost(null);
          return;
        }
        setPost({ id: snap.id, ...data });
      })
      .catch(() => {
        if (!cancelled) setError("This post could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, admin]);

  const date = post?.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : "";

  return (
    <LpFrame user={user} className="lp-profile">
      <div className="lp-profile-body">
        <div className="lp-profile-inner">
          <p className="lp-kicker">
            <Link to="/blog">Stories</Link>
          </p>
          {error ? <p className="lp-form-error">{error}</p> : null}
          {post === undefined && !error ? <p className="lp-note">Loading…</p> : null}
          {post === null ? <h1>This post is not available.</h1> : null}
          {post ? (
            <>
              <h1>{post.title}</h1>
              <p className="lp-note">{["The index", date].filter(Boolean).join(" · ")}</p>
              <div className="lp-post">{post.body}</div>
            </>
          ) : null}
        </div>
      </div>
    </LpFrame>
  );
}

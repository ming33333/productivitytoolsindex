import { Link } from "react-router-dom";
import { firebaseReady } from "../firebase";
import { kindLabel, site } from "../site";

/*
  Build the directory or blog in this file.

  import { addDoc, serverTimestamp } from "firebase/firestore";
  import { entriesCollection, postsCollection } from "../collections";

  Directory row (anyone can read it):
    await addDoc(entriesCollection(), {
      name,
      url,
      summary,
      authorEmail: user.email.toLowerCase(),
      createdAt: serverTimestamp(),
    });

  Blog post (visitors can read it only when published is true):
    await addDoc(postsCollection(), {
      title,
      slug,
      body,
      published: true,
      authorEmail: user.email.toLowerCase(),
      createdAt: serverTimestamp(),
    });
*/

export default function HomePage() {
  const needsSetup = site.template || !firebaseReady;

  return (
    <main className="blank">
      {needsSetup ? (
        <div className="banner">
          <p>This copy is still a template. Wire Firebase, Google login, and Stripe before you write the page.</p>
          <Link to="/setup">Continue setup</Link>
        </div>
      ) : null}
      <p className="eyebrow">{site.niche || kindLabel[site.kind] || "Site"}</p>
      <h1>{site.name}</h1>
      {site.tagline ? <p className="tagline">{site.tagline}</p> : null}
      <div className="canvas">
        <p>
          {needsSetup
            ? "The page stays blank until setup is finished."
            : `Blank on purpose. Build the ${kindLabel[site.kind]?.toLowerCase() || "site"} in src/pages/HomePage.jsx.`}
        </p>
      </div>
    </main>
  );
}

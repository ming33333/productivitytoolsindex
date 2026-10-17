import Option1 from "./Option1";
import "./landing.css";

const landings = {
  option1: Option1,
};

export const landingNames = Object.keys(landings);

export default function LandingPage({ variant, user }) {
  const Page = landings[variant];
  if (Page) return <Page user={user} />;

  return (
    <main className="lp-missing">
      <h1>No landing for “{variant}”</h1>
      <p>
        The main page is option 1. Open another with <code>/lp=name</code>
        {landingNames.length ? ` — available: ${landingNames.join(", ")}` : ""}.
      </p>
    </main>
  );
}

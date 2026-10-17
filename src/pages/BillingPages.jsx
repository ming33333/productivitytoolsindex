import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { logAnalyticsEvent } from "../analytics";
import { confirmCheckout } from "../subscription";

export function BillingSuccess({ user }) {
  const [params] = useSearchParams();
  const [message, setMessage] = useState("Confirming the payment…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sessionId = params.get("session_id");
    const email = user?.email?.toLowerCase();
    if (!email || !sessionId) {
      setFailed(true);
      setMessage("This return link is missing the checkout session.");
      return;
    }
    confirmCheckout(email, sessionId)
      .then(() => {
        setMessage("Payment confirmed. This account is subscribed.");
        void logAnalyticsEvent("purchase");
      })
      .catch((error) => {
        setFailed(true);
        setMessage(error.message);
      });
  }, [params, user]);

  return (
    <main className="narrow">
      <p className="eyebrow">Billing</p>
      <h1>{failed ? "Payment not confirmed" : "Subscription"}</h1>
      <p className="lede">{message}</p>
      <Link to="/account" className="button primary">
        Back to account
      </Link>
    </main>
  );
}

export function BillingCancel() {
  return (
    <main className="narrow">
      <p className="eyebrow">Billing</p>
      <h1>Checkout canceled</h1>
      <p className="lede">No charge was made.</p>
      <Link to="/account">Back to account</Link>
    </main>
  );
}

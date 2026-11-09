import { useEffect, useRef, useState } from "react";
type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
let loading: Promise<void> | undefined;
function load() {
  return (loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error("Verification unavailable"));
    };
    document.head.appendChild(script);
  }));
}
export function RepositoryVerification({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (!sitekey) return;
    let disposed = false,
      id: string | undefined;
    const api = () => (window as unknown as { turnstile: Turnstile }).turnstile;
    void load()
      .then(() => {
        if (!disposed && ref.current)
          id = api().render(ref.current, {
            sitekey,
            theme: "dark",
            size: "flexible",
            callback: onToken,
            "expired-callback": () => onToken(""),
            "error-callback": () => {
              onToken("");
              setFailed(true);
            },
          });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      if (id) api()?.remove(id);
    };
  }, [onToken, sitekey]);
  if (!sitekey) return null;
  return (
    <div className="repository-verification">
      <div ref={ref} />
      {failed && (
        <p role="alert">Verification could not load. Refresh to try again.</p>
      )}
    </div>
  );
}

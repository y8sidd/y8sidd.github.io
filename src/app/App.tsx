import { Routes, Route, Link } from "react-router-dom";
import VoidLanding from "../components/landing/VoidLanding";
import { lazy, Suspense } from "react";
const Explore = lazy(() => import("./Explore"));
function Pending() {
  const { owner, repo } = useParams();
  return (
    <main className="pending-page">
      <span className="eyebrow">REPOSITORY RECOGNIZED</span>
      <h1>
        {owner} <span className="subtle">/</span> {repo}
      </h1>
      <p>Live analysis will be available when the backend is connected.</p>
      <p className="muted">Repository existence has not been verified.</p>
      <Link className="primary-button" to="/explore/demo">
        Explore Interactive Demo
      </Link>
      <Link className="text-button" to="/">
        Back to the void
      </Link>
    </main>
  );
}
export default function App() {
  return (
    <Suspense
      fallback={
        <main className="pending-page">
          <span className="sr-only">Opening your space</span>
        </main>
      }
    >
      <Routes>
        <Route path="/" element={<VoidLanding />} />
        <Route path="/explore/demo" element={<Explore />} />
        <Route path="/explore/:owner/:repo" element={<Explore />} />
        <Route
          path="*"
          element={
            <main className="pending-page">
              <span className="eyebrow">404 · OUTSIDE THE CONSTELLATION</span>
              <h1>Nothing here. Yet.</h1>
              <Link className="primary-button" to="/">
                Return to the void
              </Link>
            </main>
          }
        />
      </Routes>
    </Suspense>
  );
}

import {
  Routes,
  Route,
  Link,
  useParams,
  useLocation,
  useNavigate,
} from "react-router-dom";
import VoidLanding from "../components/landing/VoidLanding";
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { AppErrorBoundary } from "../components/shared/AppErrorBoundary";
const Explore = lazy(() => import("./Explore"));
export function Pending() {
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
  const location = useLocation();
  const navigate = useNavigate();
  const [handoff, setHandoff] = useState<string | null>(null);
  const transitioning = handoff === location.pathname;
  const previousPath = useRef(location.pathname);
  const [landingRevision, setLandingRevision] = useState(0);
  useEffect(() => {
    if (
      previousPath.current !== location.pathname &&
      handoff &&
      handoff !== location.pathname
    ) {
      setHandoff(null);
      setLandingRevision((revision) => revision + 1);
    }
    previousPath.current = location.pathname;
  }, [handoff, location.pathname]);
  return (
    <AppErrorBoundary>
      <Suspense
        fallback={
          <main className="pending-page">
            <span role="status">Opening your space…</span>
          </main>
        }
      >
        <Suspense fallback={null}>
          <Routes>
            <Route
              path="/explore/demo"
              element={<Explore formationActive={!transitioning} />}
            />
            <Route
              path="/explore/:owner/:repo"
              element={<Explore formationActive={!transitioning} />}
            />
            <Route path="*" element={null} />
          </Routes>
        </Suspense>
        <Routes location={transitioning ? "/" : location}>
          <Route
            path="/"
            element={
              <VoidLanding
                key={landingRevision}
                onTransitionStart={(repository) => {
                  setHandoff(`/explore/${repository.owner}/${repository.repo}`);
                  navigate(`/explore/${repository.owner}/${repository.repo}`);
                }}
                onTransitionComplete={() => setHandoff(null)}
              />
            }
          />
          <Route path="/explore/demo" element={null} />
          <Route path="/explore/:owner/:repo" element={null} />
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
    </AppErrorBoundary>
  );
}

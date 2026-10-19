import { BrandMark } from "../shared/Brand";

export const handoffDuration = 2.6;
export const handoffEase = [0.65, 0, 0.2, 1] as const;
export function LandingBrand() {
  return (
    <>
      <div className="gamma-brand">
        <BrandMark size={32} />
        <span>
          RepoMentor <small>AI</small>
        </span>
      </div>
      <p className="gamma-eyebrow">INTELLIGENCE FOR EVERY REPOSITORY</p>
    </>
  );
}
export function RepositoryName({
  owner,
  repo,
}: {
  owner: string;
  repo: string;
}) {
  return (
    <>
      <span>{owner}</span>
      <i>/</i>
      <strong>{repo}</strong>
    </>
  );
}
export function TransitionIdentity({
  owner,
  repo,
}: {
  owner: string;
  repo: string;
}) {
  return (
    <div className="gamma-docked-identity">
      <div className="gamma-docked-brand">
        <LandingBrand />
      </div>
      <div
        className="gamma-glass gamma-docked-repository"
        aria-label={`Repository: ${owner}/${repo}`}
      >
        <span className="gamma-glass-reflection" aria-hidden="true" />
        <span className="gamma-repo-name">
          <RepositoryName owner={owner} repo={repo} />
        </span>
      </div>
    </div>
  );
}

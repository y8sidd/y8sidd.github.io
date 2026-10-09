export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m8 28 7-20 18 11-16 13-2-24M8 28l25-9"
        stroke="currentColor"
        strokeOpacity=".42"
        strokeWidth=".8"
      />
      <g fill="currentColor">
        <circle cx="8" cy="28" r="2" />
        <circle cx="15" cy="8" r="2.5" />
        <circle cx="33" cy="19" r="2" />
        <circle cx="17" cy="32" r="1.5" />
      </g>
    </svg>
  );
}

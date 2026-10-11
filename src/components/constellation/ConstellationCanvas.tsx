import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { AdaptiveDpr, CameraControls } from "@react-three/drei";
import { useReducedMotion } from "motion/react";
import * as THREE from "three";
import type { GraphNode, GraphEdge, Position } from "../../types/repository";
import { sphericalLayout } from "../../lib/sphericalLayout";
import { connectedIds, searchNodes } from "../../lib/graphUtils";
import { useExperience } from "../../stores/experienceStore";
import { SceneLabels } from "./SceneLabels";
import {
  entrance,
  easeReveal,
  nodeEntranceDelays,
  edgeEntrance,
  entranceDuration,
  starBloom,
  type EntranceTimeline,
} from "./entrance";

function EntranceClock({
  timeline,
  reduced,
  duration,
}: {
  timeline: EntranceTimeline;
  reduced: boolean;
  duration: number;
}) {
  useFrame((_, delta) => {
    timeline.current = reduced
      ? duration
      : Math.min(
          duration,
          timeline.current + Math.min(delta, 0.05) * entrance.playbackRate,
        );
  }, -1);
  return null;
}
function NodeField({
  nodes,
  edges,
  positions,
  timeline,
  delays,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Map<string, Position>;
  timeline: EntranceTimeline;
  delays: Map<string, number>;
}) {
  const cores = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const selected = useExperience((s) => s.selected);
  const hovered = useExperience((s) => s.hovered);
  const query = useExperience((s) => s.filter.query);
  const select = useExperience((s) => s.select);
  const hover = useExperience((s) => s.hover);
  const active = hovered ?? selected;
  const connected = useMemo(
    () => connectedIds({ edges }, active),
    [edges, active],
  );
  const matches = useMemo(
    () => new Set(searchNodes(nodes, query).map((n) => n.id)),
    [nodes, query],
  );
  const settled = useRef(false);
  const scratch = useMemo(
    () => ({ object: new THREE.Object3D(), color: new THREE.Color() }),
    [],
  );
  const stars = useMemo(
    () =>
      nodes.map((node) => {
        const dim =
          (active && !connected.has(node.id)) ||
          (query && !matches.has(node.id));
        return {
          position: positions.get(node.id)!,
          size:
            node.type === "repository"
              ? 0.072
              : node.type === "module"
                ? 0.055
                : node.type === "entry"
                  ? 0.048
                  : 0.024,
          emphasis: active === node.id ? 1.5 : 1,
          brightness: dim
            ? 0.11
            : active === node.id
              ? 1
              : node.type === "module"
                ? 0.88
                : 0.69,
          delay: delays.get(node.id) ?? 0,
        };
      }),
    [nodes, positions, active, connected, query, matches, delays],
  );

  const updateStars = useCallback(() => {
    const { object, color } = scratch;
    stars.forEach((star, i) => {
      const bloom = starBloom(timeline.current, star.delay);
      object.position.set(...star.position);
      object.scale.setScalar(star.size * star.emphasis * bloom.coreScale);
      object.updateMatrix();
      cores.current?.setMatrixAt(i, object.matrix);
      color.setScalar(star.brightness * bloom.light);
      cores.current?.setColorAt(i, color);
      // A small rim brightens with the core without radiating outward.
      object.scale.setScalar(star.size * star.emphasis * bloom.haloScale);
      object.updateMatrix();
      halos.current?.setMatrixAt(i, object.matrix);
      color.setScalar(star.brightness * bloom.haloLight);
      halos.current?.setColorAt(i, color);
    });
    for (const mesh of [cores.current, halos.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [stars, scratch, timeline]);

  useLayoutEffect(() => {
    settled.current = false;
    // Bounds cover the largest bloom, so growing stars remain visible and pickable.
    // Computing them from their initial pinprick sizes would leave stale bounds.
    for (const mesh of [cores.current, halos.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      stars.forEach((star, i) => {
        scratch.object.position.set(...star.position);
        scratch.object.scale.setScalar(star.size * 3);
        scratch.object.updateMatrix();
        mesh.setMatrixAt(i, scratch.object.matrix);
      });
      mesh.computeBoundingSphere();
    }
    updateStars();
  }, [stars, scratch, updateStars]);
  useFrame(() => {
    if (settled.current) return;
    updateStars();
    settled.current = stars.every(
      (star) => timeline.current >= star.delay + entrance.nodeBloom,
    );
  });
  const pointer = (event: ThreeEvent<PointerEvent>, enter: boolean) => {
    event.stopPropagation();
    hover(
      enter && event.instanceId !== undefined
        ? nodes[event.instanceId].id
        : null,
    );
    document.body.style.cursor = enter ? "pointer" : "";
  };
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );
  return (
    <group>
      <instancedMesh
        ref={cores}
        args={[undefined, undefined, nodes.length]}
        onPointerOver={(e) => pointer(e, true)}
        onPointerOut={(e) => pointer(e, false)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) select(nodes[e.instanceId].id);
        }}
      >
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={halos}
        args={[undefined, undefined, nodes.length]}
        onPointerOver={(e) => pointer(e, true)}
        onPointerOut={(e) => pointer(e, false)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) select(nodes[e.instanceId].id);
        }}
      >
        <sphereGeometry args={[1, 16, 12]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          vertexShader={`
            varying vec3 glowColor;
            varying vec3 glowNormal;
            varying vec3 viewDirection;
            void main() {
              vec4 viewPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
              glowNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
              viewDirection = -viewPosition.xyz;
              glowColor = instanceColor;
              gl_Position = projectionMatrix * viewPosition;
            }
          `}
          fragmentShader={`
            varying vec3 glowColor;
            varying vec3 glowNormal;
            varying vec3 viewDirection;
            void main() {
              float softness = pow(max(dot(normalize(glowNormal), normalize(viewDirection)), 0.0), 3.0);
              gl_FragColor = vec4(glowColor, softness * 0.2);
            }
          `}
        />
      </instancedMesh>
    </group>
  );
}
function EdgeField({
  edges,
  positions,
  timeline,
  delays,
}: {
  edges: GraphEdge[];
  positions: Map<string, Position>;
  timeline: EntranceTimeline;
  delays: Map<string, number>;
}) {
  const selected = useExperience((s) => s.selected);
  const hovered = useExperience((s) => s.hovered);
  const active = hovered ?? selected;
  const field = useMemo(() => {
    const segments = edges.flatMap((edge) => {
      const { from, to, start } = edgeEntrance(edge, delays);
      const a = positions.get(from);
      const b = positions.get(to);
      if (!a || !b) return [];
      const bright = active
        ? edge.source === active || edge.target === active
          ? 0.64
          : 0.035
        : edge.type === "imports"
          ? 0.22
          : 0.1;
      return [{ a, b, bright, start }];
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        new Float32Array(segments.length * 6),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Float32Array(segments.length * 6),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    return { geometry, segments, settled: false };
  }, [edges, positions, active, delays]);
  useEffect(() => () => field.geometry.dispose(), [field]);
  useFrame(() => {
    if (field.settled) return;
    const points = field.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const colors = field.geometry.getAttribute(
      "color",
    ) as THREE.BufferAttribute;
    field.segments.forEach(({ a, b, bright, start }, i) => {
      const reveal = easeReveal(timeline.current, start, entrance.edgeDraw);
      points.setXYZ(i * 2, ...a);
      points.setXYZ(
        i * 2 + 1,
        a[0] + (b[0] - a[0]) * reveal,
        a[1] + (b[1] - a[1]) * reveal,
        a[2] + (b[2] - a[2]) * reveal,
      );
      // A soft traveling highlight settles back to the original edge brightness.
      const glow = bright * reveal * (1 + Math.sin(reveal * Math.PI) * 1.2);
      colors.setXYZ(i * 2, glow, glow, glow);
      colors.setXYZ(i * 2 + 1, glow, glow, glow);
    });
    points.needsUpdate = true;
    colors.needsUpdate = true;
    field.settled = field.segments.every(
      (segment) => timeline.current >= segment.start + entrance.edgeDraw,
    );
  });
  return (
    <lineSegments geometry={field.geometry} frustumCulled={false}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </lineSegments>
  );
}
function Camera({
  positions,
  paused,
  reduced,
  timeline,
  duration,
}: {
  positions: Map<string, Position>;
  paused: boolean;
  reduced: boolean;
  timeline: EntranceTimeline;
  duration: number;
}) {
  const controls = useRef<CameraControls>(null);
  const command = useExperience((s) => s.camera);
  const selected = useExperience((s) => s.selected);
  const auto = useExperience((s) => s.autoRotate);
  const overlay = useExperience((s) => s.overlay.kind);
  const { size } = useThree();
  const distance = size.width < 650 ? 17 : 13;
  const initialized = useRef(false);
  useEffect(() => {
    if (!controls.current) return;
    const c = controls.current;
    c.smoothTime = reduced ? 0 : 0.65;
    const p = selected ? positions.get(selected) : undefined;
    if (!initialized.current) {
      initialized.current = true;
      void c.setLookAt(
        0,
        0.5,
        reduced ? distance : distance + 5,
        0,
        0,
        0,
        false,
      );
      void c.dollyTo(distance, !reduced);
    } else if (command.action === "reset" || command.action === "fit") {
      void c.setLookAt(0, 0.5, distance, 0, 0, 0, !reduced);
    } else if (command.action === "in") void c.dolly(1.4, !reduced);
    else if (command.action === "out") void c.dolly(-1.4, !reduced);
    else if (p) void c.setTarget(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3, !reduced);
  }, [command, selected, positions, reduced, distance]);
  useFrame((_, delta) => {
    if (
      timeline.current >= duration &&
      auto &&
      !paused &&
      !selected &&
      overlay === "none" &&
      !reduced
    )
      void controls.current?.rotate(delta * 0.025, 0, false);
  });
  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={6.5}
      maxDistance={24}
      dollySpeed={0.65}
      truckSpeed={0.5}
      draggingSmoothTime={0.15}
      onStart={() => useExperience.getState().interact()}
    />
  );
}
function ContextGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
}
class RenderBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Fallback() {
  return (
    <div className="graph-fallback">
      <p>3D rendering is unavailable on this device.</p>
      <span>Every file is still accessible in the node navigator.</span>
      <button
        className="primary-button"
        onClick={() => useExperience.getState().open({ kind: "list" })}
      >
        Open node navigator
      </button>
    </div>
  );
}
export default function ConstellationCanvas({
  nodes,
  edges,
  layoutNodes = nodes,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layoutNodes?: GraphNode[];
}) {
  const reduced = !!useReducedMotion();
  const timeline = useRef(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [lost, setLost] = useState(false);
  const reducedDetail = useExperience((s) => s.reducedDetail);
  const positions = useMemo(() => sphericalLayout(layoutNodes), [layoutNodes]);
  const delays = useMemo(() => nodeEntranceDelays(layoutNodes), [layoutNodes]);
  const duration = useMemo(() => entranceDuration(delays), [delays]);
  const onLost = useMemo(() => () => setLost(true), []);
  useEffect(() => {
    const change = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  const low = reducedDetail || window.innerWidth < 650;
  const hovered = useExperience((s) => s.hovered);
  const hoverNode = nodes.find((n) => n.id === hovered);
  return (
    <div
      className="constellation-canvas"
      role="img"
      aria-label="Interactive 3D repository constellation. Use Search or the node navigator for keyboard access."
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {lost ? (
        <Fallback />
      ) : (
        <RenderBoundary fallback={<Fallback />}>
          <Canvas
            camera={{ position: [0, 0.5, 13], fov: 43, near: 0.1, far: 100 }}
            dpr={low ? [1, 1.25] : [1, 1.75]}
            frameloop={hidden ? "never" : "always"}
            gl={{
              antialias: !low,
              alpha: false,
              powerPreference: low ? "low-power" : "high-performance",
            }}
            onPointerMissed={() => useExperience.getState().select(null)}
            fallback={<Fallback />}
          >
            <color attach="background" args={["#000000"]} />
            <EntranceClock
              timeline={timeline}
              reduced={reduced}
              duration={duration}
            />
            <NodeField
              nodes={nodes}
              edges={edges}
              positions={positions}
              timeline={timeline}
              delays={delays}
            />
            <EdgeField
              edges={edges}
              positions={positions}
              timeline={timeline}
              delays={delays}
            />
            <Camera
              positions={positions}
              paused={paused || hidden}
              reduced={reduced}
              timeline={timeline}
              duration={duration}
            />
            <ContextGuard onLost={onLost} />
            <SceneLabels
              nodes={nodes}
              positions={positions}
              timeline={timeline}
              delays={delays}
            />
            <AdaptiveDpr pixelated />
          </Canvas>
        </RenderBoundary>
      )}
      <div className="scene-labels" aria-hidden="true">
        {nodes
          .filter((n) => ["module", "repository", "entry"].includes(n.type))
          .map((n) => (
            <span
              id={`label-${n.id}`}
              className="star-label projected-label"
              style={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
              key={n.id}
            >
              {n.label}
            </span>
          ))}
        {hoverNode && (
          <div id="node-hover-label" className="node-tooltip projected-label">
            <strong>{hoverNode.label}</strong>
            <span>
              {hoverNode.type} · {hoverNode.path}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

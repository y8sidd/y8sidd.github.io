import {
  Component,
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
function NodeField({
  nodes,
  edges,
  positions,
  reduced,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Map<string, Position>;
  reduced: boolean;
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
  const group = useRef<THREE.Group>(null);
  const progress = useRef(reduced ? 1 : 0.025);
  useFrame((_, delta) => {
    if (group.current && progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta * 0.72);
      const t = 1 - Math.pow(1 - progress.current, 3);
      group.current.scale.setScalar(0.72 + 0.28 * t);
    }
  });
  useLayoutEffect(() => {
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    nodes.forEach((n, i) => {
      const p = positions.get(n.id)!;
      const size =
        n.type === "repository"
          ? 0.072
          : n.type === "module"
            ? 0.055
            : n.type === "entry"
              ? 0.048
              : 0.024;
      object.position.set(...p);
      object.scale.setScalar(size * (active === n.id ? 1.5 : 1));
      object.updateMatrix();
      cores.current?.setMatrixAt(i, object.matrix);
      const dim =
        (active && !connected.has(n.id)) || (query && !matches.has(n.id));
      color.setScalar(
        dim ? 0.11 : active === n.id ? 1 : n.type === "module" ? 0.88 : 0.69,
      );
      cores.current?.setColorAt(i, color);
      object.scale.setScalar(size * 3.8);
      object.updateMatrix();
      halos.current?.setMatrixAt(i, object.matrix);
      halos.current?.setColorAt(i, color);
    });
    [cores.current, halos.current].forEach((mesh) => {
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    });
  }, [nodes, positions, active, connected, matches, query]);
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
    <group ref={group}>
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
        <meshBasicMaterial
          transparent
          opacity={0.065}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
function EdgeField({
  edges,
  positions,
}: {
  edges: GraphEdge[];
  positions: Map<string, Position>;
}) {
  const selected = useExperience((s) => s.selected);
  const hovered = useExperience((s) => s.hovered);
  const active = hovered ?? selected;
  const geometry = useMemo(() => {
    const points: number[] = [];
    const colors: number[] = [];
    edges.forEach((e) => {
      const a = positions.get(e.source);
      const b = positions.get(e.target);
      if (!a || !b) return;
      points.push(...a, ...b);
      const bright = active
        ? e.source === active || e.target === active
          ? 0.64
          : 0.035
        : e.type === "imports"
          ? 0.22
          : 0.1;
      colors.push(bright, bright, bright, bright, bright, bright);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [edges, positions, active]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
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
}: {
  positions: Map<string, Position>;
  paused: boolean;
  reduced: boolean;
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
    if (auto && !paused && !selected && overlay === "none" && !reduced)
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
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [lost, setLost] = useState(false);
  const reducedDetail = useExperience((s) => s.reducedDetail);
  const positions = useMemo(() => sphericalLayout(layoutNodes), [layoutNodes]);
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
            <NodeField
              nodes={nodes}
              edges={edges}
              positions={positions}
              reduced={reduced}
            />
            <EdgeField edges={edges} positions={positions} />
            <Camera
              positions={positions}
              paused={paused || hidden}
              reduced={reduced}
            />
            <ContextGuard onLost={onLost} />
            <SceneLabels nodes={nodes} positions={positions} />
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

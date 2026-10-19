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
import { motion, useReducedMotion } from "motion/react";
import * as THREE from "three";
import type { GraphNode, GraphEdge, Position } from "../../types/repository";
import { sphericalLayout } from "../../lib/sphericalLayout";
import { connectedIds, searchNodes } from "../../lib/graphUtils";
import { useExperience } from "../../stores/experienceStore";
import { SceneLabels } from "./SceneLabels";
import {
  entrance,
  ambientPulses,
  connectionPulse,
  nodeMotion,
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
  active,
  onStart,
}: {
  onStart?: () => void;
  active: boolean;
  timeline: EntranceTimeline;
  reduced: boolean;
  duration: number;
}) {
  const started = useRef(false);
  useFrame((_, delta) => {
    if (!active) return;
    if (!started.current) {
      started.current = true;
      onStart?.();
    }
    timeline.current = reduced
      ? duration
      : timeline.current + Math.min(delta, 0.05) * entrance.playbackRate;
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
          isRoot: !node.parentId,
          motion: nodeMotion(node.id),
        };
      }),
    [nodes, positions, active, connected, query, matches, delays],
  );

  const updateStars = useCallback(() => {
    const { object, color } = scratch;
    stars.forEach((star, i) => {
      const bloom = starBloom(
        timeline.current,
        star.delay,
        star.isRoot,
        star.motion,
      );
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
      (star) =>
        timeline.current >=
        star.delay + (star.isRoot ? entrance.nodeBloom : star.motion.bloom),
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
  duration,
  reduced,
}: {
  edges: GraphEdge[];
  positions: Map<string, Position>;
  timeline: EntranceTimeline;
  delays: Map<string, number>;
  duration: number;
  reduced: boolean;
}) {
  const selected = useExperience((s) => s.selected);
  const hovered = useExperience((s) => s.hovered);
  const gl = useThree((s) => s.gl);
  const pulseUniforms = useMemo(() => ({ pixelRatio: { value: 1 } }), []);
  const active = hovered ?? selected;
  const field = useMemo(() => {
    const segments = [...edges]
      .sort((a, b) => a.id.localeCompare(b.id))
      .flatMap((edge) => {
        const motion = edgeEntrance(edge, delays);
        const { from, to } = motion;
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
        return [
          {
            a,
            b,
            bright,
            ...motion,
            length: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
          },
        ];
      });
    const makeLines = () => {
      const geometry = new THREE.BufferGeometry();
      for (const name of ["position", "color"]) {
        geometry.setAttribute(
          name,
          new THREE.Float32BufferAttribute(
            new Float32Array(segments.length * 6),
            3,
          ).setUsage(THREE.DynamicDrawUsage),
        );
      }
      return geometry;
    };
    const pulse = new THREE.BufferGeometry();
    pulse.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        new Float32Array(segments.length * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    pulse.setAttribute(
      "strength",
      new THREE.Float32BufferAttribute(
        new Float32Array(segments.length),
        1,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    return {
      geometry: makeLines(),
      trail: makeLines(),
      pulse,
      segments,
      settled: false,
    };
  }, [edges, positions, active, delays]);
  useLayoutEffect(() => {
    // Clear a traveling accent immediately if reduced motion is enabled live.
    field.settled = false;
  }, [field, reduced]);
  useEffect(
    () => () => {
      field.geometry.dispose();
      field.trail.dispose();
      field.pulse.dispose();
    },
    [field],
  );
  useFrame(() => {
    if (field.settled && reduced) return;
    pulseUniforms.pixelRatio.value = gl.getPixelRatio();
    const points = field.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const colors = field.geometry.getAttribute(
      "color",
    ) as THREE.BufferAttribute;
    const tails = field.trail.getAttribute("position") as THREE.BufferAttribute;
    const tailColors = field.trail.getAttribute(
      "color",
    ) as THREE.BufferAttribute;
    const heads = field.pulse.getAttribute("position") as THREE.BufferAttribute;
    const strengths = field.pulse.getAttribute(
      "strength",
    ) as THREE.BufferAttribute;
    // Clear only the tiny moving accents once the static network has settled.
    // Ambient motion updates at most two paths, regardless of repository size.
    (strengths.array as Float32Array).fill(0);
    (tailColors.array as Float32Array).fill(0);
    const drawPulse = (
      i: number,
      progress: number,
      light: number,
      reverse = false,
    ) => {
      const segment = field.segments[i];
      const { bright, length, tail, strength } = segment;
      const a = reverse ? segment.b : segment.a;
      const b = reverse ? segment.a : segment.b;
      const x = a[0] + (b[0] - a[0]) * progress;
      const y = a[1] + (b[1] - a[1]) * progress;
      const z = a[2] + (b[2] - a[2]) * progress;
      // A very short taper, capped in world space so long links don't become beams.
      const tailProgress = Math.max(
        0,
        progress - Math.min(0.065, tail / Math.max(length, 0.001)),
      );
      tails.setXYZ(
        i * 2,
        a[0] + (b[0] - a[0]) * tailProgress,
        a[1] + (b[1] - a[1]) * tailProgress,
        a[2] + (b[2] - a[2]) * tailProgress,
      );
      tails.setXYZ(i * 2 + 1, x, y, z);
      tailColors.setXYZ(i * 2, 0, 0, 0);
      const tip = light * strength * Math.min(0.7, bright * 4);
      tailColors.setXYZ(i * 2 + 1, tip, tip, tip);
      heads.setXYZ(i, x, y, z);
      strengths.setX(
        i,
        light * strength * (active && bright < 0.1 ? 0.15 : 0.85),
      );
    };
    if (!field.settled) {
      field.segments.forEach(({ a, b, bright, start, duration: travel }, i) => {
        const { progress, light } = connectionPulse(
          timeline.current,
          start,
          travel,
        );
        points.setXYZ(i * 2, ...a);
        points.setXYZ(
          i * 2 + 1,
          a[0] + (b[0] - a[0]) * progress,
          a[1] + (b[1] - a[1]) * progress,
          a[2] + (b[2] - a[2]) * progress,
        );
        // Leave the original, quiet connection behind the traveling light.
        const glow = bright * Math.min(1, progress * 8);
        colors.setXYZ(i * 2, glow, glow, glow);
        colors.setXYZ(i * 2 + 1, glow, glow, glow);
        drawPulse(i, progress, light);
      });
      points.needsUpdate = true;
      colors.needsUpdate = true;
      field.settled = field.segments.every(
        (segment) =>
          timeline.current >=
          segment.start + segment.duration + entrance.pulseFade,
      );
    }
    if (!reduced) {
      for (const pulse of ambientPulses(
        timeline.current - duration - 0.6,
        field.segments.length,
      )) {
        drawPulse(pulse.index, pulse.progress, pulse.light, pulse.reverse);
      }
    }
    for (const attribute of [tails, tailColors, heads, strengths])
      attribute.needsUpdate = true;
  });
  return (
    <group>
      <lineSegments geometry={field.geometry} frustumCulled={false}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments
        geometry={field.trail}
        frustumCulled={false}
        raycast={() => {}}
      >
        <lineBasicMaterial
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
      <points geometry={field.pulse} frustumCulled={false} raycast={() => {}}>
        <shaderMaterial
          uniforms={pulseUniforms}
          transparent
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          vertexShader={`
            attribute float strength;
            uniform float pixelRatio;
            varying float pulseStrength;
            void main() {
              pulseStrength = strength;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = 5.5 * pixelRatio;
            }
          `}
          fragmentShader={`
            varying float pulseStrength;
            void main() {
              float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
              float glow = exp(-radius * radius * 6.0) * (1.0 - smoothstep(0.75, 1.0, radius));
              gl_FragColor = vec4(vec3(1.0), glow * pulseStrength);
            }
          `}
        />
      </points>
    </group>
  );
}
function Camera({
  paused,
  reduced,
  timeline,
  duration,
}: {
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
    // Selection slides the whole canvas without changing the camera framing.
  }, [command, reduced, distance]);
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
function Fallback({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
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
  formationActive = true,
  onFormationStart,
}: {
  onFormationStart?: () => void;
  formationActive?: boolean;
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
  const selected = useExperience((s) => s.selected);
  const hoverNode = nodes.find((n) => n.id === hovered);
  return (
    <motion.div
      initial={false}
      animate={{ opacity: reduced ? 1 : selected ? [1, 0.45, 1] : [1, 0.65, 1] }}
      transition={{ duration: reduced ? 0 : 0.8, times: [0, 0.35, 1], ease: "easeInOut" }}
      className="constellation-canvas"
      role="img"
      aria-label="Interactive 3D repository constellation. Use Search or the node navigator for keyboard access."
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {lost ? (
        <Fallback onReady={onFormationStart} />
      ) : (
        <RenderBoundary fallback={<Fallback onReady={onFormationStart} />}>
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
            fallback={<Fallback onReady={onFormationStart} />}
          >
            <color attach="background" args={["#000000"]} />
            <EntranceClock
              active={formationActive}
              onStart={onFormationStart}
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
              duration={duration}
              reduced={reduced}
            />
            <Camera
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
    </motion.div>
  );
}

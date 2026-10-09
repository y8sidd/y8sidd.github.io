import {
  CircleHelp,
  Search,
  SlidersHorizontal,
  Plus,
  Minus,
  RotateCcw,
  Scan,
  Orbit,
  ListTree,
  MessageCircle,
  Settings2,
} from "lucide-react";
import { IconButton } from "../shared/IconButton";
import { useExperience } from "../../stores/experienceStore";
export function TopControls() {
  const open = useExperience((s) => s.open);
  return (
    <nav className="top-controls" aria-label="Explore tools">
      <IconButton
        label="Search files (⌘K)"
        onClick={() => open({ kind: "search" })}
      >
        <Search size={17} />
      </IconButton>
      <IconButton label="Node navigator" onClick={() => open({ kind: "list" })}>
        <ListTree size={17} />
      </IconButton>
      <span className="control-divider" />
      <IconButton
        label="Help and controls"
        onClick={() => open({ kind: "help" })}
      >
        <CircleHelp size={17} />
      </IconButton>
      <IconButton label="Settings" onClick={() => open({ kind: "settings" })}>
        <Settings2 size={17} />
      </IconButton>
    </nav>
  );
}
export function GraphControls() {
  const move = useExperience((s) => s.moveCamera);
  const auto = useExperience((s) => s.autoRotate);
  const setAuto = useExperience((s) => s.setAutoRotate);
  const open = useExperience((s) => s.open);
  return (
    <>
      <nav className="graph-controls glass" aria-label="Graph controls">
        <IconButton label="Reset view" onClick={() => move("reset")}>
          <RotateCcw size={16} />
        </IconButton>
        <IconButton label="Fit graph" onClick={() => move("fit")}>
          <Scan size={16} />
        </IconButton>
        <span className="control-divider" />
        <IconButton label="Zoom out" onClick={() => move("out")}>
          <Minus size={16} />
        </IconButton>
        <IconButton label="Zoom in" onClick={() => move("in")}>
          <Plus size={16} />
        </IconButton>
        <span className="control-divider" />
        <IconButton
          label={auto ? "Pause auto rotation" : "Enable auto rotation"}
          aria-pressed={auto}
          onClick={() => setAuto(!auto)}
        >
          <Orbit size={17} />
        </IconButton>
        <IconButton
          label="Filter graph"
          onClick={() => open({ kind: "filters" })}
        >
          <SlidersHorizontal size={16} />
        </IconButton>
      </nav>
      <button
        className="mentor-launch glass"
        onClick={() => open({ kind: "mentor" })}
        aria-label="Open AI Mentor"
      >
        <MessageCircle size={17} />
        <span>Ask Mentor</span>
        <kbd>M</kbd>
      </button>
    </>
  );
}

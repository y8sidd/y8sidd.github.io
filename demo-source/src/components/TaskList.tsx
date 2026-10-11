import type { Task } from '../types/task';

interface Props {
  tasks: Task[];
  onToggle: (id: string) => void;
}

export function TaskList({ tasks, onToggle }: Props) {
  return <ul>{tasks.map(task => (
    <li key={task.id}>
      <button onClick={() => onToggle(task.id)}>
        {task.done ? '✓' : '○'} {task.title}
      </button>
    </li>
  ))}</ul>;
}

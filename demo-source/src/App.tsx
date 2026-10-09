import { Header } from './components/Header';
import { TaskList } from './components/TaskList';
import { useTasks } from './hooks/useTasks';

export function App() {
  const { tasks, toggleTask } = useTasks();
  return (
    <main>
      <Header title="Constellation" />
      <TaskList tasks={tasks} onToggle={toggleTask} />
    </main>
  );
}

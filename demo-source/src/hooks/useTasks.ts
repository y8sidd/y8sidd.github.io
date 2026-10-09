import { useState } from 'react';
import { initialTasks } from '../data/tasks';

export function useTasks() {
  const [tasks, setTasks] = useState(initialTasks);
  function toggleTask(id: string) {
    setTasks(current => current.map(task =>
      task.id === id ? { ...task, done: !task.done } : task
    ));
  }
  return { tasks, toggleTask };
}

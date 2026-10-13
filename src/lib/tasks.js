// Чистая логика демо-кабинета: без DOM, покрыта тестами.
export const TASK_FILTERS = [
  { id: 'active', label: 'В работе' },
  { id: 'done', label: 'Выполнено' },
  { id: 'all', label: 'Все' },
];

export function countTasks(tasks) {
  const done = tasks.filter((task) => task.status === 'done').length;
  return { active: tasks.length - done, done, all: tasks.length };
}

export function filterTasks(tasks, filter) {
  return filter === 'all' ? tasks : tasks.filter((task) => task.status === filter);
}

export function toggleTask(tasks, id) {
  return tasks.map((task) =>
    task.id === id ? { ...task, status: task.status === 'done' ? 'active' : 'done' } : task,
  );
}

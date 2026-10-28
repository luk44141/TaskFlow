/* ==========================================================
   TaskFlow · Lógica de la aplicación
   Índice: 1. Constantes · 2. Estado · 3. Referencias al DOM
           4. Persistencia · 5. Utilidades de fecha · 6. Validación
           7. Operaciones (agregar, completar, eliminar)
           8. Renderizado · 9. Eventos · 10. Inicio
   ========================================================== */

(function () {
  'use strict';

  /* 1. Constantes ------------------------------------------- */
  const STORAGE_KEY = 'taskflow.tasks';
  const TITLE_MIN = 3;
  const TITLE_MAX = 80;
  const SUBJECT_MIN = 2;
  const SUBJECT_MAX = 30;

  /* 2. Estado ----------------------------------------------- */
  let tasks = [];
  let currentFilter = 'all'; // 'all' | 'pending' | 'completed'

  /* 3. Referencias al DOM ----------------------------------- */
  const form = document.getElementById('task-form');
  const inputTitle = document.getElementById('task-title');
  const inputSubject = document.getElementById('task-subject');
  const inputDate = document.getElementById('task-date');
  const taskList = document.getElementById('task-list');
  const emptyMessage = document.getElementById('empty-message');
  const countPending = document.getElementById('count-pending');
  const countCompleted = document.getElementById('count-completed');
  const filterButtons = document.querySelectorAll('.filter');
  const clearButton = document.getElementById('clear-completed');

  const fields = {
    title: { input: inputTitle, error: document.getElementById('error-title') },
    subject: { input: inputSubject, error: document.getElementById('error-subject') },
    date: { input: inputDate, error: document.getElementById('error-date') }
  };

  /* 4. Persistencia (localStorage) -------------------------- */

  /** Guarda las tareas. Devuelve false si el navegador lo impide. */
  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      return true;
    } catch (error) {
      console.error('No se pudo guardar en localStorage:', error);
      return false;
    }
  }

  /**
   * Carga las tareas guardadas. Si todavía no hay datos (primera visita),
   * devuelve null para que se carguen las tareas de ejemplo.
   * Si el usuario borra todo, la lista queda vacía y NO se vuelven a crear.
   */
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed.filter(isValidTask);
    } catch (error) {
      console.error('No se pudo leer localStorage:', error);
      return [];
    }
  }

  /** Comprueba que un objeto leído tenga la forma de una tarea. */
  function isValidTask(task) {
    return (
      task &&
      typeof task.id === 'string' &&
      typeof task.title === 'string' &&
      typeof task.subject === 'string' &&
      typeof task.date === 'string' &&
      typeof task.completed === 'boolean'
    );
  }

  /** Tareas de ejemplo: se pueden completar y eliminar como cualquier otra. */
  function createSampleTasks() {
    const today = new Date();
    return [
      createTask('Resolver ejercicios de ecuaciones', 'Matemática', formatInputDate(addDays(today, 2))),
      createTask('Resumen de la Revolución de Mayo', 'Historia', formatInputDate(addDays(today, 5))),
      createTask('Informe del experimento de células', 'Biología', formatInputDate(addDays(today, -1)))
    ];
  }

  /* 5. Utilidades de fecha ---------------------------------- */

  /** Convierte "AAAA-MM-DD" en Date local (evita el desfase por zona horaria). */
  function parseDate(value) {
    const parts = value.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

    const [year, month, day] = parts;
    const date = new Date(year, month - 1, day);

    const isReal =
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day;

    return isReal ? date : null;
  }

  /** Convierte un Date en "AAAA-MM-DD" (formato del input date). */
  function formatInputDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /** Días que faltan hasta la fecha (negativo si ya pasó). */
  function daysUntil(value) {
    const date = parseDate(value);
    if (!date) return null;
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((date - startOfToday()) / msPerDay);
  }

  /** Fecha legible en español, por ejemplo "28 oct 2026". */
  function formatDisplayDate(value) {
    const date = parseDate(value);
    if (!date) return value;
    return date.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  /* 6. Validación ------------------------------------------- */

  /** Devuelve un objeto con los mensajes de error (vacío si todo está bien). */
  function validate(title, subject, date) {
    const errors = {};

    if (title.length === 0) {
      errors.title = 'El título es obligatorio.';
    } else if (title.length < TITLE_MIN) {
      errors.title = 'El título debe tener al menos ' + TITLE_MIN + ' caracteres.';
    } else if (title.length > TITLE_MAX) {
      errors.title = 'El título no puede superar los ' + TITLE_MAX + ' caracteres.';
    }

    if (subject.length === 0) {
      errors.subject = 'La materia es obligatoria.';
    } else if (subject.length < SUBJECT_MIN) {
      errors.subject = 'La materia debe tener al menos ' + SUBJECT_MIN + ' caracteres.';
    } else if (subject.length > SUBJECT_MAX) {
      errors.subject = 'La materia no puede superar los ' + SUBJECT_MAX + ' caracteres.';
    }

    if (date.length === 0) {
      errors.date = 'La fecha de entrega es obligatoria.';
    } else if (!parseDate(date)) {
      errors.date = 'La fecha no es válida.';
    }

    return errors;
  }

  function showErrors(errors) {
    Object.keys(fields).forEach(function (name) {
      const message = errors[name] || '';
      fields[name].error.textContent = message;
      fields[name].input.classList.toggle('is-invalid', message !== '');
    });
  }

  function clearError(name) {
    fields[name].error.textContent = '';
    fields[name].input.classList.remove('is-invalid');
  }

  /* 7. Operaciones ------------------------------------------ */

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function createTask(title, subject, date) {
    return {
      id: generateId(),
      title: title,
      subject: subject,
      date: date,
      completed: false
    };
  }

  function addTask(title, subject, date) {
    tasks.push(createTask(title, subject, date));
    saveTasks();
    render();
  }

  function toggleTask(id) {
    const task = tasks.find(function (item) { return item.id === id; });
    if (!task) return;
    task.completed = !task.completed;
    saveTasks();
    render();
  }

  function deleteTask(id) {
    tasks = tasks.filter(function (item) { return item.id !== id; });
    saveTasks();
    render();
  }

  function clearCompleted() {
    const hasCompleted = tasks.some(function (item) { return item.completed; });
    if (!hasCompleted) return;

    if (window.confirm('¿Borrar todas las tareas completadas?')) {
      tasks = tasks.filter(function (item) { return !item.completed; });
      saveTasks();
      render();
    }
  }

  function setFilter(filter) {
    currentFilter = filter;
    filterButtons.forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.filter === filter);
    });
    render();
  }

  /* 8. Renderizado ------------------------------------------- */

  /** Devuelve las tareas según el filtro, ordenadas por fecha de entrega. */
  function getVisibleTasks() {
    return tasks
      .filter(function (task) {
        if (currentFilter === 'pending') return !task.completed;
        if (currentFilter === 'completed') return task.completed;
        return true;
      })
      .sort(function (a, b) {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.date.localeCompare(b.date);
      });
  }

  function updateCounters() {
    const completed = tasks.filter(function (task) { return task.completed; }).length;
    countCompleted.textContent = completed;
    countPending.textContent = tasks.length - completed;
    clearButton.disabled = completed === 0;
    clearButton.style.opacity = completed === 0 ? '0.5' : '1';
    clearButton.style.cursor = completed === 0 ? 'not-allowed' : 'pointer';
  }

  function getEmptyText() {
    if (tasks.length === 0) return 'Todavía no hay tareas. ¡Agregá la primera!';
    if (currentFilter === 'pending') return 'No tenés tareas pendientes. 🎉';
    if (currentFilter === 'completed') return 'Todavía no completaste ninguna tarea.';
    return '';
  }

  /** Crea un elemento HTML con texto seguro (sin innerHTML). */
  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createDueBadge(task) {
    if (task.completed) return null;

    const days = daysUntil(task.date);
    if (days === null) return null;

    if (days < 0) return createElement('span', 'badge badge--overdue', 'Vencida');
    if (days === 0) return createElement('span', 'badge badge--soon', 'Vence hoy');
    if (days === 1) return createElement('span', 'badge badge--soon', 'Vence mañana');
    return null;
  }

  function createTaskElement(task) {
    const item = createElement('li', 'task' + (task.completed ? ' is-completed' : ''));
    item.dataset.id = task.id;

    // Botón para completar / desmarcar
    const check = createElement('button', 'task__check', '✓');
    check.type = 'button';
    check.dataset.action = 'toggle';
    check.setAttribute('aria-label',
      (task.completed ? 'Marcar como pendiente: ' : 'Marcar como completada: ') + task.title);
    check.setAttribute('aria-pressed', String(task.completed));

    // Contenido
    const body = createElement('div', 'task__body');
    body.appendChild(createElement('p', 'task__title', task.title));

    const meta = createElement('div', 'task__meta');
    meta.appendChild(createElement('span', 'badge', task.subject));
    meta.appendChild(createElement('span', '', '📅 ' + formatDisplayDate(task.date)));

    const dueBadge = createDueBadge(task);
    if (dueBadge) meta.appendChild(dueBadge);

    body.appendChild(meta);

    // Botón para eliminar
    const remove = createElement('button', 'task__delete', '🗑');
    remove.type = 'button';
    remove.dataset.action = 'delete';
    remove.setAttribute('aria-label', 'Eliminar tarea: ' + task.title);

    item.appendChild(check);
    item.appendChild(body);
    item.appendChild(remove);
    return item;
  }

  function render() {
    const visible = getVisibleTasks();

    taskList.textContent = '';
    visible.forEach(function (task) {
      taskList.appendChild(createTaskElement(task));
    });

    const emptyText = visible.length === 0 ? getEmptyText() : '';
    emptyMessage.textContent = emptyText;
    emptyMessage.hidden = emptyText === '';

    updateCounters();
  }

  /* 9. Eventos ----------------------------------------------- */

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    const title = inputTitle.value.trim();
    const subject = inputSubject.value.trim();
    const date = inputDate.value;

    const errors = validate(title, subject, date);
    showErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstInvalid = Object.keys(fields).find(function (name) { return errors[name]; });
      fields[firstInvalid].input.focus();
      return;
    }

    addTask(title, subject, date);
    form.reset();
    inputTitle.focus();
  });

  // Quita el error de un campo apenas el usuario vuelve a escribir
  Object.keys(fields).forEach(function (name) {
    fields[name].input.addEventListener('input', function () { clearError(name); });
  });

  // Un solo listener para toda la lista (delegación de eventos)
  taskList.addEventListener('click', function (event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const item = button.closest('.task');
    if (!item) return;

    if (button.dataset.action === 'toggle') toggleTask(item.dataset.id);
    if (button.dataset.action === 'delete') deleteTask(item.dataset.id);
  });

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () { setFilter(button.dataset.filter); });
  });

  clearButton.addEventListener('click', clearCompleted);

  /* 10. Inicio ----------------------------------------------- */
  function init() {
    const stored = loadTasks();

    if (stored === null) {
      tasks = createSampleTasks(); // primera visita
      saveTasks();
    } else {
      tasks = stored;
    }

    render();
  }

  init();
})();
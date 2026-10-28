/* ==========================================================
   TaskFlow · Lógica de la aplicación
   Índice: 1. Constantes · 2. Estado · 3. Referencias al DOM
           4. Tema claro/oscuro · 5. Persistencia · 6. Utilidades
           7. Validación · 8. Operaciones · 9. Filtros y orden
           10. Renderizado · 11. Avisos · 12. Eventos · 13. Inicio
   ========================================================== */

(function () {
  'use strict';

  /* 1. Constantes ------------------------------------------- */
  const STORAGE_KEY = 'taskflow.tasks';
  const THEME_KEY = 'taskflow.theme';
  const DEFAULT_THEME = 'dark';

  const TITLE_MIN = 3;
  const TITLE_MAX = 80;
  const SUBJECT_MIN = 2;
  const SUBJECT_MAX = 30;

  const DUE_SOON_DAYS = 3;      // "vence pronto" = hoy o dentro de 3 días
  const TOAST_DURATION = 3000;  // milisegundos
  const MAX_TOASTS = 3;

  const DEFAULT_PRIORITY = 'medium';
  const PRIORITIES = {
    high: { label: 'Alta', order: 0 },
    medium: { label: 'Media', order: 1 },
    low: { label: 'Baja', order: 2 }
  };

  const DEFAULT_SUBJECTS = [
    'Matemática', 'Lengua', 'Historia', 'Geografía', 'Biología',
    'Física', 'Química', 'Inglés', 'Informática'
  ];

  const DEFAULT_FILTERS = { status: 'all', subject: 'all', search: '', sort: 'date' };

  /* 2. Estado ----------------------------------------------- */
  let tasks = [];
  let editingId = null;                       // id de la tarea que se está editando
  const filters = Object.assign({}, DEFAULT_FILTERS);

  /* 3. Referencias al DOM ----------------------------------- */
  const $ = function (id) { return document.getElementById(id); };

  const themeToggle = $('theme-toggle');
  const themeIcon = $('theme-icon');
  const themeLabel = $('theme-label');

  const form = $('task-form');
  const formCard = $('form-card');
  const formTitle = $('form-title');
  const submitButton = $('submit-button');
  const cancelButton = $('cancel-edit');
  const inputTitle = $('task-title');
  const inputSubject = $('task-subject');
  const inputPriority = $('task-priority');
  const inputDate = $('task-date');
  const subjectsList = $('subjects');

  const searchInput = $('search-input');
  const subjectFilter = $('subject-filter');
  const sortSelect = $('sort-select');
  const statusButtons = document.querySelectorAll('.filter');

  const taskList = $('task-list');
  const emptyState = $('empty-state');
  const emptyTitle = $('empty-title');
  const emptyText = $('empty-text');
  const clearFiltersButton = $('clear-filters');
  const resultsCount = $('results-count');
  const clearCompletedButton = $('clear-completed');

  const statTotal = $('count-total');
  const statPending = $('count-pending');
  const statCompleted = $('count-completed');
  const statOverdue = $('count-overdue');
  const toastBox = $('toasts');

  const fields = {
    title: { input: inputTitle, error: $('error-title') },
    subject: { input: inputSubject, error: $('error-subject') },
    date: { input: inputDate, error: $('error-date') }
  };

  /* 4. Tema claro / oscuro ---------------------------------- */

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'light' || saved === 'dark' ? saved : DEFAULT_THEME;
    } catch (error) {
      return DEFAULT_THEME;
    }
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = theme;
    themeIcon.textContent = isDark ? '☀️' : '🌙';
    themeLabel.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
    themeToggle.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (error) {
      console.error('No se pudo guardar el tema:', error);
    }
  }

  /* 5. Persistencia (localStorage) -------------------------- */

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
   * Carga las tareas guardadas.
   * - Primera visita (no hay datos): devuelve null para cargar los ejemplos.
   * - Datos de versiones anteriores: se completan los campos nuevos.
   * - Datos ilegibles: se hace una copia de respaldo antes de continuar.
   */
  function loadTasks() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Formato inesperado');

      return parsed.filter(isValidTask).map(normalizeTask);
    } catch (error) {
      console.error('No se pudo leer localStorage:', error);
      backupRawData(raw);
      return [];
    }
  }

  function backupRawData(raw) {
    if (raw === null) return;
    try {
      localStorage.setItem(STORAGE_KEY + '.backup', raw);
    } catch (error) {
      console.error('No se pudo crear la copia de respaldo:', error);
    }
  }

  /** Comprueba que un objeto leído tenga lo mínimo de una tarea. */
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

  /** Agrega los campos nuevos (prioridad y fecha de creación) a tareas viejas. */
  function normalizeTask(task, index) {
    return {
      id: task.id,
      title: task.title,
      subject: task.subject,
      date: task.date,
      completed: task.completed,
      priority: Object.keys(PRIORITIES).includes(task.priority) ? task.priority : DEFAULT_PRIORITY,
      createdAt: typeof task.createdAt === 'number' ? task.createdAt : guessCreatedAt(task.id, index)
    };
  }

  /** Los ids viejos empiezan con la hora de creación (en base 36). */
  function guessCreatedAt(id, index) {
    const time = parseInt(id.slice(0, 8), 36);
    return time > 1e12 ? time : index;
  }

  /** Tareas de ejemplo: se pueden editar, completar y eliminar como cualquier otra. */
  function createSampleTasks() {
    const today = new Date();
    return [
      createTask({ title: 'Resolver ejercicios de ecuaciones', subject: 'Matemática', priority: 'high', date: formatInputDate(addDays(today, 2)) }, 0),
      createTask({ title: 'Resumen de la Revolución de Mayo', subject: 'Historia', priority: 'medium', date: formatInputDate(addDays(today, 6)) }, 1),
      createTask({ title: 'Informe del experimento de células', subject: 'Biología', priority: 'low', date: formatInputDate(addDays(today, -1)) }, 2)
    ];
  }

  /* 6. Utilidades ------------------------------------------- */

  /** Crea un elemento HTML con texto seguro (sin innerHTML). */
  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createOption(label, value) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  function plural(count, one, many) {
    return count === 1 ? one : many;
  }

  /** Quita espacios repetidos y de los extremos. */
  function cleanText(value) {
    return value.replace(/\s+/g, ' ').trim();
  }

  /** Minúsculas y sin acentos, para buscar y comparar ("Matemática" = "matematica"). */
  function normalizeText(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  /** Convierte "AAAA-MM-DD" en Date local (evita el desfase por zona horaria). */
  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

    const [year, month, day] = value.split('-').map(Number);
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
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Una tarea está vencida si no está completada y su fecha ya pasó. */
  function isOverdue(task) {
    const days = daysUntil(task.date);
    return !task.completed && days !== null && days < 0;
  }

  /** Texto y tipo del aviso de vencimiento (o null si no corresponde). */
  function getDueInfo(task) {
    if (task.completed) return null;

    const days = daysUntil(task.date);
    if (days === null) return null;

    if (days < 0) {
      const late = -days;
      return { type: 'overdue', text: 'Vencida hace ' + late + plural(late, ' día', ' días') };
    }
    if (days === 0) return { type: 'soon', text: 'Vence hoy' };
    if (days === 1) return { type: 'soon', text: 'Vence mañana' };
    if (days <= DUE_SOON_DAYS) return { type: 'soon', text: 'Vence en ' + days + ' días' };
    return null;
  }

  /**
   * Junta materias sin repetir (ignora mayúsculas y acentos).
   * Devuelve un Map: clave normalizada → nombre a mostrar.
   */
  function collectSubjects(names) {
    const subjects = new Map();
    names.forEach(function (name) {
      const key = normalizeText(name);
      if (!subjects.has(key)) subjects.set(key, name);
    });
    return subjects;
  }

  /** Si la materia ya existe con otra escritura, usa la existente ("matematica" → "Matemática"). */
  function canonicalSubject(name) {
    const known = collectSubjects(DEFAULT_SUBJECTS.concat(tasks.map(function (task) { return task.subject; })));
    return known.get(normalizeText(name)) || name;
  }

  /* 7. Validación ------------------------------------------- */

  /** Devuelve un objeto con los mensajes de error (vacío si todo está bien). */
  function validate(data) {
    const errors = {};

    if (data.title.length === 0) {
      errors.title = 'El título es obligatorio.';
    } else if (data.title.length < TITLE_MIN) {
      errors.title = 'El título debe tener al menos ' + TITLE_MIN + ' caracteres.';
    } else if (data.title.length > TITLE_MAX) {
      errors.title = 'El título no puede superar los ' + TITLE_MAX + ' caracteres.';
    }

    if (data.subject.length === 0) {
      errors.subject = 'La materia es obligatoria.';
    } else if (data.subject.length < SUBJECT_MIN) {
      errors.subject = 'La materia debe tener al menos ' + SUBJECT_MIN + ' caracteres.';
    } else if (data.subject.length > SUBJECT_MAX) {
      errors.subject = 'La materia no puede superar los ' + SUBJECT_MAX + ' caracteres.';
    }

    if (data.date.length === 0) {
      errors.date = 'La fecha de entrega es obligatoria.';
    } else if (!parseDate(data.date)) {
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

  /* 8. Operaciones ------------------------------------------ */

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function createTask(data, offset) {
    return {
      id: generateId(),
      title: data.title,
      subject: data.subject,
      date: data.date,
      priority: data.priority,
      completed: false,
      createdAt: Date.now() + (offset || 0)
    };
  }

  function findTask(id) {
    return tasks.find(function (task) { return task.id === id; });
  }

  /** Guarda, vuelve a dibujar y muestra un aviso. Todas las operaciones terminan acá. */
  function commit(message, type) {
    if (saveTasks()) {
      if (message) showToast(message, type);
    } else {
      showToast('No se pudo guardar en este navegador.', 'error');
    }
    render();
  }

  function addTask(data) {
    tasks.push(createTask(data));
    commit('Tarea creada correctamente.', 'success');
  }

  function updateTask(id, data) {
    const task = findTask(id);
    if (!task) {
      showToast('La tarea que querías editar ya no existe.', 'error');
      render();
      return;
    }
    Object.assign(task, data);   // conserva id, estado y fecha de creación
    commit('Tarea actualizada.', 'success');
  }

  function toggleTask(id) {
    const task = findTask(id);
    if (!task) return;
    task.completed = !task.completed;
    commit(task.completed ? 'Tarea marcada como completada.' : 'Tarea marcada como pendiente.', 'info');
  }

  function deleteTask(id) {
    if (!findTask(id)) return;
    tasks = tasks.filter(function (task) { return task.id !== id; });
    if (editingId === id) resetForm();
    commit('Tarea eliminada.', 'info');
  }

  function clearCompleted() {
    const count = tasks.filter(function (task) { return task.completed; }).length;
    if (count === 0) {
      showToast('No hay tareas completadas para eliminar.', 'info');
      return;
    }

    const question = '¿Eliminar ' + count + plural(count, ' tarea completada', ' tareas completadas') +
      '? Esta acción no se puede deshacer.';
    if (!window.confirm(question)) return;

    tasks = tasks.filter(function (task) { return !task.completed; });
    if (editingId && !findTask(editingId)) resetForm();
    commit(count + plural(count, ' tarea eliminada.', ' tareas eliminadas.'), 'info');
  }

  /* Edición: el mismo formulario sirve para crear y para editar */

  function startEditing(id) {
    const task = findTask(id);
    if (!task) {
      showToast('La tarea que querías editar ya no existe.', 'error');
      render();
      return;
    }

    editingId = id;
    inputTitle.value = task.title;
    inputSubject.value = task.subject;
    inputPriority.value = task.priority;
    inputDate.value = task.date;
    showErrors({});
    updateFormMode();
    render();

    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    inputTitle.focus();
  }

  /** Vuelve el formulario al modo "nueva tarea". Quien lo llama se encarga de render(). */
  function resetForm() {
    editingId = null;
    form.reset();
    showErrors({});
    updateFormMode();
  }

  function updateFormMode() {
    const isEditing = editingId !== null;
    formTitle.textContent = isEditing ? 'Editar tarea' : 'Nueva tarea';
    submitButton.textContent = isEditing ? 'Guardar cambios' : 'Agregar tarea';
    cancelButton.hidden = !isEditing;
    formCard.classList.toggle('is-editing', isEditing);
  }

  function readForm() {
    return {
      title: cleanText(inputTitle.value),
      subject: cleanText(inputSubject.value),
      priority: inputPriority.value,
      date: inputDate.value
    };
  }

  /* 9. Filtros y orden -------------------------------------- */

  const STATUS_FILTERS = {
    all: function () { return true; },
    pending: function (task) { return !task.completed; },
    completed: function (task) { return task.completed; },
    overdue: isOverdue
  };

  const SORTERS = {
    date: function (a, b) {
      return a.date.localeCompare(b.date);
    },
    priority: function (a, b) {
      return PRIORITIES[a.priority].order - PRIORITIES[b.priority].order || a.date.localeCompare(b.date);
    },
    created: function (a, b) {
      return b.createdAt - a.createdAt;   // las más nuevas primero
    }
  };

  function matchesSearch(task, query) {
    return normalizeText(task.title).includes(query) || normalizeText(task.subject).includes(query);
  }

  /** Aplica estado, materia y búsqueda; después ordena (las completadas van al final). */
  function getVisibleTasks() {
    const query = normalizeText(filters.search);
    const sorter = SORTERS[filters.sort] || SORTERS.date;

    return tasks
      .filter(STATUS_FILTERS[filters.status] || STATUS_FILTERS.all)
      .filter(function (task) {
        return filters.subject === 'all' || normalizeText(task.subject) === filters.subject;
      })
      .filter(function (task) { return matchesSearch(task, query); })
      .sort(function (a, b) {
        return Number(a.completed) - Number(b.completed) || sorter(a, b);
      });
  }

  function hasActiveFilters() {
    return filters.status !== 'all' || filters.subject !== 'all' || normalizeText(filters.search) !== '';
  }

  function updateStatusButtons() {
    statusButtons.forEach(function (button) {
      const isActive = button.dataset.filter === filters.status;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function clearFilters() {
    Object.assign(filters, DEFAULT_FILTERS);
    searchInput.value = '';
    sortSelect.value = filters.sort;
    updateStatusButtons();
    render();
  }

  /* 10. Renderizado ----------------------------------------- */

  /** Actualiza la lista de materias del filtro y las sugerencias del formulario. */
  function refreshSubjectOptions() {
    const taskSubjects = collectSubjects(tasks.map(function (task) { return task.subject; }));

    // Si la materia filtrada ya no existe (se borró la última tarea), vuelve a "Todas"
    if (filters.subject !== 'all' && !taskSubjects.has(filters.subject)) {
      filters.subject = 'all';
    }

    const sorted = Array.from(taskSubjects.entries()).sort(function (a, b) {
      return a[1].localeCompare(b[1], 'es');
    });

    subjectFilter.replaceChildren(createOption('Todas las materias', 'all'));
    sorted.forEach(function (entry) {
      subjectFilter.appendChild(createOption(entry[1], entry[0]));
    });
    subjectFilter.value = filters.subject;

    const suggestions = collectSubjects(DEFAULT_SUBJECTS.concat(sorted.map(function (entry) { return entry[1]; })));
    subjectsList.replaceChildren();
    suggestions.forEach(function (label) {
      const option = document.createElement('option');
      option.value = label;
      subjectsList.appendChild(option);
    });
  }

  function updateStats() {
    const completed = tasks.filter(function (task) { return task.completed; }).length;
    statTotal.textContent = tasks.length;
    statCompleted.textContent = completed;
    statPending.textContent = tasks.length - completed;
    statOverdue.textContent = tasks.filter(isOverdue).length;
    clearCompletedButton.disabled = completed === 0;
  }

  function updateResultsCount(visibleCount) {
    if (tasks.length === 0) {
      resultsCount.textContent = '';
      return;
    }
    resultsCount.textContent = 'Mostrando ' + visibleCount + ' de ' + tasks.length + plural(tasks.length, ' tarea', ' tareas');
  }

  function renderEmptyState(visibleCount) {
    if (visibleCount > 0) {
      emptyState.hidden = true;
      return;
    }

    const hasTasks = tasks.length > 0;
    emptyTitle.textContent = hasTasks ? 'No se encontraron tareas' : 'Todavía no hay tareas';
    emptyText.textContent = hasTasks
      ? 'Probá con otra búsqueda o cambiá los filtros.'
      : 'Completá el formulario para agregar la primera.';
    clearFiltersButton.hidden = !hasTasks || !hasActiveFilters();
    emptyState.hidden = false;
  }

  function createIconButton(action, icon, label, extraClass) {
    const button = createElement('button', 'icon-btn' + (extraClass ? ' ' + extraClass : ''), icon);
    button.type = 'button';
    button.dataset.action = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    return button;
  }

  function createTaskElement(task) {
    let className = 'task task--' + task.priority;
    if (task.completed) className += ' is-completed';
    if (task.id === editingId) className += ' is-editing';

    const item = createElement('li', className);
    item.dataset.id = task.id;

    // Botón para completar / volver a pendiente
    const check = createElement('button', 'task__check', '✓');
    check.type = 'button';
    check.dataset.action = 'toggle';
    check.setAttribute('aria-pressed', String(task.completed));
    check.setAttribute('aria-label',
      (task.completed ? 'Marcar como pendiente: ' : 'Marcar como completada: ') + task.title);
    check.title = task.completed ? 'Marcar como pendiente' : 'Marcar como completada';

    // Contenido
    const body = createElement('div', 'task__body');
    body.appendChild(createElement('p', 'task__title', task.title));

    const meta = createElement('div', 'task__meta');
    meta.appendChild(createElement('span', 'badge', task.subject));
    meta.appendChild(createElement('span', 'badge badge--priority badge--' + task.priority,
      'Prioridad ' + PRIORITIES[task.priority].label.toLowerCase()));
    meta.appendChild(createElement('span', '', '📅 ' + formatDisplayDate(task.date)));

    const due = getDueInfo(task);
    if (due) meta.appendChild(createElement('span', 'badge badge--' + due.type, due.text));
    body.appendChild(meta);

    // Acciones
    const actions = createElement('div', 'task__actions');
    actions.appendChild(createIconButton('edit', '✏️', 'Editar tarea: ' + task.title));
    actions.appendChild(createIconButton('delete', '🗑️', 'Eliminar tarea: ' + task.title, 'icon-btn--danger'));

    item.appendChild(check);
    item.appendChild(body);
    item.appendChild(actions);
    return item;
  }

  function render() {
    refreshSubjectOptions();

    const visible = getVisibleTasks();
    taskList.replaceChildren.apply(taskList, visible.map(createTaskElement));

    renderEmptyState(visible.length);
    updateResultsCount(visible.length);
    updateStats();
  }

  /* 11. Avisos (toasts) ------------------------------------- */

  /** type: 'success' | 'info' | 'error' */
  function showToast(message, type) {
    const toast = createElement('div', 'toast toast--' + (type || 'info'), message);

    while (toastBox.children.length >= MAX_TOASTS) {
      toastBox.firstElementChild.remove();
    }
    toastBox.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('is-leaving');
      setTimeout(function () { toast.remove(); }, 250);
    }, TOAST_DURATION);
  }

  /* 12. Eventos --------------------------------------------- */

  themeToggle.addEventListener('click', toggleTheme);

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    const data = readForm();
    const errors = validate(data);
    showErrors(errors);

    const firstInvalid = Object.keys(fields).find(function (name) { return errors[name]; });
    if (firstInvalid) {
      fields[firstInvalid].input.focus();
      return;
    }

    data.subject = canonicalSubject(data.subject);
    if (!Object.keys(PRIORITIES).includes(data.priority)) data.priority = DEFAULT_PRIORITY;

    const id = editingId;
    resetForm();
    if (id) {
      updateTask(id, data);
    } else {
      addTask(data);
      inputTitle.focus();
    }
  });

  cancelButton.addEventListener('click', function () {
    resetForm();
    render();
  });

  // Escape cancela la edición
  form.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && editingId) {
      resetForm();
      render();
    }
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

    const id = item.dataset.id;
    if (button.dataset.action === 'toggle') toggleTask(id);
    if (button.dataset.action === 'edit') startEditing(id);
    if (button.dataset.action === 'delete') deleteTask(id);
  });

  // Búsqueda instantánea: se filtra con cada letra
  searchInput.addEventListener('input', function () {
    filters.search = searchInput.value;
    render();
  });

  statusButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      filters.status = button.dataset.filter;
      updateStatusButtons();
      render();
    });
  });

  subjectFilter.addEventListener('change', function () {
    filters.subject = subjectFilter.value;
    render();
  });

  sortSelect.addEventListener('change', function () {
    filters.sort = sortSelect.value;
    render();
  });

  clearFiltersButton.addEventListener('click', clearFilters);
  clearCompletedButton.addEventListener('click', clearCompleted);

  /* 13. Inicio ---------------------------------------------- */
  function init() {
    applyTheme(getSavedTheme());

    const stored = loadTasks();
    tasks = stored === null ? createSampleTasks() : stored;
    saveTasks();   // guarda los ejemplos (primera vez) o los datos ya actualizados

    updateFormMode();
    render();
  }

  init();
})();
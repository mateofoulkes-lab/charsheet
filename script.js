const STORAGE_KEY = 'charsheet.characters';
const SELECTED_KEY = 'charsheet.selectedId';
const DEFAULT_PORTRAIT =
  (typeof window !== 'undefined' && window.DEFAULT_PORTRAIT) ||
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAKklEQVR4Ae3BMQEAAADCIPunNsN+YAAAAAAAAAAAAAAAAAAAAAD4GlrxAAE9eEIAAAAASUVORK5CYII=';

const STAT_KEYS = ['vida', 'ataque', 'defensa', 'danio', 'movimiento', 'alcance'];

const defaultCharacters = [
  {
    id: 'tavian-kors',
    name: 'Tavian Kors',
    portrait: DEFAULT_PORTRAIT,
    ancestry: 'Mediano',
    clazz: 'Pícaro',
    level: 5,
    stats: {
      vida: '34',
      ataque: '+8',
      defensa: '15',
      danio: '2d6 + 3',
      movimiento: '12 m',
      alcance: '9 m'
    }
  },
  {
    id: 'elanor-vex',
    name: 'Elanor Vex',
    portrait: DEFAULT_PORTRAIT,
    ancestry: 'Humana',
    clazz: 'Barda',
    level: 3,
    stats: {
      vida: '28',
      ataque: '+6',
      defensa: '14',
      danio: '1d8 + 2',
      movimiento: '9 m',
      alcance: '12 m'
    }
  }
];

const elements = {};
const editorState = {
  editingId: null,
  portrait: DEFAULT_PORTRAIT
};

let characters = [];
let selectedCharacterId = null;

function withVersion(path) {
  if (!window.APP_VERSION || typeof path !== 'string' || path.startsWith('data:')) {
    return path;
  }
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${window.APP_VERSION}`;
}

function safeGetItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn('No se pudo leer del almacenamiento local:', error);
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn('No se pudo escribir en el almacenamiento local:', error);
  }
}

function normalizeStatValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value.toString();
  }
  const text = value.toString().trim();
  return text;
}

function slugify(text) {
  if (text === null || text === undefined) {
    return 'personaje';
  }

  let value = String(text);

  if (typeof value.normalize === 'function') {
    value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .substring(0, 64) || 'personaje'
  );
}

function normalizeCharacter(character) {
  const normalizedStats = {};
  STAT_KEYS.forEach((key) => {
    normalizedStats[key] = normalizeStatValue(character?.stats?.[key]);
  });

  let portrait = character?.portrait || DEFAULT_PORTRAIT;
  if (typeof portrait === 'string') {
    const trimmed = portrait.trim();
    portrait = trimmed && trimmed !== 'null' && trimmed !== 'undefined' ? trimmed : DEFAULT_PORTRAIT;
  } else {
    portrait = DEFAULT_PORTRAIT;
  }

  const normalized = {
    id: character?.id || slugify(character?.name || 'pj'),
    name: character?.name?.trim() || 'Personaje sin nombre',
    portrait,
    ancestry: character?.ancestry?.trim() || '',
    clazz: character?.clazz?.trim() || '',
    level: Number.parseInt(character?.level ?? 1, 10) || 1,
    stats: normalizedStats
  };

  return normalized;
}

function loadCharacters() {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) {
    return defaultCharacters.map(normalizeCharacter);
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultCharacters.map(normalizeCharacter);
    }
    return parsed.map(normalizeCharacter);
  } catch (error) {
    console.warn('No se pudieron cargar los personajes guardados:', error);
    return defaultCharacters.map(normalizeCharacter);
  }
}

function saveCharacters(list) {
  safeSetItem(STORAGE_KEY, JSON.stringify(list));
}

function loadSelectedCharacterId() {
  return safeGetItem(SELECTED_KEY);
}

function saveSelectedCharacterId(id) {
  safeSetItem(SELECTED_KEY, id ?? '');
}

function ensureUniqueId(baseId) {
  const existing = new Set(characters.map((item) => item.id));
  let candidate = baseId;
  let suffix = 1;
  while (existing.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function cacheElements() {
  elements.characterList = document.getElementById('characterList');
  elements.createCharacterBtn = document.getElementById('createCharacterBtn');
  elements.backToSelect = document.getElementById('backToSelect');
  elements.screenSelect = document.querySelector('[data-screen="select"]');
  elements.screenSheet = document.querySelector('[data-screen="sheet"]');
  elements.heroName = document.getElementById('heroName');
  elements.heroDetails = document.getElementById('heroDetails');
  elements.heroPortrait = document.querySelector('.hero-portrait');
  elements.stats = document.querySelectorAll('.stat');
  elements.editorModal = document.getElementById('characterEditor');
  elements.editorBackdrop = document.getElementById('editorBackdrop');
  elements.characterForm = document.getElementById('characterForm');
  elements.editorTitle = document.getElementById('editorTitle');
  elements.portraitInput = document.getElementById('portraitInput');
  elements.portraitPreview = document.getElementById('portraitPreview');
  elements.clearPortrait = document.getElementById('clearPortrait');
  elements.cancelEditor = document.getElementById('cancelEditor');
  elements.closeEditor = document.getElementById('closeEditor');
}

function renderCharacterList() {
  if (!elements.characterList) return;
  const fragment = document.createDocumentFragment();

  characters.forEach((character) => {
    const portraitSrc = withVersion(character.portrait);
    const card = document.createElement('article');
    card.className = `character-card${character.id === selectedCharacterId ? ' active' : ''}`;
    card.dataset.id = character.id;

    const portraitSrc = withVersion(character.portrait || DEFAULT_PORTRAIT);
    const metaParts = [character.ancestry, character.clazz]
      .map((part) => part?.trim())
      .filter(Boolean);
    if (character.level) {
      metaParts.push(`Nivel ${character.level}`);
    }
    const metaLine = metaParts.join(' • ');

    card.innerHTML = `
      <img src="${portraitSrc}" alt="Retrato de ${character.name}" loading="lazy" />
      <div class="character-meta">
        <h2>${character.name}</h2>
        <p>${metaLine}</p>
      </div>
      <div class="card-actions">
        <button class="icon-button edit" type="button" title="Editar ${character.name}">
          <i class="fa-solid fa-pen"></i>
          <span>Editar</span>
        </button>
        <button class="icon-button delete" type="button" title="Eliminar ${character.name}">
          <i class="fa-solid fa-trash"></i>
          <span>Borrar</span>
        </button>
      </div>
    `;

    card.addEventListener('click', () => {
      selectCharacter(character.id);
    });

    const editButton = card.querySelector('.icon-button.edit');
    const deleteButton = card.querySelector('.icon-button.delete');

    editButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      openCharacterEditor(character);
    });

    deleteButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteCharacter(character);
    });

    const editButton = card.querySelector('.icon-button.edit');
    const deleteButton = card.querySelector('.icon-button.delete');

    editButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      openCharacterEditor(character);
    });

    deleteButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteCharacter(character);
    });

    const editButton = card.querySelector('.icon-button.edit');
    const deleteButton = card.querySelector('.icon-button.delete');

    if (editButton) {
      editButton.addEventListener('click', (event) => {
        event.stopPropagation();
        handleEditCharacter(character);
      });
    }

    if (deleteButton) {
      deleteButton.addEventListener('click', (event) => {
        event.stopPropagation();
        handleDeleteCharacter(character);
      });
    }

    fragment.appendChild(card);
  });

  elements.characterList.innerHTML = '';
  elements.characterList.appendChild(fragment);
}

function selectCharacter(characterId) {
  selectedCharacterId = characterId;
  saveSelectedCharacterId(characterId);
  renderCharacterList();
  showCharacterSheet(characterId);
}

function deleteCharacter(character) {
  const confirmed = window.confirm(`¿Seguro que querés eliminar a ${character.name}?`);
  if (!confirmed) return;

  characters = characters.filter((item) => item.id !== character.id);
  saveCharacters(characters);

  if (selectedCharacterId === character.id) {
    selectedCharacterId = characters[0]?.id ?? null;
    if (selectedCharacterId) {
      showCharacterSheet(selectedCharacterId);
    } else if (elements.screenSheet && elements.screenSelect) {
      elements.screenSheet.classList.add('hidden');
      elements.screenSelect.classList.remove('hidden');
    }
  }

  saveSelectedCharacterId(selectedCharacterId ?? '');
  renderCharacterList();
}

function showCharacterSheet(characterId) {
  const character = characters.find((item) => item.id === characterId);
  if (!character) return;

  if (elements.heroName) {
    elements.heroName.textContent = character.name;
  }

  if (elements.heroDetails) {
    const parts = [character.ancestry, character.clazz]
      .map((part) => part?.trim())
      .filter(Boolean);
    parts.push(`Nivel ${character.level}`);
    elements.heroDetails.innerHTML = parts.join(' • ');
  }

  if (elements.heroPortrait) {
    elements.heroPortrait.src = withVersion(character.portrait || DEFAULT_PORTRAIT);
    elements.heroPortrait.alt = `Retrato de ${character.name}`;
  }

  if (elements.stats) {
    elements.stats.forEach((statElement) => {
      const key = statElement.dataset.stat;
      const value = character.stats[key];
      const valueElement = statElement.querySelector('.stat-value');
      if (valueElement) {
        valueElement.textContent = value || '—';
      }
    });
  }

  if (elements.screenSelect && elements.screenSheet) {
    elements.screenSelect.classList.add('hidden');
    elements.screenSheet.classList.remove('hidden');
  }
}

function createBlankCharacter() {
  const stats = {};
  STAT_KEYS.forEach((key) => {
    stats[key] = '';
  });
  return {
    id: null,
    name: '',
    ancestry: '',
    clazz: '',
    level: 1,
    portrait: DEFAULT_PORTRAIT,
    stats
  };
}

function openCharacterEditor(character) {
  const data = character ? normalizeCharacter(character) : createBlankCharacter();
  editorState.editingId = character ? data.id : null;
  editorState.portrait = data.portrait || DEFAULT_PORTRAIT;

  fillEditorForm(data);
  updatePortraitPreview();

  if (elements.editorTitle) {
    elements.editorTitle.textContent = character ? `Editar ${character.name}` : 'Nuevo personaje';
  }

  elements.editorModal?.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeCharacterEditor() {
  elements.editorModal?.classList.add('hidden');
  document.body.classList.remove('modal-open');
  editorState.editingId = null;
  editorState.portrait = DEFAULT_PORTRAIT;
  elements.characterForm?.reset();
  if (elements.editorTitle) {
    elements.editorTitle.textContent = 'Editor de personaje';
  }
  updatePortraitPreview();
}

function fillEditorForm(character) {
  if (!elements.characterForm) return;

  elements.characterForm.reset();

  const map = {
    characterName: character.name,
    characterAncestry: character.ancestry,
    characterClass: character.clazz,
    characterLevel: character.level
  };

  Object.entries(map).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) {
      field.value = value ?? '';
    }
  });

  STAT_KEYS.forEach((key) => {
    const input = document.getElementById(`stat-${key}`);
    if (input) {
      input.value = character.stats[key] ?? '';
    }
  });
}

function updatePortraitPreview() {
  if (!elements.portraitPreview) return;
  const src = editorState.portrait || DEFAULT_PORTRAIT;
  elements.portraitPreview.src = withVersion(src);
}

function handlePortraitChange(event) {
  const [file] = event.target.files;
  if (!file) return;

  if (file.type !== 'image/png') {
    window.alert('La imagen debe ser un archivo PNG.');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    editorState.portrait = loadEvent.target?.result || DEFAULT_PORTRAIT;
    updatePortraitPreview();
  };
  reader.readAsDataURL(file);
}

function collectFormData(formData) {
  const name = formData.get('characterName')?.toString().trim();
  if (!name) {
    throw new Error('El nombre del personaje es obligatorio.');
  }

  const payload = {
    id: editorState.editingId,
    name,
    ancestry: formData.get('characterAncestry')?.toString().trim() || '',
    clazz: formData.get('characterClass')?.toString().trim() || '',
    level: Number.parseInt(formData.get('characterLevel'), 10) || 1,
    portrait: editorState.portrait || DEFAULT_PORTRAIT,
    stats: {}
  };

  STAT_KEYS.forEach((key) => {
    const value = formData.get(`stat-${key}`);
    payload.stats[key] = normalizeStatValue(value);
  });

  if (!payload.id) {
    payload.id = ensureUniqueId(slugify(payload.name));
  }

  return normalizeCharacter(payload);
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (!elements.characterForm) return;

  const formData = new FormData(elements.characterForm);

  try {
    const character = collectFormData(formData);
    const index = characters.findIndex((item) => item.id === character.id);

    if (index >= 0) {
      characters[index] = character;
    } else {
      characters = [...characters, character];
    }

    saveCharacters(characters);
    selectCharacter(character.id);
    closeCharacterEditor();
  } catch (error) {
    window.alert(error.message || 'No se pudo guardar el personaje.');
  }
}

function wireInteractions() {
  elements.createCharacterBtn?.addEventListener('click', () => {
    openCharacterEditor();
  });
  header.appendChild(removeBtn);
  abilityEl.appendChild(header);

  elements.backToSelect?.addEventListener('click', () => {
    elements.screenSheet?.classList.add('hidden');
    elements.screenSelect?.classList.remove('hidden');
  });
  nameLabel.appendChild(nameInput);
  grid.appendChild(nameLabel);

  const iconLabel = document.createElement('label');
  iconLabel.className = 'form-field stacked';
  iconLabel.textContent = 'Icono (clase Font Awesome)';
  const iconInput = document.createElement('input');
  iconInput.type = 'text';
  iconInput.dataset.field = 'ability-icon';
  iconInput.placeholder = 'fa-solid fa-star';
  iconInput.value = normalized.icon;
  iconLabel.appendChild(iconInput);
  grid.appendChild(iconLabel);

  elements.editorBackdrop?.addEventListener('click', closeCharacterEditor);
  elements.closeEditor?.addEventListener('click', closeCharacterEditor);
  elements.cancelEditor?.addEventListener('click', closeCharacterEditor);
  elements.characterForm?.addEventListener('submit', handleFormSubmit);
  elements.portraitInput?.addEventListener('change', handlePortraitChange);
  elements.clearPortrait?.addEventListener('click', () => {
    editorState.portrait = DEFAULT_PORTRAIT;
    if (elements.portraitInput) {
      elements.portraitInput.value = '';
    }
    updatePortraitPreview();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.editorModal?.classList.contains('hidden')) {
      closeCharacterEditor();
    }
  });
}

function init() {
  cacheElements();
  characters = loadCharacters();
  selectedCharacterId = loadSelectedCharacterId();

  if (selectedCharacterId && !characters.some((item) => item.id === selectedCharacterId)) {
    selectedCharacterId = null;
  }

  if (!selectedCharacterId) {
    selectedCharacterId = characters[0]?.id ?? null;
  }

  renderCharacterList();

  if (selectedCharacterId) {
    showCharacterSheet(selectedCharacterId);
  }

  wireInteractions();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

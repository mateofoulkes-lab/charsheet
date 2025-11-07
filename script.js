const STORAGE_KEY = 'charsheet.characters';
const SELECTED_KEY = 'charsheet.selectedId';
const DEFAULT_PORTRAIT =
  (typeof window !== 'undefined' && window.DEFAULT_PORTRAIT) ||
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAKklEQVR4Ae3BMQEAAADCIPunNsN+YAAAAAAAAAAAAAAAAAAAAAD4GlrxAAE9eEIAAAAASUVORK5CYII=';
const STAT_KEYS = [
  'fuerza',
  'agilidad',
  'inteligencia',
  'carisma',
  'ataque',
  'danio',
  'movimiento',
  'vida'
];

const defaultCharacters = [
  {
    id: 'elanor-vex',
    name: 'Elanor Vex',
    portrait: DEFAULT_PORTRAIT,
    ancestry: 'Humana',
    clazz: 'Barda',
    level: 3,
    campaign: 'Sombras de Arvendal',
    tagline: 'La Lira Carmesí',
    stats: {
      fuerza: { base: 5, delta: 2 },
      agilidad: { base: 8, delta: 3 },
      inteligencia: { base: 9, delta: 4 },
      carisma: { base: 11, delta: 5 },
      ataque: { base: 6, delta: 2 },
      danio: { base: '1d8', delta: '+2' },
      movimiento: { base: 9, delta: 0 },
      vida: { base: 28, delta: '+6' }
    },
    abilities: [
      {
        name: 'Esencia de Fuego',
        icon: 'fa-solid fa-fire-flame-curved',
        cooldown: 3,
        cooldownMax: 6,
        details: [
          { label: 'Daño', value: '2d6 + CAR' },
          { label: 'Área', value: '3 casillas' }
        ]
      },
      {
        name: 'Canto de Guerra',
        icon: 'fa-solid fa-music',
        cooldown: 0,
        cooldownMax: 6,
        details: [
          { label: 'Bono', value: '+1 ATQ aliados' },
          { label: 'Duración', value: '2 turnos' }
        ]
      },
      {
        name: 'Sello Ígneo',
        icon: 'fa-solid fa-sun',
        cooldown: 5,
        cooldownMax: 12,
        details: [
          { label: 'Efecto', value: 'Aturde 1 turno' },
          { label: 'Distancia', value: '12 m' }
        ]
      },
      {
        name: 'Aria Vital',
        icon: 'fa-solid fa-heart-pulse',
        cooldown: 2,
        cooldownMax: 6,
        details: [
          { label: 'Curación', value: '2d4 + CAR' },
          { label: 'Objetivo', value: 'Aliado' }
        ]
      },
      {
        name: 'Muro Resonante',
        icon: 'fa-solid fa-shield',
        cooldown: 4,
        cooldownMax: 8,
        details: [
          { label: 'Defensa', value: '+2 AC' },
          { label: 'Duración', value: '3 turnos' }
        ]
      },
      {
        name: 'Eco Final',
        icon: 'fa-solid fa-wave-square',
        cooldown: 0,
        cooldownMax: 6,
        details: [
          { label: 'Daño', value: '3d4 sónico' },
          { label: 'Alcance', value: 'Línea 4 casillas' }
        ]
      }
    ]
  },
  {
    id: 'tavian-kors',
    name: 'Tavian Kors',
    portrait: DEFAULT_PORTRAIT,
    ancestry: 'Mediano',
    clazz: 'Pícaro',
    level: 5,
    campaign: 'Los Ecos de Edrin',
    tagline: 'Sombras del Mercado',
    stats: {
      fuerza: { base: 4, delta: 1 },
      agilidad: { base: 12, delta: 4 },
      inteligencia: { base: 7, delta: 2 },
      carisma: { base: 6, delta: 1 },
      ataque: { base: 9, delta: 4 },
      danio: { base: '2d6', delta: '+3' },
      movimiento: { base: 12, delta: 0 },
      vida: { base: 34, delta: '+5' }
    },
    abilities: [
      {
        name: 'Golpe Sombrío',
        icon: 'fa-solid fa-user-ninja',
        cooldown: 0,
        cooldownMax: 6,
        details: [
          { label: 'Daño', value: '3d6 + AGI' },
          { label: 'Efecto', value: 'Sigilo +1' }
        ]
      },
      {
        name: 'Daga Envenenada',
        icon: 'fa-solid fa-skull-crossbones',
        cooldown: 1,
        cooldownMax: 6,
        details: [
          { label: 'Daño', value: '1d4 + AGI' },
          { label: 'Veneno', value: '2 turnos' }
        ]
      },
      {
        name: 'Paso de Sombras',
        icon: 'fa-solid fa-mask',
        cooldown: 3,
        cooldownMax: 6,
        details: [
          { label: 'Movimiento', value: 'Teleport 8 m' },
          { label: 'Uso', value: 'Acción bonus' }
        ]
      }
    ]
  }
];

const editorState = {
  editingId: null,
  portrait: DEFAULT_PORTRAIT
};

let characters = [];
let selectedCharacterId = null;

const elements = {};

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseStatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const trimmed = String(value).trim();
  if (trimmed === '') return '';
  const numeric = Number(trimmed);
  return Number.isNaN(numeric) ? trimmed : numeric;
}

function normalizeAbility(ability) {
  const normalized = {
    name: ability?.name?.trim() || 'Habilidad sin nombre',
    icon: ability?.icon?.trim() || 'fa-solid fa-star',
    cooldown: Number.parseInt(ability?.cooldown ?? 0, 10) || 0,
    cooldownMax: Number.parseInt(ability?.cooldownMax ?? 1, 10) || 1,
    details: []
  };

  if (Array.isArray(ability?.details)) {
    normalized.details = ability.details
      .map((detail) => ({
        label: detail?.label?.toString().trim(),
        value: detail?.value?.toString().trim()
      }))
      .filter((detail) => detail.label && detail.value);
  }

  return normalized;
}

function normalizeCharacter(character) {
  let portrait = character?.portrait || DEFAULT_PORTRAIT;
  if (typeof portrait === 'string') {
    const normalizedPortrait = portrait.trim();
    if (!normalizedPortrait || normalizedPortrait === 'null' || normalizedPortrait === 'undefined') {
      portrait = DEFAULT_PORTRAIT;
    } else if (normalizedPortrait.startsWith('assets/')) {
      portrait = DEFAULT_PORTRAIT;
    } else {
      portrait = normalizedPortrait;
    }
  }

  const normalized = {
    id: character?.id || slugify(character?.name || 'pj'),
    name: character?.name?.trim() || 'Personaje sin nombre',
    portrait,
    ancestry: character?.ancestry?.trim() || '',
    clazz: character?.clazz?.trim() || '',
    level: Number.parseInt(character?.level ?? 1, 10) || 1,
    campaign: character?.campaign?.trim() || '',
    tagline: character?.tagline?.trim() || '',
    stats: {},
    abilities: Array.isArray(character?.abilities)
      ? character.abilities.map(normalizeAbility)
      : []
  };

  STAT_KEYS.forEach((key) => {
    const stat = character?.stats?.[key] ?? {};
    normalized.stats[key] = {
      base: parseStatValue(stat.base ?? 0),
      delta: parseStatValue(stat.delta ?? '+0')
    };
  });

  if (!normalized.portrait) {
    normalized.portrait = DEFAULT_PORTRAIT;
  }

  return normalized;
}

function loadCharacters() {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) {
    return clone(defaultCharacters).map(normalizeCharacter);
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return clone(defaultCharacters).map(normalizeCharacter);
    }
    return parsed.map(normalizeCharacter);
  } catch (error) {
    console.warn('No se pudieron cargar los personajes guardados:', error);
    return clone(defaultCharacters).map(normalizeCharacter);
  }
}

function saveCharacters(list) {
  safeSetItem(STORAGE_KEY, JSON.stringify(list));
}

function loadSelectedCharacterId() {
  return safeGetItem(SELECTED_KEY);
}

function saveSelectedCharacterId(id) {
  safeSetItem(SELECTED_KEY, id);
}

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .substring(0, 64) || 'personaje';
}

function ensureUniqueId(baseId) {
  let candidate = baseId;
  let suffix = 1;
  const existingIds = new Set(characters.map((character) => character.id));
  while (existingIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function cacheElements() {
  elements.characterList = document.getElementById('characterList');
  elements.createCharacterBtn = document.getElementById('createCharacterBtn');
  elements.backToSelect = document.getElementById('backToSelect');
  elements.heroName = document.getElementById('heroName');
  elements.heroDetails = document.getElementById('heroDetails');
  elements.heroPortrait = document.querySelector('.hero-portrait');
  elements.statsPanel = document.querySelectorAll('.stat');
  elements.activeAbilities = document.getElementById('activeAbilities');
  elements.screenSelect = document.querySelector('[data-screen="select"]');
  elements.screenSheet = document.querySelector('[data-screen="sheet"]');
  elements.navItems = document.querySelectorAll('.nav-item');
  elements.editorModal = document.getElementById('characterEditor');
  elements.editorBackdrop = document.getElementById('editorBackdrop');
  elements.characterForm = document.getElementById('characterForm');
  elements.portraitInput = document.getElementById('portraitInput');
  elements.portraitPreview = document.getElementById('portraitPreview');
  elements.clearPortrait = document.getElementById('clearPortrait');
  elements.cancelEditor = document.getElementById('cancelEditor');
  elements.closeEditor = document.getElementById('closeEditor');
  elements.abilitiesContainer = document.getElementById('abilitiesContainer');
  elements.addAbilityBtn = document.getElementById('addAbilityBtn');
  elements.editorTitle = document.getElementById('editorTitle');
}

function createEmptyCharacter() {
  const base = normalizeCharacter({
    id: null,
    name: '',
    portrait: DEFAULT_PORTRAIT,
    ancestry: '',
    clazz: '',
    level: 1,
    campaign: '',
    tagline: '',
    stats: {},
    abilities: []
  });
  base.id = null;
  return base;
}

function renderCharacterList() {
  if (!elements.characterList) return;

  const fragment = document.createDocumentFragment();

  characters.forEach((character) => {
    const portraitSrc = withVersion(character.portrait);
    const card = document.createElement('article');
    card.className = `character-card${character.id === selectedCharacterId ? ' active' : ''}`;
    card.dataset.id = character.id;
    const tags = [character.campaign, character.tagline]
      .map((value) => value?.trim())
      .filter(Boolean)
      .map((value) => `<span class="tag">${value}</span>`)
      .join('');

    const identity = [character.ancestry, character.clazz]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(' ');
    const metaLine = [identity, `Nivel ${character.level}`]
      .filter((value) => value && value.trim())
      .join(' &bull; ');

    card.innerHTML = `
      <img src="${portraitSrc}" alt="Retrato de ${character.name}" loading="lazy" />
      <div class="character-meta">
        <h2>${character.name}</h2>
        <p>${metaLine}</p>
        <div class="character-tags">${tags}</div>
      </div>
      <div class="card-actions">
        <button class="icon-button edit" type="button" title="Editar ${character.name}" aria-label="Editar ${character.name}">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="icon-button delete" type="button" title="Eliminar ${character.name}" aria-label="Eliminar ${character.name}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;

    card.addEventListener('click', () => {
      selectedCharacterId = character.id;
      renderCharacterList();
      showCharacterSheet(character.id);
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

function handleEditCharacter(character) {
  openCharacterEditor(character);
}

function handleDeleteCharacter(character) {
  const confirmed = window.confirm(`¿Seguro que querés eliminar a ${character.name}? Esta acción no se puede deshacer.`);
  if (!confirmed) return;

  characters = characters.filter((item) => item.id !== character.id);
  if (selectedCharacterId === character.id) {
    selectedCharacterId = characters[0]?.id ?? null;
    if (selectedCharacterId) {
      showCharacterSheet(selectedCharacterId);
    } else if (elements.screenSheet && elements.screenSelect) {
      elements.screenSheet.classList.add('hidden');
      elements.screenSelect.classList.remove('hidden');
    }
  }

  saveCharacters(characters);
  if (characters.length === 0) {
    saveSelectedCharacterId('');
  } else if (selectedCharacterId) {
    saveSelectedCharacterId(selectedCharacterId);
  }
  renderCharacterList();
}

function showCharacterSheet(characterId) {
  const character = characters.find((c) => c.id === characterId);
  if (!character || !elements.heroName || !elements.heroDetails || !elements.heroPortrait) {
    return;
  }

  elements.heroName.textContent = character.name;
  const heroSegments = [character.ancestry, character.clazz]
    .map((value) => value?.trim())
    .filter(Boolean);
  heroSegments.push(`Nivel ${character.level}`);
  elements.heroDetails.innerHTML = heroSegments.join(' &bull; ');
  elements.heroPortrait.src = withVersion(character.portrait || DEFAULT_PORTRAIT);
  elements.heroPortrait.alt = `Retrato de ${character.name}`;

  saveSelectedCharacterId(character.id);

  if (!elements.statsPanel || elements.statsPanel.length === 0) return;

  elements.statsPanel.forEach((statElement) => {
    const statKey = statElement.dataset.stat;
    const stat = character.stats[statKey];
    if (!stat) return;

    const baseEl = statElement.querySelector('.base');
    const deltaEl = statElement.querySelector('.delta');

    if (baseEl) {
      baseEl.textContent = stat.base;
    }
    if (deltaEl) {
      if (typeof stat.delta === 'number') {
        deltaEl.textContent = stat.delta >= 0 ? `+${stat.delta}` : `${stat.delta}`;
      } else {
        deltaEl.textContent = stat.delta;
      }
      const parsed = Number.parseInt(stat.delta, 10);
      deltaEl.classList.toggle('positive', !Number.isNaN(parsed) && parsed >= 0);
    }
  });

  renderAbilities(character.abilities);

  if (elements.screenSelect && elements.screenSheet) {
    elements.screenSelect.classList.add('hidden');
    elements.screenSheet.classList.remove('hidden');
  }
}

function renderAbilities(abilities) {
  if (!elements.activeAbilities) return;

  elements.activeAbilities.innerHTML = '';

  const fragment = document.createDocumentFragment();
  abilities.forEach((ability) => {
    const card = document.createElement('article');
    card.className = 'ability-card';

    const cooldownMax = Math.max(ability.cooldownMax || 1, 1);
    const cooldownCurrent = Math.min(Math.max(ability.cooldown || 0, 0), cooldownMax);

    const cooldownWrapper = document.createElement('div');
    cooldownWrapper.className = 'cooldown-track';

    for (let idx = 0; idx < cooldownMax; idx += 1) {
      const cell = document.createElement('span');
      cell.className = 'cooldown-cell';
      if (idx < cooldownCurrent) {
        cell.classList.add('on-cooldown');
      } else {
        cell.classList.add('active');
      }
      cooldownWrapper.appendChild(cell);
    }

    const details = document.createElement('div');
    details.className = 'ability-details';
    ability.details.forEach((detail) => {
      const item = document.createElement('span');
      item.innerHTML = `<span>${detail.label}</span><strong>${detail.value}</strong>`;
      details.appendChild(item);
    });

    card.innerHTML = `
      <h4>${ability.name}</h4>
      <div class="ability-icon"><i class="${ability.icon}"></i></div>
    `;

    card.appendChild(cooldownWrapper);
    card.appendChild(details);

    fragment.appendChild(card);
  });

  elements.activeAbilities.appendChild(fragment);
}

function openCharacterEditor(character) {
  const data = character ? normalizeCharacter(character) : createEmptyCharacter();
  editorState.editingId = data.id;
  editorState.portrait = data.portrait || DEFAULT_PORTRAIT;

  fillEditorForm(data);

  if (elements.editorTitle) {
    elements.editorTitle.textContent = character ? `Editar ${character.name}` : 'Nuevo personaje';
  }

  if (elements.editorModal) {
    elements.editorModal.classList.remove('hidden');
  }
  document.body.classList.add('modal-open');
}

function closeCharacterEditor() {
  if (elements.editorModal) {
    elements.editorModal.classList.add('hidden');
  }
  document.body.classList.remove('modal-open');
  editorState.editingId = null;
  editorState.portrait = DEFAULT_PORTRAIT;
  if (elements.editorTitle) {
    elements.editorTitle.textContent = 'Editor de personaje';
  }
  if (elements.characterForm) {
    elements.characterForm.reset();
  }
  if (elements.abilitiesContainer) {
    elements.abilitiesContainer.innerHTML = '';
  }
  if (elements.portraitInput) {
    elements.portraitInput.value = '';
  }
}

function fillEditorForm(character) {
  if (!elements.characterForm) return;

  elements.characterForm.reset();

  const isNewCharacter = editorState.editingId == null;

  const formDataMap = {
    characterName: character.name || '',
    characterAncestry: character.ancestry || '',
    characterClass: character.clazz || '',
    characterLevel: character.level || 1,
    characterCampaign: character.campaign || '',
    characterTagline: character.tagline || ''
  };

  Object.entries(formDataMap).forEach(([fieldId, value]) => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.value = value;
    }
  });
  header.appendChild(removeBtn);
  abilityEl.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'form-grid two-col';

  STAT_KEYS.forEach((key) => {
    const baseField = document.getElementById(`stat-${key}-base`);
    const deltaField = document.getElementById(`stat-${key}-delta`);
    if (baseField) {
      baseField.value = isNewCharacter ? '' : character.stats[key]?.base ?? '';
    }
    if (deltaField) {
      deltaField.value = isNewCharacter ? '' : character.stats[key]?.delta ?? '';
    }
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

  if (elements.portraitPreview) {
    updatePortraitPreview();
  }

  if (elements.abilitiesContainer) {
    elements.abilitiesContainer.innerHTML = '';
    if (character.abilities.length === 0) {
      elements.abilitiesContainer.appendChild(createAbilityFields());
    } else {
      character.abilities.forEach((ability) => {
        elements.abilitiesContainer.appendChild(createAbilityFields(ability));
      });
    }
  }

  if (elements.portraitInput) {
    elements.portraitInput.value = '';
  }
}

function updatePortraitPreview() {
  if (!elements.portraitPreview) return;
  elements.portraitPreview.src = editorState.portrait ? withVersion(editorState.portrait) : withVersion(DEFAULT_PORTRAIT);
  elements.portraitPreview.alt = 'Retrato del personaje';
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

function createAbilityFields(ability = {}) {
  const normalized = ability && ability.name
    ? normalizeAbility(ability)
    : {
        name: '',
        icon: ability?.icon?.trim() || 'fa-solid fa-star',
        cooldown: Number.parseInt(ability?.cooldown ?? 0, 10) || 0,
        cooldownMax: Number.parseInt(ability?.cooldownMax ?? 1, 10) || 1,
        details: Array.isArray(ability?.details) ? ability.details : []
      };
  const abilityEl = document.createElement('div');
  abilityEl.className = 'ability-form-item';

  const header = document.createElement('div');
  header.className = 'ability-form-header';
  const title = document.createElement('h4');
  title.textContent = normalized.name || 'Nueva habilidad';
  header.appendChild(title);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'icon-button small danger remove-ability';
  removeBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
  removeBtn.addEventListener('click', () => {
    abilityEl.remove();
    if (!elements.abilitiesContainer?.children.length) {
      elements.abilitiesContainer.appendChild(createAbilityFields());
    }
  });
  header.appendChild(removeBtn);
  abilityEl.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'form-grid two-col';

  const nameLabel = document.createElement('label');
  nameLabel.className = 'form-field stacked';
  nameLabel.textContent = 'Nombre';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.dataset.field = 'ability-name';
  nameInput.required = true;
  nameInput.value = normalized.name;
  nameInput.addEventListener('input', () => {
    title.textContent = nameInput.value.trim() || 'Nueva habilidad';
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

  const cooldownLabel = document.createElement('label');
  cooldownLabel.className = 'form-field stacked';
  cooldownLabel.textContent = 'Cooldown actual';
  const cooldownInput = document.createElement('input');
  cooldownInput.type = 'number';
  cooldownInput.min = '0';
  cooldownInput.dataset.field = 'ability-cooldown';
  cooldownInput.value = normalized.cooldown;
  cooldownLabel.appendChild(cooldownInput);
  grid.appendChild(cooldownLabel);

  const cooldownMaxLabel = document.createElement('label');
  cooldownMaxLabel.className = 'form-field stacked';
  cooldownMaxLabel.textContent = 'Cooldown máximo';
  const cooldownMaxInput = document.createElement('input');
  cooldownMaxInput.type = 'number';
  cooldownMaxInput.min = '1';
  cooldownMaxInput.dataset.field = 'ability-cooldown-max';
  cooldownMaxInput.value = normalized.cooldownMax;
  cooldownMaxLabel.appendChild(cooldownMaxInput);
  grid.appendChild(cooldownMaxLabel);

  abilityEl.appendChild(grid);

  const detailsWrapper = document.createElement('div');
  detailsWrapper.className = 'detail-list';
  abilityEl.appendChild(detailsWrapper);

  const addDetailBtn = document.createElement('button');
  addDetailBtn.type = 'button';
  addDetailBtn.className = 'btn tertiary add-detail';
  addDetailBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Agregar detalle';
  addDetailBtn.addEventListener('click', () => {
    detailsWrapper.appendChild(createDetailRow({}, detailsWrapper));
  });

  abilityEl.appendChild(addDetailBtn);

  if (normalized.details.length) {
    normalized.details.forEach((detail) => {
      detailsWrapper.appendChild(createDetailRow(detail, detailsWrapper));
    });
  } else {
    detailsWrapper.appendChild(createDetailRow({}, detailsWrapper));
  }

  return abilityEl;
}

function createDetailRow(detail = {}, container) {
  const row = document.createElement('div');
  row.className = 'ability-detail-row';

  const labelField = document.createElement('label');
  labelField.className = 'form-field stacked';
  labelField.textContent = 'Etiqueta';
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.dataset.field = 'detail-label';
  labelInput.value = detail.label || '';
  labelField.appendChild(labelInput);
  row.appendChild(labelField);

  const valueField = document.createElement('label');
  valueField.className = 'form-field stacked';
  valueField.textContent = 'Valor';
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.dataset.field = 'detail-value';
  valueInput.value = detail.value || '';
  valueField.appendChild(valueInput);
  row.appendChild(valueField);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'icon-button small remove-detail';
  removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  removeBtn.addEventListener('click', () => {
    row.remove();
    if (!container.querySelector('.ability-detail-row')) {
      container.appendChild(createDetailRow({}, container));
    }
  });
  row.appendChild(removeBtn);

  return row;
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (!elements.characterForm) return;

  const formData = new FormData(elements.characterForm);

  try {
    const payload = collectFormData(formData);
    let characterId = editorState.editingId;

    if (characterId) {
      payload.id = characterId;
      characters = characters.map((item) => (item.id === characterId ? normalizeCharacter(payload) : item));
    } else {
      characterId = ensureUniqueId(slugify(payload.name));
      payload.id = characterId;
      characters = [...characters, normalizeCharacter(payload)];
    }

    saveCharacters(characters);
    renderCharacterList();
    selectedCharacterId = characterId;
    showCharacterSheet(characterId);
    closeCharacterEditor();
  } catch (error) {
    window.alert(error.message || 'No se pudo guardar el personaje.');
  }
}

function collectFormData(formData) {
  const name = formData.get('characterName')?.toString().trim();
  if (!name) {
    throw new Error('El nombre del personaje es obligatorio.');
  }

  const ancestry = formData.get('characterAncestry')?.toString().trim() || '';
  const clazz = formData.get('characterClass')?.toString().trim() || '';
  const levelInput = formData.get('characterLevel');
  const level = Number.parseInt(levelInput, 10);
  const campaign = formData.get('characterCampaign')?.toString().trim() || '';
  const tagline = formData.get('characterTagline')?.toString().trim() || '';

  const stats = {};
  STAT_KEYS.forEach((key) => {
    const base = parseStatValue(formData.get(`stat-${key}-base`));
    const delta = parseStatValue(formData.get(`stat-${key}-delta`));
    stats[key] = {
      base: base === '' ? 0 : base,
      delta: delta === '' ? '+0' : delta
    };
  });

  const abilities = [];
  if (elements.abilitiesContainer) {
    const abilityItems = elements.abilitiesContainer.querySelectorAll('.ability-form-item');
    abilityItems.forEach((item) => {
      const nameInput = item.querySelector('[data-field="ability-name"]');
      const iconInput = item.querySelector('[data-field="ability-icon"]');
      const cooldownInput = item.querySelector('[data-field="ability-cooldown"]');
      const cooldownMaxInput = item.querySelector('[data-field="ability-cooldown-max"]');
      if (!nameInput) return;
      const abilityName = nameInput.value.trim();
      if (!abilityName) return;

      const details = [];
      item.querySelectorAll('.ability-detail-row').forEach((row) => {
        const labelField = row.querySelector('[data-field="detail-label"]');
        const valueField = row.querySelector('[data-field="detail-value"]');
        const label = labelField?.value.trim();
        const value = valueField?.value.trim();
        if (label && value) {
          details.push({ label, value });
        }
      });

      const cooldownValue = Number.parseInt(cooldownInput?.value ?? 0, 10);
      const cooldownMaxValue = Number.parseInt(cooldownMaxInput?.value ?? 1, 10);
      const safeCooldownMax = Number.isNaN(cooldownMaxValue) ? 1 : Math.max(cooldownMaxValue, 1);
      const safeCooldown = Number.isNaN(cooldownValue)
        ? 0
        : Math.min(Math.max(cooldownValue, 0), safeCooldownMax);

      abilities.push({
        name: abilityName,
        icon: iconInput?.value.trim() || 'fa-solid fa-star',
        cooldown: safeCooldown,
        cooldownMax: safeCooldownMax,
        details
      });
    });
  }

  return {
    id: editorState.editingId,
    name,
    ancestry,
    clazz,
    level: Number.isNaN(level) ? 1 : level,
    campaign,
    tagline,
    portrait: editorState.portrait || DEFAULT_PORTRAIT,
    stats,
    abilities
  };
}

function wireInteractions() {
  if (elements.backToSelect && elements.screenSheet && elements.screenSelect) {
    elements.backToSelect.addEventListener('click', () => {
      elements.screenSheet.classList.add('hidden');
      elements.screenSelect.classList.remove('hidden');
    });
  }

  if (elements.createCharacterBtn) {
    elements.createCharacterBtn.addEventListener('click', () => {
      openCharacterEditor();
    });
  }

  if (elements.navItems) {
    elements.navItems.forEach((navItem) => {
      if (navItem.dataset.view === 'edit') {
        navItem.addEventListener('click', () => {
          const character = characters.find((item) => item.id === selectedCharacterId);
          openCharacterEditor(character);
        });
      }
    });
  }

  if (elements.editorBackdrop) {
    elements.editorBackdrop.addEventListener('click', closeCharacterEditor);
  }

  if (elements.closeEditor) {
    elements.closeEditor.addEventListener('click', closeCharacterEditor);
  }

  if (elements.cancelEditor) {
    elements.cancelEditor.addEventListener('click', closeCharacterEditor);
  }

  if (elements.characterForm) {
    elements.characterForm.addEventListener('submit', handleFormSubmit);
  }

  if (elements.portraitInput) {
    elements.portraitInput.addEventListener('change', handlePortraitChange);
  }

  if (elements.clearPortrait) {
    elements.clearPortrait.addEventListener('click', () => {
      editorState.portrait = DEFAULT_PORTRAIT;
      updatePortraitPreview();
      if (elements.portraitInput) {
        elements.portraitInput.value = '';
      }
    });
  }

  if (elements.addAbilityBtn) {
    elements.addAbilityBtn.addEventListener('click', () => {
      const abilityItem = createAbilityFields();
      elements.abilitiesContainer.appendChild(abilityItem);
      abilityItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.editorModal && !elements.editorModal.classList.contains('hidden')) {
      closeCharacterEditor();
    }
  });
}

function init() {
  cacheElements();

  characters = loadCharacters();
  const storedSelectedId = loadSelectedCharacterId();
  selectedCharacterId = storedSelectedId || characters[0]?.id || null;

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

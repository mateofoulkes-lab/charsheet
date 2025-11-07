const STORAGE_KEY = 'charsheet.characters';
const SELECTED_KEY = 'charsheet.selectedId';
const DEFAULT_PORTRAIT =
  (typeof window !== 'undefined' && window.DEFAULT_PORTRAIT) ||
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAKklEQVR4Ae3BMQEAAADCIPunNsN+YAAAAAAAAAAAAAAAAAAAAAD4GlrxAAE9eEIAAAAASUVORK5CYII=';

const STAT_KEYS = ['vida', 'ataque', 'defensa', 'danio', 'movimiento', 'alcance'];
const STAT_LABELS = {
  vida: 'Vida',
  ataque: 'Ataque',
  defensa: 'Defensa',
  danio: 'Daño',
  movimiento: 'Movimiento',
  alcance: 'Alcance'
};
const DEFAULT_ABILITY_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjE2IiBmaWxsPSIlMjMyYjIxM2EiLz48cGF0aCBkPSJNNjAgMThsMTIuOSAyNi4yIDI4LjkgNC4yLTIxIDE5LjYgNSAyOC41TDYwIDgzLjIgMzQuMiA5Ni41bDUtMjguNS0yMS0xOS42IDI4LjktNC4yeiIgZmlsbD0iJTIzZjRjODZhIiBvcGFjaXR5PSIwLjkiLz48L3N2Zz4=';
const MAX_DISPLAY_COOLDOWN = 12;

const defaultCharacters = [
  {
    id: 'boomer-el-chamuscado',
    name: 'Boomer, el chamuscado',
    portrait: DEFAULT_PORTRAIT,
    ancestry: 'Humano',
    clazz: 'Mago',
    level: 3,
    group: 'Sir Diego',
    campaign: 'Los cultistas y Maria',
    stats: {
      vida: '30',
      ataque: '3',
      defensa: '13',
      danio: '3',
      movimiento: '3',
      alcance: '3'
    },
    activeAbilities: [],
    passiveAbilities: [],
    inventory: [],
    notes: ''
  }
];

const elements = {};
const editorState = {
  editingId: null,
  portrait: DEFAULT_PORTRAIT
};
const abilityEditorState = {
  type: null,
  editingId: null,
  image: '',
  modifiers: []
};
let modifierRowCounter = 0;

const inventoryEditorState = {
  editingId: null,
  image: ''
};

let characters = [];
let selectedCharacterId = null;

function getSelectedCharacter() {
  if (!selectedCharacterId) return null;
  return characters.find((item) => item.id === selectedCharacterId) ?? null;
}

function iconMarkup(name, { className = '', label = null } = {}) {
  if (!name) return '';
  const classes = ['icon', `icon-${name}`];
  if (className) {
    classes.push(className);
  }
  const safeLabel = label ? String(label).replace(/"/g, '&quot;') : null;
  const ariaAttributes = safeLabel ? `role="img" aria-label="${safeLabel}"` : 'aria-hidden="true"';
  return `<svg class="${classes.join(' ')}" ${ariaAttributes} focusable="false"><use href="#icon-${name}" xlink:href="#icon-${name}"></use></svg>`;
}

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

function escapeHtml(text) {
  if (text === null || text === undefined) {
    return '';
  }
  return text
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeFeatureList(value) {
  if (!value) return [];
  const list = Array.isArray(value)
    ? value
    : value
        .toString()
        .split(/\r?\n/);
  return list
    .map((item) => item?.toString().trim())
    .filter((item) => item && item.length > 0);
}

function normalizeAbilityModifier(modifier) {
  if (!modifier) return null;
  const stat = modifier.stat;
  if (!STAT_KEYS.includes(stat)) {
    return null;
  }
  const value = Number.parseInt(modifier.value, 10);
  if (Number.isNaN(value)) {
    return null;
  }
  return { stat, value };
}

function normalizeActiveAbility(ability) {
  if (!ability) return null;
  const title = ability.title?.toString().trim();
  if (!title) {
    return null;
  }
  const cooldown = Number.parseInt(ability.cooldown, 10);
  const normalized = {
    id: ability.id?.toString().trim() || slugify(title),
    title,
    description: ability.description?.toString().trim() || '',
    features: normalizeFeatureList(ability.features),
    cooldown: Number.isFinite(cooldown) && !Number.isNaN(cooldown) && cooldown > 0 ? cooldown : 0,
    image: ability.image?.toString().trim() || ''
  };
  return normalized;
}

function normalizePassiveAbility(ability) {
  if (!ability) return null;
  const title = ability.title?.toString().trim();
  if (!title) {
    return null;
  }
  const modifiers = Array.isArray(ability.modifiers)
    ? ability.modifiers.map(normalizeAbilityModifier).filter(Boolean)
    : [];
  const normalized = {
    id: ability.id?.toString().trim() || slugify(title),
    title,
    description: ability.description?.toString().trim() || '',
    features: normalizeFeatureList(ability.features),
    modifiers
  };
  return normalized;
}

function normalizeInventoryItem(item) {
  if (!item) return null;
  const title = item.title?.toString().trim() || 'Elemento sin título';
  const description = item.description?.toString().trim() || '';
  const image = item.image?.toString().trim() || '';
  const id = item.id?.toString().trim() || slugify(title || 'item');
  return {
    id,
    title,
    description,
    image
  };
}

function dedupeById(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach((item) => {
    if (!item || !item.id) return;
    if (seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
  });
  return result;
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

  const activeAbilities = dedupeById(
    Array.isArray(character?.activeAbilities)
      ? character.activeAbilities.map(normalizeActiveAbility).filter(Boolean)
      : []
  );
  const passiveAbilities = dedupeById(
    Array.isArray(character?.passiveAbilities)
      ? character.passiveAbilities.map(normalizePassiveAbility).filter(Boolean)
      : []
  );
  const inventory = dedupeById(
    Array.isArray(character?.inventory)
      ? character.inventory.map(normalizeInventoryItem).filter(Boolean)
      : []
  );
  const notesValue = character?.notes;
  const notes = notesValue === null || notesValue === undefined ? '' : notesValue.toString();

  const normalized = {
    id: character?.id || slugify(character?.name || 'pj'),
    name: character?.name?.trim() || 'Personaje sin nombre',
    portrait,
    ancestry: character?.ancestry?.trim() || '',
    clazz: character?.clazz?.trim() || '',
    level: Number.parseInt(character?.level ?? 1, 10) || 1,
    group: character?.group?.toString().trim() || '',
    campaign: character?.campaign?.toString().trim() || '',
    stats: normalizedStats,
    activeAbilities,
    passiveAbilities,
    inventory,
    notes
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

function ensureUniqueAbilityId(list, baseId) {
  const existing = new Set((list || []).map((item) => item.id));
  let candidate = baseId;
  let suffix = 1;
  while (existing.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function ensureUniqueInventoryId(list, baseId) {
  const existing = new Set((list || []).map((item) => item.id));
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
  elements.navBack = document.querySelector('.bottom-bar [data-action="back"]');
  elements.navSheet = document.querySelector('.bottom-bar [data-action="sheet"]');
  elements.navInventory = document.querySelector('.bottom-bar [data-action="inventory"]');
  elements.navAbilities = document.querySelector('.bottom-bar [data-action="abilities"]');
  elements.navNotes = document.querySelector('.bottom-bar [data-action="notes"]');
  elements.navButtons = document.querySelectorAll('.bottom-bar .nav-button');
  elements.screenSelect = document.querySelector('[data-screen="select"]');
  elements.screenSheet = document.querySelector('[data-screen="sheet"]');
  elements.screenInventory = document.querySelector('[data-screen="inventory"]');
  elements.screenAbilities = document.querySelector('[data-screen="abilities"]');
  elements.screenNotes = document.querySelector('[data-screen="notes"]');
  elements.screens = document.querySelectorAll('[data-screen]');
  elements.heroCard = document.querySelector('.hero-card');
  elements.heroName = document.getElementById('heroName');
  elements.heroDetails = document.getElementById('heroDetails');
  elements.heroPortrait = document.querySelector('.hero-portrait');
  elements.heroToggle = document.getElementById('heroToggle');
  elements.heroToggleIcon = elements.heroToggle?.querySelector('use') ?? null;
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
  elements.addInventoryItem = document.getElementById('addInventoryItem');
  elements.inventoryList = document.getElementById('inventoryList');
  elements.inventoryModal = document.getElementById('inventoryModal');
  elements.inventoryModalTitle = document.getElementById('inventoryModalTitle');
  elements.inventoryBackdrop = elements.inventoryModal?.querySelector('.modal-backdrop') ?? null;
  elements.inventoryForm = document.getElementById('inventoryForm');
  elements.inventoryTitle = document.getElementById('inventoryTitle');
  elements.inventoryDescription = document.getElementById('inventoryDescription');
  elements.inventoryImage = document.getElementById('inventoryImage');
  elements.inventoryPreview = document.getElementById('inventoryPreview');
  elements.inventoryPreviewPlaceholder = document.getElementById('inventoryPreviewPlaceholder');
  elements.clearInventoryImage = document.getElementById('clearInventoryImage');
  elements.cancelInventory = document.getElementById('cancelInventory');
  elements.closeInventoryModal = document.getElementById('closeInventoryModal');
  elements.addActiveAbility = document.getElementById('addActiveAbility');
  elements.addPassiveAbility = document.getElementById('addPassiveAbility');
  elements.activeAbilityList = document.getElementById('activeAbilityList');
  elements.passiveAbilityList = document.getElementById('passiveAbilityList');
  elements.activeAbilityModal = document.getElementById('activeAbilityModal');
  elements.passiveAbilityModal = document.getElementById('passiveAbilityModal');
  elements.activeAbilityModalTitle = document.getElementById('activeAbilityModalTitle');
  elements.passiveAbilityModalTitle = document.getElementById('passiveAbilityModalTitle');
  elements.activeAbilityBackdrop = elements.activeAbilityModal?.querySelector('.modal-backdrop') ?? null;
  elements.passiveAbilityBackdrop = elements.passiveAbilityModal?.querySelector('.modal-backdrop') ?? null;
  elements.activeAbilityForm = document.getElementById('activeAbilityForm');
  elements.passiveAbilityForm = document.getElementById('passiveAbilityForm');
  elements.activeAbilityTitle = document.getElementById('activeAbilityTitle');
  elements.activeAbilityDescription = document.getElementById('activeAbilityDescription');
  elements.activeAbilityFeatures = document.getElementById('activeAbilityFeatures');
  elements.activeAbilityCooldown = document.getElementById('activeAbilityCooldown');
  elements.activeAbilityPreview = document.getElementById('activeAbilityPreview');
  elements.activeAbilityImage = document.getElementById('activeAbilityImage');
  elements.clearActiveAbilityImage = document.getElementById('clearActiveAbilityImage');
  elements.cancelActiveAbility = document.getElementById('cancelActiveAbility');
  elements.closeActiveAbility = document.getElementById('closeActiveAbility');
  elements.passiveAbilityTitle = document.getElementById('passiveAbilityTitle');
  elements.passiveAbilityDescription = document.getElementById('passiveAbilityDescription');
  elements.passiveAbilityFeatures = document.getElementById('passiveAbilityFeatures');
  elements.addPassiveModifier = document.getElementById('addPassiveModifier');
  elements.passiveModifierList = document.getElementById('passiveModifierList');
  elements.cancelPassiveAbility = document.getElementById('cancelPassiveAbility');
  elements.closePassiveAbility = document.getElementById('closePassiveAbility');
  elements.notesTextarea = document.getElementById('notesTextarea');
  elements.saveNotesButton = document.getElementById('saveNotesButton');
}

function updateNavState(activeAction) {
  if (!elements.navButtons) return;
  elements.navButtons.forEach((button) => {
    const action = button.dataset.action;
    button.classList.toggle('active', action === activeAction);
  });
}

function showScreen(screenName) {
  if (!elements.screens || elements.screens.length === 0) {
    elements.screens = document.querySelectorAll('[data-screen]');
  }
  if (!elements.screens) return;
  elements.screens.forEach((screen) => {
    const isTarget = screen.dataset.screen === screenName;
    screen.classList.toggle('hidden', !isTarget);
  });
}

function getActiveScreen() {
  if (!elements.screens || elements.screens.length === 0) {
    elements.screens = document.querySelectorAll('[data-screen]');
  }
  if (!elements.screens) return null;
  const active = Array.from(elements.screens).find((screen) => !screen.classList.contains('hidden'));
  return active?.dataset.screen ?? null;
}

function renderCharacterList() {
  if (!elements.characterList) return;
  const fragment = document.createDocumentFragment();

  characters.forEach((character) => {
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
    const affiliationParts = [];
    if (character.group) {
      affiliationParts.push(`Grupo: ${character.group}`);
    }
    if (character.campaign) {
      affiliationParts.push(`Campaña: ${character.campaign}`);
    }
    const affiliationLine = affiliationParts.join(' • ');

    card.innerHTML = `
      <img src="${portraitSrc}" alt="Retrato de ${character.name}" loading="lazy" />
      <div class="character-meta">
        <h2>${character.name}</h2>
        <p class="character-meta-line">${metaLine || '&nbsp;'}</p>
        <p class="character-campaign">${affiliationLine || '&nbsp;'}</p>
      </div>
      <div class="card-actions">
        <button class="icon-button edit" type="button" title="Editar ${character.name}">
          ${iconMarkup('pen-to-square')}
          <span>Editar</span>
        </button>
        <button class="icon-button delete" type="button" title="Eliminar ${character.name}">
          ${iconMarkup('trash')}
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

    fragment.appendChild(card);
  });

  elements.characterList.innerHTML = '';
  elements.characterList.appendChild(fragment);
}

function aggregatePassiveModifiers(character) {
  const totals = {};
  STAT_KEYS.forEach((key) => {
    totals[key] = 0;
  });
  if (!character || !Array.isArray(character.passiveAbilities)) {
    return totals;
  }
  character.passiveAbilities.forEach((ability) => {
    if (!ability || !Array.isArray(ability.modifiers)) return;
    ability.modifiers.forEach((modifier) => {
      if (!modifier || !STAT_KEYS.includes(modifier.stat)) return;
      const value = Number.parseInt(modifier.value, 10);
      if (Number.isNaN(value)) return;
      totals[modifier.stat] += value;
    });
  });
  return totals;
}

function renderStatModifiers(character) {
  if (!elements.stats) return;
  const totals = aggregatePassiveModifiers(character);
  elements.stats.forEach((statElement) => {
    const key = statElement.dataset.stat;
    const container = statElement.querySelector('.stat-modifiers');
    if (!container || !key) return;
    const total = totals[key] ?? 0;
    if (!total) {
      container.innerHTML = '';
      return;
    }
    const className = total > 0 ? 'positive' : 'negative';
    const text = `${total > 0 ? '+' : ''}${total}`;
    container.innerHTML = `<span class="stat-modifier ${className}">${escapeHtml(text)}</span>`;
  });
}

function updateAbilityControlsAvailability() {
  const hasCharacter = Boolean(getSelectedCharacter());
  if (elements.addActiveAbility) {
    elements.addActiveAbility.disabled = !hasCharacter;
  }
  if (elements.addPassiveAbility) {
    elements.addPassiveAbility.disabled = !hasCharacter;
  }
}

function updateInventoryControlsAvailability() {
  const hasCharacter = Boolean(getSelectedCharacter());
  if (elements.addInventoryItem) {
    elements.addInventoryItem.disabled = !hasCharacter;
  }
}

function createAbilityCardElement(ability, type) {
  const safeType = type === 'passive' ? 'passive' : 'active';
  const titleText = ability?.title?.toString().trim() || 'Habilidad sin título';
  const descriptionText = ability?.description?.toString().trim() || '';
  const featuresSource = ability?.features ?? [];
  const features = Array.isArray(featuresSource)
    ? featuresSource
        .map((item) => (item == null ? '' : item.toString().trim()))
        .filter((item) => item.length > 0)
    : normalizeFeatureList(featuresSource);
  const modifiersSource = ability?.modifiers ?? [];
  const modifiers = Array.isArray(modifiersSource)
    ? modifiersSource
        .map((modifier) => {
          if (!modifier) return null;
          const stat = modifier.stat?.toString().trim();
          if (!stat) return null;
          const parsed = Number.parseInt(modifier.value, 10);
          const value = Number.isNaN(parsed) ? 0 : parsed;
          return { stat, value };
        })
        .filter(Boolean)
    : [];
  const cooldownValue = Number.parseInt(ability?.cooldown, 10);
  const cooldown = Number.isNaN(cooldownValue) || cooldownValue < 0 ? 0 : cooldownValue;
  const imageSrc = ability?.image?.toString().trim() || '';
  const abilityId = ability?.id?.toString().trim() || slugify(titleText);

  const card = document.createElement('article');
  card.className = `ability-card ability-${safeType}`;
  card.dataset.id = abilityId;
  card.dataset.type = safeType;

  const media = document.createElement('div');
  media.className = 'ability-card-media';

  if (imageSrc) {
    const img = document.createElement('img');
    img.src = withVersion(imageSrc);
    img.alt = `Ilustración de ${titleText}`;
    media.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'ability-image placeholder';
    const icon = document.createElement('i');
    icon.className = safeType === 'active' ? 'fa-solid fa-bolt' : 'fa-solid fa-leaf';
    icon.setAttribute('aria-hidden', 'true');
    placeholder.appendChild(icon);
    media.appendChild(placeholder);
  }

  card.appendChild(media);

  const body = document.createElement('div');
  body.className = 'ability-card-body';

  const header = document.createElement('header');
  header.className = 'ability-card-header';

  const title = document.createElement('h4');
  title.textContent = titleText;
  header.appendChild(title);

  if (descriptionText) {
    const description = document.createElement('p');
    description.className = 'ability-description';
    description.textContent = descriptionText;
    header.appendChild(description);
  }

  body.appendChild(header);

  const featureList = document.createElement('ul');
  featureList.className = 'ability-features';
  if (features.length > 0) {
    features.forEach((feature) => {
      const item = document.createElement('li');
      item.textContent = feature;
      featureList.appendChild(item);
    });
  } else {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'ability-feature-empty';
    emptyItem.textContent = 'Sin características adicionales';
    featureList.appendChild(emptyItem);
  }
  body.appendChild(featureList);

  if (safeType === 'active') {
    const cooldownContainer = document.createElement('div');
    cooldownContainer.className = 'ability-cooldown';
    if (cooldown > 0) {
      cooldownContainer.setAttribute('aria-label', `Cooldown de ${cooldown} turnos`);
      const dots = Math.min(cooldown, MAX_DISPLAY_COOLDOWN);
      for (let index = 0; index < dots; index += 1) {
        const dot = document.createElement('span');
        dot.className = 'cooldown-dot';
        cooldownContainer.appendChild(dot);
      }
      if (cooldown > MAX_DISPLAY_COOLDOWN) {
        const extra = document.createElement('span');
        extra.className = 'cooldown-extra';
        extra.textContent = `+${cooldown - MAX_DISPLAY_COOLDOWN}`;
        cooldownContainer.appendChild(extra);
      }
    } else {
      cooldownContainer.classList.add('cooldown-none');
      cooldownContainer.textContent = 'Sin cooldown';
    }
    body.appendChild(cooldownContainer);
  } else {
    const modifierList = document.createElement('ul');
    modifierList.className = 'ability-modifiers';
    if (modifiers.length > 0) {
      modifiers.forEach((modifier) => {
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'modifier-label';
        label.textContent = STAT_LABELS[modifier.stat] || modifier.stat.toUpperCase();
        const value = document.createElement('span');
        value.className = `modifier-value ${modifier.value >= 0 ? 'positive' : 'negative'}`;
        value.textContent = `${modifier.value >= 0 ? '+' : ''}${modifier.value}`;
        item.appendChild(label);
        item.appendChild(value);
        modifierList.appendChild(item);
      });
    } else {
      const emptyModifier = document.createElement('li');
      emptyModifier.className = 'ability-modifier-empty';
      emptyModifier.textContent = 'Sin modificadores';
      modifierList.appendChild(emptyModifier);
    }
    body.appendChild(modifierList);
  }

  card.appendChild(body);

  const actions = document.createElement('footer');
  actions.className = 'ability-card-actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'icon-button edit';
  editButton.dataset.action = 'edit';
  editButton.title = `Editar ${titleText}`;
  editButton.innerHTML = `${iconMarkup('pen-to-square')}<span>Editar</span>`;
  actions.appendChild(editButton);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'icon-button delete';
  deleteButton.dataset.action = 'delete';
  deleteButton.title = `Eliminar ${titleText}`;
  deleteButton.innerHTML = `${iconMarkup('trash')}<span>Borrar</span>`;
  actions.appendChild(deleteButton);

  card.appendChild(actions);

  return card;
}

function createInventoryCardElement(item) {
  const title = item?.title?.toString().trim() || 'Elemento sin título';
  const description = item?.description?.toString().trim() || '';
  const imageSrc = item?.image?.toString().trim() || '';
  const itemId = item?.id?.toString().trim() || slugify(title || 'item');

  const card = document.createElement('article');
  card.className = 'inventory-card';
  card.dataset.id = itemId;

  const media = document.createElement('div');
  media.className = 'inventory-card-media';
  if (imageSrc) {
    const img = document.createElement('img');
    img.src = withVersion(imageSrc);
    img.alt = `Imagen de ${title}`;
    media.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'inventory-card-placeholder';
    placeholder.innerHTML = '<i class="fa-solid fa-circle" aria-hidden="true"></i>';
    media.appendChild(placeholder);
  }
  card.appendChild(media);

  const body = document.createElement('div');
  body.className = 'inventory-card-body';

  const header = document.createElement('header');
  header.className = 'inventory-card-header';
  const heading = document.createElement('h4');
  heading.textContent = title;
  header.appendChild(heading);
  body.appendChild(header);

  const descriptionElement = document.createElement('p');
  descriptionElement.className = 'inventory-card-description';
  if (description) {
    descriptionElement.textContent = description;
  } else {
    descriptionElement.textContent = 'Sin descripción';
    descriptionElement.classList.add('empty');
  }
  body.appendChild(descriptionElement);

  card.appendChild(body);

  const actions = document.createElement('footer');
  actions.className = 'inventory-card-actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'icon-button edit';
  editButton.dataset.action = 'edit';
  editButton.title = `Editar ${title}`;
  editButton.innerHTML = `${iconMarkup('pen-to-square')}<span>Editar</span>`;
  actions.appendChild(editButton);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'icon-button delete';
  deleteButton.dataset.action = 'delete';
  deleteButton.title = `Eliminar ${title}`;
  deleteButton.innerHTML = `${iconMarkup('trash')}<span>Borrar</span>`;
  actions.appendChild(deleteButton);

  card.appendChild(actions);

  return card;
}

function renderAbilityLists() {
  updateAbilityControlsAvailability();
  const character = getSelectedCharacter();
  if (!elements.activeAbilityList || !elements.passiveAbilityList) {
    return;
  }

  if (!character) {
    const message = '<p class="empty-state">Seleccioná un personaje para administrar sus habilidades.</p>';
    elements.activeAbilityList.innerHTML = message;
    elements.passiveAbilityList.innerHTML = message;
    return;
  }

  const activeFragment = document.createDocumentFragment();
  const activeAbilities = Array.isArray(character.activeAbilities) ? character.activeAbilities : [];
  if (activeAbilities.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-state';
    emptyMessage.textContent = 'No hay habilidades activas registradas.';
    activeFragment.appendChild(emptyMessage);
  } else {
    activeAbilities.forEach((ability) => {
      if (!ability) return;
      activeFragment.appendChild(createAbilityCardElement(ability, 'active'));
    });
  }
  elements.activeAbilityList.innerHTML = '';
  elements.activeAbilityList.appendChild(activeFragment);

  const passiveFragment = document.createDocumentFragment();
  const passiveAbilities = Array.isArray(character.passiveAbilities) ? character.passiveAbilities : [];
  if (passiveAbilities.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-state';
    emptyMessage.textContent = 'No hay habilidades pasivas registradas.';
    passiveFragment.appendChild(emptyMessage);
  } else {
    passiveAbilities.forEach((ability) => {
      if (!ability) return;
      passiveFragment.appendChild(createAbilityCardElement(ability, 'passive'));
    });
  }
  elements.passiveAbilityList.innerHTML = '';
  elements.passiveAbilityList.appendChild(passiveFragment);
}

function renderInventoryList() {
  updateInventoryControlsAvailability();
  if (!elements.inventoryList) return;
  const character = getSelectedCharacter();
  if (!character) {
    elements.inventoryList.innerHTML =
      '<p class="inventory-empty-state">Seleccioná un personaje para administrar su inventario.</p>';
    return;
  }

  const items = Array.isArray(character.inventory) ? character.inventory : [];
  const fragment = document.createDocumentFragment();
  if (items.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'inventory-empty-state';
    emptyMessage.textContent = 'No hay objetos en el inventario.';
    fragment.appendChild(emptyMessage);
  } else {
    items.forEach((item) => {
      if (!item) return;
      fragment.appendChild(createInventoryCardElement(item));
    });
  }
  elements.inventoryList.innerHTML = '';
  elements.inventoryList.appendChild(fragment);
}

function renderNotesContent() {
  if (!elements.notesTextarea) return;
  const character = getSelectedCharacter();
  const hasCharacter = Boolean(character);

  elements.notesTextarea.disabled = !hasCharacter;
  if (elements.saveNotesButton) {
    elements.saveNotesButton.disabled = !hasCharacter;
  }

  if (!hasCharacter) {
    elements.notesTextarea.value = '';
    return;
  }

  const noteValue = character.notes;
  elements.notesTextarea.value = noteValue === null || noteValue === undefined ? '' : noteValue.toString();
}

function showAbilitiesScreen() {
  renderAbilityLists();
  showScreen('abilities');
  updateNavState('abilities');
}

function showInventoryScreen() {
  renderInventoryList();
  showScreen('inventory');
  updateNavState('inventory');
}

function showNotesScreen() {
  renderNotesContent();
  showScreen('notes');
  updateNavState('notes');
}

function applyCharacterUpdate(characterId, updater) {
  const index = characters.findIndex((item) => item.id === characterId);
  if (index < 0) return null;
  const current = characters[index];
  const draft = {
    ...current,
    stats: { ...current.stats },
    activeAbilities: [...(current.activeAbilities || [])],
    passiveAbilities: [...(current.passiveAbilities || [])],
    inventory: [...(current.inventory || [])],
    notes: current.notes ?? ''
  };
  const maybeUpdated = updater ? updater(draft) : draft;
  const next = maybeUpdated || draft;
  const normalized = normalizeCharacter(next);
  characters = [
    ...characters.slice(0, index),
    normalized,
    ...characters.slice(index + 1)
  ];
  saveCharacters(characters);
  if (selectedCharacterId === characterId) {
    renderCharacterSheetView(normalized);
    renderAbilityLists();
    renderInventoryList();
    renderNotesContent();
  }
  return normalized;
}

function syncBodyModalState() {
  const openModal = document.querySelector('.modal:not(.hidden)');
  document.body.classList.toggle('modal-open', Boolean(openModal));
}

function updateActiveAbilityPreview() {
  if (!elements.activeAbilityPreview) return;
  const source = abilityEditorState.image || DEFAULT_ABILITY_IMAGE;
  elements.activeAbilityPreview.src = withVersion(source);
  elements.activeAbilityPreview.alt = 'Vista previa de la habilidad activa';
}

function closeActiveAbilityModal() {
  if (!elements.activeAbilityModal) return;
  elements.activeAbilityModal.classList.add('hidden');
  elements.activeAbilityForm?.reset();
  if (elements.activeAbilityImage) {
    elements.activeAbilityImage.value = '';
  }
  abilityEditorState.type = null;
  abilityEditorState.editingId = null;
  abilityEditorState.image = '';
  abilityEditorState.modifiers = [];
  updateActiveAbilityPreview();
  syncBodyModalState();
}

function openActiveAbilityModal(ability = null) {
  if (!elements.activeAbilityModal) return;
  abilityEditorState.type = 'active';
  abilityEditorState.editingId = ability?.id ?? null;
  abilityEditorState.image = ability?.image || '';
  abilityEditorState.modifiers = [];
  elements.activeAbilityForm?.reset();
  if (elements.activeAbilityTitle) {
    elements.activeAbilityTitle.value = ability?.title ?? '';
  }
  if (elements.activeAbilityDescription) {
    elements.activeAbilityDescription.value = ability?.description ?? '';
  }
  if (elements.activeAbilityFeatures) {
    elements.activeAbilityFeatures.value = ability?.features?.join('\n') ?? '';
  }
  if (elements.activeAbilityCooldown) {
    const cooldown = Number.parseInt(ability?.cooldown, 10);
    elements.activeAbilityCooldown.value = Number.isNaN(cooldown) || cooldown < 0 ? 0 : cooldown;
  }
  if (elements.activeAbilityModalTitle) {
    elements.activeAbilityModalTitle.textContent = ability ? 'Editar habilidad activa' : 'Nueva habilidad activa';
  }
  updateActiveAbilityPreview();
  elements.activeAbilityModal.classList.remove('hidden');
  syncBodyModalState();
  elements.activeAbilityTitle?.focus({ preventScroll: true });
}

function handleActiveAbilityImageChange(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  if (file.type !== 'image/png') {
    window.alert('La imagen debe ser un archivo PNG.');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    abilityEditorState.image = loadEvent.target?.result || '';
    updateActiveAbilityPreview();
  };
  reader.readAsDataURL(file);
}

function handleActiveAbilitySubmit(event) {
  event.preventDefault();
  if (!elements.activeAbilityForm) return;
  const formData = new FormData(elements.activeAbilityForm);
  const title = formData.get('title')?.toString().trim();
  if (!title) {
    window.alert('El título de la habilidad es obligatorio.');
    return;
  }
  const description = formData.get('description')?.toString().trim() || '';
  const features = normalizeFeatureList(formData.get('features'));
  const cooldownValue = Number.parseInt(formData.get('cooldown'), 10);
  const cooldown = Number.isNaN(cooldownValue) || cooldownValue < 0 ? 0 : cooldownValue;
  const baseId = slugify(title || 'habilidad-activa');
  const characterId = selectedCharacterId;
  if (!characterId) {
    window.alert('Seleccioná un personaje antes de agregar habilidades.');
    return;
  }

  applyCharacterUpdate(characterId, (draft) => {
    const ability = {
      id:
        abilityEditorState.editingId || ensureUniqueAbilityId(draft.activeAbilities, `${baseId}-activa`),
      title,
      description,
      features,
      cooldown,
      image: abilityEditorState.image || ''
    };
    const list = draft.activeAbilities;
    const index = list.findIndex((item) => item.id === ability.id);
    if (index >= 0) {
      list[index] = ability;
    } else {
      list.push(ability);
    }
    return draft;
  });

  closeActiveAbilityModal();
}

function addPassiveModifierRow(modifier = null) {
  if (!elements.passiveModifierList) return;
  const row = document.createElement('div');
  row.className = 'modifier-row';
  modifierRowCounter += 1;
  const statId = `modifier-stat-${modifierRowCounter}`;
  const valueId = `modifier-value-${modifierRowCounter}`;

  const statWrapper = document.createElement('div');
  statWrapper.className = 'modifier-field';
  const statLabel = document.createElement('label');
  statLabel.className = 'sr-only';
  statLabel.setAttribute('for', statId);
  statLabel.textContent = 'Estadística';
  const select = document.createElement('select');
  select.name = 'modifier-stat';
  select.className = 'modifier-stat';
  select.id = statId;
  STAT_KEYS.forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = STAT_LABELS[key] || key.toUpperCase();
    select.appendChild(option);
  });
  statWrapper.appendChild(statLabel);
  statWrapper.appendChild(select);

  const valueWrapper = document.createElement('div');
  valueWrapper.className = 'modifier-field';
  const valueLabel = document.createElement('label');
  valueLabel.className = 'sr-only';
  valueLabel.setAttribute('for', valueId);
  valueLabel.textContent = 'Valor del modificador';
  const input = document.createElement('input');
  input.type = 'number';
  input.name = 'modifier-value';
  input.className = 'modifier-value-input';
  input.step = '1';
  input.value = '0';
  input.id = valueId;
  valueWrapper.appendChild(valueLabel);
  valueWrapper.appendChild(input);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'icon-button delete';
  removeButton.dataset.action = 'remove-modifier';
  removeButton.title = 'Quitar modificador';
  removeButton.innerHTML = `${iconMarkup('xmark')}<span>Quitar</span>`;

  row.appendChild(statWrapper);
  row.appendChild(valueWrapper);
  row.appendChild(removeButton);

  elements.passiveModifierList.appendChild(row);

  if (modifier) {
    if (STAT_KEYS.includes(modifier.stat)) {
      select.value = modifier.stat;
    }
    if (typeof modifier.value === 'number' || typeof modifier.value === 'string') {
      const parsed = Number.parseInt(modifier.value, 10);
      input.value = Number.isNaN(parsed) ? '0' : parsed.toString();
    }
  }
}

function clearPassiveModifiers() {
  if (!elements.passiveModifierList) return;
  elements.passiveModifierList.innerHTML = '';
}

function closePassiveAbilityModal() {
  if (!elements.passiveAbilityModal) return;
  elements.passiveAbilityModal.classList.add('hidden');
  elements.passiveAbilityForm?.reset();
  clearPassiveModifiers();
  abilityEditorState.type = null;
  abilityEditorState.editingId = null;
  abilityEditorState.image = '';
  abilityEditorState.modifiers = [];
  modifierRowCounter = 0;
  syncBodyModalState();
}

function openPassiveAbilityModal(ability = null) {
  if (!elements.passiveAbilityModal) return;
  abilityEditorState.type = 'passive';
  abilityEditorState.editingId = ability?.id ?? null;
  abilityEditorState.image = '';
  abilityEditorState.modifiers = Array.isArray(ability?.modifiers) ? ability.modifiers : [];
  elements.passiveAbilityForm?.reset();
  if (elements.passiveAbilityTitle) {
    elements.passiveAbilityTitle.value = ability?.title ?? '';
  }
  if (elements.passiveAbilityDescription) {
    elements.passiveAbilityDescription.value = ability?.description ?? '';
  }
  if (elements.passiveAbilityFeatures) {
    elements.passiveAbilityFeatures.value = ability?.features?.join('\n') ?? '';
  }
  if (elements.passiveAbilityModalTitle) {
    elements.passiveAbilityModalTitle.textContent = ability
      ? 'Editar habilidad pasiva'
      : 'Nueva habilidad pasiva';
  }
  modifierRowCounter = 0;
  clearPassiveModifiers();
  if (abilityEditorState.modifiers.length > 0) {
    abilityEditorState.modifiers.forEach((modifier) => addPassiveModifierRow(modifier));
  } else {
    addPassiveModifierRow();
  }
  elements.passiveAbilityModal.classList.remove('hidden');
  syncBodyModalState();
  elements.passiveAbilityTitle?.focus({ preventScroll: true });
}

function handlePassiveModifierListClick(event) {
  const button = event.target.closest('button[data-action="remove-modifier"]');
  if (!button) return;
  const row = button.closest('.modifier-row');
  if (row) {
    row.remove();
  }
}

function handlePassiveAbilitySubmit(event) {
  event.preventDefault();
  if (!elements.passiveAbilityForm) return;
  const formData = new FormData(elements.passiveAbilityForm);
  const title = formData.get('title')?.toString().trim();
  if (!title) {
    window.alert('El título de la habilidad es obligatorio.');
    return;
  }
  const description = formData.get('description')?.toString().trim() || '';
  const features = normalizeFeatureList(formData.get('features'));
  const modifiers = [];
  if (elements.passiveModifierList) {
    elements.passiveModifierList.querySelectorAll('.modifier-row').forEach((row) => {
      const stat = row.querySelector('select[name="modifier-stat"]')?.value;
      const valueText = row.querySelector('input[name="modifier-value"]')?.value;
      if (!stat) return;
      const value = Number.parseInt(valueText, 10);
      if (Number.isNaN(value)) return;
      if (!STAT_KEYS.includes(stat)) return;
      modifiers.push({ stat, value });
    });
  }

  const baseId = slugify(title || 'habilidad-pasiva');
  const characterId = selectedCharacterId;
  if (!characterId) {
    window.alert('Seleccioná un personaje antes de agregar habilidades.');
    return;
  }

  applyCharacterUpdate(characterId, (draft) => {
    const ability = {
      id:
        abilityEditorState.editingId || ensureUniqueAbilityId(draft.passiveAbilities, `${baseId}-pasiva`),
      title,
      description,
      features,
      modifiers
    };
    const list = draft.passiveAbilities;
    const index = list.findIndex((item) => item.id === ability.id);
    if (index >= 0) {
      list[index] = ability;
    } else {
      list.push(ability);
    }
    return draft;
  });

  closePassiveAbilityModal();
}

function updateInventoryPreview() {
  if (!elements.inventoryPreview) return;
  const source = inventoryEditorState.image || '';
  if (source) {
    elements.inventoryPreview.src = withVersion(source);
    elements.inventoryPreview.classList.remove('hidden');
    elements.inventoryPreviewPlaceholder?.classList.add('hidden');
  } else {
    elements.inventoryPreview.src = '';
    elements.inventoryPreview.classList.add('hidden');
    elements.inventoryPreviewPlaceholder?.classList.remove('hidden');
  }
}

function closeInventoryModal() {
  if (!elements.inventoryModal) return;
  elements.inventoryModal.classList.add('hidden');
  elements.inventoryForm?.reset();
  if (elements.inventoryImage) {
    elements.inventoryImage.value = '';
  }
  inventoryEditorState.editingId = null;
  inventoryEditorState.image = '';
  updateInventoryPreview();
  syncBodyModalState();
}

function openInventoryModal(item = null) {
  if (!elements.inventoryModal) return;
  inventoryEditorState.editingId = item?.id ?? null;
  inventoryEditorState.image = item?.image || '';
  elements.inventoryForm?.reset();
  if (elements.inventoryTitle) {
    elements.inventoryTitle.value = item?.title ?? '';
  }
  if (elements.inventoryDescription) {
    elements.inventoryDescription.value = item?.description ?? '';
  }
  if (elements.inventoryModalTitle) {
    elements.inventoryModalTitle.textContent = item ? 'Editar item' : 'Nuevo item';
  }
  updateInventoryPreview();
  elements.inventoryModal.classList.remove('hidden');
  syncBodyModalState();
  elements.inventoryTitle?.focus({ preventScroll: true });
}

function handleInventoryImageChange(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  if (file.type !== 'image/png') {
    window.alert('La imagen debe ser un archivo PNG.');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    inventoryEditorState.image = loadEvent.target?.result || '';
    updateInventoryPreview();
  };
  reader.readAsDataURL(file);
}

function handleInventorySubmit(event) {
  event.preventDefault();
  if (!elements.inventoryForm) return;
  const formData = new FormData(elements.inventoryForm);
  const title = formData.get('title')?.toString().trim();
  if (!title) {
    window.alert('El título del item es obligatorio.');
    return;
  }
  const description = formData.get('description')?.toString().trim() || '';
  const characterId = selectedCharacterId;
  if (!characterId) {
    window.alert('Seleccioná un personaje antes de administrar el inventario.');
    return;
  }
  const baseId = slugify(title || 'item');

  applyCharacterUpdate(characterId, (draft) => {
    if (!Array.isArray(draft.inventory)) {
      draft.inventory = [];
    }
    const item = {
      id: inventoryEditorState.editingId || ensureUniqueInventoryId(draft.inventory, `${baseId}-item`),
      title,
      description,
      image: inventoryEditorState.image || ''
    };
    const list = draft.inventory;
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index >= 0) {
      list[index] = item;
    } else {
      list.push(item);
    }
    return draft;
  });

  closeInventoryModal();
}

function handleNotesSave() {
  if (!elements.notesTextarea) return;
  if (!selectedCharacterId) {
    window.alert('Seleccioná un personaje antes de guardar notas.');
    return;
  }

  const content = elements.notesTextarea.value ?? '';

  applyCharacterUpdate(selectedCharacterId, (draft) => {
    draft.notes = content;
    return draft;
  });
}

function handleInventoryListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (!['edit', 'delete'].includes(action)) return;
  const card = button.closest('.inventory-card');
  if (!card) return;
  const itemId = card.dataset.id;
  const character = getSelectedCharacter();
  if (!character) {
    window.alert('Seleccioná un personaje para administrar el inventario.');
    return;
  }
  const items = Array.isArray(character.inventory) ? character.inventory : [];
  const item = items.find((entry) => entry?.id === itemId);
  if (!item) return;

  if (action === 'edit') {
    openInventoryModal(item);
    return;
  }

  if (action === 'delete') {
    const confirmed = window.confirm(`¿Seguro que querés eliminar "${item.title}"?`);
    if (!confirmed) return;
    applyCharacterUpdate(character.id, (draft) => {
      draft.inventory = (draft.inventory || []).filter((entry) => entry.id !== itemId);
      return draft;
    });
  }
}

function handleAbilityListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (!['edit', 'delete'].includes(action)) return;
  const card = button.closest('.ability-card');
  if (!card) return;
  const abilityId = card.dataset.id;
  const type = card.dataset.type;
  if (!abilityId || !type) return;
  const character = getSelectedCharacter();
  if (!character) {
    window.alert('Seleccioná un personaje para administrar sus habilidades.');
    return;
  }

  if (action === 'edit') {
    if (type === 'active') {
      const ability = character.activeAbilities.find((item) => item.id === abilityId);
      if (ability) {
        openActiveAbilityModal(ability);
      }
    } else if (type === 'passive') {
      const ability = character.passiveAbilities.find((item) => item.id === abilityId);
      if (ability) {
        openPassiveAbilityModal(ability);
      }
    }
    return;
  }

  if (action === 'delete') {
    const abilities = type === 'active' ? character.activeAbilities : character.passiveAbilities;
    const ability = abilities.find((item) => item.id === abilityId);
    if (!ability) return;
    const confirmed = window.confirm(`¿Seguro que querés eliminar "${ability.title}"?`);
    if (!confirmed) return;
    applyCharacterUpdate(character.id, (draft) => {
      if (type === 'active') {
        draft.activeAbilities = draft.activeAbilities.filter((item) => item.id !== abilityId);
      } else {
        draft.passiveAbilities = draft.passiveAbilities.filter((item) => item.id !== abilityId);
      }
      return draft;
    });
  }
}

function selectCharacter(characterId) {
  selectedCharacterId = characterId;
  saveSelectedCharacterId(characterId);
  renderCharacterList();
  const character = getSelectedCharacter();
  if (character) {
    renderAbilityLists();
    renderInventoryList();
  } else {
    updateAbilityControlsAvailability();
    updateInventoryControlsAvailability();
  }
  renderNotesContent();
  const activeScreen = getActiveScreen();
  if (activeScreen === 'abilities') {
    showAbilitiesScreen();
  } else if (activeScreen === 'inventory') {
    showInventoryScreen();
  } else if (activeScreen === 'notes') {
    showNotesScreen();
  } else if (character) {
    showCharacterSheet(characterId);
  }
}

function deleteCharacter(character) {
  const confirmed = window.confirm(`¿Seguro que querés eliminar a ${character.name}?`);
  if (!confirmed) return;

  characters = characters.filter((item) => item.id !== character.id);
  saveCharacters(characters);

  if (selectedCharacterId === character.id) {
    selectedCharacterId = characters[0]?.id ?? null;
    const nextCharacter = getSelectedCharacter();
    if (nextCharacter) {
      renderCharacterSheetView(nextCharacter);
    }
  }

  saveSelectedCharacterId(selectedCharacterId ?? '');
  renderCharacterList();
  renderAbilityLists();
  renderInventoryList();
  renderNotesContent();

  const activeScreen = getActiveScreen();
  if (selectedCharacterId) {
    if (activeScreen === 'abilities') {
      showAbilitiesScreen();
    } else if (activeScreen === 'inventory') {
      showInventoryScreen();
    } else if (activeScreen === 'notes') {
      showNotesScreen();
    } else if (activeScreen === 'sheet') {
      showCharacterSheet(selectedCharacterId);
    }
  } else {
    showScreen('select');
    updateNavState(null);
    updateInventoryControlsAvailability();
  }
}

function renderCharacterSheetView(character) {
  if (!character) return;
  if (elements.heroName) {
    elements.heroName.textContent = character.name;
  }

  if (elements.heroDetails) {
    const parts = [character.ancestry, character.clazz]
      .map((part) => part?.trim())
      .filter(Boolean);
    parts.push(`Nivel ${character.level}`);
    elements.heroDetails.textContent = parts.join(' · ');
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
  renderStatModifiers(character);
}

function showCharacterSheet(characterId) {
  const character = characters.find((item) => item.id === characterId);
  if (!character) return;
  renderCharacterSheetView(character);
  showScreen('sheet');
  updateNavState('sheet');
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
    group: '',
    campaign: '',
    portrait: DEFAULT_PORTRAIT,
    stats,
    activeAbilities: [],
    passiveAbilities: [],
    inventory: [],
    notes: ''
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
  syncBodyModalState();
}

function closeCharacterEditor() {
  elements.editorModal?.classList.add('hidden');
  editorState.editingId = null;
  editorState.portrait = DEFAULT_PORTRAIT;
  elements.characterForm?.reset();
  if (elements.editorTitle) {
    elements.editorTitle.textContent = 'Editor de personaje';
  }
  updatePortraitPreview();
  syncBodyModalState();
}

function fillEditorForm(character) {
  if (!elements.characterForm) return;

  elements.characterForm.reset();

  const map = {
    characterName: character.name,
    characterAncestry: character.ancestry,
    characterClass: character.clazz,
    characterLevel: character.level,
    characterGroup: character.group,
    characterCampaign: character.campaign
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
    group: formData.get('characterGroup')?.toString().trim() || '',
    campaign: formData.get('characterCampaign')?.toString().trim() || '',
    portrait: editorState.portrait || DEFAULT_PORTRAIT,
    stats: {}
  };

  STAT_KEYS.forEach((key) => {
    const value = formData.get(`stat-${key}`);
    payload.stats[key] = normalizeStatValue(value);
  });

  if (payload.id) {
    const existing = characters.find((item) => item.id === payload.id);
    payload.activeAbilities = Array.isArray(existing?.activeAbilities) ? existing.activeAbilities : [];
    payload.passiveAbilities = Array.isArray(existing?.passiveAbilities) ? existing.passiveAbilities : [];
    payload.inventory = Array.isArray(existing?.inventory) ? existing.inventory : [];
    payload.notes = existing?.notes ?? '';
  } else {
    payload.activeAbilities = [];
    payload.passiveAbilities = [];
    payload.inventory = [];
    payload.notes = '';
  }

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
  elements.navBack?.addEventListener('click', () => {
    showScreen('select');
    updateNavState(null);
  });
  elements.navSheet?.addEventListener('click', () => {
    if (!selectedCharacterId && characters[0]) {
      selectCharacter(characters[0].id);
      return;
    }
    if (selectedCharacterId) {
      showCharacterSheet(selectedCharacterId);
    }
  });
  elements.navInventory?.addEventListener('click', () => {
    if (!selectedCharacterId && characters[0]) {
      selectCharacter(characters[0].id);
    }
    showInventoryScreen();
  });
  elements.navAbilities?.addEventListener('click', () => {
    if (!selectedCharacterId && characters[0]) {
      selectCharacter(characters[0].id);
    }
    showAbilitiesScreen();
  });
  elements.navNotes?.addEventListener('click', () => {
    if (!selectedCharacterId && characters[0]) {
      selectCharacter(characters[0].id);
    }
    showNotesScreen();
  });

  if (elements.heroToggle && elements.heroCard) {
    elements.heroToggle.addEventListener('click', () => {
      const nextCollapsed = !elements.heroCard.classList.contains('collapsed');
      setHeroCardCollapsed(nextCollapsed);
    });
  }

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

  elements.addActiveAbility?.addEventListener('click', () => {
    if (!selectedCharacterId) {
      window.alert('Seleccioná un personaje antes de agregar habilidades.');
      return;
    }
    openActiveAbilityModal();
  });
  elements.addPassiveAbility?.addEventListener('click', () => {
    if (!selectedCharacterId) {
      window.alert('Seleccioná un personaje antes de agregar habilidades.');
      return;
    }
    openPassiveAbilityModal();
  });
  elements.addInventoryItem?.addEventListener('click', () => {
    if (!selectedCharacterId) {
      window.alert('Seleccioná un personaje antes de agregar objetos.');
      return;
    }
    openInventoryModal();
  });
  elements.activeAbilityForm?.addEventListener('submit', handleActiveAbilitySubmit);
  elements.passiveAbilityForm?.addEventListener('submit', handlePassiveAbilitySubmit);
  elements.inventoryForm?.addEventListener('submit', handleInventorySubmit);
  elements.saveNotesButton?.addEventListener('click', handleNotesSave);
  elements.activeAbilityImage?.addEventListener('change', handleActiveAbilityImageChange);
  elements.inventoryImage?.addEventListener('change', handleInventoryImageChange);
  elements.clearActiveAbilityImage?.addEventListener('click', () => {
    abilityEditorState.image = '';
    if (elements.activeAbilityImage) {
      elements.activeAbilityImage.value = '';
    }
    updateActiveAbilityPreview();
  });
  elements.clearInventoryImage?.addEventListener('click', () => {
    inventoryEditorState.image = '';
    if (elements.inventoryImage) {
      elements.inventoryImage.value = '';
    }
    updateInventoryPreview();
  });
  elements.cancelActiveAbility?.addEventListener('click', closeActiveAbilityModal);
  elements.closeActiveAbility?.addEventListener('click', closeActiveAbilityModal);
  elements.activeAbilityBackdrop?.addEventListener('click', closeActiveAbilityModal);
  elements.cancelPassiveAbility?.addEventListener('click', closePassiveAbilityModal);
  elements.closePassiveAbility?.addEventListener('click', closePassiveAbilityModal);
  elements.passiveAbilityBackdrop?.addEventListener('click', closePassiveAbilityModal);
  elements.cancelInventory?.addEventListener('click', closeInventoryModal);
  elements.closeInventoryModal?.addEventListener('click', closeInventoryModal);
  elements.inventoryBackdrop?.addEventListener('click', closeInventoryModal);
  elements.addPassiveModifier?.addEventListener('click', () => addPassiveModifierRow());
  elements.passiveModifierList?.addEventListener('click', handlePassiveModifierListClick);
  elements.activeAbilityList?.addEventListener('click', handleAbilityListClick);
  elements.passiveAbilityList?.addEventListener('click', handleAbilityListClick);
  elements.inventoryList?.addEventListener('click', handleInventoryListClick);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!elements.activeAbilityModal?.classList.contains('hidden')) {
      closeActiveAbilityModal();
    } else if (!elements.passiveAbilityModal?.classList.contains('hidden')) {
      closePassiveAbilityModal();
    } else if (!elements.inventoryModal?.classList.contains('hidden')) {
      closeInventoryModal();
    } else if (!elements.editorModal?.classList.contains('hidden')) {
      closeCharacterEditor();
    }
  });
}

function setHeroCardCollapsed(collapsed) {
  if (!elements.heroCard || !elements.heroToggle) return;

  elements.heroCard.classList.toggle('collapsed', collapsed);
  elements.heroToggle.setAttribute('aria-expanded', String(!collapsed));
  elements.heroToggle.setAttribute(
    'aria-label',
    collapsed ? 'Restaurar cabecera del personaje' : 'Minimizar cabecera del personaje'
  );

  if (elements.heroToggleIcon) {
    const iconId = collapsed ? '#icon-chevron-down' : '#icon-chevron-up';
    elements.heroToggleIcon.setAttribute('href', iconId);
    elements.heroToggleIcon.setAttribute('xlink:href', iconId);
  }
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
    renderAbilityLists();
    renderInventoryList();
  } else {
    showScreen('select');
    updateNavState(null);
    updateAbilityControlsAvailability();
    renderInventoryList();
  }

  renderNotesContent();

  wireInteractions();
  updateActiveAbilityPreview();
  updateInventoryPreview();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .catch((error) => console.warn('No se pudo registrar el service worker:', error));
  });
}

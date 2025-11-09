const STORAGE_KEY = 'charsheet.characters';
const SELECTED_KEY = 'charsheet.selectedId';
const DB_NAME = 'charsheet-storage';
const DB_VERSION = 1;
const DB_STORE_NAME = 'keyvalue';
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
const CHARACTER_EXPORT_VERSION = 1;
const CHARACTER_EXPORT_EXTENSION = '.charsheet.json';

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
    currentHealth: 30,
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

const sheetAbilityState = {
  selectedAbilityId: null
};

let characters = [];
let selectedCharacterId = null;
let passiveModifierCache = createEmptyModifierData();

function getSelectedCharacter() {
  if (!selectedCharacterId) return null;
  return characters.find((item) => item.id === selectedCharacterId) ?? null;
}

function getCharacterById(id) {
  if (!id) return null;
  return characters.find((item) => item.id === id) ?? null;
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

function isDataUrl(value) {
  if (typeof value !== 'string') return false;
  return value.trim().startsWith('data:');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result?.toString() ?? '');
    };
    reader.onerror = () => {
      reject(reader.error || new Error('No se pudo leer el archivo.'));
    };
    reader.readAsDataURL(blob);
  });
}

async function ensureDataUrl(source) {
  const trimmed = source?.toString().trim() || '';
  if (!trimmed) {
    return '';
  }
  if (isDataUrl(trimmed)) {
    return trimmed;
  }
  try {
    const response = await fetch(withVersion(trimmed));
    if (!response.ok) {
      throw new Error(`Estado ${response.status}`);
    }
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (error) {
    console.warn('No se pudo convertir la imagen a data URL para exportar:', error);
    return trimmed;
  }
}

async function prepareCharacterForExport(character) {
  if (!character) {
    throw new Error('No hay personaje para exportar.');
  }

  const exportable = JSON.parse(JSON.stringify(character));
  exportable.portrait = await ensureDataUrl(character.portrait || DEFAULT_PORTRAIT);

  const activeAbilities = Array.isArray(character.activeAbilities)
    ? character.activeAbilities.filter(Boolean)
    : [];
  exportable.activeAbilities = await Promise.all(
    activeAbilities.map(async (ability) => {
      const copy = JSON.parse(JSON.stringify(ability));
      copy.image = await ensureDataUrl(ability?.image || '');
      return copy;
    })
  );

  const passiveAbilities = Array.isArray(character.passiveAbilities)
    ? character.passiveAbilities.filter(Boolean)
    : [];
  exportable.passiveAbilities = passiveAbilities.map((ability) => JSON.parse(JSON.stringify(ability)));

  const inventoryItems = Array.isArray(character.inventory) ? character.inventory.filter(Boolean) : [];
  exportable.inventory = await Promise.all(
    inventoryItems.map(async (item) => {
      const copy = JSON.parse(JSON.stringify(item));
      copy.image = await ensureDataUrl(item?.image || '');
      return copy;
    })
  );

  return {
    version: CHARACTER_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    character: exportable
  };
}

function createExportFilename(name) {
  const base = slugify(name || 'personaje');
  return `${base}${CHARACTER_EXPORT_EXTENSION}`;
}

function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function exportCharacter(character) {
  if (!character) {
    window.alert('Seleccioná un personaje antes de exportar.');
    return;
  }
  try {
    const payload = await prepareCharacterForExport(character);
    const json = JSON.stringify(payload, null, 2);
    const filename = createExportFilename(character.name);
    downloadTextFile(filename, json);
  } catch (error) {
    console.error('No se pudo exportar el personaje:', error);
    window.alert('No se pudo exportar el personaje. Intentá nuevamente.');
  }
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

function supportsIndexedDB() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

let dbPromise = null;

function getDatabase() {
  if (!supportsIndexedDB()) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
            db.createObjectStore(DB_STORE_NAME);
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.addEventListener('versionchange', () => {
            db.close();
            dbPromise = null;
          });
          resolve(db);
        };
        request.onerror = () => {
          console.warn('No se pudo abrir la base de datos local:', request.error);
          resolve(null);
        };
        request.onblocked = () => {
          console.warn('El acceso a la base de datos local está bloqueado por otra pestaña.');
        };
      } catch (error) {
        console.warn('No se pudo iniciar la base de datos local:', error);
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function idbGet(key) {
  const db = await getDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(DB_STORE_NAME, 'readonly');
      const store = transaction.objectStore(DB_STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result ?? null);
      };
      request.onerror = () => {
        console.warn('No se pudo leer de la base de datos local:', request.error);
        resolve(null);
      };
    } catch (error) {
      console.warn('No se pudo acceder a la base de datos local:', error);
      resolve(null);
    }
  });
}

async function idbSet(key, value) {
  const db = await getDatabase();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(DB_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(DB_STORE_NAME);
      const request = value === null ? store.delete(key) : store.put(value, key);
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        console.warn('No se pudo escribir en la base de datos local:', request.error);
        resolve();
      };
    } catch (error) {
      console.warn('No se pudo actualizar la base de datos local:', error);
      resolve();
    }
  });
}

function parseStoredCharacters(raw) {
  if (!raw) {
    return null;
  }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    return parsed.map(normalizeCharacter);
  } catch (error) {
    console.warn('No se pudieron interpretar los personajes guardados:', error);
    return null;
  }
}

function normalizeStoredSelectedId(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = value.toString().trim();
  if (text.length === 0) {
    return null;
  }
  return text;
}

async function loadCharactersFromIndexedDB() {
  const stored = await idbGet(STORAGE_KEY);
  return parseStoredCharacters(stored);
}

function persistCharactersToIndexedDB(list) {
  const payload = JSON.stringify(list);
  idbSet(STORAGE_KEY, payload).catch((error) => {
    console.warn('No se pudo guardar los personajes en la base de datos local:', error);
  });
}

async function loadSelectedIdFromIndexedDB() {
  const stored = await idbGet(SELECTED_KEY);
  return normalizeStoredSelectedId(stored);
}

function persistSelectedIdToIndexedDB(id) {
  const value = id ? id.toString() : null;
  idbSet(SELECTED_KEY, value).catch((error) => {
    console.warn('No se pudo guardar el personaje seleccionado en la base de datos local:', error);
  });
}

function requestPersistentStorage() {
  if (navigator.storage?.persist) {
    navigator.storage
      .persist()
      .catch((error) => console.warn('No se pudo solicitar almacenamiento persistente:', error));
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

function normalizeCurrentHealth(value, stats = {}) {
  const totalText = stats?.vida ?? '';
  const max = Number.parseInt(totalText, 10);
  const parsed = Number.parseInt(value, 10);
  let current;
  if (Number.isNaN(parsed)) {
    current = Number.isNaN(max) ? 0 : max;
  } else {
    current = parsed;
  }
  if (!Number.isFinite(current)) {
    current = 0;
  }
  if (current < 0) {
    current = 0;
  }
  return current;
}

function createEmptyModifierData() {
  const totals = {};
  const details = {};
  STAT_KEYS.forEach((key) => {
    totals[key] = 0;
    details[key] = [];
  });
  return { totals, details };
}

function getHealthDisplayMarkup(current, total) {
  const safeCurrent = Number.isFinite(current) ? Math.trunc(current) : 0;
  const safeTotal = Number.isFinite(total) ? Math.trunc(total) : 0;
  return `<span class="stat-value-current">${safeCurrent}</span><span class="stat-value-separator">/</span><span class="stat-value-total">${safeTotal}</span>`;
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
  const storedProgress = ability.cooldownProgress ?? ability.currentCooldown ?? ability.progress;
  const parsedProgress = Number.parseInt(storedProgress, 10);
  const effectValue = Number.parseInt(
    ability.effectDuration !== undefined ? ability.effectDuration : ability.duration,
    10
  );
  const effectDuration = Number.isNaN(effectValue) || effectValue < 0 ? 0 : effectValue;
  const isBasic =
    ability.isBasic === true || ability.isBasic === 'true' || ability.id?.toString().trim() === 'ataque-basico';
  const normalized = {
    id: ability.id?.toString().trim() || slugify(title),
    title,
    description: ability.description?.toString().trim() || '',
    features: normalizeFeatureList(ability.features),
    cooldown: Number.isFinite(cooldown) && !Number.isNaN(cooldown) && cooldown > 0 ? cooldown : 0,
    image: ability.image?.toString().trim() || '',
    cooldownProgress: 0,
    isBasic,
    effectDuration
  };
  if (normalized.cooldown <= 0) {
    normalized.cooldownProgress = 0;
  } else if (Number.isNaN(parsedProgress)) {
    normalized.cooldownProgress = normalized.cooldown;
  } else {
    const clamped = Math.max(0, Math.min(normalized.cooldown, parsedProgress));
    normalized.cooldownProgress = clamped;
  }
  return normalized;
}

function createBasicAttackAbility(characterName) {
  const safeName = characterName?.toString().trim() || 'personaje';
  return {
    id: 'ataque-basico',
    title: 'Ataque básico',
    description: `Ataque básico de ${safeName}.`,
    features: ['Inflige el daño base del personaje.'],
    cooldown: 0,
    cooldownProgress: 0,
    effectDuration: 0,
    image: '',
    isBasic: true
  };
}

function ensureBasicActiveAbility(list, characterName) {
  if (!Array.isArray(list) || list.length === 0) {
    return [createBasicAttackAbility(characterName)];
  }

  const abilities = list.map((ability) => ({ ...ability }));
  let basicIndex = abilities.findIndex((item) => item.isBasic);

  if (basicIndex < 0) {
    abilities[0].isBasic = true;
    basicIndex = 0;
  }

  if (basicIndex !== 0) {
    const [basic] = abilities.splice(basicIndex, 1);
    abilities.unshift({ ...basic, isBasic: true });
  }

  abilities.forEach((ability, index) => {
    if (index > 0 && ability.isBasic) {
      ability.isBasic = false;
    }
    const total = Number.parseInt(ability.cooldown, 10);
    const cooldownTotal = Number.isNaN(total) || total < 0 ? 0 : total;
    ability.cooldown = cooldownTotal;
    const effectValue = Number.parseInt(
      ability.effectDuration !== undefined ? ability.effectDuration : ability.duration,
      10
    );
    ability.effectDuration = Number.isNaN(effectValue) || effectValue < 0 ? 0 : effectValue;
    if (cooldownTotal <= 0) {
      ability.cooldownProgress = 0;
    } else {
      const parsed = Number.parseInt(ability.cooldownProgress, 10);
      const progress = Number.isNaN(parsed) ? cooldownTotal : parsed;
      ability.cooldownProgress = Math.max(0, Math.min(cooldownTotal, progress));
    }
    if (index === 0 && ability.isBasic) {
      if (!ability.title) {
        ability.title = 'Ataque básico';
      }
      if (!ability.description) {
        const safeName = characterName?.toString().trim() || 'el personaje';
        ability.description = `Ataque básico de ${safeName}.`;
      }
    }
  });

  return abilities;
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
  const cooldownValue = Number.parseInt(ability.cooldown, 10);
  const cooldown = Number.isNaN(cooldownValue) || cooldownValue < 0 ? 0 : cooldownValue;
  const effectValue = Number.parseInt(
    ability.effectDuration !== undefined ? ability.effectDuration : ability.duration,
    10
  );
  const effectDuration = Number.isNaN(effectValue) || effectValue < 0 ? 0 : effectValue;
  const normalized = {
    id: ability.id?.toString().trim() || slugify(title),
    title,
    description: ability.description?.toString().trim() || '',
    features: normalizeFeatureList(ability.features),
    modifiers,
    cooldown,
    effectDuration
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

function migrateLegacyActiveAbility(ability) {
  if (!ability || typeof ability !== 'object') return null;
  const migrated = { ...ability };

  if (migrated.title === undefined) {
    migrated.title = ability.titulo ?? ability.nombre ?? '';
  }
  if (migrated.description === undefined) {
    migrated.description = ability.descripcion ?? ability.detalle ?? '';
  }
  if (migrated.features === undefined) {
    const featuresSource =
      ability.caracteristicas ?? ability.rasgos ?? ability.efectos ?? ability.detalles ?? ability.descripcionLarga;
    if (Array.isArray(featuresSource)) {
      migrated.features = featuresSource;
    } else if (featuresSource !== undefined && featuresSource !== null) {
      migrated.features = featuresSource.toString();
    }
  }
  if (migrated.cooldown === undefined) {
    migrated.cooldown = ability.enfriamiento ?? ability.cooldown ?? ability.cd ?? ability.cooldownTotal;
  }
  if (migrated.cooldownProgress === undefined) {
    migrated.cooldownProgress =
      ability.progresoEnfriamiento ??
      ability.progresoCooldown ??
      ability.progreso ??
      ability.cooldownActual ??
      ability.actualCooldown;
  }
  if (migrated.effectDuration === undefined) {
    migrated.effectDuration = ability.duracion ?? ability.turnos ?? ability.duracionEfecto ?? ability.efectoDuracion;
  }
  if (migrated.image === undefined) {
    migrated.image = ability.imagen ?? ability.icono ?? '';
  }
  if (migrated.isBasic === undefined) {
    migrated.isBasic = ability.esBasica ?? ability.basica ?? false;
  }
  if (migrated.id === undefined) {
    migrated.id = ability.identificador ?? ability.slug ?? ability.codigo ?? ability.uuid ?? null;
  }

  return migrated;
}

function migrateLegacyPassiveAbility(ability) {
  if (!ability || typeof ability !== 'object') return null;
  const migrated = { ...ability };

  if (migrated.title === undefined) {
    migrated.title = ability.titulo ?? ability.nombre ?? '';
  }
  if (migrated.description === undefined) {
    migrated.description = ability.descripcion ?? ability.detalle ?? '';
  }
  if (migrated.features === undefined) {
    const featuresSource = ability.caracteristicas ?? ability.rasgos ?? ability.efectos ?? ability.detalles;
    if (Array.isArray(featuresSource)) {
      migrated.features = featuresSource;
    } else if (featuresSource !== undefined && featuresSource !== null) {
      migrated.features = featuresSource.toString();
    }
  }
  if (!Array.isArray(migrated.modifiers) && Array.isArray(ability.modificadores)) {
    migrated.modifiers = ability.modificadores
      .map((modifier) => {
        if (!modifier || typeof modifier !== 'object') return null;
        const stat = modifier.stat ?? modifier.estadistica ?? modifier.atributo ?? modifier.clave;
        const value = modifier.value ?? modifier.valor ?? modifier.cantidad ?? modifier.modificador;
        if (stat === undefined || value === undefined) {
          return null;
        }
        return { stat, value };
      })
      .filter(Boolean);
  }
  if (migrated.cooldown === undefined) {
    migrated.cooldown = ability.enfriamiento ?? ability.cooldown ?? ability.cd ?? ability.cooldownTotal;
  }
  if (migrated.effectDuration === undefined) {
    migrated.effectDuration = ability.duracion ?? ability.turnos ?? ability.duracionEfecto;
  }
  if (migrated.id === undefined) {
    migrated.id = ability.identificador ?? ability.slug ?? ability.codigo ?? ability.uuid ?? null;
  }

  return migrated;
}

function migrateLegacyInventoryItem(item) {
  if (!item || typeof item !== 'object') return null;
  const migrated = { ...item };

  if (migrated.title === undefined) {
    migrated.title = item.titulo ?? item.nombre ?? '';
  }
  if (migrated.description === undefined) {
    migrated.description = item.descripcion ?? item.detalle ?? '';
  }
  if (migrated.image === undefined) {
    migrated.image = item.imagen ?? item.icono ?? '';
  }
  if (migrated.id === undefined) {
    const legacyId = item.identificador ?? item.slug ?? item.codigo ?? item.uuid;
    if (legacyId !== undefined && legacyId !== null && legacyId !== '') {
      migrated.id = legacyId.toString().trim();
    } else if (migrated.title) {
      migrated.id = slugify(migrated.title);
    }
  }

  return migrated;
}

function migrateLegacyCharacter(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const migrated = { ...data };

  if (migrated.name === undefined) {
    migrated.name = data.nombre ?? data.alias ?? '';
  }
  if (migrated.ancestry === undefined) {
    migrated.ancestry = data.ascendencia ?? data.ancestria ?? data.raza ?? '';
  }
  if (migrated.clazz === undefined) {
    migrated.clazz = data.clase ?? data.profesion ?? '';
  }
  if (migrated.level === undefined) {
    migrated.level = data.nivel ?? data.level ?? data.lv;
  }
  if (migrated.group === undefined) {
    migrated.group = data.grupo ?? data['compañia'] ?? data.compania ?? data.faccion;
  }
  if (migrated.campaign === undefined) {
    migrated.campaign = data['campaña'] ?? data.campaña ?? data.campana ?? data.campanaActual;
  }
  if (migrated.portrait === undefined) {
    migrated.portrait = data.retrato ?? data.imagen ?? data.avatar;
  }
  if (migrated.notes === undefined) {
    migrated.notes = data.notas ?? '';
  }
  if (migrated.currentHealth === undefined) {
    migrated.currentHealth = data.vidaActual ?? data.saludActual ?? data.hpActual;
  }
  if (!migrated.stats && typeof data.estadisticas === 'object' && data.estadisticas !== null) {
    migrated.stats = { ...data.estadisticas };
  }
  if (migrated.id === undefined) {
    migrated.id = data.identificador ?? data.slug ?? data.codigo ?? data.uuid;
  }

  if (!Array.isArray(migrated.activeAbilities) && Array.isArray(data.habilidadesActivas)) {
    migrated.activeAbilities = data.habilidadesActivas.map(migrateLegacyActiveAbility).filter(Boolean);
  }

  if (!Array.isArray(migrated.passiveAbilities) && Array.isArray(data.habilidadesPasivas)) {
    migrated.passiveAbilities = data.habilidadesPasivas.map(migrateLegacyPassiveAbility).filter(Boolean);
  }

  if (!Array.isArray(migrated.inventory)) {
    const legacyInventory = Array.isArray(data.inventario)
      ? data.inventario
      : Array.isArray(data.objetos)
        ? data.objetos
        : null;
    if (legacyInventory) {
      migrated.inventory = legacyInventory.map(migrateLegacyInventoryItem).filter(Boolean);
    }
  }

  return migrated;
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
  const migratedCharacter = migrateLegacyCharacter(character);
  const normalizedStats = {};
  STAT_KEYS.forEach((key) => {
    normalizedStats[key] = normalizeStatValue(migratedCharacter?.stats?.[key]);
  });

  let portrait = migratedCharacter?.portrait || DEFAULT_PORTRAIT;
  if (typeof portrait === 'string') {
    const trimmed = portrait.trim();
    portrait = trimmed && trimmed !== 'null' && trimmed !== 'undefined' ? trimmed : DEFAULT_PORTRAIT;
  } else {
    portrait = DEFAULT_PORTRAIT;
  }

  const activeAbilities = ensureBasicActiveAbility(
    dedupeById(
      Array.isArray(migratedCharacter?.activeAbilities)
        ? migratedCharacter.activeAbilities.map(normalizeActiveAbility).filter(Boolean)
        : []
    ),
    migratedCharacter?.name
  );
  const passiveAbilities = dedupeById(
    Array.isArray(migratedCharacter?.passiveAbilities)
      ? migratedCharacter.passiveAbilities.map(normalizePassiveAbility).filter(Boolean)
      : []
  );
  const inventory = dedupeById(
    Array.isArray(migratedCharacter?.inventory)
      ? migratedCharacter.inventory.map(normalizeInventoryItem).filter(Boolean)
      : []
  );
  const notesValue = migratedCharacter?.notes;
  const notes = notesValue === null || notesValue === undefined ? '' : notesValue.toString();
  const currentHealth = normalizeCurrentHealth(migratedCharacter?.currentHealth, normalizedStats);

  const normalized = {
    id: migratedCharacter?.id || slugify(migratedCharacter?.name || 'pj'),
    name: migratedCharacter?.name?.trim() || 'Personaje sin nombre',
    portrait,
    ancestry: migratedCharacter?.ancestry?.trim() || '',
    clazz: migratedCharacter?.clazz?.trim() || '',
    level: Number.parseInt(migratedCharacter?.level ?? 1, 10) || 1,
    group: migratedCharacter?.group?.toString().trim() || '',
    campaign: migratedCharacter?.campaign?.toString().trim() || '',
    stats: normalizedStats,
    activeAbilities,
    passiveAbilities,
    inventory,
    notes,
    currentHealth
  };

  return normalized;
}

async function loadCharacters() {
  const localStored = parseStoredCharacters(safeGetItem(STORAGE_KEY));
  if (localStored) {
    persistCharactersToIndexedDB(localStored);
    return localStored;
  }

  const idbStored = await loadCharactersFromIndexedDB();
  if (idbStored) {
    safeSetItem(STORAGE_KEY, JSON.stringify(idbStored));
    return idbStored;
  }

  // Sembrar personajes por defecto SOLO la primera vez
  const seeded = safeGetItem('charsheet.seeded');
  if (!seeded) {
    const seededList = defaultCharacters.map(normalizeCharacter);
    safeSetItem(STORAGE_KEY, JSON.stringify(seededList));
    safeSetItem('charsheet.seeded', '1');
    return seededList;
  }

  // Si no hay datos guardados y ya sembramos antes, devolver lista vacía
  return [];
}

function saveCharacters(list) {
  const payload = JSON.stringify(list);
  safeSetItem(STORAGE_KEY, payload);
  persistCharactersToIndexedDB(list);
}

async function loadSelectedCharacterId() {
  const localStored = normalizeStoredSelectedId(safeGetItem(SELECTED_KEY));
  if (localStored) {
    persistSelectedIdToIndexedDB(localStored);
    return localStored;
  }

  const idbStored = await loadSelectedIdFromIndexedDB();
  if (idbStored) {
    safeSetItem(SELECTED_KEY, idbStored);
    return idbStored;
  }

  safeSetItem(SELECTED_KEY, '');
  return null;
}

function saveSelectedCharacterId(id) {
  const value = id ?? '';
  safeSetItem(SELECTED_KEY, value);
  persistSelectedIdToIndexedDB(id);
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
  elements.importCharacterBtn = document.getElementById('importCharacterBtn');
  elements.importCharacterInput = document.getElementById('importCharacterInput');
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
  elements.heroAffiliation = document.getElementById('heroAffiliation');
  elements.heroPortrait = document.querySelector('.hero-portrait');
  elements.heroToggle = document.getElementById('heroToggle');
  elements.heroToggleIcon = elements.heroToggle?.querySelector('use') ?? null;
  elements.sheetAbilitySection = document.getElementById('sheetActiveAbilities');
  elements.sheetAbilityList = document.getElementById('sheetActiveAbilityList');
  elements.sheetAbilityModal = document.getElementById('sheetAbilityModal');
  elements.sheetAbilityBackdrop = elements.sheetAbilityModal?.querySelector('.modal-backdrop') ?? null;
  elements.sheetAbilityTitle = document.getElementById('sheetAbilityTitle');
  elements.sheetAbilityImage = document.getElementById('sheetAbilityImage');
  elements.sheetAbilityDescription = document.getElementById('sheetAbilityDescription');
  elements.sheetAbilityFeatureList = document.getElementById('sheetAbilityFeatureList');
  elements.sheetAbilityCooldown = document.getElementById('sheetAbilityCooldown');
  elements.sheetAbilityQuestion = document.getElementById('sheetAbilityQuestion');
  elements.sheetAbilityConfirm = document.getElementById('confirmAbilityExecution');
  elements.sheetAbilityCancel = document.getElementById('cancelAbilityExecution');
  elements.sheetAbilityReset = document.getElementById('resetAbilityCooldown');
  elements.closeSheetAbilityModal = document.getElementById('closeSheetAbilityModal');
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
  elements.activeAbilityDuration = document.getElementById('activeAbilityDuration');
  elements.activeAbilityPreview = document.getElementById('activeAbilityPreview');
  elements.activeAbilityImage = document.getElementById('activeAbilityImage');
  elements.clearActiveAbilityImage = document.getElementById('clearActiveAbilityImage');
  elements.cancelActiveAbility = document.getElementById('cancelActiveAbility');
  elements.closeActiveAbility = document.getElementById('closeActiveAbility');
  elements.passiveAbilityTitle = document.getElementById('passiveAbilityTitle');
  elements.passiveAbilityDescription = document.getElementById('passiveAbilityDescription');
  elements.passiveAbilityFeatures = document.getElementById('passiveAbilityFeatures');
  elements.passiveAbilityCooldown = document.getElementById('passiveAbilityCooldown');
  elements.passiveAbilityDuration = document.getElementById('passiveAbilityDuration');
  elements.addPassiveModifier = document.getElementById('addPassiveModifier');
  elements.passiveModifierList = document.getElementById('passiveModifierList');
  elements.cancelPassiveAbility = document.getElementById('cancelPassiveAbility');
  elements.closePassiveAbility = document.getElementById('closePassiveAbility');
  elements.notesTextarea = document.getElementById('notesTextarea');
  elements.saveNotesButton = document.getElementById('saveNotesButton');
  elements.statDetailModal = document.getElementById('statDetailModal');
  elements.statDetailBackdrop = elements.statDetailModal?.querySelector('.modal-backdrop') ?? null;
  elements.statDetailTitle = document.getElementById('statDetailTitle');
  elements.statDetailIntro = document.getElementById('statDetailIntro');
  elements.statModifierList = document.getElementById('statModifierList');
  elements.healthControlSection = document.getElementById('healthControlSection');
  elements.healthDisplay = document.getElementById('healthDisplay');
  elements.healthCurrentInput = document.getElementById('healthCurrentInput');
  elements.healthMaxValue = document.getElementById('healthMaxValue');
  elements.healthIncrement = document.getElementById('healthIncrement');
  elements.healthDecrement = document.getElementById('healthDecrement');
  elements.saveStatDetail = document.getElementById('saveStatDetail');
  elements.cancelStatDetail = document.getElementById('cancelStatDetail');
  elements.closeStatDetail = document.getElementById('closeStatDetail');
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
        <button class="icon-button export" type="button" title="Exportar ${character.name}">
          ${iconMarkup('download')}
          <span>Exportar</span>
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
    const exportButton = card.querySelector('.icon-button.export');

    editButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      const latest = getCharacterById(character.id) ?? character;
      openCharacterEditor(latest);
    });

    exportButton?.addEventListener('click', async (event) => {
      event.stopPropagation();
      const latest = getCharacterById(character.id);
      if (!latest) {
        window.alert('No se pudo encontrar el personaje para exportar.');
        return;
      }
      await exportCharacter(latest);
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

function computePassiveModifierData(character) {
  const data = createEmptyModifierData();
  if (!character || !Array.isArray(character.passiveAbilities)) {
    return data;
  }
  character.passiveAbilities.forEach((ability) => {
    if (!ability || !Array.isArray(ability.modifiers)) return;
    const title = ability.title?.toString().trim() || 'Habilidad sin título';
    ability.modifiers.forEach((modifier) => {
      if (!modifier || !STAT_KEYS.includes(modifier.stat)) return;
      const value = Number.parseInt(modifier.value, 10);
      if (Number.isNaN(value)) return;
      data.totals[modifier.stat] += value;
      data.details[modifier.stat].push({
        abilityId: ability.id,
        abilityTitle: title,
        value
      });
    });
  });
  return data;
}

function renderStatModifiers(character) {
  if (!elements.stats) return;
  passiveModifierCache = computePassiveModifierData(character);
  const totals = passiveModifierCache.totals;
  elements.stats.forEach((statElement) => {
    const key = statElement.dataset.stat;
    if (!key) return;
    const container = statElement.querySelector('.stat-modifiers');
    const entries = passiveModifierCache.details[key] ?? [];
    const hasModifiers = entries.length > 0;
    const clickable = Boolean(character) && (hasModifiers || key === 'vida');
    statElement.classList.toggle('has-modifiers', hasModifiers);
    statElement.classList.toggle('clickable', clickable);
    statElement.dataset.hasModifiers = hasModifiers ? 'true' : 'false';
    if (clickable) {
      statElement.setAttribute('role', 'button');
      statElement.setAttribute('tabindex', '0');
    } else {
      statElement.removeAttribute('role');
      statElement.removeAttribute('tabindex');
    }
    if (!container) {
      return;
    }
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
  const normalizedCooldown = Number.isNaN(cooldownValue) || cooldownValue < 0 ? 0 : cooldownValue;
  const imageSrc = ability?.image?.toString().trim() || '';
  const rawEffectValue = Number.parseInt(
    ability?.effectDuration !== undefined ? ability.effectDuration : ability?.duration,
    10
  );
  const normalizedEffect = Number.isNaN(rawEffectValue) || rawEffectValue < 0 ? 0 : rawEffectValue;
  const effectDuration = safeType === 'active' ? normalizedEffect : 0;
  const cooldown = safeType === 'active' ? normalizedCooldown : 0;
  const abilityId = ability?.id?.toString().trim() || slugify(titleText);
  const isBasic = ability?.isBasic === true;

  const card = document.createElement('article');
  card.className = `ability-card ability-${safeType}`;
  if (isBasic) {
    card.classList.add('ability-basic');
  }
  card.dataset.id = abilityId;
  card.dataset.type = safeType;
  card.dataset.basic = String(isBasic);

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

  if (isBasic) {
    const basicBadge = document.createElement('span');
    basicBadge.className = 'ability-basic-badge';
    basicBadge.textContent = 'Ataque básico';
    header.appendChild(basicBadge);
  }

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
      const effectTurnsLabel = effectDuration === 1 ? 'turno' : 'turnos';
      const cooldownLabel =
        effectDuration > 0
          ? `Cooldown de ${cooldown} turnos; duración del efecto ${effectDuration} ${effectTurnsLabel}`
          : `Cooldown de ${cooldown} turnos`;
      cooldownContainer.setAttribute('aria-label', cooldownLabel);
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
      const effectTurnsLabel = effectDuration === 1 ? 'turno' : 'turnos';
      if (effectDuration > 0) {
        const label = `Sin cooldown. Duración del efecto ${effectDuration} ${effectTurnsLabel}.`;
        cooldownContainer.setAttribute('aria-label', label);
      }
      cooldownContainer.textContent = 'Sin cooldown';
    }
    if (effectDuration > 0) {
      const effectTurnsLabel = effectDuration === 1 ? 'turno' : 'turnos';
      const label = `Duración del efecto: ${effectDuration} ${effectTurnsLabel}`;
      const indicator = document.createElement('span');
      indicator.className = 'cooldown-effect-indicator';
      indicator.textContent = effectDuration.toString();
      indicator.setAttribute('role', 'img');
      indicator.setAttribute('aria-label', label);
      indicator.title = label;
      cooldownContainer.appendChild(indicator);
    }
    body.appendChild(cooldownContainer);
  } else {
    const passiveState = document.createElement('div');
    passiveState.className = 'ability-passive-state';
    passiveState.textContent = 'Efecto permanente';
    body.appendChild(passiveState);

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
  if (isBasic) {
    deleteButton.disabled = true;
    deleteButton.title = 'El ataque básico no se puede eliminar';
    deleteButton.innerHTML = `${iconMarkup('trash')}<span>No disponible</span>`;
  } else {
    deleteButton.title = `Eliminar ${titleText}`;
    deleteButton.innerHTML = `${iconMarkup('trash')}<span>Borrar</span>`;
  }
  actions.appendChild(deleteButton);

  card.appendChild(actions);

  return card;
}

function clampCooldownProgressValue(total, value) {
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) {
    return total;
  }
  return Math.max(0, Math.min(total, numeric));
}

function getAbilityCooldownState(ability) {
  const totalValue = Number.parseInt(ability?.cooldown, 10);
  const total = Number.isNaN(totalValue) || totalValue < 0 ? 0 : totalValue;
  const progress = clampCooldownProgressValue(total, ability?.cooldownProgress);
  const remaining = total > 0 ? Math.max(0, total - progress) : 0;
  const ready = total === 0 || progress >= total;
  return { total, progress, remaining, ready };
}

function createCooldownTrackElement(total, progress) {
  const track = document.createElement('div');
  track.className = 'cooldown-track';
  if (total <= 0) {
    track.classList.add('cooldown-track-none');
    track.textContent = 'Sin cooldown';
    return track;
  }

  const clamped = clampCooldownProgressValue(total, progress);
  track.style.setProperty('--cooldown-cells', total);
  track.classList.toggle('is-ready', clamped >= total);
  for (let index = 0; index < total; index += 1) {
    const cell = document.createElement('span');
    cell.className = 'cooldown-cell';
    if (index < clamped) {
      cell.classList.add('filled');
    }
    track.appendChild(cell);
  }
  return track;
}

function createSheetAbilityCard(ability) {
  const { total, progress, remaining, ready } = getAbilityCooldownState(ability);
  const effectValue = Number.parseInt(
    ability?.effectDuration !== undefined ? ability.effectDuration : ability?.duration,
    10
  );
  const effectDuration = Number.isNaN(effectValue) || effectValue < 0 ? 0 : effectValue;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sheet-ability-card';
  button.dataset.abilityId = ability.id;
  button.dataset.ready = String(ready);
  if (ability.isBasic) {
    button.classList.add('is-basic');
  }
  if (ready) {
    button.classList.add('is-ready');
    const readyLabel = `Ver detalles de ${ability.title}`;
    button.title = readyLabel;
    button.setAttribute('aria-label', readyLabel);
  } else {
    button.classList.add('is-cooldown');
    const turnsLabel = remaining === 1 ? 'turno' : 'turnos';
    const label = `${ability.title} en cooldown. Faltan ${remaining} ${turnsLabel}.`;
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  const media = document.createElement('div');
  media.className = 'sheet-ability-media';
  if (ability.image) {
    const img = document.createElement('img');
    img.src = withVersion(ability.image);
    img.alt = `Ilustración de ${ability.title}`;
    media.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'sheet-ability-placeholder';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-bolt';
    icon.setAttribute('aria-hidden', 'true');
    placeholder.appendChild(icon);
    media.appendChild(placeholder);
  }
  button.appendChild(media);

  const info = document.createElement('div');
  info.className = 'sheet-ability-info';

  const title = document.createElement('h4');
  title.className = 'sheet-ability-title';
  title.textContent = ability.title;
  info.appendChild(title);

  const effects = document.createElement('ul');
  effects.className = 'sheet-ability-effects';
  const featureLines = Array.isArray(ability.features) ? ability.features.filter(Boolean) : [];
  let displayLines = featureLines.slice(0, 4);
  if (displayLines.length === 0 && ability.description) {
    displayLines = [ability.description];
  }
  if (displayLines.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'sheet-ability-effect-empty';
    empty.textContent = 'Sin detalles disponibles.';
    effects.appendChild(empty);
  } else {
    displayLines.forEach((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      effects.appendChild(item);
    });
  }
  info.appendChild(effects);
  button.appendChild(info);

  const cooldownWrapper = document.createElement('div');
  cooldownWrapper.className = 'sheet-ability-cooldown';
  const track = createCooldownTrackElement(total, progress);
  cooldownWrapper.appendChild(track);
  if (effectDuration > 0) {
    const effectTurnsLabel = effectDuration === 1 ? 'turno' : 'turnos';
    const label = `Duración del efecto: ${effectDuration} ${effectTurnsLabel}`;
    const indicator = document.createElement('span');
    indicator.className = 'cooldown-effect-indicator';
    indicator.textContent = effectDuration.toString();
    indicator.setAttribute('role', 'img');
    indicator.setAttribute('aria-label', label);
    indicator.title = label;
    cooldownWrapper.appendChild(indicator);
  }
  button.appendChild(cooldownWrapper);

  return button;
}

function createPassTurnCard() {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'sheetPassTurnCard';
  button.className = 'sheet-ability-card pass-turn';
  button.dataset.action = 'pass-turn';
  button.title = 'Pasar turno';
  button.setAttribute('aria-label', 'Pasar turno');

  const media = document.createElement('div');
  media.className = 'sheet-ability-media';
  const placeholder = document.createElement('div');
  placeholder.className = 'sheet-ability-placeholder pass-turn';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-forward-step';
  icon.setAttribute('aria-hidden', 'true');
  placeholder.appendChild(icon);
  media.appendChild(placeholder);
  button.appendChild(media);

  const info = document.createElement('div');
  info.className = 'sheet-ability-info';
  const title = document.createElement('h4');
  title.className = 'sheet-ability-title';
  title.textContent = 'Pasar turno';
  info.appendChild(title);
  const description = document.createElement('p');
  description.className = 'sheet-ability-pass-turn-text';
  description.textContent = 'Completa un turno sin ejecutar habilidades.';
  info.appendChild(description);
  button.appendChild(info);

  const noteWrapper = document.createElement('div');
  noteWrapper.className = 'sheet-ability-cooldown pass-turn';
  const note = document.createElement('span');
  note.className = 'sheet-ability-pass-turn-note';
  note.textContent = 'Todas las habilidades recuperan 1 punto de cooldown.';
  noteWrapper.appendChild(note);
  button.appendChild(noteWrapper);

  return button;
}

function renderSheetActiveAbilities(character) {
  if (!elements.sheetAbilityList) return;
  const abilities = Array.isArray(character?.activeAbilities) ? character.activeAbilities : [];

  const fragment = document.createDocumentFragment();
  if (abilities.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'sheet-ability-empty';
    empty.textContent = 'No hay habilidades activas registradas.';
    fragment.appendChild(empty);
  } else {
    abilities.forEach((ability) => {
      if (!ability) return;
      fragment.appendChild(createSheetAbilityCard(ability));
    });
  }

  fragment.appendChild(createPassTurnCard());

  elements.sheetAbilityList.innerHTML = '';
  elements.sheetAbilityList.appendChild(fragment);

  if (elements.sheetAbilitySection) {
    elements.sheetAbilitySection.classList.remove('hidden');
  }
}

function openSheetAbilityModal(ability) {
  if (!elements.sheetAbilityModal) return;
  sheetAbilityState.selectedAbilityId = ability.id;

  const cooldownState = getAbilityCooldownState(ability);
  const canResetCooldown = !cooldownState.ready && cooldownState.total > 0;

  if (elements.sheetAbilityReset) {
    elements.sheetAbilityReset.classList.toggle('hidden', !canResetCooldown);
    elements.sheetAbilityReset.disabled = !canResetCooldown;
    if (canResetCooldown) {
      elements.sheetAbilityReset.dataset.abilityId = ability.id;
    } else {
      delete elements.sheetAbilityReset.dataset.abilityId;
    }
  }

  if (elements.sheetAbilityTitle) {
    elements.sheetAbilityTitle.textContent = ability.title;
  }

  if (elements.sheetAbilityImage) {
    const imageSource = ability.image ? withVersion(ability.image) : withVersion(DEFAULT_ABILITY_IMAGE);
    elements.sheetAbilityImage.src = imageSource;
    elements.sheetAbilityImage.alt = `Ilustración de ${ability.title}`;
    elements.sheetAbilityImage.classList.toggle('placeholder', !ability.image);
  }

  if (elements.sheetAbilityDescription) {
    const description = ability.description?.toString().trim();
    if (description) {
      elements.sheetAbilityDescription.textContent = description;
      elements.sheetAbilityDescription.classList.remove('empty');
    } else {
      elements.sheetAbilityDescription.textContent = 'Sin descripción disponible.';
      elements.sheetAbilityDescription.classList.add('empty');
    }
  }

  if (elements.sheetAbilityFeatureList) {
    elements.sheetAbilityFeatureList.innerHTML = '';
    const featureLines = Array.isArray(ability.features) ? ability.features.filter(Boolean) : [];
    if (featureLines.length > 0) {
      featureLines.forEach((feature) => {
        const item = document.createElement('li');
        item.textContent = feature;
        elements.sheetAbilityFeatureList.appendChild(item);
      });
    } else {
      const empty = document.createElement('li');
      empty.className = 'ability-detail-feature-empty';
      empty.textContent = 'Sin características adicionales.';
      elements.sheetAbilityFeatureList.appendChild(empty);
    }
  }

  if (elements.sheetAbilityCooldown) {
    elements.sheetAbilityCooldown.innerHTML = '';
    elements.sheetAbilityCooldown.appendChild(
      createCooldownTrackElement(cooldownState.total, cooldownState.progress)
    );
  }

  if (elements.sheetAbilityQuestion) {
    if (cooldownState.ready) {
      elements.sheetAbilityQuestion.textContent = '¿Desea ejecutar esta habilidad?';
      elements.sheetAbilityQuestion.classList.remove('cooldown');
    } else {
      const turnsLabel = cooldownState.remaining === 1 ? 'turno' : 'turnos';
      let message = `Esta habilidad está en cooldown. Faltan ${cooldownState.remaining} ${turnsLabel}.`;
      if (canResetCooldown) {
        message += ' Podés resetear el cooldown manualmente si lo necesitás.';
      }
      elements.sheetAbilityQuestion.textContent = message;
      elements.sheetAbilityQuestion.classList.add('cooldown');
    }
  }

  if (elements.sheetAbilityConfirm) {
    elements.sheetAbilityConfirm.disabled = !cooldownState.ready;
    elements.sheetAbilityConfirm.textContent = cooldownState.ready
      ? 'Ejecutar habilidad'
      : 'En cooldown';
  }

  elements.sheetAbilityModal.classList.remove('hidden');
  syncBodyModalState();

  if (cooldownState.ready) {
    elements.sheetAbilityConfirm?.focus({ preventScroll: true });
  } else {
    elements.sheetAbilityCancel?.focus({ preventScroll: true });
  }
}

function closeSheetAbilityModal() {
  if (!elements.sheetAbilityModal) return;
  elements.sheetAbilityModal.classList.add('hidden');
  sheetAbilityState.selectedAbilityId = null;
  if (elements.sheetAbilityFeatureList) {
    elements.sheetAbilityFeatureList.innerHTML = '';
  }
  if (elements.sheetAbilityCooldown) {
    elements.sheetAbilityCooldown.innerHTML = '';
  }
  if (elements.sheetAbilityReset) {
    elements.sheetAbilityReset.classList.add('hidden');
    elements.sheetAbilityReset.disabled = true;
    delete elements.sheetAbilityReset.dataset.abilityId;
  }
  syncBodyModalState();
}

function handleSheetAbilityListClick(event) {
  const button = event.target.closest('.sheet-ability-card');
  if (!button || !elements.sheetAbilityList?.contains(button)) {
    return;
  }

  const action = button.dataset.action;
  if (action === 'pass-turn') {
    const character = getSelectedCharacter();
    if (!character) return;
    const confirmed = window.confirm('¿Seguro que querés pasar el turno?');
    if (!confirmed) return;
    advanceTurn(character.id);
    return;
  }

  const abilityId = button.dataset.abilityId;
  if (!abilityId) return;
  const character = getSelectedCharacter();
  if (!character) return;
  const ability = character.activeAbilities.find((item) => item.id === abilityId);
  if (!ability) return;
  openSheetAbilityModal(ability);
}

function handleAbilityExecutionConfirm() {
  if (!sheetAbilityState.selectedAbilityId) return;
  executeAbility(sheetAbilityState.selectedAbilityId);
}

function handleAbilityCooldownReset() {
  const abilityId = elements.sheetAbilityReset?.dataset.abilityId || sheetAbilityState.selectedAbilityId;
  if (!abilityId) return;
  const character = getSelectedCharacter();
  if (!character) return;
  const ability = character.activeAbilities.find((item) => item.id === abilityId);
  if (!ability) return;
  const cooldownState = getAbilityCooldownState(ability);
  if (cooldownState.ready || cooldownState.total <= 0) {
    return;
  }
  const confirmed = window.confirm('¿Querés resetear el cooldown de esta habilidad?');
  if (!confirmed) return;
  applyCharacterUpdate(character.id, (draft) => {
    const list = draft.activeAbilities || [];
    const index = list.findIndex((item) => item.id === abilityId);
    if (index >= 0) {
      const updated = { ...list[index] };
      updated.cooldown = cooldownState.total;
      updated.cooldownProgress = cooldownState.total;
      list[index] = updated;
    }
    return draft;
  });
  closeSheetAbilityModal();
}

function updateCooldownsAfterTurn(list, usedAbilityId = null) {
  if (!Array.isArray(list)) return [];
  return list.map((ability) => {
    if (!ability) return ability;
    const totalValue = Number.parseInt(ability.cooldown, 10);
    const total = Number.isNaN(totalValue) || totalValue < 0 ? 0 : totalValue;
    const progress = clampCooldownProgressValue(total, ability.cooldownProgress);
    const next = { ...ability, cooldown: total };
    if (total <= 0) {
      next.cooldownProgress = 0;
    } else if (usedAbilityId && ability.id === usedAbilityId) {
      next.cooldownProgress = 0;
    } else {
      next.cooldownProgress = Math.min(total, progress + 1);
    }
    return next;
  });
}

function advanceTurn(characterId, usedAbilityId = null) {
  applyCharacterUpdate(characterId, (draft) => {
    draft.activeAbilities = updateCooldownsAfterTurn(draft.activeAbilities, usedAbilityId);
    return draft;
  });
}

function executeAbility(abilityId) {
  const character = getSelectedCharacter();
  if (!character) return;
  const ability = character.activeAbilities.find((item) => item.id === abilityId);
  if (!ability) return;
  const cooldownState = getAbilityCooldownState(ability);
  if (!cooldownState.ready) {
    window.alert('Esta habilidad todavía está en cooldown.');
    return;
  }
  advanceTurn(character.id, abilityId);
  closeSheetAbilityModal();
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

function populateStatModifierList(entries) {
  if (!elements.statModifierList) return;
  elements.statModifierList.innerHTML = '';
  if (!entries || entries.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'stat-modifier-empty';
    emptyItem.textContent = 'No hay habilidades que modifiquen esta estadística.';
    elements.statModifierList.appendChild(emptyItem);
    return;
  }
  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'stat-modifier-entry';
    if (entry.abilityId) {
      item.dataset.abilityId = entry.abilityId;
    }
    const name = document.createElement('span');
    name.className = 'stat-modifier-name';
    name.textContent = entry.abilityTitle || 'Habilidad sin título';
    const value = document.createElement('span');
    const numericValue = Number.parseInt(entry.value, 10) || 0;
    value.className = `stat-modifier-value ${numericValue >= 0 ? 'positive' : 'negative'}`;
    value.textContent = `${numericValue >= 0 ? '+' : ''}${numericValue}`;
    item.appendChild(name);
    item.appendChild(value);
    elements.statModifierList.appendChild(item);
  });
}

function updateHealthControlState(total, current) {
  if (!elements.healthControlSection) return;
  const safeCurrent = Number.isFinite(current) ? Math.trunc(current) : 0;
  const safeTotal = Number.isFinite(total) ? Math.trunc(total) : NaN;
  if (elements.healthCurrentInput) {
    elements.healthCurrentInput.value = safeCurrent;
    elements.healthCurrentInput.min = '0';
    elements.healthCurrentInput.removeAttribute('max');
  }
  if (elements.healthMaxValue) {
    elements.healthMaxValue.textContent = Number.isNaN(safeTotal) ? '—' : safeTotal.toString();
  }
  if (elements.healthDisplay) {
    if (!Number.isNaN(safeTotal) && safeCurrent !== safeTotal) {
      elements.healthDisplay.innerHTML = getHealthDisplayMarkup(safeCurrent, safeTotal);
    } else if (!Number.isNaN(safeTotal)) {
      elements.healthDisplay.textContent = safeTotal.toString();
    } else {
      elements.healthDisplay.textContent = safeCurrent.toString();
    }
  }
}

function openStatDetailModal(statKey) {
  if (!elements.statDetailModal) return;
  const character = getSelectedCharacter();
  if (!character) return;

  const modifierData = computePassiveModifierData(character);
  passiveModifierCache = modifierData;
  const entries = modifierData.details[statKey] ?? [];
  const isHealth = statKey === 'vida';
  if (!isHealth && entries.length === 0) {
    return;
  }

  const label = STAT_LABELS[statKey] || statKey.toUpperCase();
  if (elements.statDetailTitle) {
    elements.statDetailTitle.textContent = `Detalles de ${label}`;
  }
  if (elements.statDetailIntro) {
    const introText = isHealth
      ? entries.length > 0
        ? 'Estas habilidades modifican la Vida. Ajustá los puntos actuales si es necesario.'
        : 'Ajustá los puntos de vida actuales del personaje.'
      : entries.length > 0
        ? `Habilidades que modifican ${label}`
        : `No hay habilidades que modifiquen ${label}`;
    elements.statDetailIntro.textContent = introText;
  }

  populateStatModifierList(entries);

  if (elements.healthControlSection) {
    elements.healthControlSection.classList.toggle('hidden', !isHealth);
  }
  if (elements.saveStatDetail) {
    elements.saveStatDetail.classList.toggle('hidden', !isHealth);
  }

  if (isHealth) {
    const totalText = character.stats?.vida ?? '';
    const totalNumber = Number.parseInt(totalText, 10);
    const currentHealth = Number.isFinite(character.currentHealth)
      ? character.currentHealth
      : normalizeCurrentHealth(null, character.stats);
    updateHealthControlState(totalNumber, currentHealth);
  }

  elements.statDetailModal.dataset.stat = statKey;
  elements.statDetailModal.classList.remove('hidden');
  syncBodyModalState();

  if (isHealth && elements.healthCurrentInput) {
    elements.healthCurrentInput.focus({ preventScroll: true });
  } else {
    elements.cancelStatDetail?.focus({ preventScroll: true });
  }
}

function closeStatDetailModal() {
  if (!elements.statDetailModal) return;
  elements.statDetailModal.classList.add('hidden');
  elements.statDetailModal.dataset.stat = '';
  if (elements.statModifierList) {
    elements.statModifierList.innerHTML = '';
  }
  syncBodyModalState();
}

function handleStatDetailSave() {
  if (!elements.statDetailModal) return;
  const statKey = elements.statDetailModal.dataset.stat;
  if (statKey !== 'vida') {
    closeStatDetailModal();
    return;
  }
  if (!selectedCharacterId) {
    window.alert('Seleccioná un personaje antes de ajustar la vida.');
    return;
  }
  const rawValue = Number.parseInt(elements.healthCurrentInput?.value ?? '0', 10);
  const nextValue = Number.isNaN(rawValue) ? 0 : Math.max(0, rawValue);
  applyCharacterUpdate(selectedCharacterId, (draft) => {
    draft.currentHealth = normalizeCurrentHealth(nextValue, draft.stats);
    return draft;
  });
  closeStatDetailModal();
}

function adjustHealth(delta) {
  if (!elements.healthCurrentInput || !elements.statDetailModal) return;
  const rawValue = Number.parseInt(elements.healthCurrentInput.value, 10);
  const currentValue = Number.isNaN(rawValue) ? 0 : rawValue;
  const nextValue = Math.max(0, currentValue + delta);
  elements.healthCurrentInput.value = nextValue;
  const character = getSelectedCharacter();
  if (!character) return;
  const totalNumber = Number.parseInt(character.stats?.vida ?? '', 10);
  updateHealthControlState(totalNumber, nextValue);
}

function handleHealthInputChange() {
  if (!elements.healthCurrentInput) return;
  const rawValue = Number.parseInt(elements.healthCurrentInput.value, 10);
  const nextValue = Number.isNaN(rawValue) ? 0 : Math.max(0, rawValue);
  elements.healthCurrentInput.value = nextValue;
  const character = getSelectedCharacter();
  if (!character) return;
  const totalNumber = Number.parseInt(character.stats?.vida ?? '', 10);
  updateHealthControlState(totalNumber, nextValue);
}

function handleStatInteraction(statElement) {
  if (!statElement) return;
  const statKey = statElement.dataset.stat;
  if (!statKey) return;
  const hasModifiers = statElement.dataset.hasModifiers === 'true';
  if (statKey !== 'vida' && !hasModifiers) {
    return;
  }
  openStatDetailModal(statKey);
}

function handleStatClick(event) {
  handleStatInteraction(event.currentTarget);
}

function handleStatKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  event.preventDefault();
  handleStatInteraction(event.currentTarget);
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
    notes: current.notes ?? '',
    currentHealth: normalizeCurrentHealth(current.currentHealth, current.stats)
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
  if (elements.activeAbilityDuration) {
    const rawEffect =
      ability?.effectDuration !== undefined ? ability.effectDuration : ability?.duration;
    const effectValue = Number.parseInt(rawEffect, 10);
    elements.activeAbilityDuration.value = Number.isNaN(effectValue) || effectValue < 0 ? 0 : effectValue;
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
  const effectValue = Number.parseInt(formData.get('effectDuration'), 10);
  const effectDuration = Number.isNaN(effectValue) || effectValue < 0 ? 0 : effectValue;
  const baseId = slugify(title || 'habilidad-activa');
  const characterId = selectedCharacterId;
  if (!characterId) {
    window.alert('Seleccioná un personaje antes de agregar habilidades.');
    return;
  }

  applyCharacterUpdate(characterId, (draft) => {
    const list = draft.activeAbilities;
    const abilityId =
      abilityEditorState.editingId || ensureUniqueAbilityId(draft.activeAbilities, `${baseId}-activa`);
    const index = list.findIndex((item) => item.id === abilityId);
    const previous = index >= 0 ? list[index] : null;
    const ability = {
      id: abilityId,
      title,
      description,
      features,
      cooldown,
      effectDuration,
      image: abilityEditorState.image || '',
      isBasic: previous?.isBasic === true || abilityId === 'ataque-basico',
      cooldownProgress: 0
    };
    if (ability.cooldown <= 0) {
      ability.cooldownProgress = 0;
    } else if (previous) {
      ability.cooldownProgress = clampCooldownProgressValue(ability.cooldown, previous.cooldownProgress);
    } else {
      ability.cooldownProgress = ability.cooldown;
    }
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
  if (elements.passiveAbilityCooldown) {
    const cooldownValue = Number.parseInt(ability?.cooldown, 10);
    elements.passiveAbilityCooldown.value = Number.isNaN(cooldownValue)
      ? '0'
      : cooldownValue.toString();
  }
  if (elements.passiveAbilityDuration) {
    const rawEffect =
      ability?.effectDuration !== undefined ? ability.effectDuration : ability?.duration;
    const effectValue = Number.parseInt(rawEffect, 10);
    elements.passiveAbilityDuration.value = Number.isNaN(effectValue)
      ? '0'
      : effectValue.toString();
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
  const cooldownValue = Number.parseInt(formData.get('cooldown'), 10);
  const cooldown = Number.isNaN(cooldownValue) || cooldownValue < 0 ? 0 : cooldownValue;
  const effectValue = Number.parseInt(formData.get('effectDuration'), 10);
  const effectDuration = Number.isNaN(effectValue) || effectValue < 0 ? 0 : effectValue;
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
      modifiers,
      cooldown,
      effectDuration
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
    if (type === 'active' && ability.isBasic) {
      window.alert('El ataque básico no se puede eliminar.');
      return;
    }
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
        if (key === 'vida') {
          const totalNumber = Number.parseInt(value, 10);
          const hasNumericTotal = !Number.isNaN(totalNumber);
          const currentHealth = Number.isFinite(character.currentHealth)
            ? character.currentHealth
            : normalizeCurrentHealth(null, character.stats);
          if (hasNumericTotal && currentHealth !== totalNumber) {
            valueElement.innerHTML = getHealthDisplayMarkup(currentHealth, totalNumber);
          } else if (hasNumericTotal) {
            valueElement.textContent = totalNumber.toString();
          } else {
            valueElement.textContent = value || '—';
          }
        } else {
          valueElement.textContent = value || '—';
        }
      }
    });
  }
  renderStatModifiers(character);
  renderSheetActiveAbilities(character);
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
    notes: '',
    currentHealth: 0
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
    payload.currentHealth = normalizeCurrentHealth(existing?.currentHealth, payload.stats);
  } else {
    payload.activeAbilities = [];
    payload.passiveAbilities = [];
    payload.inventory = [];
    payload.notes = '';
    payload.currentHealth = normalizeCurrentHealth(null, payload.stats);
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

function resetImportInput() {
  if (elements.importCharacterInput) {
    elements.importCharacterInput.value = '';
  }
}

async function handleImportCharacterFile(event) {
  const input = event.target;
  const file = input?.files?.[0];
  if (!file) {
    resetImportInput();
    return;
  }

  try {
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      throw new Error('El archivo no tiene un formato válido.');
    }

    const payload = parsed && typeof parsed === 'object' && parsed.character ? parsed.character : parsed;
    const version = parsed?.version ?? CHARACTER_EXPORT_VERSION;

    if (!payload || typeof payload !== 'object') {
      throw new Error('El archivo de personaje no es compatible.');
    }

    if (parsed?.version !== undefined && version !== CHARACTER_EXPORT_VERSION) {
      throw new Error('El archivo de personaje no es compatible con esta versión de la aplicación.');
    }

    const normalized = normalizeCharacter(payload);
    const baseId = normalized.id ? normalized.id : slugify(normalized.name);
    normalized.id = ensureUniqueId(baseId);

    characters = [...characters, normalized];
    saveCharacters(characters);
    selectCharacter(normalized.id);
    window.alert(`Se importó "${normalized.name}" correctamente.`);
  } catch (error) {
    console.error('No se pudo importar el personaje:', error);
    window.alert(error.message || 'No se pudo importar el personaje. Verificá el archivo e intentá de nuevo.');
  } finally {
    resetImportInput();
  }
}

function wireInteractions() {
  elements.createCharacterBtn?.addEventListener('click', () => {
    openCharacterEditor();
  });
  elements.importCharacterBtn?.addEventListener('click', () => {
    if (!elements.importCharacterInput) return;
    elements.importCharacterInput.value = '';
    elements.importCharacterInput.click();
  });
  elements.importCharacterInput?.addEventListener('change', handleImportCharacterFile);
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

  if (elements.stats) {
    elements.stats.forEach((statElement) => {
      statElement.addEventListener('click', handleStatClick);
      statElement.addEventListener('keydown', handleStatKeydown);
    });
  }

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
  elements.sheetAbilityList?.addEventListener('click', handleSheetAbilityListClick);
  elements.sheetAbilityBackdrop?.addEventListener('click', closeSheetAbilityModal);
  elements.closeSheetAbilityModal?.addEventListener('click', closeSheetAbilityModal);
  elements.sheetAbilityCancel?.addEventListener('click', closeSheetAbilityModal);
  elements.sheetAbilityConfirm?.addEventListener('click', handleAbilityExecutionConfirm);
  elements.sheetAbilityReset?.addEventListener('click', handleAbilityCooldownReset);
  elements.statDetailBackdrop?.addEventListener('click', closeStatDetailModal);
  elements.closeStatDetail?.addEventListener('click', closeStatDetailModal);
  elements.cancelStatDetail?.addEventListener('click', closeStatDetailModal);
  elements.saveStatDetail?.addEventListener('click', handleStatDetailSave);
  elements.healthIncrement?.addEventListener('click', () => adjustHealth(1));
  elements.healthDecrement?.addEventListener('click', () => adjustHealth(-1));
  elements.healthCurrentInput?.addEventListener('input', handleHealthInputChange);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!elements.sheetAbilityModal?.classList.contains('hidden')) {
      closeSheetAbilityModal();
    } else if (!elements.activeAbilityModal?.classList.contains('hidden')) {
      closeActiveAbilityModal();
    } else if (!elements.passiveAbilityModal?.classList.contains('hidden')) {
      closePassiveAbilityModal();
    } else if (!elements.inventoryModal?.classList.contains('hidden')) {
      closeInventoryModal();
    } else if (!elements.statDetailModal?.classList.contains('hidden')) {
      closeStatDetailModal();
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

async function init() {
  cacheElements();
  characters = await loadCharacters();
  selectedCharacterId = await loadSelectedCharacterId();

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
  requestPersistentStorage();
}

function startApp() {
  init().catch((error) => console.error('No se pudo inicializar la aplicación:', error));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
  startApp();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .catch((error) => console.warn('No se pudo registrar el service worker:', error));
  });
}

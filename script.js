const characters = [
  {
    id: 'elanor-vex',
    name: 'Elanor Vex',
    portrait: 'https://images.unsplash.com/photo-1604079628040-94301bb21b17?auto=format&fit=crop&w=640&q=80',
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
    portrait: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=640&q=80',
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

const elements = {};

function cacheElements() {
  elements.characterList = document.getElementById('characterList');
  elements.createCharacterBtn = document.getElementById('createCharacterBtn');
  elements.editCharacterBtn = document.getElementById('editCharacterBtn');
  elements.deleteCharacterBtn = document.getElementById('deleteCharacterBtn');
  elements.backToSelect = document.getElementById('backToSelect');
  elements.heroName = document.getElementById('heroName');
  elements.heroDetails = document.getElementById('heroDetails');
  elements.heroPortrait = document.querySelector('.hero-portrait');
  elements.statsPanel = document.querySelectorAll('.stat');
  elements.activeAbilities = document.getElementById('activeAbilities');
  elements.screenSelect = document.querySelector('[data-screen="select"]');
  elements.screenSheet = document.querySelector('[data-screen="sheet"]');
}

let selectedCharacterId = characters[0]?.id ?? null;

function renderCharacterList() {
  if (!elements.characterList) return;

  const fragment = document.createDocumentFragment();

  characters.forEach((character) => {
    const card = document.createElement('article');
    card.className = `character-card${character.id === selectedCharacterId ? ' active' : ''}`;
    card.dataset.id = character.id;
    card.innerHTML = `
      <img src="${character.portrait}" alt="Retrato de ${character.name}" loading="lazy" />
      <div class="character-meta">
        <h2>${character.name}</h2>
        <p>${character.ancestry} ${character.clazz} &bull; Nivel ${character.level}</p>
        <div class="character-tags">
          <span class="tag">${character.campaign}</span>
          <span class="tag">${character.tagline}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      selectedCharacterId = character.id;
      renderCharacterList();
      showCharacterSheet(character.id);
    });

    fragment.appendChild(card);
  });

  elements.characterList.innerHTML = '';
  elements.characterList.appendChild(fragment);
}

function showCharacterSheet(characterId) {
  const character = characters.find((c) => c.id === characterId);
  if (!character || !elements.heroName || !elements.heroDetails || !elements.heroPortrait) {
    return;
  }

  elements.heroName.textContent = character.name;
  elements.heroDetails.innerHTML = `${character.ancestry} &bull; ${character.clazz} &bull; Nivel ${character.level}`;
  elements.heroPortrait.src = character.portrait;

  if (!elements.statsPanel || elements.statsPanel.length === 0) return;

  elements.statsPanel.forEach((statElement) => {
    const statKey = statElement.dataset.stat;
    const stat = character.stats[statKey];
    if (!stat) return;

    const baseEl = statElement.querySelector('.base');
    const deltaEl = statElement.querySelector('.delta');

    baseEl.textContent = stat.base;
    if (typeof stat.delta === 'number') {
      deltaEl.textContent = stat.delta >= 0 ? `+${stat.delta}` : `${stat.delta}`;
    } else {
      deltaEl.textContent = stat.delta;
    }

    deltaEl.classList.toggle('positive', (parseInt(stat.delta, 10) || 0) >= 0);
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

    const cooldownCells = Array.from({ length: ability.cooldownMax }, (_, idx) => {
      const cell = document.createElement('span');
      cell.className = 'cooldown-cell';
      if (idx < ability.cooldown) {
        cell.classList.add('on-cooldown');
      } else {
        cell.classList.add('active');
      }
      return cell;
    });

    const cooldownWrapper = document.createElement('div');
    cooldownWrapper.className = 'cooldown-track';
    cooldownCells.forEach((cell) => cooldownWrapper.appendChild(cell));

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

function wireInteractions() {
  if (elements.backToSelect && elements.screenSheet && elements.screenSelect) {
    elements.backToSelect.addEventListener('click', () => {
      elements.screenSheet.classList.add('hidden');
      elements.screenSelect.classList.remove('hidden');
    });
  }

  if (elements.createCharacterBtn) {
    elements.createCharacterBtn.addEventListener('click', () => {
      alert('En una próxima versión podrás crear nuevos personajes desde aquí.');
    });
  }

  if (elements.editCharacterBtn) {
    elements.editCharacterBtn.addEventListener('click', () => {
      alert('Las herramientas de edición estarán disponibles cuando la app se sincronice con el Master.');
    });
  }

  if (elements.deleteCharacterBtn) {
    elements.deleteCharacterBtn.addEventListener('click', () => {
      alert('Pronto podrás gestionar y eliminar personajes desde la app.');
    });
  }
}

function init() {
  cacheElements();

  if (!characters.length) return;
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

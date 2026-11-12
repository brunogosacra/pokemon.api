const API_BASE = "https://pokeapi.co/api/v2";
const PAGE_SIZE = 12;
const FALLBACK_POKEMON_COUNT = 1025;
const FAVORITES_KEY = "pokedex-favorites-v1";
const THEME_KEY = "pokedex-theme-v1";

const typeNames = {
  bug: "Inseto",
  dark: "Sombrio",
  dragon: "Dragão",
  electric: "Elétrico",
  fairy: "Fada",
  fighting: "Lutador",
  fire: "Fogo",
  flying: "Voador",
  ghost: "Fantasma",
  grass: "Planta",
  ground: "Terra",
  ice: "Gelo",
  normal: "Normal",
  poison: "Veneno",
  psychic: "Psíquico",
  rock: "Pedra",
  steel: "Aço",
  water: "Água",
};

const statNames = {
  hp: "HP",
  attack: "Ataque",
  defense: "Defesa",
  "special-attack": "Atq. especial",
  "special-defense": "Def. especial",
  speed: "Velocidade",
};

const battleStats = [
  ["hp", "HP"],
  ["attack", "Ataque"],
  ["defense", "Defesa"],
  ["special-attack", "Atq. especial"],
  ["special-defense", "Def. especial"],
  ["speed", "Velocidade"],
];

const state = {
  page: 1,
  filter: "all",
  total: 0,
  totalAll: 0,
  items: [],
  selected: null,
  favorites: readFavorites(),
  favoriteItems: [],
  compare: [],
  cache: new Map(),
  requestId: 0,
};

const elements = {
  grid: document.querySelector("#pokemon-grid"),
  description: document.querySelector("#catalog-description"),
  count: document.querySelector("#catalog-count"),
  pageIndicator: document.querySelector("#page-indicator"),
  previous: document.querySelector("#previous-button"),
  next: document.querySelector("#next-button"),
  filterRow: document.querySelector("#filter-row"),
  catalogError: document.querySelector("#catalog-error"),
  retry: document.querySelector("#retry-button"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#pokemon-search"),
  searchFeedback: document.querySelector("#search-feedback"),
  random: document.querySelector("#random-button"),
  detail: document.querySelector("#detail-content"),
  favorites: document.querySelector("#favorites-content"),
  favoritesCount: document.querySelector("#favorites-count"),
  compare: document.querySelector("#compare-content"),
  themeToggle: document.querySelector("#theme-toggle"),
};

function readFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return new Set(
      Array.isArray(stored)
        ? stored.filter((id) => Number.isInteger(id) && id > 0)
        : [],
    );
  } catch (error) {
    console.error("Não foi possível ler os favoritos salvos.", error);
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
  } catch (error) {
    console.error("Não foi possível salvar os favoritos.", error);
    elements.searchFeedback.textContent =
      "Não foi possível salvar seus favoritos neste navegador.";
  }
}

function applyTheme(theme, persist = true) {
  const isDark = theme === "dark";
  document.body.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  elements.themeToggle.setAttribute("aria-pressed", String(isDark));
  elements.themeToggle.setAttribute(
    "aria-label",
    isDark ? "Ativar modo claro" : "Ativar modo noturno",
  );
  elements.themeToggle.querySelector(".theme-toggle-icon").textContent = isDark
    ? "☀"
    : "☾";
  elements.themeToggle.querySelector(".theme-toggle-label").textContent = isDark
    ? "Modo claro"
    : "Modo noturno";
  document.querySelector('meta[name="theme-color"]').content = isDark
    ? "#30353b"
    : "#ffffff";

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    } catch (error) {
      console.error("Não foi possível salvar a preferência de tema.", error);
      elements.searchFeedback.textContent =
        "O modo foi alterado, mas não foi possível salvar essa preferência.";
    }
  }
}

function initializeTheme() {
  let savedTheme = "light";
  try {
    savedTheme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch (error) {
    console.error("Não foi possível ler a preferência de tema.", error);
  }
  applyTheme(savedTheme, false);
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("POKEMON_NOT_FOUND");
    }
    throw new Error(`A API respondeu com o status ${response.status}.`);
  }
  return response.json();
}

function pokemonIdFromUrl(url) {
  return Number(url.match(/\/pokemon\/(\d+)\/?$/)?.[1]);
}

async function getPokemon(identifier) {
  const query = String(identifier).trim().toLowerCase();
  const normalized = /^\d+$/.test(query) ? String(Number(query)) : query;
  if (!normalized) {
    throw new Error("POKEMON_NOT_FOUND");
  }

  const cached = [...state.cache.values()].find(
    (pokemon) => pokemon.id === Number(normalized) || pokemon.name === normalized,
  );
  if (cached) {
    return cached;
  }

  const pokemon = await fetchJSON(`${API_BASE}/pokemon/${encodeURIComponent(normalized)}`);
  state.cache.set(pokemon.id, pokemon);
  return pokemon;
}

function spriteFor(pokemon) {
  return (
    pokemon.sprites?.other?.["official-artwork"]?.front_default ||
    pokemon.sprites?.front_default ||
    ""
  );
}

function formattedId(id) {
  return `#${String(id).padStart(3, "0")}`;
}

function formatName(name) {
  return name.replaceAll("-", " ");
}

function setLoading() {
  elements.grid.setAttribute("aria-busy", "true");
  elements.grid.replaceChildren();
  const loading = document.createElement("div");
  loading.className = "catalog-loading";
  loading.innerHTML = '<span><span class="loading-mark" aria-hidden="true"></span>Buscando Pokémon...</span>';
  elements.grid.append(loading);
  elements.catalogError.hidden = true;
}

function showCatalogError(error) {
  console.error("Erro ao carregar o catálogo de Pokémon.", error);
  elements.grid.setAttribute("aria-busy", "false");
  elements.grid.replaceChildren();
  elements.catalogError.hidden = false;
  elements.description.textContent = "Houve um problema ao consultar a PokéAPI.";
}

function createCard(pokemon) {
  const card = document.createElement("article");
  card.className = `pokemon-card${state.selected?.id === pokemon.id ? " is-selected" : ""}`;

  const selectButton = document.createElement("button");
  selectButton.className = "pokemon-card-select";
  selectButton.type = "button";
  selectButton.setAttribute("aria-label", `Ver detalhes de ${formatName(pokemon.name)}`);
  selectButton.style.cssText =
    "display:block;width:100%;padding:0;border:0;background:transparent;color:inherit;text-align:inherit;cursor:pointer";
  selectButton.addEventListener("click", () => selectPokemon(pokemon));

  const imageWrap = document.createElement("span");
  imageWrap.className = "pokemon-image-wrap";
  const image = document.createElement("img");
  image.className = "pokemon-image";
  image.src = spriteFor(pokemon);
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.hidden = true;
  }, { once: true });
  imageWrap.append(image);

  const number = document.createElement("span");
  number.className = "pokemon-number";
  number.textContent = formattedId(pokemon.id);
  const name = document.createElement("span");
  name.className = "pokemon-name";
  name.textContent = formatName(pokemon.name);
  selectButton.append(imageWrap, number, name);

  const favoriteButton = document.createElement("button");
  favoriteButton.className = `card-star${state.favorites.has(pokemon.id) ? " is-favorite" : ""}`;
  favoriteButton.type = "button";
  favoriteButton.textContent = state.favorites.has(pokemon.id) ? "★" : "☆";
  favoriteButton.setAttribute(
    "aria-label",
    `${state.favorites.has(pokemon.id) ? "Remover" : "Adicionar"} ${formatName(pokemon.name)} ${state.favorites.has(pokemon.id) ? "dos" : "aos"} favoritos`,
  );
  favoriteButton.setAttribute("aria-pressed", String(state.favorites.has(pokemon.id)));
  favoriteButton.addEventListener("click", () => toggleFavorite(pokemon));
  card.append(selectButton, favoriteButton);
  return card;
}

function renderCards(pokemonList) {
  elements.grid.replaceChildren();
  elements.grid.setAttribute("aria-busy", "false");

  if (pokemonList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "catalog-empty";
    empty.textContent =
      state.filter === "favorites"
        ? "Você ainda não adicionou favoritos. Use ☆ nos cartões para guardar seus Pokémon."
        : "Nenhum Pokémon encontrado nesta categoria.";
    elements.grid.append(empty);
    return;
  }

  elements.grid.append(...pokemonList.map(createCard));
}

function getPokemonForPage() {
  if (state.filter === "favorites") {
    const sortedIds = [...state.favorites].sort((a, b) => a - b);
    state.total = sortedIds.length;
    const pageIds = sortedIds.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    return Promise.all(pageIds.map((id) => getPokemon(id)));
  }

  if (state.filter !== "all") {
    return fetchJSON(`${API_BASE}/type/${state.filter}`).then((data) => {
      const sorted = data.pokemon
        .map((item) => pokemonIdFromUrl(item.pokemon.url))
        .filter((id) => id > 0 && id <= (state.totalAll || FALLBACK_POKEMON_COUNT))
        .filter((id, index, ids) => ids.indexOf(id) === index)
        .sort((a, b) => a - b);
      state.total = sorted.length;
      const pageIds = sorted.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
      return Promise.all(pageIds.map((id) => getPokemon(id)));
    });
  }

  return fetchJSON(
    `${API_BASE}/pokemon?limit=${PAGE_SIZE}&offset=${(state.page - 1) * PAGE_SIZE}`,
  ).then(async (data) => {
    state.total = data.count;
    state.totalAll = data.count;
    const results = await Promise.all(
      data.results.map(async (item) => {
        const id = pokemonIdFromUrl(item.url);
        const cached = [...state.cache.values()].find((pokemon) => pokemon.id === id);
        return cached || fetchJSON(item.url);
      }),
    );
    results.forEach((pokemon) => state.cache.set(pokemon.id, pokemon));
    return results;
  });
}

async function loadCatalog() {
  const requestId = ++state.requestId;
  setLoading();
  elements.previous.disabled = state.page <= 1;
  elements.next.disabled = true;
  elements.count.firstChild.textContent = "— ";

  try {
    const pokemonList = await getPokemonForPage();
    if (requestId !== state.requestId) {
      return;
    }
    state.items = pokemonList;
    renderCards(pokemonList);
    renderPagination();
    elements.description.textContent =
      state.filter === "favorites"
        ? "Seus Pokémon favoritos, reunidos em um só lugar."
        : state.filter === "all"
          ? `${PAGE_SIZE} Pokémon por página. Selecione um cartão para ver os detalhes.`
          : `Pokémon do tipo ${typeNames[state.filter] || state.filter}, em ordem de número.`;
    elements.count.firstChild.textContent = `${String(state.total).padStart(2, "0")} `;
    if (state.selected) {
      const updated = pokemonList.find((pokemon) => pokemon.id === state.selected.id);
      if (updated) {
        state.selected = updated;
      }
    }
  } catch (error) {
    if (requestId === state.requestId) {
      showCatalogError(error);
    }
  }
}

function renderPagination() {
  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  elements.pageIndicator.textContent = `Página ${state.page} de ${pages}`;
  elements.previous.disabled = state.page <= 1;
  elements.next.disabled = state.page >= pages;
}

function setActiveFilter(filter) {
  state.filter = filter;
  state.page = 1;
  elements.filterRow.querySelectorAll(".filter-chip").forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  loadCatalog();
}

function selectPokemon(pokemon) {
  state.selected = pokemon;
  renderCards(state.items);
  renderDetail();
}

function renderDetail() {
  const pokemon = state.selected;
  if (!pokemon) {
    return;
  }

  elements.detail.replaceChildren();
  const identity = document.createElement("div");
  identity.className = "detail-identity";
  const image = document.createElement("img");
  image.className = "detail-image";
  image.src = spriteFor(pokemon);
  image.alt = `Ilustração de ${formatName(pokemon.name)}`;
  image.addEventListener("error", () => {
    image.hidden = true;
  }, { once: true });

  const title = document.createElement("div");
  const number = document.createElement("span");
  number.className = "detail-number";
  number.textContent = formattedId(pokemon.id);
  const name = document.createElement("h3");
  name.className = "detail-name";
  name.textContent = formatName(pokemon.name);
  const types = document.createElement("div");
  types.className = "type-list";
  pokemon.types
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .forEach((item) => {
      const badge = document.createElement("span");
      badge.className = "type-badge";
      badge.textContent = typeNames[item.type.name] || item.type.name;
      types.append(badge);
    });
  title.append(number, name, types);
  identity.append(image, title);

  const stats = document.createElement("div");
  stats.className = "detail-stats";
  [
    ["Altura", `${(pokemon.height / 10).toFixed(1)} m`],
    ["Peso", `${(pokemon.weight / 10).toFixed(1)} kg`],
    ...pokemon.stats.slice(0, 4).map((stat) => [
      statNames[stat.stat.name] || stat.stat.name,
      stat.base_stat,
    ]),
  ].forEach(([label, value]) => {
    const stat = document.createElement("div");
    stat.className = "detail-stat";
    const statLabel = document.createElement("span");
    statLabel.textContent = label;
    const statValue = document.createElement("strong");
    statValue.textContent = value;
    stat.append(statLabel, statValue);
    stats.append(stat);
  });

  const actions = document.createElement("div");
  actions.className = "detail-actions";
  const favorite = document.createElement("button");
  favorite.className = "button button-outline";
  favorite.type = "button";
  favorite.textContent = state.favorites.has(pokemon.id) ? "★ Favorito" : "☆ Favoritar";
  favorite.setAttribute("aria-pressed", String(state.favorites.has(pokemon.id)));
  favorite.addEventListener("click", () => toggleFavorite(pokemon));
  const compare = document.createElement("button");
  compare.className = "button button-dark";
  compare.type = "button";
  compare.textContent = state.compare.some((item) => item.id === pokemon.id)
    ? "✓ Na comparação"
    : "+ Comparar";
  compare.disabled = state.compare.some((item) => item.id === pokemon.id);
  compare.addEventListener("click", () => addToCompare(pokemon));
  actions.append(favorite, compare);
  elements.detail.append(identity, stats, actions);
}

function toggleFavorite(pokemon) {
  if (state.favorites.has(pokemon.id)) {
    state.favorites.delete(pokemon.id);
  } else {
    state.favorites.add(pokemon.id);
    state.cache.set(pokemon.id, pokemon);
  }
  saveFavorites();
  updateFavoriteCount();
  renderCards(state.items);
  renderDetail();
  loadFavoritePreview();
  if (state.filter === "favorites") {
    const lastPage = Math.max(1, Math.ceil(state.favorites.size / PAGE_SIZE));
    if (state.page > lastPage) {
      state.page = lastPage;
    }
    loadCatalog();
  }
}

function updateFavoriteCount() {
  elements.favoritesCount.textContent = String(state.favorites.size).padStart(2, "0");
}

function renderFavorites() {
  elements.favorites.replaceChildren();
  const pokemonList = state.favoriteItems.filter((pokemon) =>
    state.favorites.has(pokemon.id),
  );
  if (state.favorites.size === 0) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "Seus Pokémon favoritos aparecem aqui.";
    elements.favorites.append(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "favorite-list";
  pokemonList.slice(0, 3).forEach((pokemon) => {
    const item = document.createElement("li");
    item.className = "favorite-item";
    const image = document.createElement("img");
    image.src = spriteFor(pokemon);
    image.alt = "";
    image.loading = "lazy";
    const open = document.createElement("button");
    open.type = "button";
    const name = document.createElement("strong");
    name.textContent = formatName(pokemon.name);
    const number = document.createElement("span");
    number.textContent = formattedId(pokemon.id);
    open.append(name, number);
    open.addEventListener("click", () => selectPokemon(pokemon));
    item.append(image, open);
    list.append(item);
  });
  if (state.favorites.size > pokemonList.length) {
    const more = document.createElement("li");
    more.className = "muted-copy";
    more.textContent = `+ ${state.favorites.size - pokemonList.length} favorito(s)`;
    list.append(more);
  }
  elements.favorites.append(list);
}

async function loadFavoritePreview() {
  const ids = [...state.favorites].sort((a, b) => a - b).slice(0, 3);
  if (ids.length === 0) {
    state.favoriteItems = [];
    renderFavorites();
    return;
  }

  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        return await getPokemon(id);
      } catch (error) {
        console.error(`Não foi possível carregar o Pokémon favorito #${id}.`, error);
        return null;
      }
    }),
  );
  state.favoriteItems = results.filter(Boolean);
  renderFavorites();
  const failedCount = results.length - state.favoriteItems.length;
  if (failedCount > 0 && state.favoriteItems.length > 0) {
    const warning = document.createElement("p");
    warning.className = "muted-copy";
    warning.textContent =
      "Alguns favoritos não puderam ser carregados. Verifique sua conexão.";
    elements.favorites.append(warning);
  }
  if (state.favoriteItems.length === 0) {
    const error = document.createElement("p");
    error.className = "muted-copy";
    error.textContent = "Não foi possível carregar os favoritos. Verifique sua conexão.";
    elements.favorites.replaceChildren(error);
  }
}

function renderCompare() {
  elements.compare.replaceChildren();
  if (state.compare.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "Adicione até dois Pokémon pela ficha para comparar seus atributos.";
    elements.compare.append(empty);
    return;
  }

  const fighters = document.createElement("div");
  fighters.className = "compare-grid";
  state.compare.forEach((pokemon) => {
    const card = document.createElement("article");
    card.className = "compare-card";
    const image = document.createElement("img");
    image.src = spriteFor(pokemon);
    image.alt = `Ilustração de ${formatName(pokemon.name)}`;
    const name = document.createElement("strong");
    name.textContent = formatName(pokemon.name);
    const types = document.createElement("small");
    types.textContent = pokemon.types
      .map((item) => typeNames[item.type.name] || item.type.name)
      .join(" · ");
    const remove = document.createElement("button");
    remove.className = "compare-remove";
    remove.type = "button";
    remove.textContent = "Remover";
    remove.setAttribute("aria-label", `Remover ${formatName(pokemon.name)} da comparação`);
    remove.addEventListener("click", () => {
      state.compare = state.compare.filter((item) => item.id !== pokemon.id);
      renderCompare();
      renderDetail();
    });
    card.append(image, name, types, remove);
    fighters.append(card);
  });

  if (state.compare.length === 1) {
    const waiting = document.createElement("div");
    waiting.className = "compare-card compare-waiting";
    waiting.textContent = "Escolha outro Pokémon para começar o duelo.";
    fighters.append(waiting);
  }
  elements.compare.append(fighters);

  if (state.compare.length !== 2) {
    return;
  }

  const [first, second] = state.compare;
  const scoreFor = (pokemon) =>
    battleStats.reduce(
      (total, [key]) =>
        total +
        (pokemon.stats.find((stat) => stat.stat.name === key)?.base_stat || 0),
      0,
    );
  const firstScore = scoreFor(first);
  const secondScore = scoreFor(second);
  const result = document.createElement("section");
  result.className = "compare-result";
  result.setAttribute("aria-label", "Resultado do duelo de atributos");

  const winner = document.createElement("p");
  winner.className = "compare-winner";
  winner.textContent =
    firstScore === secondScore
      ? "Empate!"
      : `Vencedor: ${formatName(firstScore > secondScore ? first.name : second.name)}!`;
  result.append(winner);

  const score = document.createElement("div");
  score.className = "compare-score";
  [firstScore, secondScore].forEach((value) => {
    const total = document.createElement("strong");
    total.textContent = String(value);
    score.append(total);
  });
  result.append(score);

  const statList = document.createElement("div");
  statList.className = "compare-stat-list";
  battleStats.forEach(([key, label]) => {
    const firstValue =
      first.stats.find((stat) => stat.stat.name === key)?.base_stat || 0;
    const secondValue =
      second.stats.find((stat) => stat.stat.name === key)?.base_stat || 0;
    const row = document.createElement("div");
    row.className = "compare-stat-row";
    const firstStat = document.createElement("strong");
    firstStat.className =
      firstValue > secondValue ? "compare-stat-value is-winning" : "compare-stat-value";
    firstStat.textContent = String(firstValue);
    const statName = document.createElement("span");
    statName.className = "compare-stat-name";
    statName.textContent = label;
    const secondStat = document.createElement("strong");
    secondStat.className =
      secondValue > firstValue ? "compare-stat-value is-winning" : "compare-stat-value";
    secondStat.textContent = String(secondValue);
    row.append(firstStat, statName, secondStat);
    statList.append(row);
  });
  result.append(statList);

  const physical = document.createElement("div");
  physical.className = "compare-physical";
  [
    ["Altura", `${(first.height / 10).toFixed(1)} m`, `${(second.height / 10).toFixed(1)} m`],
    ["Peso", `${(first.weight / 10).toFixed(1)} kg`, `${(second.weight / 10).toFixed(1)} kg`],
  ].forEach(([label, firstValue, secondValue]) => {
    const row = document.createElement("div");
    row.className = "compare-physical-row";
    const firstStat = document.createElement("span");
    firstStat.textContent = firstValue;
    const statName = document.createElement("span");
    statName.textContent = label;
    const secondStat = document.createElement("span");
    secondStat.textContent = secondValue;
    row.append(firstStat, statName, secondStat);
    physical.append(row);
  });
  result.append(physical);

  const note = document.createElement("small");
  note.className = "compare-note";
  note.textContent =
    "Resultado calculado pela soma dos seis atributos base. Altura e peso são informativos.";
  result.append(note);
  elements.compare.append(result);
}

function addToCompare(pokemon) {
  if (state.compare.some((item) => item.id === pokemon.id)) {
    elements.searchFeedback.textContent =
      `${formatName(pokemon.name)} já está neste duelo. Escolha outro Pokémon.`;
    return;
  }
  if (state.compare.length >= 2) {
    elements.searchFeedback.textContent =
      "A comparação já tem dois Pokémon. Remova um para adicionar outro.";
    return;
  }
  state.compare.push(pokemon);
  elements.searchFeedback.textContent = `${formatName(pokemon.name)} foi adicionado à comparação.`;
  renderCompare();
  renderDetail();
}

async function searchPokemon(identifier) {
  const query = identifier.trim();
  if (!query) {
    elements.searchFeedback.textContent = "Digite um nome ou número para pesquisar.";
    elements.searchInput.focus();
    return;
  }

  elements.searchFeedback.textContent = "Pesquisando na PokéAPI...";
  try {
    const pokemon = await getPokemon(query);
    selectPokemon(pokemon);
    elements.searchFeedback.textContent = `${formatName(pokemon.name)} encontrado!`;
    document.querySelector("#detail-panel").scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  } catch (error) {
    if (error.message === "POKEMON_NOT_FOUND") {
      elements.searchFeedback.textContent =
        "Pokémon não encontrado. Confira o nome ou o número e tente novamente.";
    } else {
      console.error("Erro ao pesquisar Pokémon.", error);
      elements.searchFeedback.textContent =
        "Não foi possível realizar a pesquisa. Verifique sua conexão e tente novamente.";
    }
  }
}

async function searchRandomPokemon() {
  const id =
    Math.floor(Math.random() * (state.totalAll || FALLBACK_POKEMON_COUNT)) + 1;
  elements.searchInput.value = String(id);
  await searchPokemon(String(id));
}

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchPokemon(elements.searchInput.value);
});

elements.random.addEventListener("click", searchRandomPokemon);
elements.previous.addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    loadCatalog();
  }
});
elements.next.addEventListener("click", () => {
  if (state.page < Math.ceil(state.total / PAGE_SIZE)) {
    state.page += 1;
    loadCatalog();
  }
});
elements.filterRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (button) {
    setActiveFilter(button.dataset.filter);
  }
});
elements.retry.addEventListener("click", loadCatalog);
elements.themeToggle.addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
});

initializeTheme();
updateFavoriteCount();
renderCompare();
loadFavoritePreview();
loadCatalog();

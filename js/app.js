// Game loader - gets game ID from URL
function getGameId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('game') || 'renegade-platinum';
}

// Global state
let gameId = getGameId();
let gameConfig = null;
let data = null;
let evolutions = null;
let currentAreaIndex = 0;
let trackingState = {};
let isTransitioning = false;
let scrollAccumulator = 0;
const SCROLL_THRESHOLD = 150;
let isDarkMode = localStorage.getItem('darkMode') !== 'false';

// Track active tabs per area to restore after re-render
let activeMethodTabs = {};
let activeWalkingTabs = {};

// Mobile state
let currentMobileTab = 'tracker';

// Initialize dark mode
function initDarkMode() {
    if (isDarkMode) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    updateDarkModeIcon();
}

// Toggle dark mode
function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    localStorage.setItem('darkMode', isDarkMode);
    document.documentElement.classList.toggle('dark', isDarkMode);
    updateDarkModeIcon();
}

// Update dark mode icon
function updateDarkModeIcon() {
    const icon = document.getElementById('dark-mode-icon');
    if (!icon) return;
    if (isDarkMode) {
        icon.innerHTML = '<path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>';
    } else {
        icon.innerHTML = '<path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>';
    }
}

// Get storage key for current game
function getStorageKey() {
    return `pokemonLiveDex_${gameId}_tracking`;
}

function getAreaIndexKey() {
    return `pokemonLiveDex_${gameId}_areaIndex`;
}

function getTabsKey() {
    return `pokemonLiveDex_${gameId}_tabs`;
}

// Load tracking state from localStorage
function loadTrackingState() {
    const saved = localStorage.getItem(getStorageKey());
    if (saved) {
        trackingState = JSON.parse(saved);
    }
    
    // Load last viewed area
    const savedArea = localStorage.getItem(getAreaIndexKey());
    if (savedArea) {
        currentAreaIndex = parseInt(savedArea, 10) || 0;
    }
    
    // Load saved tab states
    const savedTabs = localStorage.getItem(getTabsKey());
    if (savedTabs) {
        const tabData = JSON.parse(savedTabs);
        activeMethodTabs = tabData.method || {};
        activeWalkingTabs = tabData.walking || {};
    }
}

// Save tracking state to localStorage
function saveTrackingState() {
    localStorage.setItem(getStorageKey(), JSON.stringify(trackingState));
    renderPCBox();
    renderMobilePCBox();
}

// Save current area index
function saveAreaIndex() {
    localStorage.setItem(getAreaIndexKey(), currentAreaIndex.toString());
}

// Save tab states
function saveTabState() {
    localStorage.setItem(getTabsKey(), JSON.stringify({
        method: activeMethodTabs,
        walking: activeWalkingTabs
    }));
}

// Export tracking data to JSON file
function exportData() {
    const exportObj = {
        gameId: gameId,
        exportedAt: new Date().toISOString(),
        trackingState: trackingState,
        currentAreaIndex: currentAreaIndex,
        tabs: {
            method: activeMethodTabs,
            walking: activeWalkingTabs
        }
    };
    
    const dataStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `pokemon-livedex-${gameId}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Import tracking data from JSON file
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importObj = JSON.parse(e.target.result);
            
            // Validate it's for the same game
            if (importObj.gameId && importObj.gameId !== gameId) {
                if (!confirm(`This save is for "${importObj.gameId}" but you're playing "${gameId}". Import anyway?`)) {
                    return;
                }
            }
            
            // Import tracking state
            if (importObj.trackingState) {
                trackingState = importObj.trackingState;
                saveTrackingState();
            }
            
            // Import area index
            if (typeof importObj.currentAreaIndex === 'number') {
                currentAreaIndex = importObj.currentAreaIndex;
                saveAreaIndex();
            }
            
            // Import tab states
            if (importObj.tabs) {
                if (importObj.tabs.method) activeMethodTabs = importObj.tabs.method;
                if (importObj.tabs.walking) activeWalkingTabs = importObj.tabs.walking;
                saveTabState();
            }
            
            // Refresh the view
            renderCarousel();
            renderPCBox();
            renderMobilePCBox();
            
            alert('Import successful!');
        } catch (err) {
            alert('Failed to import: Invalid file format');
            console.error('Import error:', err);
        }
    };
    reader.readAsText(file);
    
    // Reset the input so the same file can be imported again
    event.target.value = '';
}

// Get Pokemon tracking state
function getPokemonState(pokedexNum) {
    return trackingState[pokedexNum] || { count: 0 };
}

// Set Pokemon tracking state
function setPokemonState(pokedexNum, state) {
    trackingState[pokedexNum] = { ...getPokemonState(pokedexNum), ...state };
    saveTrackingState();
}

// Increment count (catch one more)
function incrementCount(pokedexNum, e) {
    if (e) e.stopPropagation();
    const state = getPokemonState(pokedexNum);
    setPokemonState(pokedexNum, { count: (state.count || 0) + 1 });
    renderEvoModal(currentEvoModalPokemon);
}

// Decrement count (release one)
function decrementCount(pokedexNum, e) {
    if (e) e.stopPropagation();
    const state = getPokemonState(pokedexNum);
    const newCount = Math.max(0, (state.count || 0) - 1);
    setPokemonState(pokedexNum, { count: newCount });
    renderEvoModal(currentEvoModalPokemon);
}

// Check if we can evolve: need to keep 1 of each in the line
function canEvolvePokemon(fromDex, line, evoConnections) {
    const getAncestorSurplus = (dex) => {
        let surplus = 0;
        const ancestorConnections = evoConnections.filter(e => e.toDex === dex);
        for (const conn of ancestorConnections) {
            const ancestorState = getPokemonState(conn.fromDex);
            const ancestorCount = ancestorState.count || 0;
            surplus += Math.max(0, ancestorCount - 1) + getAncestorSurplus(conn.fromDex);
        }
        return surplus;
    };
    
    const fromState = getPokemonState(fromDex);
    const fromCount = fromState.count || 0;
    const ancestorSurplus = getAncestorSurplus(fromDex);
    
    return (fromCount + ancestorSurplus) >= 2;
}

// Evolve: subtract 1 from source, add 1 to target
function evolvePokemon(fromDex, toDex, e) {
    if (e) e.stopPropagation();
    const fromState = getPokemonState(fromDex);
    const toState = getPokemonState(toDex);
    
    setPokemonState(fromDex, { count: Math.max(0, (fromState.count || 0) - 1) });
    setPokemonState(toDex, { count: (toState.count || 0) + 1 });
    renderEvoModal(currentEvoModalPokemon);
}

let currentEvoModalPokemon = null;

// Open evolution modal
function openEvoModal(pokemonName, pokedexNum) {
    currentEvoModalPokemon = { name: pokemonName, dex: pokedexNum };
    renderEvoModal(currentEvoModalPokemon);
    document.getElementById('evo-modal').classList.remove('hidden');
}

// Close evolution modal
function closeEvoModal() {
    document.getElementById('evo-modal').classList.add('hidden');
    renderCarousel();
    restoreTabState();
    renderMobilePCBox();
}

// Restore tab state after re-render
function restoreTabState() {
    const uniqueId = `area-${currentAreaIndex}`;
    
    const savedMethod = activeMethodTabs[currentAreaIndex];
    if (savedMethod) {
        const methodBtn = document.querySelector(`.method-tab-${uniqueId}[onclick="showMethodTab('${savedMethod}', '${uniqueId}')"]`);
        if (methodBtn) {
            showMethodTab(savedMethod, uniqueId, false);
        }
    }
    
    const savedWalking = activeWalkingTabs[currentAreaIndex];
    if (savedWalking) {
        const container = document.querySelector(`.walking-swipe-container-${uniqueId}`);
        if (container) {
            const tabs = JSON.parse(container.dataset.tabs || '[]');
            const idx = tabs.indexOf(savedWalking);
            const actualBtn = document.querySelector(`.walking-tab-${uniqueId}[data-tab-index="${idx}"]`);
            if (actualBtn) {
                showWalkingTabById(actualBtn, savedWalking, uniqueId, false);
            }
        }
    }
}

// Find evolution line for a Pokemon
function getEvolutionLine(pokemonName) {
    if (!evolutions) return [{ name: pokemonName, dex: null }];
    
    let baseName = pokemonName;
    let found = true;
    while (found) {
        found = false;
        for (const p of evolutions.pokemon) {
            for (const evo of p.evolves_to || []) {
                if (evo.pokemon === baseName) {
                    baseName = p.pokemon;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
    }

    const line = [];
    const collectLine = (name) => {
        const pokemon = evolutions.pokemon.find(p => p.pokemon === name);
        if (pokemon) {
            line.push({ name: pokemon.pokemon, dex: pokemon.pokedex_number });
            for (const evo of pokemon.evolves_to || []) {
                collectLine(evo.pokemon);
            }
        }
    };
    collectLine(baseName);
    return line;
}

// Get evolution info for tooltip
function getEvoInfo(pokemonName, targetEvo) {
    if (!evolutions) return null;
    const pokemon = evolutions.pokemon.find(p => p.pokemon === pokemonName);
    if (!pokemon) return null;
    
    for (const evo of pokemon.evolves_to || []) {
        if (evo.pokemon === targetEvo) {
            return evo;
        }
    }
    return null;
}

// Render evolution modal
function renderEvoModal(pokemon) {
    const title = document.getElementById('evo-modal-title');
    const content = document.getElementById('evo-modal-content');
    
    title.textContent = `${pokemon.name} Evolution Line`;
    
    const line = getEvolutionLine(pokemon.name);
    
    const evoConnections = [];
    for (let i = 0; i < line.length; i++) {
        const pkmn = evolutions.pokemon.find(p => p.pokemon === line[i].name);
        if (pkmn && pkmn.evolves_to) {
            for (const evo of pkmn.evolves_to) {
                const targetIdx = line.findIndex(l => l.name === evo.pokemon);
                if (targetIdx !== -1) {
                    evoConnections.push({
                        fromIdx: i,
                        toIdx: targetIdx,
                        fromDex: line[i].dex,
                        toDex: line[targetIdx].dex,
                        toName: evo.pokemon,
                        method: evo.method,
                        level: evo.level,
                        item: evo.item
                    });
                }
            }
        }
    }
    
    content.innerHTML = line.map((p, idx) => {
        const state = getPokemonState(p.dex);
        const count = state.count || 0;
        const hasAny = count > 0;
        const ringClass = hasAny ? 'ring-4 ring-pokemon-blue' : '';
        
        const evosFrom = evoConnections.filter(e => e.fromIdx === idx);
        const canEvolve = count > 0 && canEvolvePokemon(p.dex, line, evoConnections);
        
        let evoInfo = '';
        const evoTo = evoConnections.find(e => e.toIdx === idx);
        if (evoTo) {
            if (evoTo.method === 'level' && evoTo.level) {
                evoInfo = `Lv. ${evoTo.level}`;
            } else if (evoTo.method === 'item' && evoTo.item) {
                evoInfo = evoTo.item;
            } else if (evoTo.method === 'happiness') {
                evoInfo = 'Happiness';
            } else {
                evoInfo = evoTo.method || '';
            }
        }
        
        let evolveButtons = '';
        if (evosFrom.length > 0) {
            evolveButtons = evosFrom.map(evo => {
                const disabled = !canEvolve;
                const btnClass = disabled 
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-400 cursor-not-allowed' 
                    : 'bg-green-500 hover:bg-green-600 text-white cursor-pointer';
                return `
                    <button 
                        onclick="${disabled ? '' : `evolvePokemon(${evo.fromDex}, ${evo.toDex}, event)`}"
                        class="w-full py-1.5 px-2 rounded text-xs font-medium transition-colors ${btnClass}"
                        ${disabled ? 'disabled' : ''}
                        title="${disabled ? 'Need 2+ to evolve (keep 1 for dex)' : `Evolve to ${evo.toName}`}"
                    >
                        Evolve → ${evo.toName}
                    </button>
                `;
            }).join('');
        }
        
        return `
            <div class="flex flex-col items-center">
                <div class="h-6 flex items-end justify-center mb-1">
                    ${evoInfo ? `<span class="text-xs text-gray-500 dark:text-gray-400">${evoInfo}</span>` : ''}
                </div>
                <div class="relative rounded-xl p-4 ${ringClass} bg-gray-50 dark:bg-gray-700 transition-all w-[140px] flex flex-col">
                    <img 
                        src="sprites/${p.dex}.png" 
                        alt="${p.name}"
                        class="w-20 h-20 pixelated mx-auto"
                        onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.dex}.png'"
                    >
                    <div class="text-center text-sm font-semibold dark:text-white mt-1 truncate">${p.name}</div>
                    
                    <div class="flex items-center justify-center gap-2 mt-2">
                        <button 
                            onclick="decrementCount(${p.dex}, event)"
                            class="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 flex items-center justify-center text-gray-700 dark:text-gray-200 font-bold text-sm transition-colors"
                        >-</button>
                        <span class="w-8 text-center font-bold text-xl ${hasAny ? 'text-pokemon-blue' : 'text-gray-400'}">${count}</span>
                        <button 
                            onclick="incrementCount(${p.dex}, event)"
                            class="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 flex items-center justify-center text-gray-700 dark:text-gray-200 font-bold text-sm transition-colors"
                        >+</button>
                    </div>
                    <div class="text-xs text-center text-gray-500 dark:text-gray-400 mb-2">in box</div>
                    
                    <div class="min-h-[32px] flex flex-col justify-end">
                        ${evolveButtons ? `<div class="space-y-1">${evolveButtons}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('<div class="flex items-center text-2xl text-gray-300 dark:text-gray-600 self-center">→</div>');
}

// Render area list in sidebar
let areaFilterQuery = '';

// Build ordered list of Pokemon by first encounter
function buildEncounterOrder() {
    const order = [];
    const seen = new Set();
    
    for (const area of data.areas) {
        for (const time of ['morning', 'day', 'night']) {
            for (const enc of area.encounters.walking?.[time] || []) {
                if (!seen.has(enc.pokedex_number)) {
                    seen.add(enc.pokedex_number);
                    order.push({
                        name: enc.pokemon,
                        dex: enc.pokedex_number,
                        area: area.area_name
                    });
                }
            }
        }
        for (const method of ['surf', 'old_rod', 'good_rod', 'super_rod', 'honey_tree', 'poke_radar']) {
            for (const enc of area.encounters[method] || []) {
                if (!seen.has(enc.pokedex_number)) {
                    seen.add(enc.pokedex_number);
                    order.push({
                        name: enc.pokemon,
                        dex: enc.pokedex_number,
                        area: area.area_name
                    });
                }
            }
        }
    }
    return order;
}

let encounterOrder = [];

// Render PC Box with caught Pokemon
function renderPCBox() {
    const container = document.getElementById('pc-sprites');
    const statsEl = document.getElementById('pc-stats');
    
    if (!container || !statsEl) return;
    
    if (!encounterOrder.length) {
        encounterOrder = buildEncounterOrder();
    }
    
    const baseToLine = new Map();
    const processedBases = new Set();
    
    for (const poke of encounterOrder) {
        const line = getEvolutionLine(poke.name);
        const baseDex = line[0]?.dex;
        
        if (baseDex && !processedBases.has(baseDex)) {
            processedBases.add(baseDex);
            baseToLine.set(baseDex, line);
        }
    }
    
    let totalCount = 0;
    let html = '';
    
    for (const poke of encounterOrder) {
        const line = getEvolutionLine(poke.name);
        const baseDex = line[0]?.dex;
        
        if (!baseToLine.has(baseDex)) continue;
        const storedLine = baseToLine.get(baseDex);
        baseToLine.delete(baseDex);
        
        for (const member of storedLine) {
            const state = getPokemonState(member.dex);
            const count = state.count || 0;
            
            if (count > 0) {
                totalCount += count;
                for (let i = 0; i < count; i++) {
                    html += `
                        <div class="relative cursor-pointer hover:z-20" onclick="openEvoModal('${member.name}', ${member.dex})" title="${member.name}">
                            <img src="sprites/${member.dex}.png" 
                                 alt="${member.name}" 
                                 class="w-16 h-16 pixelated transition-transform duration-200 hover:scale-[2] hover:drop-shadow-lg"
                                 onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${member.dex}.png'">
                        </div>
                    `;
                }
            }
        }
    }
    
    container.innerHTML = html || '<div class="col-span-5 text-center text-gray-500 dark:text-gray-400 py-8">No Pokemon caught yet</div>';
    statsEl.textContent = `${totalCount} Pokemon caught`;
}

function renderAreaList() {
    const container = document.getElementById('area-list');
    if (!container) return;
    
    const filterLower = areaFilterQuery.toLowerCase();
    
    container.innerHTML = data.areas.map((area, idx) => {
        const matchesFilter = !filterLower || area.area_name.toLowerCase().includes(filterLower);
        if (!matchesFilter) return '';
        
        return `
            <button 
                onclick="selectArea(${idx})"
                id="area-btn-${idx}"
                class="w-full text-left px-3 py-2 text-sm rounded-lg mb-1 transition-colors ${
                    idx === currentAreaIndex 
                        ? 'bg-pokemon-blue text-white' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200'
                }"
            >
                ${area.area_name}
            </button>
        `;
    }).join('');
    
    if (!filterLower) {
        const activeBtn = document.getElementById(`area-btn-${currentAreaIndex}`);
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function filterAreas(query) {
    areaFilterQuery = query;
    renderAreaList();
}

// Select an area with animation
function selectArea(idx, direction = null) {
    if (isTransitioning || idx === currentAreaIndex) return;
    if (idx < 0 || idx >= data.areas.length) return;
    
    isTransitioning = true;
    
    if (direction === null) {
        direction = idx > currentAreaIndex ? 'down' : 'up';
    }
    
    const prevSlide = document.getElementById('area-slide-prev');
    const currentSlide = document.getElementById('area-slide-current');
    const nextSlide = document.getElementById('area-slide-next');
    
    [prevSlide, currentSlide, nextSlide].forEach(s => {
        s.classList.remove('no-transition');
        s.classList.add('with-transition');
    });
    
    if (direction === 'down') {
        nextSlide.classList.remove('with-transition');
        nextSlide.classList.add('no-transition');
        nextSlide.innerHTML = renderAreaCard(data.areas[idx], idx);
        nextSlide.className = 'area-slide next no-transition';
        
        nextSlide.offsetHeight;
        
        nextSlide.classList.remove('no-transition');
        nextSlide.classList.add('with-transition');
        
        currentSlide.className = 'area-slide prev with-transition';
        nextSlide.className = 'area-slide current with-transition';
    } else {
        prevSlide.classList.remove('with-transition');
        prevSlide.classList.add('no-transition');
        prevSlide.innerHTML = renderAreaCard(data.areas[idx], idx);
        prevSlide.className = 'area-slide prev no-transition';
        
        prevSlide.offsetHeight;
        
        prevSlide.classList.remove('no-transition');
        prevSlide.classList.add('with-transition');
        
        currentSlide.className = 'area-slide next with-transition';
        prevSlide.className = 'area-slide current with-transition';
    }
    
    setTimeout(() => {
        currentAreaIndex = idx;
        saveAreaIndex();
        renderCarouselNoTransition();
        renderAreaList();
        isTransitioning = false;
        scrollAccumulator = 0;
    }, 420);
    
    document.getElementById('search-results').classList.add('hidden');
    document.getElementById('area-content').classList.remove('hidden');
    
    // On mobile, switch to tracker tab
    if (window.innerWidth < 769) {
        showMobileTab('tracker');
    }
}

// Get optimal time class
function getTimeClass(optimalTime) {
    switch (optimalTime) {
        case 'morning': return 'area-morning';
        case 'day': return 'area-day';
        case 'night': return 'area-night';
        default: return 'area-neutral';
    }
}

// Render Pokemon grid with catch/skip sections
function renderPokemonGrid(pokemonList, gridClass) {
    // Catch here: has catch_count > 0 AND no better opportunity
    const catchHere = pokemonList.filter(p => p.catch_count > 0 && !p.better_opportunity);
    // Skip: either already sourced (catch_count === 0) OR has better opportunity elsewhere
    const skipHere = pokemonList.filter(p => p.catch_count === 0 || p.better_opportunity);
    
    let html = '';
    
    if (catchHere.length > 0) {
        html += `<div class="${gridClass}">${catchHere.map(p => renderPokemonCard(p)).join('')}</div>`;
    }
    
    if (skipHere.length > 0) {
        html += `
            <div class="skip-divider flex items-center gap-3 my-4 px-2">
                <div class="flex-1 border-t border-dashed border-gray-400 dark:border-gray-600"></div>
                <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">Skip</span>
                <div class="flex-1 border-t border-dashed border-gray-400 dark:border-gray-600"></div>
            </div>
            <div class="${gridClass} opacity-60">${skipHere.map(p => renderPokemonCard(p)).join('')}</div>
        `;
    }
    
    return html;
}

// Render a Pokemon card as a compact grid box
function renderPokemonCard(pokemon) {
    const state = getPokemonState(pokemon.pokedex_number);
    const owned = state.count || 0;
    const catchHere = pokemon.catch_count;  // How many to catch at THIS location
    const zeroCatch = catchHere === 0;
    const caughtClass = owned > 0 ? 'caught' : 'not-caught';
    
    // Calculate total needed for living dex (1 for this + 1 for each evolution)
    const line = getEvolutionLine(pokemon.pokemon);
    const totalNeeded = line.length;  // Need 1 of each in the evolution line
    const isComplete = owned >= totalNeeded;
    
    const hasWarning = pokemon.above_evo_warning;
    const hasBetter = pokemon.better_opportunity;
    const warningTitle = hasWarning ? pokemon.above_evo_warning : '';
    const betterTitle = hasBetter ? `Better at ${pokemon.better_opportunity.area} (${pokemon.better_opportunity.encounter_rate}%)` : '';
    
    let tooltipLines = [
        `${pokemon.pokemon} #${pokemon.pokedex_number}`,
        `${pokemon.encounter_rate}% encounter rate`,
        `Level ${pokemon.level_range}`,
        `${owned}/${totalNeeded} for living dex`,
        catchHere > 0 ? `Catch ${catchHere} here` : `Already sourced`
    ];
    if (hasWarning) {
        tooltipLines.push(`Warning: Over evolution level`);
    }
    if (hasBetter) {
        tooltipLines.push(`Better: ${pokemon.better_opportunity.area} (${pokemon.better_opportunity.encounter_rate}%)`);
    }
    
    // Badge styling: green if complete, blue if in progress, gray if not started/sourced
    let badgeClass;
    if (isComplete) {
        badgeClass = 'bg-green-500 text-white';
    } else if (owned > 0) {
        badgeClass = 'bg-pokemon-blue text-white';
    } else if (catchHere > 0) {
        badgeClass = 'bg-gray-200 text-gray-500';
    } else {
        badgeClass = 'bg-gray-200 text-gray-400';
    }

    return `
        <div 
            class="pokemon-card badge-tooltip relative flex flex-col items-center p-4 rounded-xl shadow-sm ${zeroCatch ? 'zero-catch' : ''} hover:shadow-lg hover:scale-105 transition-all cursor-pointer"
            onclick="openEvoModal('${pokemon.pokemon}', ${pokemon.pokedex_number})"
        >
            <span class="tooltip-text" style="display:none; position:fixed; background:#1f2937; color:white; padding:8px 12px; border-radius:6px; font-size:12px; white-space:normal; line-height:1.4; text-align:left; width:max-content; max-width:220px; z-index:99999; pointer-events:none; box-shadow:0 4px 12px rgba(0,0,0,0.3);">${tooltipLines.join('<br>')}</span>
            
            <div class="absolute -top-2 -right-2 min-w-[28px] h-7 px-1 rounded-full flex items-center justify-center text-xs font-bold shadow ${badgeClass}" style="z-index: 10;">
                ${owned}/${totalNeeded}
            </div>
            
            <div class="sprite-hover transition-transform ${caughtClass} mt-2">
                <img 
                    src="sprites/${pokemon.pokedex_number}.png" 
                    alt="${pokemon.pokemon}"
                    class="w-16 h-16 pixelated"
                    onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.pokedex_number}.png'"
                >
            </div>
            
            <div class="text-sm font-semibold text-center truncate w-full mt-2 text-gray-800">${pokemon.pokemon}</div>
            
            <div class="flex items-center justify-center gap-2 mt-2 flex-wrap">
                <span class="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full font-medium">${pokemon.encounter_rate}%</span>
                <span class="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">Lv. ${pokemon.level_range}</span>
                ${hasWarning ? `<span class="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium" title="${warningTitle}">Over Evo</span>` : ''}
                ${hasBetter ? `<span class="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium" title="${betterTitle}">Skip</span>` : ''}
            </div>
        </div>
    `;
}

// Helper to check if two encounter arrays are identical
function encountersEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((enc, i) => enc.pokemon === b[i].pokemon && enc.encounter_rate === b[i].encounter_rate);
}

// Render encounter method section as a grid
function renderEncounterSection(title, encounters, isWalking = false, areaIdx, isNightArea = false) {
    if (!encounters || (Array.isArray(encounters) && encounters.length === 0)) return '';
    if (isWalking && !encounters.morning?.length && !encounters.day?.length && !encounters.night?.length) return '';

    const uniqueId = `area-${areaIdx}`;
    const isMobile = window.innerWidth < 768;
    const gridClass = isMobile 
        ? 'flex flex-wrap gap-2 p-2 justify-center'
        : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4 content-start';
    
    let content = '';
    if (isWalking) {
        const morning = encounters.morning || [];
        const day = encounters.day || [];
        const night = encounters.night || [];
        
        const morningEqualsDay = encountersEqual(morning, day);
        const dayEqualsNight = encountersEqual(day, night);
        const morningEqualsNight = encountersEqual(morning, night);
        const allSame = morningEqualsDay && dayEqualsNight;
        
        let tabs = [];
        let contents = [];
        
        if (allSame) {
            tabs = [];
            contents = [{ id: 'all', pokemon: morning, hidden: false }];
        } else if (morningEqualsDay && !dayEqualsNight) {
            tabs = [
                { id: 'morning-day', label: 'Morning / Day', active: true },
                { id: 'night', label: 'Night', active: false }
            ];
            contents = [
                { id: 'morning-day', pokemon: morning, hidden: false },
                { id: 'night', pokemon: night, hidden: true }
            ];
        } else if (dayEqualsNight && !morningEqualsDay) {
            tabs = [
                { id: 'morning', label: 'Morning', active: true },
                { id: 'day-night', label: 'Day / Night', active: false }
            ];
            contents = [
                { id: 'morning', pokemon: morning, hidden: false },
                { id: 'day-night', pokemon: day, hidden: true }
            ];
        } else if (morningEqualsNight && !morningEqualsDay) {
            tabs = [
                { id: 'morning-night', label: 'Morning / Night', active: true },
                { id: 'day', label: 'Day', active: false }
            ];
            contents = [
                { id: 'morning-night', pokemon: morning, hidden: false },
                { id: 'day', pokemon: day, hidden: true }
            ];
        } else {
            tabs = [
                { id: 'morning', label: 'Morning', active: true },
                { id: 'day', label: 'Day', active: false },
                { id: 'night', label: 'Night', active: false }
            ];
            contents = [
                { id: 'morning', pokemon: morning, hidden: false },
                { id: 'day', pokemon: day, hidden: true },
                { id: 'night', pokemon: night, hidden: true }
            ];
        }
        
        const tabIds = tabs.map(t => t.id);
        const tabsHtml = tabs.length > 0 ? `
            <div class="flex border-b mb-3 border-white/20">
                ${tabs.map((t, i) => `
                    <button onclick="showWalkingTabById(this, '${t.id}', '${uniqueId}')" data-tab-index="${i}" class="walking-tab-${uniqueId} px-4 py-2 text-sm font-medium ${t.active ? 'border-b-2 border-pokemon-yellow text-white' : 'text-white/60'}">${t.label}</button>
                `).join('')}
            </div>
        ` : '';
        
        const contentsHtml = `
            <div class="walking-swipe-container-${uniqueId} relative overflow-hidden" data-tabs='${JSON.stringify(tabIds)}' data-current="0">
                <div class="walking-swipe-track-${uniqueId} flex transition-transform duration-300 ease-out">
                    ${contents.map((c, i) => `
                        <div id="walking-${c.id}-${uniqueId}" data-tab-index="${i}" class="walking-content-${uniqueId} flex-shrink-0 w-full">
                            ${renderPokemonGrid(c.pokemon, gridClass)}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        content = `<div>${tabsHtml}${contentsHtml}</div>`;
    } else {
        content = renderPokemonGrid(encounters, gridClass);
    }

    return `<div>${content}</div>`;
}

// Show walking time tab by ID
function showWalkingTabById(btn, tabId, uniqueId, animate = true) {
    const areaIdx = parseInt(uniqueId.replace('area-', ''));
    activeWalkingTabs[areaIdx] = tabId;
    saveTabState();
    
    document.querySelectorAll(`.walking-tab-${uniqueId}`).forEach(t => {
        t.classList.remove('border-pokemon-yellow', 'border-b-2', 'text-white');
        t.classList.add('text-white/60');
    });
    if (btn) {
        btn.classList.add('border-pokemon-yellow', 'border-b-2', 'text-white');
        btn.classList.remove('text-white/60');
    }
    
    const container = document.querySelector(`.walking-swipe-container-${uniqueId}`);
    const track = document.querySelector(`.walking-swipe-track-${uniqueId}`);
    if (container && track) {
        const tabs = JSON.parse(container.dataset.tabs || '[]');
        const tabIndex = tabs.indexOf(tabId);
        if (tabIndex !== -1) {
            container.dataset.current = tabIndex;
            track.style.transform = `translateX(-${tabIndex * 100}%)`;
        }
    }
}

// Navigate walking tabs with horizontal scroll
function handleWalkingSwipe(uniqueId, direction) {
    const container = document.querySelector(`.walking-swipe-container-${uniqueId}`);
    if (!container) return false;
    
    const tabs = JSON.parse(container.dataset.tabs || '[]');
    let current = parseInt(container.dataset.current || '0');
    
    if (direction === 'left' && current < tabs.length - 1) {
        current++;
    } else if (direction === 'right' && current > 0) {
        current--;
    } else {
        return false;
    }
    
    const tabId = tabs[current];
    const btn = document.querySelector(`.walking-tab-${uniqueId}[data-tab-index="${current}"]`);
    showWalkingTabById(btn, tabId, uniqueId);
    return true;
}

// Render area card HTML
function renderAreaCard(area, areaIdx) {
    if (!area) return '';
    
    const idx = areaIdx !== undefined ? areaIdx : data.areas.indexOf(area);
    const timeClass = getTimeClass(area.optimal_time);
    const isNight = area.optimal_time === 'night';

    const hasWalking = area.encounters.walking?.morning?.length || 
                      area.encounters.walking?.day?.length || 
                      area.encounters.walking?.night?.length;

    const uniqueId = `area-${idx}`;
    
    const methods = [
        { key: 'walking', has: hasWalking, label: 'Walking' },
        { key: 'surf', has: area.encounters.surf?.length, label: 'Surf' },
        { key: 'old_rod', has: area.encounters.old_rod?.length, label: 'Old Rod' },
        { key: 'good_rod', has: area.encounters.good_rod?.length, label: 'Good Rod' },
        { key: 'super_rod', has: area.encounters.super_rod?.length, label: 'Super Rod' },
        { key: 'honey_tree', has: area.encounters.honey_tree?.length, label: 'Honey Tree' },
        { key: 'poke_radar', has: area.encounters.poke_radar?.length, label: 'Poke Radar' }
    ];
    
    const firstMethod = methods.find(m => m.has)?.key || null;
    
    const inactiveClass = 'text-white/70 hover:bg-white/20';
    const activeClass = 'bg-pokemon-blue text-white';
    
    const renderTabButton = (method) => {
        const isFirst = method.key === firstMethod;
        const btnClass = isFirst ? activeClass : inactiveClass;
        return `<button onclick="showMethodTab('${method.key}', '${uniqueId}')" class="method-tab-${uniqueId} px-3 py-1 rounded-full text-sm font-medium ${btnClass}">${method.label}</button>`;
    };
    
    const renderTabContent = (method, title, encounters, isWalking = false) => {
        const isFirst = method === firstMethod;
        const hiddenClass = isFirst ? '' : 'hidden';
        return `<div id="tab-${method}-${uniqueId}" class="method-content-${uniqueId} min-h-[350px] ${hiddenClass}">${renderEncounterSection(title, encounters, isWalking, idx)}</div>`;
    };

    const sunriseIcon = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 12h4a5 5 0 0 1 10 0h4M5.6 5.6l2.8 2.8M18.4 5.6l-2.8 2.8M12 2v3"/><path d="M12 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>`;
    const sunIcon = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
    const moonIcon = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    const clockIcon = `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
    
    const timeIcon = area.optimal_time === 'morning' ? sunriseIcon : 
                    area.optimal_time === 'day' ? sunIcon : 
                    area.optimal_time === 'night' ? moonIcon : clockIcon;
    
    return `
        <div class="rounded-xl shadow-lg overflow-hidden ${timeClass}">
            <div class="area-card-inner p-6">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h2 class="text-2xl font-bold">${area.area_name}</h2>
                        <p class="text-xs opacity-70 mt-1">
                            Area ${idx + 1} of ${data.areas.length}
                        </p>
                    </div>
                    <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/20">
                        <span class="opacity-90">${timeIcon}</span>
                        <div class="text-sm opacity-90">
                            ${area.optimal_time 
                                ? `<span class="font-semibold">${area.optimal_time.charAt(0).toUpperCase() + area.optimal_time.slice(1)}</span>`
                                : '<span class="text-xs">Multiple times</span>'
                            }
                        </div>
                    </div>
                </div>

                <div class="flex flex-wrap gap-2 mb-4 border-b border-white/20 pb-2">
                    ${methods.filter(m => m.has).map(m => renderTabButton(m)).join('')}
                </div>

                <div id="method-content-${uniqueId}" class="min-h-[350px]">
                    ${hasWalking ? renderTabContent('walking', 'Walking Encounters', area.encounters.walking, true) : ''}
                    ${renderTabContent('surf', 'Surf Encounters', area.encounters.surf)}
                    ${renderTabContent('old_rod', 'Old Rod Encounters', area.encounters.old_rod)}
                    ${renderTabContent('good_rod', 'Good Rod Encounters', area.encounters.good_rod)}
                    ${renderTabContent('super_rod', 'Super Rod Encounters', area.encounters.super_rod)}
                    ${renderTabContent('honey_tree', 'Honey Tree Encounters', area.encounters.honey_tree)}
                    ${renderTabContent('poke_radar', 'Poke Radar Encounters', area.encounters.poke_radar)}
                </div>
            </div>
        </div>
    `;
}

// Show method tab
function showMethodTab(method, uniqueId, animate = true) {
    const areaIdx = parseInt(uniqueId.replace('area-', ''));
    activeMethodTabs[areaIdx] = method;
    saveTabState();
    
    document.querySelectorAll(`.method-tab-${uniqueId}`).forEach(t => {
        t.classList.remove('bg-pokemon-blue');
        t.classList.add('text-white/70');
    });
    
    const activeBtn = document.querySelector(`.method-tab-${uniqueId}[onclick="showMethodTab('${method}', '${uniqueId}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('bg-pokemon-blue');
        activeBtn.classList.remove('text-white/70');
    }
    
    const allContents = document.querySelectorAll(`.method-content-${uniqueId}`);
    const tabContent = document.getElementById(`tab-${method}-${uniqueId}`);
    
    if (animate && tabContent) {
        allContents.forEach(c => {
            if (!c.classList.contains('hidden')) {
                c.style.opacity = '0';
                c.style.transform = 'translateX(-20px)';
                setTimeout(() => c.classList.add('hidden'), 150);
            }
        });
        
        setTimeout(() => {
            tabContent.classList.remove('hidden');
            tabContent.style.opacity = '0';
            tabContent.style.transform = 'translateX(20px)';
            requestAnimationFrame(() => {
                tabContent.style.transition = 'opacity 0.15s ease-out, transform 0.15s ease-out';
                tabContent.style.opacity = '1';
                tabContent.style.transform = 'translateX(0)';
            });
        }, 150);
    } else {
        allContents.forEach(c => c.classList.add('hidden'));
        if (tabContent) {
            tabContent.classList.remove('hidden');
            tabContent.style.opacity = '1';
            tabContent.style.transform = 'translateX(0)';
        }
    }
}

// Get available method tabs for an area
function getMethodTabs(uniqueId) {
    const tabs = [];
    document.querySelectorAll(`.method-tab-${uniqueId}`).forEach(btn => {
        const onclick = btn.getAttribute('onclick');
        const match = onclick?.match(/showMethodTab\('([^']+)'/);
        if (match) tabs.push(match[1]);
    });
    return tabs;
}

// Handle horizontal swipe for method tabs
function handleMethodSwipe(uniqueId, direction) {
    const tabs = getMethodTabs(uniqueId);
    if (tabs.length === 0) return false;
    
    const areaIdx = parseInt(uniqueId.replace('area-', ''));
    const currentMethod = activeMethodTabs[areaIdx] || tabs[0];
    const currentIndex = tabs.indexOf(currentMethod);
    
    let newIndex;
    if (direction === 'left' && currentIndex < tabs.length - 1) {
        newIndex = currentIndex + 1;
    } else if (direction === 'right' && currentIndex > 0) {
        newIndex = currentIndex - 1;
    } else {
        return false;
    }
    
    showMethodTab(tabs[newIndex], uniqueId);
    return true;
}

// Render carousel without transitions
function renderCarouselNoTransition() {
    const prevSlide = document.getElementById('area-slide-prev');
    const currentSlide = document.getElementById('area-slide-current');
    const nextSlide = document.getElementById('area-slide-next');
    
    if (!prevSlide || !currentSlide || !nextSlide) return;
    
    prevSlide.className = 'area-slide prev no-transition';
    currentSlide.className = 'area-slide current no-transition';
    nextSlide.className = 'area-slide next no-transition';
    
    prevSlide.innerHTML = currentAreaIndex > 0 ? renderAreaCard(data.areas[currentAreaIndex - 1], currentAreaIndex - 1) : '';
    currentSlide.innerHTML = renderAreaCard(data.areas[currentAreaIndex], currentAreaIndex);
    nextSlide.innerHTML = currentAreaIndex < data.areas.length - 1 ? renderAreaCard(data.areas[currentAreaIndex + 1], currentAreaIndex + 1) : '';
}

function renderCarousel() {
    renderCarouselNoTransition();
}

// Search functionality
function performSearch(query) {
    if (!query.trim()) {
        document.getElementById('search-results').classList.add('hidden');
        document.getElementById('area-content').classList.remove('hidden');
        return;
    }

    const results = [];
    const queryLower = query.toLowerCase();

    for (let areaIdx = 0; areaIdx < data.areas.length; areaIdx++) {
        const area = data.areas[areaIdx];
        
        const checkEncounters = (encounters, method) => {
            if (!encounters) return;
            if (Array.isArray(encounters)) {
                for (const enc of encounters) {
                    if (enc.pokemon.toLowerCase().includes(queryLower)) {
                        results.push({ area, areaIdx, method, encounter: enc });
                    }
                }
            } else {
                for (const time of ['morning', 'day', 'night']) {
                    for (const enc of encounters[time] || []) {
                        if (enc.pokemon.toLowerCase().includes(queryLower)) {
                            results.push({ area, areaIdx, method: `walking (${time})`, encounter: enc });
                        }
                    }
                }
            }
        };

        checkEncounters(area.encounters.walking, 'walking');
        checkEncounters(area.encounters.surf, 'surf');
        checkEncounters(area.encounters.old_rod, 'old_rod');
        checkEncounters(area.encounters.good_rod, 'good_rod');
        checkEncounters(area.encounters.super_rod, 'super_rod');
        checkEncounters(area.encounters.honey_tree, 'honey_tree');
        checkEncounters(area.encounters.poke_radar, 'poke_radar');
    }

    const container = document.getElementById('search-results-content');
    if (results.length === 0) {
        container.innerHTML = '<p class="text-gray-500 dark:text-gray-400">No Pokemon found matching your search.</p>';
    } else {
        container.innerHTML = results.map(r => `
            <div class="bg-white dark:bg-gray-700 rounded-lg shadow-sm p-4 mb-2 hover:shadow-md transition-shadow cursor-pointer" onclick="selectArea(${r.areaIdx})">
                <div class="flex items-center gap-3">
                    <img 
                        src="sprites/${r.encounter.pokedex_number}.png" 
                        alt="${r.encounter.pokemon}"
                        class="w-10 h-10"
                        onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${r.encounter.pokedex_number}.png'"
                    >
                    <div class="flex-1">
                        <div class="font-medium dark:text-white">${r.encounter.pokemon}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">${r.area.area_name} - ${r.method}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-pokemon-blue">${r.encounter.catch_count} to catch</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">${r.encounter.encounter_rate}% - Lv. ${r.encounter.level_range}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('search-results').classList.remove('hidden');
    document.getElementById('area-content').classList.add('hidden');
}

// Smooth scroll handler
let horizontalScrollAccumulator = 0;
const HORIZONTAL_SCROLL_THRESHOLD = 250;
let horizontalSwipeCooldown = false;

function handleScroll(e) {
    if (isTransitioning) {
        e.preventDefault();
        return;
    }
    
    if (!document.getElementById('evo-modal').classList.contains('hidden')) return;
    if (!document.getElementById('search-results').classList.contains('hidden')) return;

    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 5) {
        e.preventDefault();
        
        if (horizontalSwipeCooldown) return;
        
        horizontalScrollAccumulator += e.deltaX;
        
        if (Math.abs(horizontalScrollAccumulator) > HORIZONTAL_SCROLL_THRESHOLD) {
            const uniqueId = `area-${currentAreaIndex}`;
            const direction = horizontalScrollAccumulator > 0 ? 'left' : 'right';
            
            let switched = false;
            
            const walkingTabVisible = !document.getElementById(`tab-walking-${uniqueId}`)?.classList.contains('hidden');
            const walkingContainer = document.querySelector(`.walking-swipe-container-${uniqueId}`);
            
            if (walkingTabVisible && walkingContainer) {
                switched = handleWalkingSwipe(uniqueId, direction);
                
                if (!switched) {
                    switched = handleMethodSwipe(uniqueId, direction);
                }
            } else {
                switched = handleMethodSwipe(uniqueId, direction);
                
                if (switched && direction === 'right') {
                    const newWalkingContainer = document.querySelector(`.walking-swipe-container-${uniqueId}`);
                    const newWalkingTabVisible = !document.getElementById(`tab-walking-${uniqueId}`)?.classList.contains('hidden');
                    if (newWalkingTabVisible && newWalkingContainer) {
                        const tabs = JSON.parse(newWalkingContainer.dataset.tabs || '[]');
                        if (tabs.length > 1) {
                            const lastTabId = tabs[tabs.length - 1];
                            const lastBtn = document.querySelector(`.walking-tab-${uniqueId}[data-tab-index="${tabs.length - 1}"]`);
                            showWalkingTabById(lastBtn, lastTabId, uniqueId);
                        }
                    }
                }
            }
            
            horizontalScrollAccumulator = 0;
            
            if (switched) {
                horizontalSwipeCooldown = true;
                setTimeout(() => {
                    horizontalSwipeCooldown = false;
                }, 400);
            }
        }
        return;
    } else {
        horizontalScrollAccumulator = 0;
    }

    const cardInner = e.target.closest('.area-card-inner');
    if (cardInner) {
        const atTop = cardInner.scrollTop === 0;
        const atBottom = cardInner.scrollTop + cardInner.clientHeight >= cardInner.scrollHeight - 5;
        
        if (e.deltaY > 0 && !atBottom) return;
        if (e.deltaY < 0 && !atTop) return;
    }

    e.preventDefault();
    
    scrollAccumulator += e.deltaY;
    
    if (scrollAccumulator > SCROLL_THRESHOLD && currentAreaIndex < data.areas.length - 1) {
        selectArea(currentAreaIndex + 1, 'down');
    } else if (scrollAccumulator < -SCROLL_THRESHOLD && currentAreaIndex > 0) {
        selectArea(currentAreaIndex - 1, 'up');
    }
}

// Mobile tab switching
function showMobileTab(tab) {
    currentMobileTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('#mobile-tab-bar button').forEach(btn => {
        btn.classList.remove('text-pokemon-blue', 'border-pokemon-blue');
        btn.classList.add('text-gray-500');
    });
    const activeBtn = document.querySelector(`#mobile-tab-bar button[data-tab="${tab}"]`);
    if (activeBtn) {
        activeBtn.classList.add('text-pokemon-blue', 'border-pokemon-blue');
        activeBtn.classList.remove('text-gray-500');
    }
    
    // Show/hide views
    const areasView = document.getElementById('mobile-areas-view');
    const pcView = document.getElementById('mobile-pc-view');
    const mainContent = document.querySelector('main');
    
    if (areasView) areasView.classList.add('hidden');
    if (pcView) pcView.classList.add('hidden');
    if (mainContent) mainContent.classList.add('hidden');
    
    if (tab === 'areas' && areasView) {
        areasView.classList.remove('hidden');
        renderMobileAreaList();
    } else if (tab === 'pc' && pcView) {
        pcView.classList.remove('hidden');
        renderMobilePCBox();
    } else if (tab === 'tracker' && mainContent) {
        mainContent.classList.remove('hidden');
    }
}

// Render mobile area list
let mobileAreaFilterQuery = '';

function renderMobileAreaList() {
    const container = document.getElementById('mobile-area-list');
    if (!container || !data) return;
    
    const filterLower = mobileAreaFilterQuery.toLowerCase();
    
    container.innerHTML = data.areas.map((area, idx) => {
        const matchesFilter = !filterLower || area.area_name.toLowerCase().includes(filterLower);
        if (!matchesFilter) return '';
        
        return `
            <button 
                onclick="selectArea(${idx}); showMobileTab('tracker');"
                class="w-full text-left px-4 py-3 bg-white dark:bg-gray-800 rounded-lg mb-2 shadow-sm transition-colors ${
                    idx === currentAreaIndex 
                        ? 'border-2 border-pokemon-blue' 
                        : 'border border-gray-200 dark:border-gray-700'
                }"
            >
                <div class="font-medium dark:text-white">${area.area_name}</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">Area ${idx + 1}</div>
            </button>
        `;
    }).join('');
}

function filterMobileAreas(query) {
    mobileAreaFilterQuery = query;
    renderMobileAreaList();
}

// Render mobile PC box
function renderMobilePCBox() {
    const container = document.getElementById('mobile-pc-sprites');
    const statsEl = document.getElementById('mobile-pc-stats');
    
    if (!container || !statsEl) return;
    
    if (!encounterOrder.length) {
        encounterOrder = buildEncounterOrder();
    }
    
    const baseToLine = new Map();
    const processedBases = new Set();
    
    for (const poke of encounterOrder) {
        const line = getEvolutionLine(poke.name);
        const baseDex = line[0]?.dex;
        
        if (baseDex && !processedBases.has(baseDex)) {
            processedBases.add(baseDex);
            baseToLine.set(baseDex, line);
        }
    }
    
    let totalCount = 0;
    let html = '';
    
    for (const poke of encounterOrder) {
        const line = getEvolutionLine(poke.name);
        const baseDex = line[0]?.dex;
        
        if (!baseToLine.has(baseDex)) continue;
        const storedLine = baseToLine.get(baseDex);
        baseToLine.delete(baseDex);
        
        for (const member of storedLine) {
            const state = getPokemonState(member.dex);
            const count = state.count || 0;
            
            if (count > 0) {
                totalCount += count;
                for (let i = 0; i < count; i++) {
                    html += `
                        <div class="relative cursor-pointer" onclick="openEvoModal('${member.name}', ${member.dex})" title="${member.name}">
                            <img src="sprites/${member.dex}.png" 
                                 alt="${member.name}" 
                                 class="w-14 h-14 pixelated"
                                 onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${member.dex}.png'">
                        </div>
                    `;
                }
            }
        }
    }
    
    container.innerHTML = html || '<div class="col-span-5 text-center text-gray-500 dark:text-gray-400 py-8">No Pokemon caught yet</div>';
    statsEl.textContent = `${totalCount} Pokemon caught`;
}

// Initialize
async function init() {
    initDarkMode();
    
    try {
        // Load game config and data
        const basePath = `games/${gameId}`;
        
        const [configRes, outputRes, evoRes] = await Promise.all([
            fetch(`${basePath}/config.json`),
            fetch(`${basePath}/output.json`),
            fetch(`${basePath}/evolutions.json`)
        ]);
        
        gameConfig = await configRes.json();
        data = await outputRes.json();
        evolutions = await evoRes.json();
        
        // Update page title
        document.title = `${gameConfig.name} - Living Dex Tracker`;
        const gameTitleEl = document.getElementById('game-title');
        if (gameTitleEl) {
            gameTitleEl.textContent = gameConfig.name;
        }
        
        loadTrackingState();
        renderAreaList();
        renderCarousel();
        renderPCBox();

        // Search input handler
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => performSearch(e.target.value), 300);
            });
        }

        // Area filter input handler
        const areaSearchInput = document.getElementById('area-search-input');
        if (areaSearchInput) {
            areaSearchInput.addEventListener('input', (e) => {
                filterAreas(e.target.value);
            });
        }
        
        // Mobile area filter input handler
        const mobileAreaSearchInput = document.getElementById('mobile-area-search-input');
        if (mobileAreaSearchInput) {
            mobileAreaSearchInput.addEventListener('input', (e) => {
                filterMobileAreas(e.target.value);
            });
        }

        // Close modal on backdrop click
        const evoModal = document.getElementById('evo-modal');
        if (evoModal) {
            evoModal.addEventListener('click', (e) => {
                if (e.target === evoModal) {
                    closeEvoModal();
                }
            });
        }

        // Scroll to change areas
        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.addEventListener('wheel', handleScroll, { passive: false });
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (!document.getElementById('evo-modal').classList.contains('hidden')) return;
            if (isTransitioning) return;
            
            if (e.key === 'ArrowDown' || e.key === 'j') {
                if (currentAreaIndex < data.areas.length - 1) {
                    selectArea(currentAreaIndex + 1, 'down');
                    e.preventDefault();
                }
            } else if (e.key === 'ArrowUp' || e.key === 'k') {
                if (currentAreaIndex > 0) {
                    selectArea(currentAreaIndex - 1, 'up');
                    e.preventDefault();
                }
            }
        });

        // Hide nav hint after first interaction
        const navHint = document.getElementById('nav-hint');
        if (navHint && mainContent) {
            const hideHint = () => {
                navHint.style.opacity = '0';
                setTimeout(() => navHint.style.display = 'none', 300);
            };
            mainContent.addEventListener('wheel', hideHint, { once: true });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') hideHint();
            }, { once: true });
        }

    } catch (error) {
        console.error('Failed to load data:', error);
        const currentSlide = document.getElementById('area-slide-current');
        if (currentSlide) {
            currentSlide.innerHTML = `
                <div class="p-6 text-center text-red-500 bg-white rounded-xl">
                    <p>Failed to load data for game: ${gameId}</p>
                    <p class="text-sm mt-2">${error.message}</p>
                    <a href="index.html" class="mt-4 inline-block px-4 py-2 bg-pokemon-blue text-white rounded-lg">Back to Game Selection</a>
                </div>
            `;
        }
    }
}

// Tooltip show/hide functions
function showTooltip(card) {
    try {
        const tooltip = card.querySelector('.tooltip-text');
        if (!tooltip) return;
        
        // Move tooltip to body to avoid overflow clipping
        document.body.appendChild(tooltip);
        tooltip.dataset.cardId = card.dataset.pokemonId || Math.random();
        card.dataset.pokemonId = tooltip.dataset.cardId;
        
        const cardRect = card.getBoundingClientRect();
        
        // Make visible and measure
        tooltip.style.visibility = 'hidden';
        tooltip.style.display = 'block';
        tooltip.style.top = '0';
        tooltip.style.left = '0';
        
        const tooltipHeight = tooltip.offsetHeight;
        const tooltipWidth = tooltip.offsetWidth;
        
        let top, left;
        if (cardRect.top < tooltipHeight + 20) {
            top = cardRect.bottom + 8;
        } else {
            top = cardRect.top - tooltipHeight - 8;
        }
        
        left = cardRect.left + (cardRect.width / 2) - (tooltipWidth / 2);
        
        // Keep on screen
        if (left < 10) left = 10;
        if (left + tooltipWidth > window.innerWidth - 10) {
            left = window.innerWidth - tooltipWidth - 10;
        }
        if (top < 10) top = cardRect.bottom + 8;
        
        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        tooltip.style.visibility = 'visible';
    } catch (e) {
        console.error('showTooltip error:', e);
    }
}

function hideTooltip(card) {
    // Find tooltip either in card or in body
    let tooltip = card.querySelector('.tooltip-text');
    if (!tooltip && card.dataset.pokemonId) {
        tooltip = document.body.querySelector(`.tooltip-text[data-card-id="${card.dataset.pokemonId}"]`);
    }
    if (tooltip) {
        tooltip.style.display = 'none';
        tooltip.style.visibility = 'hidden';
        // Move back to card
        if (tooltip.parentElement === document.body) {
            card.appendChild(tooltip);
        }
    }
}

// Attach tooltip listeners to all pokemon cards
function attachTooltipListeners() {
    document.querySelectorAll('.pokemon-card').forEach(card => {
        card.removeEventListener('mouseenter', card._tooltipEnter);
        card.removeEventListener('mouseleave', card._tooltipLeave);
        
        card._tooltipEnter = () => showTooltip(card);
        card._tooltipLeave = () => hideTooltip(card);
        
        card.addEventListener('mouseenter', card._tooltipEnter);
        card.addEventListener('mouseleave', card._tooltipLeave);
    });
}

// Initial call
setTimeout(attachTooltipListeners, 1000);

// Attach import file listener
document.getElementById('import-file')?.addEventListener('change', importData);

// Call after DOM updates
const originalRenderArea = typeof renderArea === 'function' ? renderArea : null;

// Observer to attach listeners when cards are added
const tooltipObserver = new MutationObserver(() => {
    attachTooltipListeners();
});
tooltipObserver.observe(document.body, { childList: true, subtree: true });

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service worker registered'))
        .catch((err) => console.log('Service worker registration failed:', err));
}

// Start the app
init();

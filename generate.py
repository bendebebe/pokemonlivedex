#!/usr/bin/env python3
"""
Generate output.json for the Living Dex tracker.
Processes encounters.json and evolutions.json to calculate:
- How many of each Pokemon to catch
- Next area for evolution leveling
- Above-evolution warnings
- Better opportunity flags
- Optimal time of day per area
"""

import json
from collections import defaultdict

def load_data():
    """Load encounters and evolutions data."""
    with open('encounters.json', 'r', encoding='utf-8') as f:
        encounters = json.load(f)
    with open('evolutions.json', 'r', encoding='utf-8') as f:
        evolutions = json.load(f)
    return encounters['areas'], evolutions['pokemon']

def build_evolution_data(pokemon_list):
    """Build lookup structures for evolution data."""
    # Map from pokemon name to its data
    pokemon_by_name = {}
    # Map from pokemon name to pokedex number
    name_to_dex = {}
    # Map from pokedex number to pokemon name
    dex_to_name = {}
    
    for p in pokemon_list:
        name = p['pokemon']
        pokemon_by_name[name] = p
        name_to_dex[name] = p['pokedex_number']
        dex_to_name[p['pokedex_number']] = name
    
    return pokemon_by_name, name_to_dex, dex_to_name

def get_base_pokemon(pokemon_name, pokemon_by_name):
    """Find the base (unevolved) form of a Pokemon."""
    # Check all pokemon to see if any evolve into this one
    for name, data in pokemon_by_name.items():
        for evo in data.get('evolves_to', []):
            if evo['pokemon'] == pokemon_name:
                # Found a pre-evolution, recurse
                return get_base_pokemon(name, pokemon_by_name)
    return pokemon_name

def get_full_evolution_line(pokemon_name, pokemon_by_name, include_base=True):
    """
    Get the full evolution line starting from the base form.
    Returns list of (pokemon_name, pokedex_number) including all branches.
    """
    # First find the base form
    base = get_base_pokemon(pokemon_name, pokemon_by_name)
    
    # Then get all evolutions from base
    result = []
    
    def collect_evolutions(name):
        if name not in pokemon_by_name:
            return
        data = pokemon_by_name[name]
        result.append((name, data['pokedex_number']))
        for evo in data.get('evolves_to', []):
            collect_evolutions(evo['pokemon'])
    
    collect_evolutions(base)
    return result

def get_evolution_requirements(pokemon_name, pokemon_by_name):
    """
    Get evolution requirements for a Pokemon.
    Returns list of (evolved_form, method, level_or_none) for each direct evolution.
    """
    if pokemon_name not in pokemon_by_name:
        return []
    
    data = pokemon_by_name[pokemon_name]
    requirements = []
    
    for evo in data.get('evolves_to', []):
        method = evo.get('method', 'unknown')
        level = evo.get('level')
        requirements.append({
            'evolves_into': evo['pokemon'],
            'pokedex_number': evo['pokedex_number'],
            'method': method,
            'level': level,
            'item': evo.get('item')
        })
    
    return requirements

def get_all_evolution_levels(pokemon_name, pokemon_by_name):
    """
    Get all evolution level thresholds for a Pokemon and its evolutions.
    Returns list of (level, evolved_form) sorted by level.
    """
    levels = []
    
    def collect_levels(name):
        if name not in pokemon_by_name:
            return
        data = pokemon_by_name[name]
        for evo in data.get('evolves_to', []):
            if evo.get('level'):
                levels.append((evo['level'], evo['pokemon'], name))
            # Recurse for chain evolutions
            collect_levels(evo['pokemon'])
    
    collect_levels(pokemon_name)
    return sorted(levels, key=lambda x: x[0])

def calculate_catch_count(pokemon_name, pokemon_by_name, sourced_set):
    """
    Calculate how many of this Pokemon to catch for the living dex.
    Returns (count, list_of_unsourced_pokemon).
    """
    # Get full evolution line
    evo_line = get_full_evolution_line(pokemon_name, pokemon_by_name)
    
    # Count how many are not yet sourced
    unsourced = [(name, dex) for name, dex in evo_line if name not in sourced_set]
    
    return len(unsourced), unsourced

def find_pokemon_in_area(areas, area_idx, pokemon_name, min_level=None):
    """
    Find a Pokemon in areas starting from area_idx.
    Returns (area_name, level_range, encounter_rate, method) or None.
    """
    for idx in range(area_idx + 1, len(areas)):
        area = areas[idx]
        
        # Check all encounter methods
        for method, data in area['encounters'].items():
            if method == 'walking':
                for time_of_day in ['morning', 'day', 'night']:
                    for enc in data.get(time_of_day, []):
                        if enc['pokemon'] == pokemon_name:
                            level_range = enc.get('level_range', '')
                            # Parse min level from range
                            if level_range:
                                try:
                                    if '-' in str(level_range):
                                        enc_min_level = int(str(level_range).split('-')[0])
                                    else:
                                        enc_min_level = int(level_range)
                                except:
                                    enc_min_level = 0
                            else:
                                enc_min_level = 0
                            
                            if min_level is None or enc_min_level >= min_level:
                                return {
                                    'area': area['area_name'],
                                    'level_range': level_range,
                                    'encounter_rate': enc['rate'],
                                    'method': f'walking ({time_of_day})'
                                }
            else:
                for enc in data:
                    if enc['pokemon'] == pokemon_name:
                        level_range = enc.get('level_range', '')
                        if level_range:
                            try:
                                if '-' in str(level_range):
                                    enc_min_level = int(str(level_range).split('-')[0])
                                else:
                                    enc_min_level = int(level_range)
                            except:
                                enc_min_level = 0
                        else:
                            enc_min_level = 0
                        
                        if min_level is None or enc_min_level >= min_level:
                            return {
                                'area': area['area_name'],
                                'level_range': level_range,
                                'encounter_rate': enc['rate'],
                                'method': method
                            }
    
    return None

def find_better_opportunity(areas, area_idx, pokemon_name, current_rate):
    """
    If current_rate < 15%, find a future area with rate >= 15%.
    Returns {area, encounter_rate} or None.
    """
    if current_rate >= 15:
        return None
    
    for idx in range(area_idx + 1, len(areas)):
        area = areas[idx]
        
        # Check all encounter methods
        for method, data in area['encounters'].items():
            if method == 'walking':
                for time_of_day in ['morning', 'day', 'night']:
                    for enc in data.get(time_of_day, []):
                        if enc['pokemon'] == pokemon_name and enc['rate'] >= 15:
                            return {
                                'area': area['area_name'],
                                'encounter_rate': enc['rate']
                            }
            else:
                for enc in data:
                    if enc['pokemon'] == pokemon_name and enc['rate'] >= 15:
                        return {
                            'area': area['area_name'],
                            'encounter_rate': enc['rate']
                        }
    
    return None

def check_above_evolution_warning(pokemon_name, level_range, pokemon_by_name):
    """
    Check if the encounter level is above any evolution threshold.
    Returns warning string or None.
    """
    if not level_range:
        return None
    
    try:
        if '-' in str(level_range):
            min_level = int(str(level_range).split('-')[0])
        else:
            min_level = int(level_range)
    except:
        return None
    
    # Get evolution levels for this Pokemon
    evo_levels = get_all_evolution_levels(pokemon_name, pokemon_by_name)
    
    warnings = []
    for evo_level, evolved_form, from_pokemon in evo_levels:
        if min_level >= evo_level and from_pokemon == pokemon_name:
            warnings.append(f"Already at/above Lv{evo_level} for {evolved_form}")
    
    if warnings:
        return "; ".join(warnings)
    return None

def calculate_next_evo_areas(pokemon_name, areas, area_idx, pokemon_by_name):
    """
    For each evolution, find the next area where the BASE Pokemon appears
    at or above the evolution level.
    Returns list of evolution area info.
    """
    base = get_base_pokemon(pokemon_name, pokemon_by_name)
    evo_reqs = get_evolution_requirements(base, pokemon_by_name)
    
    result = []
    
    for req in evo_reqs:
        if req['method'] == 'level' and req['level']:
            next_area = find_pokemon_in_area(areas, area_idx, base, req['level'])
            if next_area:
                result.append({
                    'evolves_into': req['evolves_into'],
                    'evo_level': req['level'],
                    'next_area': next_area['area'],
                    'level_range': next_area['level_range'],
                    'encounter_rate': next_area['encounter_rate']
                })
            else:
                result.append({
                    'evolves_into': req['evolves_into'],
                    'evo_level': req['level'],
                    'next_area': None,
                    'level_range': None,
                    'encounter_rate': None,
                    'note': 'Must grind — no future area found'
                })
    
    # Also check for chain evolutions (e.g., if we're catching Starly, include Staravia->Staraptor)
    # Get all evolutions that need leveling from this base
    def get_chain_evos(name, depth=0):
        if depth > 3 or name not in pokemon_by_name:
            return
        reqs = get_evolution_requirements(name, pokemon_by_name)
        for req in reqs:
            if req['method'] == 'level' and req['level']:
                next_area = find_pokemon_in_area(areas, area_idx, base, req['level'])
                if next_area:
                    result.append({
                        'evolves_into': req['evolves_into'],
                        'evo_level': req['level'],
                        'next_area': next_area['area'],
                        'level_range': next_area['level_range'],
                        'encounter_rate': next_area['encounter_rate']
                    })
                else:
                    result.append({
                        'evolves_into': req['evolves_into'],
                        'evo_level': req['level'],
                        'next_area': None,
                        'level_range': None,
                        'encounter_rate': None,
                        'note': 'Must grind — no future area found'
                    })
            get_chain_evos(req['evolves_into'], depth + 1)
    
    for req in evo_reqs:
        get_chain_evos(req['evolves_into'])
    
    # Remove duplicates
    seen = set()
    unique_result = []
    for r in result:
        key = r['evolves_into']
        if key not in seen:
            seen.add(key)
            unique_result.append(r)
    
    return unique_result if unique_result else None

def calculate_optimal_time(area):
    """
    Determine which time of day covers the most unique Pokemon.
    Returns 'morning', 'day', 'night', or None.
    """
    walking = area['encounters'].get('walking', {})
    
    morning_pokemon = set(p['pokemon'] for p in walking.get('morning', []))
    day_pokemon = set(p['pokemon'] for p in walking.get('day', []))
    night_pokemon = set(p['pokemon'] for p in walking.get('night', []))
    
    # If no walking encounters
    if not morning_pokemon and not day_pokemon and not night_pokemon:
        return None
    
    # Get all unique pokemon
    all_pokemon = morning_pokemon | day_pokemon | night_pokemon
    
    # Count unique coverage for each time
    morning_unique = len(morning_pokemon)
    day_unique = len(day_pokemon)
    night_unique = len(night_pokemon)
    
    # Check if all times have the same Pokemon
    if morning_pokemon == day_pokemon == night_pokemon:
        return "day"  # Default to day if all same
    
    # Check which time has the most coverage
    max_coverage = max(morning_unique, day_unique, night_unique)
    times_with_max = []
    if morning_unique == max_coverage:
        times_with_max.append('morning')
    if day_unique == max_coverage:
        times_with_max.append('day')
    if night_unique == max_coverage:
        times_with_max.append('night')
    
    # If multiple times tied, check if any single time covers ALL unique pokemon
    if len(times_with_max) > 1:
        # Check if we need multiple times to catch all unique pokemon
        if morning_pokemon == all_pokemon:
            return 'morning'
        if day_pokemon == all_pokemon:
            return 'day'
        if night_pokemon == all_pokemon:
            return 'night'
        # Multiple times needed
        return None
    
    return times_with_max[0]

def process_encounter(enc, areas, area_idx, pokemon_by_name, sourced_set, name_to_dex):
    """Process a single encounter entry."""
    pokemon_name = enc['pokemon']
    
    # Get pokedex number
    pokedex_number = name_to_dex.get(pokemon_name)
    if pokedex_number is None:
        # Try to find it
        for p in pokemon_by_name.values():
            if p['pokemon'] == pokemon_name:
                pokedex_number = p['pokedex_number']
                break
    
    # Calculate catch count
    catch_count, unsourced = calculate_catch_count(pokemon_name, pokemon_by_name, sourced_set)
    
    # Check for above evolution warning
    above_evo_warning = check_above_evolution_warning(
        pokemon_name, enc.get('level_range'), pokemon_by_name
    )
    
    # Check for better opportunity
    better_opportunity = find_better_opportunity(
        areas, area_idx, pokemon_name, enc['rate']
    )
    
    # Calculate next evolution areas (only if catch_count >= 2)
    next_evo_area = None
    if catch_count >= 2:
        next_evo_area = calculate_next_evo_areas(
            pokemon_name, areas, area_idx, pokemon_by_name
        )
    
    return {
        'pokemon': pokemon_name,
        'pokedex_number': pokedex_number,
        'encounter_rate': enc['rate'],
        'level_range': enc.get('level_range', ''),
        'catch_count': catch_count,
        'above_evo_warning': above_evo_warning,
        'better_opportunity': better_opportunity,
        'next_evo_area': next_evo_area
    }

def get_unlock_area_indices(areas):
    """
    Determine when each encounter method becomes available.
    Returns dict mapping method to first area index where it can be used.
    
    Key unlock locations:
    - Walking: Always available (index 0)
    - Old Rod: Jubilife City -> first usable at Route 202 (after Jubilife)
    - Good Rod: Route 209 -> first usable at Lost Tower (area after Route 209)
    - Super Rod: Snowpoint City -> first usable at Lake Acuity (after Snowpoint Temple)
    - Surf: Celestic Town -> first usable at Route 219 (area after Celestic Town)
    - Poke Radar: Route 202 -> available from Route 202
    - Honey Tree: Always available (index 0)
    """
    # Build name to index mapping
    name_to_idx = {area['area_name']: idx for idx, area in enumerate(areas)}
    
    unlocks = {
        'walking': 0,
        'honey_tree': 0,
        'poke_radar': name_to_idx.get('Route 202', 0),
        'old_rod': name_to_idx.get('Route 202', 0),  # After Jubilife City
        'good_rod': name_to_idx.get('Lost Tower', 0),  # After Route 209
        'surf': name_to_idx.get('Route 219', 0),  # After Celestic Town
        'super_rod': name_to_idx.get('Lake Acuity', 0),  # After Snowpoint City
    }
    
    print(f"Method unlock indices: {unlocks}")
    return unlocks

def main():
    print("Loading data...")
    areas, pokemon_list = load_data()
    pokemon_by_name, name_to_dex, dex_to_name = build_evolution_data(pokemon_list)
    
    print(f"Loaded {len(areas)} areas and {len(pokemon_list)} Pokemon")
    
    # Get method unlock indices
    method_unlocks = get_unlock_area_indices(areas)
    
    # Track sourced Pokemon per encounter method
    # Key insight: Pokemon found via surf before you have surf shouldn't count as "sourced"
    # We track separately: walking_sourced, surf_sourced, etc.
    sourced_by_method = {
        'walking': set(),
        'surf': set(),
        'old_rod': set(),
        'good_rod': set(),
        'super_rod': set(),
        'honey_tree': set(),
        'poke_radar': set()
    }
    
    # Combined sourced set for methods player has unlocked
    def get_effective_sourced(area_idx):
        """Get the combined sourced set for methods available at this area."""
        combined = set()
        for method, unlock_idx in method_unlocks.items():
            if area_idx >= unlock_idx:
                combined.update(sourced_by_method[method])
        return combined
    
    output_areas = []
    
    for area_idx, area in enumerate(areas):
        print(f"Processing: {area['area_name']}")
        
        # Calculate optimal time
        optimal_time = calculate_optimal_time(area)
        
        # Process encounters
        processed_encounters = {
            'walking': {
                'morning': [],
                'day': [],
                'night': []
            },
            'surf': [],
            'old_rod': [],
            'good_rod': [],
            'super_rod': [],
            'honey_tree': [],
            'poke_radar': []
        }
        
        # Track which Pokemon to add to sourced after this area (per method)
        newly_sourced_by_method = {m: set() for m in sourced_by_method.keys()}
        
        # Get effective sourced set for this area (only methods unlocked so far)
        effective_sourced = get_effective_sourced(area_idx)
        
        # Process walking encounters (always available)
        walking = area['encounters'].get('walking', {})
        for time_of_day in ['morning', 'day', 'night']:
            for enc in walking.get(time_of_day, []):
                processed = process_encounter(
                    enc, areas, area_idx, pokemon_by_name, effective_sourced, name_to_dex
                )
                processed_encounters['walking'][time_of_day].append(processed)
                
                # Mark for sourcing if catch_count > 0
                if processed['catch_count'] > 0:
                    evo_line = get_full_evolution_line(enc['pokemon'], pokemon_by_name)
                    for name, _ in evo_line:
                        newly_sourced_by_method['walking'].add(name)
        
        # Process other encounter methods
        for method in ['surf', 'old_rod', 'good_rod', 'super_rod', 'honey_tree', 'poke_radar']:
            method_unlocked = area_idx >= method_unlocks[method]
            
            for enc in area['encounters'].get(method, []):
                # Use effective sourced set (only includes methods unlocked so far)
                processed = process_encounter(
                    enc, areas, area_idx, pokemon_by_name, effective_sourced, name_to_dex
                )
                processed_encounters[method].append(processed)
                
                # Only mark as sourced if this method is unlocked
                if processed['catch_count'] > 0 and method_unlocked:
                    evo_line = get_full_evolution_line(enc['pokemon'], pokemon_by_name)
                    for name, _ in evo_line:
                        newly_sourced_by_method[method].add(name)
        
        # Add to output
        output_areas.append({
            'area_name': area['area_name'],
            'optimal_time': optimal_time,
            'encounters': processed_encounters
        })
        
        # Update sourced sets per method
        for method, pokemon_set in newly_sourced_by_method.items():
            sourced_by_method[method].update(pokemon_set)
    
    # Save output
    output = {
        'description': 'Renegade Platinum Living Dex Guide',
        'areas': output_areas
    }
    
    with open('output.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    # Calculate total unique sourced
    all_sourced = set()
    for method_sourced in sourced_by_method.values():
        all_sourced.update(method_sourced)
    
    print(f"\nSaved output.json with {len(output_areas)} areas")
    print(f"Total Pokemon sourced: {len(all_sourced)}")
    print(f"  Walking: {len(sourced_by_method['walking'])}")
    print(f"  Surf: {len(sourced_by_method['surf'])}")
    print(f"  Old Rod: {len(sourced_by_method['old_rod'])}")
    print(f"  Good Rod: {len(sourced_by_method['good_rod'])}")
    print(f"  Super Rod: {len(sourced_by_method['super_rod'])}")
    print(f"  Honey Tree: {len(sourced_by_method['honey_tree'])}")
    print(f"  Poke Radar: {len(sourced_by_method['poke_radar'])}")

if __name__ == "__main__":
    main()

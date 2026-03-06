#!/usr/bin/env python3
"""
Parse the raw encounter data from encounters_raw.txt and output encounters.json
"""

import json
import re

def parse_pokemon_list(text):
    """Parse a line like 'Starly (30%), Bidoof (30%), Pidgey (10%)' into list of dicts."""
    pokemon_list = []
    # Match patterns like "Pokémon (XX%)" or "Pokémon (X%)"
    pattern = r'([A-Za-z♂♀\.\-\'\s]+?)\s*\((\d+)%\)'
    matches = re.findall(pattern, text)
    for name, rate in matches:
        pokemon_list.append({
            "pokemon": name.strip(),
            "rate": int(rate)
        })
    return pokemon_list

def parse_level_range(levels_text):
    """Parse level text like '4 - 5' or '20 - 40' into string."""
    # Clean up and normalize
    levels_text = levels_text.strip()
    # Handle single level like "12"
    if '-' not in levels_text:
        return levels_text
    # Handle range like "4 - 5"
    parts = levels_text.split('-')
    if len(parts) == 2:
        low = parts[0].strip()
        high = parts[1].strip()
        if low == high:
            return low
        return f"{low}-{high}"
    return levels_text

def parse_encounters():
    with open('encounters_raw.txt', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split into sections by the separator line
    sections = re.split(r'={50,}', content)
    
    areas = []
    current_area = None
    
    lines = content.split('\n')
    i = 0
    
    while i < len(lines):
        line = lines[i].strip()
        
        # Skip empty lines and header content
        if not line or line.startswith('o---') or line.startswith('|') or line.startswith('-'):
            i += 1
            continue
        
        # Skip general changes section
        if 'General Changes' in line or 'Area Changes' in line:
            i += 1
            continue
            
        # Check for separator line (marks end of area header)
        if line.startswith('==='):
            i += 1
            continue
        
        # Check for area name and levels line
        # Area names are followed by "Levels:" on the next non-empty line
        if i + 1 < len(lines):
            next_line = lines[i + 1].strip() if i + 1 < len(lines) else ""
            next_next_line = lines[i + 2].strip() if i + 2 < len(lines) else ""
            
            # Check if this is an area header (next line starts with "Levels:" or "Level:" or "Wild Levels:")
            if next_line.startswith('Levels:') or next_line.startswith('Level:') or next_line.startswith('Wild Levels:'):
                # Save previous area
                if current_area:
                    areas.append(current_area)
                
                area_name = line
                levels_line = next_line
                
                # Parse levels
                levels = {}
                # Extract level info: "Levels: 4 - 5 (Walking), 20 - 40 (Surfing)"
                level_match = re.search(r'(?:Levels?|Wild Levels?):\s*(.+)', levels_line)
                if level_match:
                    level_info = level_match.group(1)
                    # Parse each level range
                    # Pattern: "4 - 5 (Walking)" or "20 - 40 (Surfing)" or "12 (Honey Tree)"
                    level_parts = re.findall(r'(\d+(?:\s*-\s*\d+)?)\s*\(([^)]+)\)', level_info)
                    if level_parts:
                        for level_range, encounter_type in level_parts:
                            enc_type_lower = encounter_type.lower().strip()
                            if 'walk' in enc_type_lower:
                                levels['walking'] = parse_level_range(level_range)
                            elif 'surf' in enc_type_lower:
                                levels['surf'] = parse_level_range(level_range)
                            elif 'honey' in enc_type_lower:
                                levels['honey_tree'] = parse_level_range(level_range)
                            else:
                                levels[enc_type_lower] = parse_level_range(level_range)
                    else:
                        # No method specified, just a plain level range like "20 - 22"
                        # Use it as walking level
                        plain_range = re.search(r'(\d+(?:\s*-\s*\d+)?)', level_info)
                        if plain_range:
                            levels['walking'] = parse_level_range(plain_range.group(1))
                
                current_area = {
                    "area_name": area_name,
                    "levels": levels,
                    "encounters": {
                        "walking": {
                            "morning": [],
                            "day": [],
                            "night": []
                        },
                        "surf": [],
                        "old_rod": [],
                        "good_rod": [],
                        "super_rod": [],
                        "honey_tree": [],
                        "poke_radar": []
                    }
                }
                
                i += 3  # Skip area name, levels line, and separator
                continue
        
        # Parse encounter lines
        if current_area:
            # Check for encounter type prefixes
            if line.startswith('Morning'):
                pokemon_text = line[7:].strip()
                pokemon_list = parse_pokemon_list(pokemon_text)
                for p in pokemon_list:
                    p['level_range'] = current_area['levels'].get('walking', '')
                current_area['encounters']['walking']['morning'] = pokemon_list
            
            elif line.startswith('Day'):
                pokemon_text = line[3:].strip()
                pokemon_list = parse_pokemon_list(pokemon_text)
                for p in pokemon_list:
                    p['level_range'] = current_area['levels'].get('walking', '')
                current_area['encounters']['walking']['day'] = pokemon_list
            
            elif line.startswith('Night'):
                pokemon_text = line[5:].strip()
                pokemon_list = parse_pokemon_list(pokemon_text)
                for p in pokemon_list:
                    p['level_range'] = current_area['levels'].get('walking', '')
                current_area['encounters']['walking']['night'] = pokemon_list
            
            elif line.startswith('Surf'):
                pokemon_text = line[4:].strip()
                pokemon_list = parse_pokemon_list(pokemon_text)
                for p in pokemon_list:
                    p['level_range'] = current_area['levels'].get('surf', '20-40')
                current_area['encounters']['surf'] = pokemon_list
            
            elif line.startswith('Old Rod'):
                pokemon_text = line[7:].strip()
                pokemon_list = parse_pokemon_list(pokemon_text)
                for p in pokemon_list:
                    p['level_range'] = '10'  # Fixed level for Old Rod
                current_area['encounters']['old_rod'] = pokemon_list
            
            elif line.startswith('Good Rod'):
                pokemon_text = line[8:].strip()
                pokemon_list = parse_pokemon_list(pokemon_text)
                for p in pokemon_list:
                    p['level_range'] = '25'  # Fixed level for Good Rod
                current_area['encounters']['good_rod'] = pokemon_list
            
            elif line.startswith('Super Rod'):
                pokemon_text = line[9:].strip()
                pokemon_list = parse_pokemon_list(pokemon_text)
                for p in pokemon_list:
                    p['level_range'] = '50'  # Fixed level for Super Rod
                current_area['encounters']['super_rod'] = pokemon_list
            
            elif line.startswith('Honey Tree'):
                pokemon_text = line[10:].strip()
                pokemon_list = parse_pokemon_list(pokemon_text)
                for p in pokemon_list:
                    p['level_range'] = current_area['levels'].get('honey_tree', current_area['levels'].get('honey tree', ''))
                current_area['encounters']['honey_tree'] = pokemon_list
            
            elif line.startswith('Poké Radar'):
                pokemon_text = line[10:].strip()
                if pokemon_text != '-':
                    pokemon_list = parse_pokemon_list(pokemon_text)
                    for p in pokemon_list:
                        p['level_range'] = current_area['levels'].get('walking', '')
                    current_area['encounters']['poke_radar'] = pokemon_list
        
        i += 1
    
    # Don't forget to add the last area
    if current_area:
        areas.append(current_area)
    
    # Clean up areas - remove empty encounter methods
    for area in areas:
        enc = area['encounters']
        # Check if walking has any pokemon
        if not enc['walking']['morning'] and not enc['walking']['day'] and not enc['walking']['night']:
            enc['walking'] = {"morning": [], "day": [], "night": []}
    
    return areas

def main():
    print("Parsing encounter data...")
    areas = parse_encounters()
    
    output = {
        "description": "Renegade Platinum encounter data by area",
        "areas": areas
    }
    
    with open('encounters.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"Saved {len(areas)} areas to encounters.json")
    
    # Print summary
    total_pokemon = set()
    for area in areas:
        for method, data in area['encounters'].items():
            if method == 'walking':
                for time in ['morning', 'day', 'night']:
                    for p in data.get(time, []):
                        total_pokemon.add(p['pokemon'])
            else:
                for p in data:
                    total_pokemon.add(p['pokemon'])
    
    print(f"Total unique Pokémon found: {len(total_pokemon)}")

if __name__ == "__main__":
    main()

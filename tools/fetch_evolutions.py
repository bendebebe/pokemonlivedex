#!/usr/bin/env python3
"""
Fetch evolution data from PokeAPI and apply Renegade Platinum overrides.
Outputs evolutions.json with the modified evolution data.
"""

import json
import time
import urllib.request
import urllib.error

# Renegade Platinum evolution overrides
RP_LEVEL_OVERRIDES = {
    # Level changes
    ("Ponyta", "Rapidash"): {"method": "level", "level": 35},
    ("Slowpoke", "Slowbro"): {"method": "level", "level": 33},
    ("Grimer", "Muk"): {"method": "level", "level": 35},
    ("Rhyhorn", "Rhydon"): {"method": "level", "level": 36},
    ("Kadabra", "Alakazam"): {"method": "level", "level": 36},
    ("Machoke", "Machamp"): {"method": "level", "level": 36},
    ("Graveler", "Golem"): {"method": "level", "level": 36},
    ("Haunter", "Gengar"): {"method": "level", "level": 36},
    ("Aron", "Lairon"): {"method": "level", "level": 24},
    ("Lairon", "Aggron"): {"method": "level", "level": 40},
    ("Meditite", "Medicham"): {"method": "level", "level": 33},
    ("Wailmer", "Wailord"): {"method": "level", "level": 36},
    ("Trapinch", "Vibrava"): {"method": "level", "level": 30},
    ("Baltoy", "Claydol"): {"method": "level", "level": 32},
    ("Shuppet", "Banette"): {"method": "level", "level": 32},
    ("Duskull", "Dusclops"): {"method": "level", "level": 32},
    ("Snorunt", "Glalie"): {"method": "level", "level": 32},
    ("Spheal", "Sealeo"): {"method": "level", "level": 24},
    ("Sealeo", "Walrein"): {"method": "level", "level": 40},
    ("Glameow", "Purugly"): {"method": "level", "level": 32},
    ("Stunky", "Skuntank"): {"method": "level", "level": 32},
    ("Skorupi", "Drapion"): {"method": "level", "level": 30},
    ("Croagunk", "Toxicroak"): {"method": "level", "level": 33},
    ("Slugma", "Magcargo"): {"method": "level", "level": 32},
    
    # Item-based evolutions (use item like a stone)
    ("Onix", "Steelix"): {"method": "item", "item": "Metal Coat"},
    ("Scyther", "Scizor"): {"method": "item", "item": "Metal Coat"},
    ("Electabuzz", "Electivire"): {"method": "item", "item": "Electirizer"},
    ("Magmar", "Magmortar"): {"method": "item", "item": "Magmarizer"},
    ("Porygon", "Porygon2"): {"method": "item", "item": "Up-Grade"},
    ("Porygon2", "Porygon-Z"): {"method": "item", "item": "Dubious Disc"},
    ("Feebas", "Milotic"): {"method": "item", "item": "Prism Scale"},
    ("Dusclops", "Dusknoir"): {"method": "item", "item": "Reaper Cloth"},
    ("Poliwhirl", "Politoed"): {"method": "item", "item": "King's Rock"},
    ("Slowpoke", "Slowking"): {"method": "item", "item": "King's Rock"},
    ("Rhydon", "Rhyperior"): {"method": "item", "item": "Protector"},
    ("Seadra", "Kingdra"): {"method": "item", "item": "Dragon Scale"},
    ("Clamperl", "Huntail"): {"method": "item", "item": "Deep Sea Tooth"},
    ("Clamperl", "Gorebyss"): {"method": "item", "item": "Deep Sea Scale"},
    
    # Happiness-based (no level requirement, time-independent)
    ("Budew", "Roselia"): {"method": "happiness"},
    ("Chingling", "Chimecho"): {"method": "happiness"},
    ("Riolu", "Lucario"): {"method": "happiness"},
    
    # Eevee stone evolutions
    ("Eevee", "Espeon"): {"method": "item", "item": "Sun Stone"},
    ("Eevee", "Umbreon"): {"method": "item", "item": "Moon Stone"},
    ("Eevee", "Leafeon"): {"method": "item", "item": "Leaf Stone"},
    ("Eevee", "Glaceon"): {"method": "item", "item": "Ice Stone"},
    ("Eevee", "Vaporeon"): {"method": "item", "item": "Water Stone"},
    ("Eevee", "Jolteon"): {"method": "item", "item": "Thunder Stone"},
    ("Eevee", "Flareon"): {"method": "item", "item": "Fire Stone"},
}

# Pokemon name mapping (PokeAPI uses lowercase, we want proper case)
def proper_case(name):
    """Convert pokemon name to proper case, handling special cases."""
    special_cases = {
        "nidoran-f": "Nidoran♀",
        "nidoran-m": "Nidoran♂",
        "mr-mime": "Mr. Mime",
        "mime-jr": "Mime Jr.",
        "porygon-z": "Porygon-Z",
        "ho-oh": "Ho-Oh",
    }
    if name in special_cases:
        return special_cases[name]
    return name.replace("-", " ").title().replace(" ", "")


def fetch_json(url, retries=3):
    """Fetch JSON from URL with retries."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'PokemonLiveDex/1.0 (Pokemon Living Dex Tracker)'}
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode())
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            if attempt < retries - 1:
                print(f"  Retry {attempt + 1} for {url}: {e}")
                time.sleep(1)
            else:
                raise
    return None


def get_pokedex_number(species_url):
    """Extract pokedex number from species URL or fetch it."""
    # URL format: https://pokeapi.co/api/v2/pokemon-species/25/
    parts = species_url.rstrip("/").split("/")
    return int(parts[-1])


def parse_evolution_chain(chain, pokemon_data):
    """
    Recursively parse evolution chain and build pokemon data.
    Returns list of all pokemon in this chain.
    """
    species_name = chain["species"]["name"]
    pokedex_num = get_pokedex_number(chain["species"]["url"])
    
    # Skip Pokemon beyond Gen 4 (493)
    if pokedex_num > 493:
        return []
    
    proper_name = proper_case(species_name)
    
    # Initialize pokemon entry if not exists
    if proper_name not in pokemon_data:
        pokemon_data[proper_name] = {
            "pokemon": proper_name,
            "pokedex_number": pokedex_num,
            "evolves_to": []
        }
    
    chain_pokemon = [proper_name]
    
    # Process evolutions
    for evo in chain.get("evolves_to", []):
        evo_species_name = evo["species"]["name"]
        evo_pokedex_num = get_pokedex_number(evo["species"]["url"])
        
        # Skip Pokemon beyond Gen 4
        if evo_pokedex_num > 493:
            continue
            
        evo_proper_name = proper_case(evo_species_name)
        
        # Get evolution details
        evo_details = evo.get("evolution_details", [{}])
        detail = evo_details[0] if evo_details else {}
        
        # Check for Renegade Platinum override
        override_key = (proper_name, evo_proper_name)
        if override_key in RP_LEVEL_OVERRIDES:
            override = RP_LEVEL_OVERRIDES[override_key]
            evo_entry = {
                "pokemon": evo_proper_name,
                "pokedex_number": evo_pokedex_num,
                "method": override["method"]
            }
            if "level" in override:
                evo_entry["level"] = override["level"]
            if "item" in override:
                evo_entry["item"] = override["item"]
        else:
            # Use original evolution data
            trigger = detail.get("trigger", {}).get("name", "unknown")
            evo_entry = {
                "pokemon": evo_proper_name,
                "pokedex_number": evo_pokedex_num,
            }
            
            if trigger == "level-up":
                evo_entry["method"] = "level"
                if detail.get("min_level"):
                    evo_entry["level"] = detail["min_level"]
                elif detail.get("min_happiness"):
                    evo_entry["method"] = "happiness"
                elif detail.get("min_beauty"):
                    evo_entry["method"] = "beauty"
                elif detail.get("known_move"):
                    evo_entry["method"] = "move"
                    evo_entry["move"] = detail["known_move"]["name"]
                elif detail.get("known_move_type"):
                    evo_entry["method"] = "move_type"
                elif detail.get("location"):
                    evo_entry["method"] = "location"
                elif detail.get("time_of_day"):
                    evo_entry["method"] = "happiness"
                    evo_entry["time"] = detail["time_of_day"]
            elif trigger == "trade":
                # In RP, most trades are converted to level or item
                if override_key not in RP_LEVEL_OVERRIDES:
                    evo_entry["method"] = "trade"
                    if detail.get("held_item"):
                        evo_entry["item"] = proper_case(detail["held_item"]["name"])
            elif trigger == "use-item":
                evo_entry["method"] = "item"
                if detail.get("item"):
                    evo_entry["item"] = proper_case(detail["item"]["name"])
            else:
                evo_entry["method"] = trigger
        
        pokemon_data[proper_name]["evolves_to"].append(evo_entry)
        
        # Recursively process further evolutions
        sub_chain = parse_evolution_chain(evo, pokemon_data)
        chain_pokemon.extend(sub_chain)
    
    return chain_pokemon


def add_nincada_special_case(pokemon_data):
    """
    Handle Nincada special case: evolving produces both Ninjask AND Shedinja.
    """
    if "Nincada" in pokemon_data:
        # Check if Shedinja is already there
        has_shedinja = any(e["pokemon"] == "Shedinja" for e in pokemon_data["Nincada"]["evolves_to"])
        if not has_shedinja:
            pokemon_data["Nincada"]["evolves_to"].append({
                "pokemon": "Shedinja",
                "pokedex_number": 292,
                "method": "level",
                "level": 20,
                "special": "simultaneous_with_ninjask"
            })


def main():
    print("Fetching evolution data from PokeAPI...")
    
    pokemon_data = {}
    
    # Fetch all evolution chains (there are about 254 for Gen 1-4)
    # We'll fetch chains 1-270 to be safe
    for chain_id in range(1, 271):
        url = f"https://pokeapi.co/api/v2/evolution-chain/{chain_id}"
        try:
            print(f"Fetching chain {chain_id}...", end=" ")
            data = fetch_json(url)
            
            if data:
                chain_pokemon = parse_evolution_chain(data["chain"], pokemon_data)
                if chain_pokemon:
                    print(f"Found: {', '.join(chain_pokemon[:3])}{'...' if len(chain_pokemon) > 3 else ''}")
                else:
                    print("(Gen 5+ only)")
            else:
                print("No data")
                
        except urllib.error.HTTPError as e:
            if e.code == 404:
                print(f"Chain {chain_id} not found (404)")
            else:
                print(f"Error: {e}")
        except Exception as e:
            print(f"Error: {e}")
        
        # Rate limiting
        time.sleep(0.1)
    
    # Add Nincada special case
    add_nincada_special_case(pokemon_data)
    
    # Convert to list sorted by pokedex number
    pokemon_list = sorted(pokemon_data.values(), key=lambda x: x["pokedex_number"])
    
    # Filter to only Gen 1-4 (1-493)
    pokemon_list = [p for p in pokemon_list if p["pokedex_number"] <= 493]
    
    # Save to JSON
    output = {
        "description": "Pokemon evolution data for Renegade Platinum living dex",
        "pokemon": pokemon_list
    }
    
    print(f"\nAbout to save {len(pokemon_list)} Pokemon...")
    print(f"pokemon_data has {len(pokemon_data)} entries")
    
    output_str = json.dumps(output, indent=2, ensure_ascii=False)
    print(f"JSON string length: {len(output_str)} chars")
    
    with open("evolutions.json", "w", encoding="utf-8") as f:
        bytes_written = f.write(output_str)
        print(f"Wrote {bytes_written} bytes to evolutions.json")
    
    # Verify it was written
    import os
    file_size = os.path.getsize("evolutions.json")
    print(f"File size after write: {file_size} bytes")
    
    print(f"\nSaved {len(pokemon_list)} Pokemon to evolutions.json")
    
    # Print some stats
    evos_count = sum(len(p["evolves_to"]) for p in pokemon_list)
    print(f"Total evolution paths: {evos_count}")


if __name__ == "__main__":
    main()

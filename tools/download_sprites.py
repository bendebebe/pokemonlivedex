#!/usr/bin/env python3
"""
Download Gen 4 sprites (Pokemon 1-493) from PokeAPI GitHub repository.
Saves sprites to sprites/ folder as {pokedex_number}.png
"""

import os
import urllib.request
import urllib.error
import time
import sys

SPRITE_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{}.png"
SPRITES_DIR = "sprites"

def download_sprite(pokedex_num, retries=3):
    """Download a single sprite."""
    url = SPRITE_URL.format(pokedex_num)
    filepath = os.path.join(SPRITES_DIR, f"{pokedex_num}.png")
    
    # Skip if already exists
    if os.path.exists(filepath):
        return True, "exists"
    
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'PokemonLiveDex/1.0'}
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                data = response.read()
                with open(filepath, 'wb') as f:
                    f.write(data)
                return True, "downloaded"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False, "not found"
            if attempt < retries - 1:
                time.sleep(0.5)
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(0.5)
            else:
                return False, str(e)
    
    return False, "failed"

def main():
    # Create sprites directory
    os.makedirs(SPRITES_DIR, exist_ok=True)
    
    print("Downloading Pokemon sprites (1-493)...")
    print(f"Saving to {os.path.abspath(SPRITES_DIR)}/")
    print()
    
    success_count = 0
    skip_count = 0
    fail_count = 0
    
    for i in range(1, 494):
        success, status = download_sprite(i)
        
        if success:
            if status == "exists":
                skip_count += 1
                symbol = "."
            else:
                success_count += 1
                symbol = "+"
        else:
            fail_count += 1
            symbol = "X"
            print(f"\n  Failed #{i}: {status}")
        
        # Progress indicator
        sys.stdout.write(symbol)
        sys.stdout.flush()
        
        # Newline every 50
        if i % 50 == 0:
            print(f" ({i}/493)")
        
        # Small delay to avoid rate limiting
        if status == "downloaded":
            time.sleep(0.05)
    
    print()
    print()
    print(f"Complete!")
    print(f"  Downloaded: {success_count}")
    print(f"  Skipped (already exist): {skip_count}")
    print(f"  Failed: {fail_count}")

if __name__ == "__main__":
    main()

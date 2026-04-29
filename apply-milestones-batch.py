#!/usr/bin/env python3
"""
Batch apply milestones to all anime/manga theme files
"""

import os
import re
import json
import sys

# Add current dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

THEME_DIR = r"e:\Main\server\seaserver\seanime-web\src\lib\theme\anime-themes"

# Master progressions
MASTER_PROGRESSIONS = {
    "naruto": ["Orphaned", "Academy", "Genin", "Chunin Exam", "Chunin", "Jonin", "Anbu", "Kage", "Hokage", "Legendary", "Eternal", "Divine", "Transcendent", "Mythical", "Infinite"],
    "bleach": ["Ghost", "Academy", "Unseated", "Seat", "Vice Captain", "Captain", "Royal Guard", "Soul King", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "one-piece": ["Pirate", "East Blue", "Grand Line", "Shichibukai", "Yonko", "Emperor", "Legend", "Ocean Master", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "dragon-ball-z": ["Martial", "Ki User", "Super", "SSJ", "SSJ2", "SSJ3", "Blue", "Instinct", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "hunter-x-hunter": ["Applicant", "Hunter", "Nen", "Specialist", "Master", "Elite", "Zodiac", "Chairman", "Legend", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "my-hero-academia": ["Quirkless", "Student", "Licensed", "Pro", "Top", "Top 10", "Top 1", "Symbol", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "jujutsu-kaisen": ["Victim", "Student", "Grade 4", "Grade 1", "Special", "Strongest", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "demon-slayer": ["Survivor", "Student", "Swordsman", "Master", "Hashira", "Legend", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "attack-on-titan": ["Orphan", "Cadet", "Scout", "Commander", "Legend", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "black-clover": ["Powerless", "Squad", "Knight", "Leader", "Master", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "fairy-tail": ["Mage", "Guild", "S-Class", "Master", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "sword-art-online": ["Player", "Novice", "Veteran", "Legend", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "death-note": ["Human", "User", "Kira", "God", "Legend", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
    "code-geass": ["Student", "User", "Emperor", "Legend", "Divine", "Eternal", "Transcendent", "Mythical", "Infinite"],
}

def get_progression(theme_name):
    """Get progression for a theme."""
    if theme_name in MASTER_PROGRESSIONS:
        prog = MASTER_PROGRESSIONS[theme_name]
    else:
        prog = ["Generic Rank"]
    
    # Extend to 150 items
    while len(prog) < 150:
        prog = prog + prog
    return prog[:150]

def get_theme_key_from_filename(filename):
    """Convert filename to progression lookup key."""
    # Remove .ts extension and convert to lowercase with hyphens
    theme = filename.replace("-theme.ts", "").lower()
    # Handle special cases
    theme_map = {
        "20th-century-boys": "20th-century-boys",
        "a-silent-voice": "a-silent-voice",
        "abyss": "made-in-abyss",
        "acc-world": "accel-world",
        "bleach": "bleach",
        "naruto": "naruto",
        "one-piece": "one-piece",
        # Add more as needed
    }
    return theme_map.get(theme, theme)

def generate_milestone_block(progression):
    """Generate TypeScript milestone block."""
    lines = []
    for i in range(150):
        level = 1 + int((i * 999) / 149)
        idx = i % len(progression)
        name = progression[idx].replace('"', '\\"')
        lines.append(f'    {level}: "{name}",')
    return "milestoneNames: {\n" + "\n".join(lines) + "\n  },"

def apply_to_file(filepath):
    """Apply milestones to a single theme file."""
    filename = os.path.basename(filepath)
    theme_key = get_theme_key_from_filename(filename)
    
    # Get progression
    if theme_key not in MASTER_PROGRESSIONS:
        # Try with the filename without extension as fallback
        theme_key = filename.replace("-theme.ts", "")
    
    progression = get_progression(theme_key)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"ERROR reading {filename}: {e}")
        return False
    
    # Check if milestoneNames already exists
    has_milestone = 'milestoneNames' in content
    
    milestone_block = generate_milestone_block(progression)
    
    if has_milestone:
        # Replace existing
        pattern = r'milestoneNames:\s*\{[^}]*\},'
        content = re.sub(pattern, milestone_block + ",", content, flags=re.DOTALL)
    else:
        # Add after achievementNames or at end of config
        if 'achievementNames' in content:
            # Add after achievementNames block
            pattern = r'(achievementNames:\s*\{[^}]*\},)'
            replacement = r'\1\n  ' + milestone_block
            content = re.sub(pattern, replacement, content, flags=re.DOTALL)
        else:
            # Add before closing of theme config
            pattern = r'(\n\}\s*as\s+const|;\s*$)'
            replacement = r'\n  ' + milestone_block + r'\1'
            content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    
    # Write back
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[OK] {filename}")
        return True
    except Exception as e:
        print(f"[FAIL] {filename}: {e}")
        return False

def main():
    """Apply milestones to all theme files."""
    print(f"Scanning {THEME_DIR}...\n")
    
    files = []
    if os.path.isdir(THEME_DIR):
        for f in os.listdir(THEME_DIR):
            if f.endswith("-theme.ts"):
                files.append(os.path.join(THEME_DIR, f))
    
    print(f"Found {len(files)} theme files\n")
    
    success = 0
    failed = 0
    
    for filepath in sorted(files):
        if apply_to_file(filepath):
            success += 1
        else:
            failed += 1
    
    print(f"\n\nSummary:")
    print(f"  Successful: {success}")
    print(f"  Failed: {failed}")
    print(f"  Total: {len(files)}")

if __name__ == "__main__":
    main()

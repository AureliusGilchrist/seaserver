#!/usr/bin/env python3
"""
Mass update script: Apply 150 lore-accurate milestones to all anime/manga theme files.
"""
import os
import re
from pathlib import Path
from master_progressions import MASTER_PROGRESSIONS, get_progression, generate_ts_entries

THEME_DIR = r"e:\Main\server\seaserver\seanime-web\src\lib\theme\anime-themes"

def get_all_theme_files():
    """Get all theme TypeScript files."""
    files = []
    for f in os.listdir(THEME_DIR):
        if f.endswith("-theme.ts") and f != "player-icons.tsx":
            theme_name = f.replace("-theme.ts", "")
            files.append((theme_name, os.path.join(THEME_DIR, f)))
    return sorted(files)

def extract_milestone_section(content):
    """Extract existing milestoneNames section boundaries."""
    # Find start of milestoneNames
    start_match = re.search(r'milestoneNames:\s*\{', content)
    if not start_match:
        return None, None, None
    
    start_pos = start_match.start()
    
    # Find matching closing brace (this is tricky - need to count braces)
    brace_count = 0
    in_section = False
    end_pos = None
    
    for i in range(start_match.end(), len(content)):
        if content[i] == '{':
            brace_count += 1
            in_section = True
        elif content[i] == '}':
            brace_count -= 1
            if in_section and brace_count < 0:
                end_pos = i + 1
                break
    
    if end_pos is None:
        return None, None, None
    
    old_content = content[start_pos:end_pos]
    return start_pos, end_pos, old_content

def update_theme_file(theme_name, filepath):
    """Update a single theme file with new milestones."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Get progression for this theme
    progression = get_progression(theme_name)
    new_ts_entries = generate_ts_entries(progression)
    
    # Create new milestoneNames section
    new_section = f"milestoneNames: {{\n{new_ts_entries}\n    }}"
    
    # Find and replace old section
    start_pos, end_pos, old_section = extract_milestone_section(content)
    
    if start_pos is None:
        print(f"  ❌ Could not find milestoneNames in {theme_name}")
        return False
    
    # Replace
    new_content = content[:start_pos] + new_section + content[end_pos:]
    
    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    return True

def main():
    """Update all theme files."""
    theme_files = get_all_theme_files()
    
    print(f"Found {len(theme_files)} theme files")
    print("=" * 70)
    print("UPDATING MILESTONES FOR ALL THEMES")
    print("=" * 70)
    
    success_count = 0
    fail_count = 0
    
    for i, (theme_name, filepath) in enumerate(theme_files, 1):
        # Determine if custom or default
        is_custom = theme_name in MASTER_PROGRESSIONS
        status = "✓" if is_custom else "○"
        
        print(f"[{i:3d}/{len(theme_files)}] {status} {theme_name:30}", end="... ")
        
        try:
            if update_theme_file(theme_name, filepath):
                print("✓ OK")
                success_count += 1
            else:
                print("✗ FAILED")
                fail_count += 1
        except Exception as e:
            print(f"✗ ERROR: {str(e)[:50]}")
            fail_count += 1
    
    print("=" * 70)
    print(f"SUCCESS: {success_count} | FAILED: {fail_count}")
    print(f"Custom progressions: {len(MASTER_PROGRESSIONS)}")
    print(f"Generic progressions: {len(theme_files) - len(MASTER_PROGRESSIONS)}")

if __name__ == "__main__":
    main()

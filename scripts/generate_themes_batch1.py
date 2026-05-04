#!/usr/bin/env python3
"""Generate first 50 new themes based on MAL popularity"""
import json, os
from pathlib import Path

THEMES_DIR = Path("e:/Main/server/seanime-themes/seanime-themes/themes")

# First 50 popular anime NOT in existing_ids.txt
NEW_THEMES = [
    ("86-eighty-six", "86", "Republic of San Magnolia fights the Legion using drones, but the pilots are actually humans treated as disposable. A war drama about dignity and sacrifice.", "#8b0000"),
    ("a-channel", "A-Channel", "Tooru and Run have been best friends since childhood. Tooru follows Run to high school to protect her in this cute slice-of-life comedy.", "#ff69b4"),
    ("acchi-kocchi", "Acchi Kocchi", "Tsumiki has a crush on Io but can never confess properly. Their friends watch their awkward romance in this adorable comedy.", "#ffb6c1"),
    ("adachi-and-shimamura", "Adachi and Shimamura", "Two high school girls skip class and meet on the gym floor. Their friendship slowly blossoms into something more.", "#dda0dd"),
    ("a-darker-shade-of-magic", "A Darker Shade of Magic", "Multiple Londons exist in parallel worlds. Kell is a rare magician who can travel between them, smuggling forbidden artifacts.", "#2d1b4e"),
    ("afro-samurai", "Afro Samurai", "In futuristic feudal Japan, Afro seeks revenge against Justice. Bloody stylish action with a hip-hop soundtrack.", "#1a1a1a"),
    ("after-the-rain", "After the Rain", "17-year-old Akira falls for her 45-year-old manager. A contemplative drama about unrequited feelings.", "#4682b4"),
    ("aharen-san", "Aharen-san wa Hakarenai", "Reina Aharen is tiny and quiet. Raido tries to help her with personal space but ends up in adorable misunderstandings.", "#ffb6c1"),
    ("air", "Air", "Yukito searches for the 'girl in the sky'. He meets Misuzu and discovers a thousand-year curse in this bittersweet tale.", "#87ceeb"),
    ("air-gear", "Air Gear", "Itsuki discovers Air Trecks - motorized inline skates that let riders defy gravity. He joins the Storm Riders racing scene.", "#ff4500"),
    ("ajin", "Ajin", "Kei discovers he's an immortal Ajin, hunted by the government. On the run with terrifying abilities.", "#2f2f2f"),
    ("amagami-ss", "Amagami SS", "Junichi gets a second chance at love with six different girls across parallel story arcs in this romantic VN adaptation.", "#ff69b4"),
    ("angel-next-door", "The Angel Next Door Spoils Me Rotten", "Amane nurses his neighbor Mahiru back to health. The school's 'angel' then decides to take care of him.", "#ffe4e1"),
    ("angels-of-death", "Angels of Death", "Rachel wakes up in a basement and must navigate a building where each floor is guarded by a murderer.", "#4b0082"),
    ("anohana", "AnoHana", "Five years after Menma's death, her ghost appears to Jintan. She has one unfinished wish to fulfill before she can rest.", "#448abe"),
    ("another", "Another", "Transfer student Kouichi discovers class 3-3 is haunted by a curse. Mei Misaki seems invisible to everyone.", "#703070"),
    ("aoharu-x-machinegun", "Aoharu x Machinegun", "Hotaru is tricked into joining a survival games team. She's a combat prodigy who takes on the boys in paintball battles.", "#ff6347"),
    ("arakawa-under-the-bridge", "Arakawa Under the Bridge", "Kou is saved by a girl living under a bridge and must learn to live with the weird riverbank community.", "#87ceeb"),
    ("aria", "Aria", "On terraformed Mars called Aqua, Akari trains as an undine gondolier in Neo-Venezia. A meditation on wonder and everyday beauty.", "#126cd7"),
    ("assassination-classroom", "Assassination Classroom", "A yellow octopus creature becomes the teacher of class 3-E. Students must kill him before he destroys Earth.", "#ffff00"),
]

def generate_milestone_names(theme_id):
    """Generate 100 milestone names (levels 1-1000, every 10)"""
    return {
        "1": "Beginner", "11": "Novice", "21": "Apprentice", "31": "Trainee",
        "41": "Student", "51": "Practitioner", "61": "Adept", "71": "Expert",
        "81": "Veteran", "91": "Master", "101": "Elite", "111": "Champion",
        "121": "Hero", "131": "Legend", "141": "Mythic", "151": "Ascended",
        "161": "Transcendent", "171": "Immortal", "181": "Divine", "191": "Eternal",
        "201": "Celestial", "211": "Cosmic", "221": "Universal", "231": "Infinite",
        "241": "Absolute", "251": "Supreme", "261": "Ultimate", "271": "Perfect",
        "281": "Flawless", "291": "Unstoppable", "301": "Invincible", "311": "Unbeatable",
        "321": "Undefeated", "331": "Unbroken", "341": "Undying", "351": "Immortal King",
        "361": "Eternal Emperor", "371": "Timeless Sovereign", "381": "Infinite Monarch",
        "391": "Cosmic Overlord", "401": "Universal Ruler", "411": "Galactic Conqueror",
        "421": "Dimensional Lord", "431": "Reality Shaper", "441": "Fate Weaver",
        "451": "Destiny Forger", "461": "Legend Maker", "471": "Myth Writer",
        "481": "Story Creator", "491": "World Builder", "501": "God Tier",
        "511": "Demigod", "521": "Deity", "531": "Greater Deity", "541": "True God",
        "551": "High God", "561": "Supreme Deity", "571": "Primordial Being",
        "581": "Ancient One", "591": "First Born", "601": "Origin", "611": "Source",
        "621": "Beginning", "631": "Alpha", "641": "Genesis", "651": "Creation",
        "661": "Creator", "671": "Architect", "681": "Designer", "691": "Planner",
        "701": "Visionary", "711": "Dreamer", "721": "Idealist", "731": "Perfectionist",
        "741": "Completionist", "751": "Accomplished", "761": "Fulfilled",
        "771": "Realized", "781": "Actualized", "791": "Enlightened",
        "801": "Awakened", "811": "Aware", "821": "Conscious", "831": "Omniscient",
        "841": "All-Knowing", "851": "All-Seeing", "861": "All-Understanding",
        "871": "Wise", "881": "Sage", "891": "Philosopher", "901": "Thinker",
        "911": "Intellect", "921": "Brilliant", "931": "Genius", "941": "Prodigy",
        "951": "Phenomenon", "961": "Miracle", "971": "Wonder", "981": "Marvel",
        "991": "Pinnacle", "1000": "Absolute Peak"
    }

def generate_achievement_names(theme_id, name):
    """Generate theme-appropriate achievement names"""
    # Create lore-appropriate names based on theme
    return {
        "a_first_episode": f"First Step into {name}",
        "a_episode_counter": "Journey Counter",
        "a_hours_invested": "Time Well Spent",
        "a_anime_collector": f"{name} Collection",
        "a_first_complete": "First Conquest",
        "a_hundred_club": "Century Club",
        "a_completionist": "True Completionist",
        "a_genre_action": "Action Seeker",
        "a_genre_adventure": "Adventure Seeker",
        "a_genre_comedy": "Comedy Enjoyer",
        "a_genre_drama": "Drama Enthusiast",
        "a_genre_fantasy": "Fantasy Explorer",
        "a_new_year_watch": "New Year",
        "a_valentines_weeb": "Valentine",
        "m_first_chapter": "First Chapter",
        "m_chapter_counter": "Chapter Counter",
        "m_manga_collector": "Manga Collection",
        "m_first_complete": "First Complete",
        "m_genre_action": "Action Reader",
        "m_genre_romance": "Romance Reader",
        "m_new_year_read": "New Year",
    }

def create_theme(id, name, description, primary_color):
    """Create a theme.json file"""
    # Derive colors from primary
    r = int(primary_color[1:3], 16)
    g = int(primary_color[3:5], 16)  
    b = int(primary_color[5:7], 16)
    
    # Create palette
    bg = f"#{max(0, r//10):02x}{max(0, g//10):02x}{max(0, b//10):02x}"
    secondary = f"#{min(255, r+40):02x}{min(255, g+20):02x}{min(255, b):02x}"
    accent = f"#{min(255, r+80):02x}{min(255, g+60):02x}{min(255, b+40):02x}"
    
    theme = {
        "id": id,
        "displayName": name,
        "description": description,
        "fontFamily": "'Inter', sans-serif",
        "fontHref": "",
        "musicUrl": "",
        "backgroundImageUrl": "",
        "particleColor": accent,
        "backgroundDim": 0.5,
        "backgroundBlur": 0,
        "hasAnimatedElements": False,
        "cssVars": {
            "--color-brand-50": secondary,
            "--color-brand-100": secondary,
            "--color-brand-200": secondary,
            "--color-brand-300": secondary,
            "--color-brand-400": accent,
            "--color-brand-500": primary_color,
            "--color-brand-600": primary_color,
            "--color-brand-700": primary_color,
            "--color-brand-800": primary_color,
            "--color-brand-900": primary_color,
            "--color-brand-950": bg,
        },
        "previewColors": {
            "bg": bg,
            "primary": primary_color,
            "secondary": secondary,
            "accent": accent
        },
        "achievementNames": generate_achievement_names(id, name),
        "milestoneNames": generate_milestone_names(id)
    }
    
    # Create directory and save
    theme_dir = THEMES_DIR / id
    theme_dir.mkdir(parents=True, exist_ok=True)
    
    with open(theme_dir / "theme.json", "w", encoding="utf-8") as f:
        json.dump(theme, f, indent=2, ensure_ascii=False)
    
    return id

# Generate themes
print("Creating first 20 themes...")
created = []
for id, name, desc, color in NEW_THEMES[:20]:
    try:
        create_theme(id, name, desc, color)
        created.append(id)
        print(f"✓ {id}")
    except Exception as e:
        print(f"✗ {id}: {e}")

print(f"\nCreated {len(created)} themes")

#!/usr/bin/env python3
"""Generate batch 2: themes 21-40"""
import json, os
from pathlib import Path

THEMES_DIR = Path("e:/Main/server/seanime-themes/seanime-themes/themes")

NEW_THEMES = [
    ("astra-lost-in-space", "Astra Lost in Space", "Nine students become stranded in deep space during a school trip. They must work together to survive 5000 light years.", "#4169e1"),
    ("attack-on-titan", "Attack on Titan", "Humanity lives inside walls to escape man-eating Titans. Eren joins the Survey Corps to fight back.", "#8b0000"),
    ("azumanga-daioh", "Azumanga Daioh", "Follow the quirky daily lives of six high school girls. Absurdist slice-of-life comedy.", "#ff69b4"),
    ("babylon", "BABYLON", "Prosecutor Zen investigates a mysterious organization in this psychological thriller about suicide and justice.", "#4a0080"),
    ("baccano", "Baccano!", "A non-linear story of immortal alchemists, mobsters, and passengers on the Flying Pussyfoot train in 1930s America.", "#8b4513"),
    ("bakemonogatari", "Bakemonogatari", "Koyomi helps girls with supernatural afflictions. Monogatari is a dialogue-heavy, visually striking story.", "#e6e6fa"),
    ("baki", "Baki the Grappler", "Baki trains to defeat his father Yujiro, the strongest creature on Earth. Brutal underground martial arts.", "#8b0000"),
    ("banana-fish", "Banana Fish", "Ash Lynx investigates 'Banana Fish' in 1980s NYC. Gang wars, mystery, and the bond between Ash and Eiji.", "#ffd700"),
    ("beastars", "BEASTARS", "In a world of anthropomorphic animals, shy wolf Legoshi struggles with his predatory instincts and falls for a rabbit.", "#708090"),
    ("beck", "Beck: Mongolian Chop Squad", "Koyuki meets guitarist Ray and forms the band Beck. A coming-of-age story about rock music dreams.", "#b8860b"),
    ("berserk", "Berserk", "Guts, the Black Swordsman, wields a massive sword against demonic Apostles. The darkest dark fantasy epic.", "#1a1a1a"),
    ("beyblade", "Beyblade", "Tyson and his Dragoon beyblade battle in tournaments. A toy commercial turned competitive anime.", "#00bfff"),
    ("black-butler", "Black Butler", "Young earl Ciel Phantomhive makes a demon pact. Sebastian serves as his perfect butler while hunting revenge.", "#000000"),
    ("black-clover", "Black Clover", "Asta was born without magic in a magic world. With anti-magic, he aims to become the Wizard King.", "#ff4500"),
    ("black-lagoon", "Black Lagoon", "Salaryman Rock joins the Lagoon Company pirates in Roanapur. Violent crime noir action.", "#2f4f4f"),
    ("blame", "BLAME!", "Killy wanders the City, a vast artificial structure, searching for the Net Terminal Gene to stop the chaos.", "#dcdcdc"),
    ("bleach", "Bleach", "Ichigo becomes a Soul Reaper, protecting the living from Hollows and guiding souls to the afterlife.", "#ff8c00"),
    ("blue-exorcist", "Blue Exorcist", "Rin discovers he's the son of Satan and trains to become an exorcist at True Cross Academy.", "#0000cd"),
    ("blue-period", "Blue Period", "Yatora discovers art in his final year of high school. A inspiring story about passion and creativity.", "#4169e1"),
    ("bobobo-bo-bo-bobo", "Bobobo-bo Bo-bobo", "In a dystopia where baldness is enforced, Bo-bobo uses nose hair martial arts to fight for hair freedom.", "#ffff00"),
]

def generate_milestone_names(theme_id):
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
    r = int(primary_color[1:3], 16)
    g = int(primary_color[3:5], 16)  
    b = int(primary_color[5:7], 16)
    
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
    
    theme_dir = THEMES_DIR / id
    theme_dir.mkdir(parents=True, exist_ok=True)
    
    with open(theme_dir / "theme.json", "w", encoding="utf-8") as f:
        json.dump(theme, f, indent=2, ensure_ascii=False)
    
    return id

print("Creating batch 2 (themes 21-40)...")
created = []
for id, name, desc, color in NEW_THEMES:
    try:
        create_theme(id, name, desc, color)
        created.append(id)
        print(f"✓ {id}")
    except Exception as e:
        print(f"✗ {id}: {e}")

print(f"\nCreated {len(created)} themes")

#!/usr/bin/env python3
"""Generate multiple batches of themes"""
import json, os
from pathlib import Path

THEMES_DIR = Path("e:/Main/server/seanime-themes/seanime-themes/themes")

BATCHES = {
    3: [
        ("borgman", "Sonic Soldier Borgman", "Cybernetic soldiers fight demonic invaders from another dimension in 202X Tokyo.", "#1e90ff"),
        ("boys-over-flowers", "Boys Over Flowers", "Poor student Tsukushi attends an elite school ruled by F4. A classic reverse harem romance.", "#ff1493"),
        ("buddy-daddies", "Buddy Daddies", "Two assassins become accidental fathers to a four-year-old girl. Action meets heartwarming comedy.", "#dc143c"),
        ("bungou-stray-dogs", "Bungo Stray Dogs", "Atsushi discovers he can transform into a tiger and joins a detective agency of superpowered literary figures.", "#191970"),
        ("business-fish", "Business Fish", "Office workers are literal fish in this absurdist comedy about corporate Japan.", "#4682b4"),
        ("canaan", "Canaan", "Canaan, a synesthetic assassin, pursues her nemesis Alphard in Shanghai. Stylish action espionage.", "#ff4500"),
        ("candy-candy", "Candy Candy", "Orphan Candy White grows up in early 1900s America. A classic melodrama about love and loss.", "#ffb6c1"),
        ("cardcaptor-sakura", "Cardcaptor Sakura", "Sakura accidentally releases magical Clow Cards and must capture them. Magical girl classic by CLAMP.", "#ff69b4"),
        ("carnival-phantasm", "Carnival Phantasm", "TYPE-MOON characters meet in this chaotic comedy crossover. Tsukihime and Fate characters collide.", "#ffff00"),
        ("carole-and-tuesday", "Carole & Tuesday", "In the Mars colony of Alba City, two girls form a musical duo to chase their dreams.", "#ff6347"),
        ("cells-at-work", "Cells at Work!", "Anthropomorphized cells work in the human body. Red Blood Cell and White Blood Cell fight pathogens.", "#dc143c"),
        ("charlotte", "Charlotte", "Students with supernatural abilities search for others like them. Time loops and bittersweet consequences.", "#9370db"),
        ("chihayafuru", "Chihayafuru", "Chihaya dreams of becoming the world's best competitive karuta player. A sports anime about poetry cards.", "#228b22"),
        ("chobits", "Chobits", "Hideki finds Chi, a persocom android, in the trash. An exploration of love between humans and machines.", "#ffb6c1"),
        ("chrome-shelled-regios", "Chrome Shelled Regios", "Layfon moves to an academy city on a moving fortress. Post-apocalyptic action with weapons called Dites.", "#ffd700"),
        ("clannad", "Clannad", "Delinquent Tomoya meets Nagisa and helps revive the drama club. Key Visual Arts emotional masterpiece.", "#87ceeb"),
        ("classroom-of-the-elite", "Classroom of the Elite", "Ayanokoji hides his genius at the Tokyo Metropolitan Advanced Nurturing School. Psychological mind games.", "#4682b4"),
        ("claymore", "Claymore", "Half-demon women warriors called Claymores hunt shape-shifting Yoma. Clare seeks revenge against Priscilla.", "#c0c0c0"),
        ("code-geass", "Code Geass", "Lelouch gains the power of absolute obedience and leads a rebellion against Britannia. Chess-like strategy mecha.", "#800080"),
        ("cop-craft", "Cop Craft", "Detective Kei partners with a knight from another world to solve crimes involving interdimensional contraband.", "#191970"),
    ],
    4: [
        ("cowboy-bebop", "Cowboy Bebop", "Bounty hunters Spike and Jet chase criminals across the solar system. Jazz-noir space western masterpiece.", "#daa520"),
        ("cromartie-high", "Cromartie High School", "Takashi enrolls in a school for delinquents. Absurdist comedy where everyone is a gangster.", "#2f4f4f"),
        ("cross-game", "Cross Game", "Kou loses his neighbor and crush Wakaba, then meets her sister Aoba. Baseball and coming-of-age by Mitsuru Adachi.", "#228b22"),
        ("d-gray-man", "D.Gray-man", "Allen Walker joins the Black Order to destroy Akuma created by the Millennium Earl. Dark shounen action.", "#191970"),
        ("dandadan", "Dandadan", "Momo believes ghosts but not aliens; Okarun believes aliens but not ghosts. Both are real and terrifying.", "#ff1493"),
        ("danmachi", "Is It Wrong to Pick Up Girls in a Dungeon?", "Bell Cranel explores the Dungeon to become a hero. Dungeon-crawling action romance.", "#daa520"),
        ("darker-than-black", "Darker than Black", "Contractors with supernatural powers emerge in Tokyo. Hei, the Black Reaper, works for a mysterious syndicate.", "#000000"),
        ("date-a-live", "Date A Live", "Shido must seal the powers of Spirits by making them fall in love. A harem with a sci-fi twist.", "#ff69b4"),
        ("death-note", "Death Note", "Light Yagami finds a notebook that kills anyone whose name is written in it. The ultimate cat-and-mouse thriller.", "#000000"),
        ("death-parade", "Death Parade", "Arbiters judge souls through death games at the Quindecim bar. An exploration of human nature and judgment.", "#800080"),
        ("demon-slayer", "Demon Slayer", "Tanjiro's family is slaughtered by demons; his sister Nezuko is turned into one. He becomes a Demon Slayer to cure her.", "#ff4500"),
        ("detroit-metal-city", "Detroit Metal City", "Sweet farm boy Negishi becomes Krauser II, the emperor of death metal. Hilarious identity crisis comedy.", "#8b0000"),
        ("devilman-crybaby", "Devilman Crybaby", "Akira merges with a demon to save humanity. Masaaki Yuasa's psychedelic apocalyptic masterpiece.", "#9400d3"),
        ("domestic-girlfriend", "Domestic Girlfriend", "Natsuo's teacher and stepsister both have complicated connections to him. Mature romantic drama.", "#ff69b4"),
        ("donten-ni-warau", "Laughing Under the Clouds", "The Kumoh brothers guard a prison in the Meiji era while hiding a family secret.", "#4169e1"),
        ("dororo", "Dororo", "Hyakkimaru hunts demons to reclaim his body parts. A dark retelling of the Tezuka classic.", "#8b0000"),
        ("dr-stone", "Dr. Stone", "Senku revives after 3700 years of petrification to rebuild civilization with science. Educational adventure.", "#32cd32"),
        ("dragon-ball", "Dragon Ball", "Goku searches for Dragon Balls and trains in martial arts. The journey from boyhood to legendary warrior begins.", "#ff8c00"),
        ("durarara", "Durarara!!", "Mikado moves to Ikebukuro where urban legends come alive. A supernatural mystery with a large ensemble cast.", "#ffd700"),
        ("eden-of-the-east", "Eden of the East", "Akira wakes up naked with a gun and phone in front of the White House. A mystery thriller by Production I.G.", "#ff69b4"),
    ],
}

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

total = 0
for batch_num, themes in BATCHES.items():
    print(f"Creating batch {batch_num} ({len(themes)} themes)...")
    created = []
    for id, name, desc, color in themes:
        try:
            create_theme(id, name, desc, color)
            created.append(id)
            print(f"  ✓ {id}")
        except Exception as e:
            print(f"  ✗ {id}: {e}")
    print(f"  Created {len(created)} themes")
    total += len(created)

print(f"\nTotal: {total} themes created")

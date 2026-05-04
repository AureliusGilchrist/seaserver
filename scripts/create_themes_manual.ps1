# Create multiple theme directories with complete theme.json content - BATCH 3 (themes 41-80)
$themes = @(
    @("ghost-hound", "Ghost Hound", "Three boys with traumatic pasts can enter the Unseen World. Psychological mystery from the creators of Serial Experiments Lain.", "#4b0082"),
    @("ghost-hunt", "Ghost Hunt", "Mai joins Shibuya Psychic Research to investigate paranormal cases. Atmospheric horror mystery.", "#2f4f4f"),
    @("giant-killing", "Giant Killing", "Takeshi coaches East Tokyo United against his former club. Realistic soccer anime about underdogs.", "#228b22"),
    @("girls-last-tour", "Girls' Last Tour", "Chito and Yuuri explore the ruins of civilization in a kettenkrad. Melancholic post-apocalyptic slice-of-life.", "#808080"),
    @("gj-bu", "GJ-bu", "Kyouya joins the Good Job Club, a club for doing odd jobs. Cute comedy with distinct character quirks.", "#ff69b4"),
    @("golden-kamuy", "Golden Kamuy", "Sugimoto searches for Ainu gold in Hokkaido, racing against other factions. Historical action with survival elements.", "#daa520"),
    @("golgo-13", "Golgo 13", "The legendary assassin Duke Togo takes impossible hits. Professional, stoic, and always completes the job.", "#1a1a1a"),
    @("gosick", "Gosick", "Kazuya meets Victorique, a genius loli detective, in 1924 Saubure. Gothic mystery romance.", "#ffd700"),
    @("great-pretender", "Great Pretender", "Con artist Makoto joins Laurent's team for elaborate international heists. Stylish crime caper by Wit Studio.", "#ff4500"),
    @("gugure-kokkuri-san", "Gugure! Kokkuri-san", "Kohina summons Kokkuri-san, a fox spirit, to haunt her doll-like existence. Comedy about a lonely girl.", "#ff8c00"),
    @("gunbuster", "Gunbuster", "Noriko trains to pilot the Gunbuster mech against space monsters. Classic Gainax sci-fi with time dilation.", "#4169e1"),
    @("gundam-00", "Mobile Suit Gundam 00", "Celestial Being uses Gundams to end war through armed interventions. Real Robot mecha with political intrigue.", "#00bfff"),
    @("gundam-seed", "Mobile Suit Gundam SEED", "Kira pilots the Strike Gundam in the war between Naturals and Coordinators. Classic Gundam series.", "#4169e1"),
    @("gundam-unicorn", "Mobile Suit Gundam Unicorn", "Banagher pilots the Unicorn Gundam, key to Laplace's Box. High-quality OVA with Universal Century lore.", "#ffffff"),
    @("gundam-wing", "Mobile Suit Gundam Wing", "Five Gundam pilots fight for colony independence from Earth. Political mecha with iconic designs.", "#2e8b57"),
    @("guyver", "Guyver: The Bio-Boosted Armor", "Sho bonds with the Guyver unit and fights the Chronos Corporation. Body horror meets superhero action.", "#2f4f4f"),
    @("hachimitsu-to-clover", "Honey and Clover", "Art students navigate love, friendship, and finding themselves. Bittersweet josei classic by Chica Umino.", "#ff6347"),
    @("hadigirl", "Hadi Girl", "Saku can see spirits and helps them move on. Gentle supernatural slice-of-life.", "#ffb6c1"),
    @("haganai", "Boku wa Tomodachi ga Sukunai", "Kodaka forms the Neighbors Club to make friends. Socially awkward comedy about friendship.", "#ff69b4"),
    @("haiyore-nyaruko-san", "Nyarko-san: Another Crawling Chaos", "Nyarlathotep from Cthulhu Mythos appears as a silver-haired girl to protect Mahiro. Lovecraftian comedy.", "#c0c0c0")
)

foreach ($theme in $themes) {
    $id = $theme[0]
    $name = $theme[1]
    $desc = $theme[2]
    $color = $theme[3]
    
    # Calculate colors
    $r = [Convert]::ToInt32($color.Substring(1,2), 16)
    $g = [Convert]::ToInt32($color.Substring(3,2), 16)
    $b = [Convert]::ToInt32($color.Substring(5,2), 16)
    
    $bg = "#{0:x2}{1:x2}{2:x2}" -f [Math]::Max(0, $r/10), [Math]::Max(0, $g/10), [Math]::Max(0, $b/10)
    $secondary = "#{0:x2}{1:x2}{2:x2}" -f [Math]::Min(255, $r+40), [Math]::Min(255, $g+20), [Math]::Min(255, $b)
    $accent = "#{0:x2}{1:x2}{2:x2}" -f [Math]::Min(255, $r+80), [Math]::Min(255, $g+60), [Math]::Min(255, $b+40)
    
    $dir = "e:\Main\server\seanime-themes\seanime-themes\themes\$id"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    
    $json = @"
{
  "id": "$id",
  "displayName": "$name",
  "description": "$desc",
  "fontFamily": "'Inter', sans-serif",
  "fontHref": "",
  "musicUrl": "",
  "backgroundImageUrl": "",
  "particleColor": "$accent",
  "backgroundDim": 0.5,
  "backgroundBlur": 0,
  "hasAnimatedElements": false,
  "cssVars": {
    "--color-brand-50": "$secondary",
    "--color-brand-100": "$secondary",
    "--color-brand-200": "$secondary",
    "--color-brand-300": "$secondary",
    "--color-brand-400": "$accent",
    "--color-brand-500": "$color",
    "--color-brand-600": "$color",
    "--color-brand-700": "$color",
    "--color-brand-800": "$color",
    "--color-brand-900": "$color",
    "--color-brand-950": "$bg"
  },
  "previewColors": {
    "bg": "$bg",
    "primary": "$color",
    "secondary": "$secondary",
    "accent": "$accent"
  },
  "achievementNames": {
    "a_first_episode": "First Step into $name",
    "a_episode_counter": "Journey Counter",
    "a_hours_invested": "Time Well Spent",
    "a_anime_collector": "$name Collection",
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
    "m_new_year_read": "New Year"
  },
  "milestoneNames": {
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
}
"@
    
    $json | Out-File -FilePath "$dir\theme.json" -Encoding utf8
    Write-Host "Created $id"
}

Write-Host "Done!"

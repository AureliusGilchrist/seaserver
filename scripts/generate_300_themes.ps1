# Generate 300 new anime/manga themes for seanime-themes
# Based on MAL popularity, excluding existing themes

$themesDir = "e:/Main/server/seanime-themes/seanime-themes/themes"
$indexFile = "e:/Main/server/seanime-themes/seanime-themes/index.json"

# Read existing themes
$existing = Get-Content "e:/Main/server/seanime-themes/seanime-themes/existing_ids.txt"

# 300 new themes data: (id, name, description, color1, color2, color3)
$newThemes = @(
    # 1-25
    @("86-eighty-six", "86", "The Republic of San Magnolia fights the Legion using drones, but the pilots are actually humans treated as disposable. A heartbreaking war drama about dignity, sacrifice, and what it means to be human.", "#1a1a2e", "#4a4a6a", "#d4af37"),
    @("a-channel", "A-Channel", "Tooru and Run have been best friends since childhood. When Run enters high school, Tooru follows to protect her, meeting new friends and navigating daily school life comedy.", "#ffc0cb", "#ff69b4", "#fffacd"),
    @("a-darker-shade-of-magic", "A Darker Shade of Magic", "Multiple Londons exist in parallel worlds with different magic levels. Kell is a rare magician who can travel between them, smuggling forbidden artifacts across the boundaries.", "#2d1b4e", "#8b0000", "#c0c0c0"),
    @("absolute-duo", "Absolute Duo", "Tooru Kokonoe enters Koryo Academy to gain power after losing someone precious. Students here wield Blaze, manifested weapons from their souls, in a school of superpowered combat.", "#191970", "#ff4500", "#87ceeb"),
    @("acchi-kocchi", "Acchi Kocchi", "Tsumiki Miniwa has a crush on Io Otonashi but can never confess properly. Their friends watch their awkward romance with amusement in this adorable slice-of-life comedy.", "#ffb6c1", "#87ceeb", "#fffacd"),
    @("ace-attorney", "Ace Attorney", "Rookie defense attorney Phoenix Wright takes on impossible cases, exposing contradictions with cries of 'Objection!' Courtroom drama filled with memorable characters and absurd logic.", "#4169e1", "#8b4513", "#ffd700"),
    @("adachi-and-shimamura", "Adachi and Shimamura", "Two high school girls skip class and meet on the second floor of the gymnasium. Their friendship slowly blossoms into something more in this gentle yuri romance.", "#e6e6fa", "#dda0dd", "#98fb98"),
    @("aesthetica-of-a-rogue-hero", "Aesthetica of a Rogue Hero", "Akatsuki Ousawa returns from a fantasy world with the demon king's daughter in tow. Now enrolled in a school for interdimensional returnees, he lives by his own rules.", "#2f2f4f", "#cd5c5c", "#ffd700"),
    @("afro-samurai", "Afro Samurai", "In a futuristic feudal Japan, Afro seeks revenge against Justice, the gunman who killed his father and took the Number One headband. Bloody stylish action with a hip-hop soundtrack.", "#1a1a1a", "#8b0000", "#ffd700"),
    @("after-the-rain", "After the Rain", "17-year-old high school girl Akira Tachibana falls for her 45-year-old manager at the family restaurant. A contemplative drama about unrequited feelings and finding oneself.", "#4682b4", "#708090", "#d3d3d3"),
    @("aharen-san", "Aharen-san wa Hakarenai", "Reina Aharen is tiny, quiet, and sits too close. Raido tries to help her with personal space but ends up in adorable misunderstandings. A comedy about communication and closeness.", "#ffb6c1", "#87cefa", "#ffffe0"),
    @("ainz-ooal-gown", "Ainz Ooal Gown", "Suzuki Satoru is trapped in Yggdrasil as his skeletal lich character Momonga, now Ainz Ooal Gown. He conquers the New World as the supreme overlord of Nazarick.", "#191970", "#800080", "#ffd700"),
    @("air", "Air", "Yukito Kunisaki is a traveling performer searching for the 'girl in the sky' from his mother's story. In a small seaside town, he meets Misuzu and discovers a thousand-year curse.", "#87ceeb", "#fffacd", "#ffb6c1"),
    @("air-gear", "Air Gear", "Minami Itsuki discovers Air Trecks, motorized inline skates that let riders defy gravity. He joins the Storm Riders underground scene, racing toward the top.", "#ff4500", "#1e90ff", "#ffff00"),
    @("ajin", "Ajin", "Kei Nagai discovers he's an Ajin, an immortal demi-human hunted by the government. On the run with terrifying abilities, he faces the cruel experiments of those who would control his kind.", "#2f2f2f", "#8b0000", "#696969"),
    @("akaneiro-ni-somaru-saka", "Akane Iro ni Somaru Saka", "Yuuhi Katagiri transfers schools and meets Junichi Nagase, a delinquent who helped her. A romantic comedy with dramatic twists and multiple endings.", "#dc143c", "#ffd700", "#ff6347"),
    @("akb0048", "AKB0048", "In a future where entertainment is banned, idol group AKB48 continues as AKB0048, guerrilla idols who fight for the right to perform with microphone-sabers and mecha.", "#ff69b4", "#87ceeb", "#ffd700"),
    @("akiba-maid-war", "Akiba Maid War", "Nagomi Wahira joins a maid cafe in Akihabara, only to discover the maid industry is a brutal world of turf wars and violence. Stylish yakuza drama meets moe aesthetics.", "#ff1493", "#c71585", "#ffd700"),
    @("akibas-trip", "Akiba's Trip", "Tamotsu Denkigai fights vampire-like creatures in Akihabara by stripping them to expose them to sunlight. A bizarre action game adaptation full of otaku culture.", "#ff69b4", "#00ced1", "#ffd700"),
    @("akikan", "Akikan!", "Kakeru Daichi buys a melon soda that transforms into a girl. Other 'Akikan' girls appear from steel and aluminum cans, competing to determine which container type is superior.", "#32cd32", "#ff6347", "#ffd700"),
    @("aldnoah-zero", "Aldnoah.Zero", "Earth is invaded by Vers Empire from Mars using advanced Aldnoah technology. Inaho Kaizuka uses tactical genius to fight seemingly invincible Martian Knights.", "#1e3a5f", "#c41e3a", "#ffd700"),
    @("alice-in-borderland", "Alice in Borderland", "Arisu and friends are transported to an emptied Tokyo where they must play deadly games to survive. A psychological thriller about will to live.", "#8b0000", "#2f2f2f", "#ff4500"),
    @("alien-nine", "Alien Nine", "Yuri Otani is forced to join the Alien Party, wearing a symbiotic Borg creature to capture invasive aliens at her elementary school. Disturbing coming-of-age horror.", "#ffb6c1", "#90ee90", "#ff69b4"),
    @("all-out", "All Out!!", "Kenji Gion joins his high school rugby team despite being small. A realistic sports anime about positionless players finding their strength in a team.", "#2e8b57", "#ffffff", "#191970"),
    @("amagami-ss", "Amagami SS", "Junichi Tachibana had his heart broken two years ago. Now in high school, he gets a second chance at love with six different girls across parallel story arcs.", "#ff69b4", "#87ceeb", "#ffd700")
)

# Function to generate milestone names (100 ranks, every 10 levels)
function Get-MilestoneNames {
    $names = @{
        "1" = "Beginner"
        "11" = "Novice"
        "21" = "Apprentice"
        "31" = "Trainee"
        "41" = "Student"
        "51" = "Practitioner"
        "61" = "Adept"
        "71" = "Expert"
        "81" = "Veteran"
        "91" = "Master"
        "101" = "Elite"
        "111" = "Champion"
        "121" = "Hero"
        "131" = "Legend"
        "141" = "Mythic"
        "151" = "Ascended"
        "161" = "Transcendent"
        "171" = "Immortal"
        "181" = "Divine"
        "191" = "Eternal"
        "201" = "Celestial"
        "211" = "Cosmic"
        "221" = "Universal"
        "231" = "Infinite"
        "241" = "Absolute"
        "251" = "Supreme"
        "261" = "Ultimate"
        "271" = "Perfect"
        "281" = "Flawless"
        "291" = "Unstoppable"
        "301" = "Invincible"
        "311" = "Unbeatable"
        "321" = "Undefeated"
        "331" = "Unbroken"
        "341" = "Undying"
        "351" = "Immortal King"
        "361" = "Eternal Emperor"
        "371" = "Timeless Sovereign"
        "381" = "Infinite Monarch"
        "391" = "Cosmic Overlord"
        "401" = "Universal Ruler"
        "411" = "Galactic Conqueror"
        "421" = "Dimensional Lord"
        "431" = "Reality Shaper"
        "441" = "Fate Weaver"
        "451" = "Destiny Forger"
        "461" = "Legend Maker"
        "471" = "Myth Writer"
        "481" = "Story Creator"
        "491" = "World Builder"
        "501" = "God Tier"
        "511" = "Demigod"
        "521" = "Deity"
        "531" = "Greater Deity"
        "541" = "True God"
        "551" = "High God"
        "561" = "Supreme Deity"
        "571" = "Primordial Being"
        "581" = "Ancient One"
        "591" = "First Born"
        "601" = "Origin"
        "611" = "Source"
        "621" = "Beginning"
        "631" = "Alpha"
        "641" = "Genesis"
        "651" = "Creation"
        "661" = "Creator"
        "671" = "Architect"
        "681" = "Designer"
        "691" = "Planner"
        "701" = "Visionary"
        "711" = "Dreamer"
        "721" = "Idealist"
        "731" = "Perfectionist"
        "741" = "Completionist"
        "751" = "Accomplished"
        "761" = "Fulfilled"
        "771" = "Realized"
        "781" = "Actualized"
        "791" = "Enlightened"
        "801" = "Awakened"
        "811" = "Aware"
        "821" = "Conscious"
        "831" = "Omniscient"
        "841" = "All-Knowing"
        "851" = "All-Seeing"
        "861" = "All-Understanding"
        "871" = "Wise"
        "881" = "Sage"
        "891" = "Philosopher"
        "901" = "Thinker"
        "911" = "Intellect"
        "921" = "Brilliant"
        "931" = "Genius"
        "941" = "Prodigy"
        "951" = "Phenomenon"
        "961" = "Miracle"
        "971" = "Wonder"
        "981" = "Marvel"
        "991" = "Pinnacle"
        "1000" = "Absolute Peak"
    }
    return $names
}

# Function to generate achievement names
function Get-AchievementNames {
    return @{
        a_anime_complete = "Anime Completionist"
        a_manga_complete = "Manga Completionist"
        a_first_watch = "First Watch"
        a_first_read = "First Read"
        a_ten_anime = "Ten Anime Milestone"
        a_ten_manga = "Ten Manga Milestone"
        a_fifty_anime = "Fifty Anime Milestone"
        a_fifty_manga = "Fifty Manga Milestone"
        a_hundred_anime = "Century of Anime"
        a_hundred_manga = "Century of Manga"
        a_five_hundred_anime = "Five Hundred Anime"
        a_five_hundred_manga = "Five Hundred Manga"
        a_thousand_anime = "Thousand Anime Master"
        a_thousand_manga = "Thousand Manga Master"
        a_episode_watcher = "Episode Collector"
        a_chapter_reader = "Chapter Collector"
        a_movie_watcher = "Movie Buff"
        a_ova_watcher = "OVA Collector"
        a_special_watcher = "Special Collector"
        a_ona_watcher = "ONA Collector"
        a_tv_watcher = "Series Watcher"
        a_binge_watcher = "Binge Watcher"
        a_speed_reader = "Speed Reader"
        a_slow_reader = "Slow and Steady"
        a_rewatcher = "Rewatch Enthusiast"
        a_rereader = "Rereader"
        a_platinum = "Platinum Achiever"
        a_gold = "Gold Achiever"
        a_silver = "Silver Achiever"
        a_bronze = "Bronze Achiever"
        a_diverse_genre = "Genre Explorer"
        a_diverse_studio = "Studio Explorer"
        a_diverse_year = "Time Traveler"
        a_diverse_format = "Format Explorer"
        a_diverse_source = "Source Material Explorer"
        a_diverse_rating = "Rating Explorer"
        a_high_rated = "High Standards"
        a_low_rated = "Patience of Saints"
        a_recent = "Modern Consumer"
        a_classic = "Classic Enjoyer"
        a_seasonal = "Seasonal Watcher"
        a_airing = "Airing Follower"
        a_backlog_clearer = "Backlog Destroyer"
        a_completionist = "True Completionist"
        a_perfectionist = "Perfectionist"
        a_critic = "Critic"
        a_reviewer = "Reviewer"
        a_rater = "Rater"
        a_list_maker = "List Maker"
        a_planner = "Planner"
        a_tracker = "Tracker"
        a_stats_watcher = "Stats Watcher"
        a_achievement_hunter = "Achievement Hunter"
        m_episodes_1 = "First Episode"
        m_episodes_50 = "50 Episodes"
        m_episodes_100 = "100 Episodes"
        m_episodes_500 = "500 Episodes"
        m_episodes_1000 = "1000 Episodes"
        m_episodes_5000 = "5000 Episodes"
        m_episodes_10000 = "10000 Episodes"
        m_chapters_1 = "First Chapter"
        m_chapters_50 = "50 Chapters"
        m_chapters_100 = "100 Chapters"
        m_chapters_500 = "500 Chapters"
        m_chapters_1000 = "1000 Chapters"
        m_chapters_5000 = "5000 Chapters"
        m_chapters_10000 = "10000 Chapters"
        m_volumes_1 = "First Volume"
        m_volumes_10 = "10 Volumes"
        m_volumes_50 = "50 Volumes"
        m_volumes_100 = "100 Volumes"
        m_volumes_500 = "500 Volumes"
        m_movies_1 = "First Movie"
        m_movies_10 = "10 Movies"
        m_movies_50 = "50 Movies"
        m_movies_100 = "100 Movies"
        m_specials_1 = "First Special"
        m_specials_10 = "10 Specials"
        m_specials_50 = "50 Specials"
        m_ova_1 = "First OVA"
        m_ova_10 = "10 OVAs"
        m_ova_50 = "50 OVAs"
        m_ona_1 = "First ONA"
        m_ona_10 = "10 ONAs"
        m_ona_50 = "50 ONAs"
    }
}

# Function to create theme JSON
function Create-ThemeJson($id, $name, $description, $color1, $color2, $color3) {
    $milestoneNames = Get-MilestoneNames
    $achievementNames = Get-AchievementNames
    
    $theme = @{
        id = $id
        displayName = $name
        description = $description
        fontFamily = "'Inter', sans-serif"
        fontHref = ""
        musicUrl = ""
        backgroundImageUrl = ""
        particleColor = $color3
        backgroundDim = 0.5
        backgroundBlur = 0
        hasAnimatedElements = $false
        cssVars = @{
            "--color-brand-50" = $color2
            "--color-brand-100" = $color2
            "--color-brand-200" = $color2
            "--color-brand-300" = $color2
            "--color-brand-400" = $color3
            "--color-brand-500" = $color2
            "--color-brand-600" = $color1
            "--color-brand-700" = $color1
            "--color-brand-800" = $color1
            "--color-brand-900" = $color1
            "--color-brand-950" = $color1
        }
        previewColors = @{
            bg = $color1
            primary = $color2
            secondary = $color2
            accent = $color3
        }
        achievementNames = $achievementNames
        milestoneNames = $milestoneNames
    }
    
    return $theme | ConvertTo-Json -Depth 10
}

# Generate first batch of 25 themes
Write-Host "Generating first 25 themes..."
for ($i = 0; $i -lt [Math]::Min(25, $newThemes.Count); $i++) {
    $theme = $newThemes[$i]
    $themeId = $theme[0]
    $themeName = $theme[1]
    $themeDesc = $theme[2]
    $color1 = $theme[3]
    $color2 = $theme[4]
    $color3 = $theme[5]
    
    if ($existing -contains $themeId) {
        Write-Host "Skipping existing theme: $themeId"
        continue
    }
    
    $themeDir = Join-Path $themesDir $themeId
    if (!(Test-Path $themeDir)) {
        New-Item -ItemType Directory -Path $themeDir -Force | Out-Null
    }
    
    $json = Create-ThemeJson $themeId $themeName $themeDesc $color1 $color2 $color3
    $jsonPath = Join-Path $themeDir "theme.json"
    $json | Set-Content -Path $jsonPath -Encoding UTF8
    
    Write-Host "Created theme: $themeId"
}

Write-Host "First batch complete!"

export type EasterEggTrigger =
    | "konami"
    | "type-sequence"
    | "click-count"
    | "time-of-day"
    | "date"
    | "scroll-to-bottom"
    | "idle"
    | "manual"
    | "milestone"
    | "page-visit"
    | "feature"

export interface EasterEggDefinition {
    id: string
    name: string
    description: string
    xp: number
    trigger: EasterEggTrigger
    // trigger-specific config
    sequence?: string[]      // for konami / type-sequence
    target?: string          // CSS selector for click-count
    clickCount?: number      // for click-count
    idleSeconds?: number     // for idle
    hour?: number            // for time-of-day (0–23)
    dayOfWeek?: number       // 0=Sun…6=Sat, optional filter for time-of-day
    month?: number           // for date (1-based)
    day?: number             // for date
    hint: string
    icon: string
    // milestone config
    milestoneKey?: string    // e.g. "animeCount", "episodesWatched", "level", "totalXP"
    milestoneValue?: number  // the threshold
    // page-visit config
    pagePath?: string        // prefix match on pathname
}

// ─────────────────────────────────────────────────────────────────────────────
// KONAMI
// ─────────────────────────────────────────────────────────────────────────────
const KONAMI_EGGS: EasterEggDefinition[] = [
    { id: "konami-code", name: "Konami Code", description: "You remembered the classic code.", xp: 100, trigger: "konami", sequence: ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"], hint: "↑↑↓↓←→←→BA", icon: "🕹️" },
]

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD SEQUENCES
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_EGGS: EasterEggDefinition[] = [
    { id: "type-seanime",       name: "Say My Name",               description: "Typed the app's name.",                               xp: 60,  trigger: "type-sequence", sequence: ["s","e","a","n","i","m","e"],                           hint: "Just type what you see.",                          icon: "🌊" },
    { id: "type-yare-yare",     name: "Yare Yare Daze",            description: "What a pain…",                                        xp: 80,  trigger: "type-sequence", sequence: ["y","a","r","e","y","a","r","e"],                      hint: "The world-weary phrase from JoJo.",                icon: "😤" },
    { id: "type-plus-ultra",    name: "Plus Ultra!",                description: "Go beyond your limits!",                              xp: 80,  trigger: "type-sequence", sequence: ["p","l","u","s","u","l","t","r","a"],                  hint: "The battle cry of U.A. heroes.",                   icon: "💥" },
    { id: "type-dattebayo",     name: "Believe It!",                description: "Dattebayo!",                                          xp: 80,  trigger: "type-sequence", sequence: ["d","a","t","t","e","b","a","y","o"],                  hint: "Naruto's signature phrase.",                       icon: "🍜" },
    { id: "type-gomu-gomu",     name: "Gomu Gomu no Mi",            description: "I'm gonna be King of the Pirates!",                   xp: 80,  trigger: "type-sequence", sequence: ["g","o","m","u","g","o","m","u"],                     hint: "The Devil Fruit of the Straw Hat captain.",        icon: "🏴‍☠️" },
    { id: "type-nani",          name: "NANI?!",                     description: "Wh-what?!",                                           xp: 40,  trigger: "type-sequence", sequence: ["n","a","n","i"],                                      hint: "A very expressive Japanese word.",                 icon: "😱" },
    { id: "type-omae-wa",       name: "Omae Wa Mou…",               description: "You are already dead.",                               xp: 90,  trigger: "type-sequence", sequence: ["o","m","a","e","w","a"],                              hint: "Kenshiro's iconic line from HnK.",                 icon: "💀" },
    { id: "type-isekai",        name: "Truck-kun",                  description: "Isekai protagonist found!",                           xp: 55,  trigger: "type-sequence", sequence: ["i","s","e","k","a","i"],                              hint: "Another world awaits.",                            icon: "🚛" },
    { id: "type-naruto",        name: "Believe It",                 description: "The ninja legend.",                                   xp: 50,  trigger: "type-sequence", sequence: ["n","a","r","u","t","o"],                              hint: "Name of the Hidden Leaf's greatest ninja.",        icon: "🍃" },
    { id: "type-ichigo",        name: "Soul Reaper",                description: "Zangetsu!",                                           xp: 55,  trigger: "type-sequence", sequence: ["i","c","h","i","g","o"],                              hint: "The substitute Soul Reaper's name.",               icon: "⚔️" },
    { id: "type-luffy",         name: "Gomu Gomu Pistol",           description: "I'm gonna be King of the Pirates!",                   xp: 55,  trigger: "type-sequence", sequence: ["l","u","f","f","y"],                                  hint: "The Straw Hat captain's name.",                    icon: "⚓" },
    { id: "type-goku",          name: "Kakarot",                    description: "It's over 9000!",                                     xp: 60,  trigger: "type-sequence", sequence: ["g","o","k","u"],                                      hint: "The Saiyan hero's name.",                          icon: "🐉" },
    { id: "type-vegeta",        name: "Prince of Saiyans",          description: "It's over 9000!",                                     xp: 60,  trigger: "type-sequence", sequence: ["v","e","g","e","t","a"],                              hint: "The proud Saiyan prince.",                         icon: "👑" },
    { id: "type-sukuna",        name: "Ryomen Sukuna",              description: "Malevolent Shrine!",                                  xp: 90,  trigger: "type-sequence", sequence: ["s","u","k","u","n","a"],                              hint: "The King of Curses.",                              icon: "👹" },
    { id: "type-gojo",          name: "Infinity",                   description: "Throughout Heaven and Earth, I Alone Am The Honored One.", xp: 100, trigger: "type-sequence", sequence: ["g","o","j","o"],                               hint: "The strongest jujutsu sorcerer.",                  icon: "🔵" },
    { id: "type-levi",          name: "Humanity's Strongest",       description: "Captain Levi Ackerman.",                              xp: 70,  trigger: "type-sequence", sequence: ["l","e","v","i"],                                      hint: "The captain of the Survey Corps.",                 icon: "⚙️" },
    { id: "type-eren",          name: "Rumbling",                   description: "I will protect my people.",                           xp: 70,  trigger: "type-sequence", sequence: ["e","r","e","n"],                                      hint: "The Attack Titan's wielder.",                      icon: "🌊" },
    { id: "type-tanjiro",       name: "Water Breathing",            description: "First Form: Water Surface Slash.",                    xp: 65,  trigger: "type-sequence", sequence: ["t","a","n","j","i","r","o"],                          hint: "The demon slayer with a scar on his forehead.",    icon: "💧" },
    { id: "type-zenitsu",       name: "Thunderclap and Flash",      description: "Godspeed!",                                           xp: 65,  trigger: "type-sequence", sequence: ["z","e","n","i","t","s","u"],                          hint: "The cowardly but lightning-fast demon slayer.",    icon: "⚡" },
    { id: "type-inosuke",       name: "Beast Breathing",            description: "YAAH!",                                               xp: 60,  trigger: "type-sequence", sequence: ["i","n","o","s","u","k","e"],                          hint: "The boar-headed demon slayer.",                    icon: "🐗" },
    { id: "type-deku",          name: "One For All",                description: "Smash!",                                              xp: 65,  trigger: "type-sequence", sequence: ["d","e","k","u"],                                      hint: "The symbol of hope's hero name.",                  icon: "💪" },
    { id: "type-bakugo",        name: "Explosion!",                 description: "I'll win. That's... what heroes do.",                 xp: 65,  trigger: "type-sequence", sequence: ["b","a","k","u","g","o"],                              hint: "The explosive hero.",                              icon: "💢" },
    { id: "type-edward",        name: "State Alchemist",            description: "Don't call me short.",                                xp: 70,  trigger: "type-sequence", sequence: ["e","d","w","a","r","d"],                              hint: "The Fullmetal Alchemist himself.",                 icon: "⚗️" },
    { id: "type-alphonse",      name: "Truth",                      description: "A human's heart.",                                    xp: 70,  trigger: "type-sequence", sequence: ["a","l","p","h","o","n","s","e"],                      hint: "Ed's gentle younger brother.",                     icon: "🛡️" },
    { id: "type-gon",           name: "Rock, Scissors, Paper!",     description: "I'll pass the Hunter Exam!",                         xp: 65,  trigger: "type-sequence", sequence: ["g","o","n"],                                          hint: "The boy from Whale Island.",                       icon: "🎣" },
    { id: "type-killua",        name: "Godspeed",                   description: "Yo, I'm Killua.",                                     xp: 70,  trigger: "type-sequence", sequence: ["k","i","l","l","u","a"],                              hint: "The assassin's prodigy.",                          icon: "⚡" },
    { id: "type-light",         name: "I Am Justice",               description: "I'll create a perfect world.",                        xp: 85,  trigger: "type-sequence", sequence: ["l","i","g","h","t"],                                  hint: "The Death Note's first owner.",                    icon: "📓" },
    { id: "type-ryuk",          name: "Shinigami",                  description: "Humans are so interesting.",                          xp: 80,  trigger: "type-sequence", sequence: ["r","y","u","k"],                                      hint: "The bored shinigami who dropped his notebook.",    icon: "🍎" },
    { id: "type-asta",          name: "No Magic No Problem",        description: "I'll be the Magic Emperor!",                         xp: 65,  trigger: "type-sequence", sequence: ["a","s","t","a"],                                      hint: "The loudest mage in Black Clover.",                icon: "🍀" },
    { id: "type-yuno",          name: "Wind Spirit",                description: "By the Wind Spirit's power!",                        xp: 65,  trigger: "type-sequence", sequence: ["y","u","n","o"],                                      hint: "Asta's rival from the same village.",              icon: "🌪️" },
    { id: "type-natsu",         name: "Fairy Tail!",                description: "I'll burn it all!",                                  xp: 60,  trigger: "type-sequence", sequence: ["n","a","t","s","u"],                                  hint: "The Salamander of Fairy Tail.",                    icon: "🔥" },
    { id: "type-erza",          name: "Titania",                    description: "I don't need words, I'll slash them away!",          xp: 70,  trigger: "type-sequence", sequence: ["e","r","z","a"],                                      hint: "The queen of fairies.",                            icon: "⚔️" },
    { id: "type-gray",          name: "Ice-Make",                   description: "Ice-Make: Hammer!",                                  xp: 60,  trigger: "type-sequence", sequence: ["g","r","a","y"],                                      hint: "The ice-make mage who loses his clothes.",         icon: "🧊" },
    { id: "type-kirito",        name: "Dual Wielder",               description: "I'll clear this game.",                              xp: 60,  trigger: "type-sequence", sequence: ["k","i","r","i","t","o"],                              hint: "The black swordsman of SAO.",                      icon: "⚔️" },
    { id: "type-asuna",         name: "Flash",                      description: "You can't beat me in speed.",                        xp: 60,  trigger: "type-sequence", sequence: ["a","s","u","n","a"],                                  hint: "The Flash of the Knights of Blood.",               icon: "⚡" },
    { id: "type-mob",           name: "100%",                       description: "???%",                                                xp: 75,  trigger: "type-sequence", sequence: ["m","o","b"],                                          hint: "Shigeo Kageyama's nickname.",                      icon: "💯" },
    { id: "type-saitama",       name: "One Punch",                  description: "OK.",                                                 xp: 100, trigger: "type-sequence", sequence: ["s","a","i","t","a","m","a"],                          hint: "The strongest hero... who's just a hobby.",       icon: "👊" },
    { id: "type-senku",         name: "10 Billion Percent",         description: "This is exhilarating!",                              xp: 75,  trigger: "type-sequence", sequence: ["s","e","n","k","u"],                                  hint: "The scientific genius of Dr. Stone.",              icon: "🧪" },
    { id: "type-spike",         name: "Cowboy Bebop",               description: "Whatever happens, happens.",                         xp: 70,  trigger: "type-sequence", sequence: ["s","p","i","k","e"],                                  hint: "The bounty hunter with the lazy eye.",             icon: "🚀" },
    { id: "type-gintoki",       name: "Natural Perm",               description: "I'm Gintoki Sakata. You might know me.",             xp: 75,  trigger: "type-sequence", sequence: ["g","i","n","t","o","k","i"],                          hint: "The white demon of the Joui War.",                 icon: "🍓" },
    { id: "type-onepunch",      name: "OK",                         description: "He only needs one punch.",                           xp: 80,  trigger: "type-sequence", sequence: ["o","n","e","p","u","n","c","h"],                      hint: "Not the hero name, the technique.",                icon: "🥊" },
    { id: "type-fullcowl",      name: "Full Cowl",                  description: "20 percent!",                                        xp: 70,  trigger: "type-sequence", sequence: ["f","u","l","l","c","o","w","l"],                      hint: "Deku's power distribution technique.",            icon: "💚" },
    { id: "type-bankai",        name: "BANKAI!",                    description: "Tensa Zangetsu!",                                    xp: 90,  trigger: "type-sequence", sequence: ["b","a","n","k","a","i"],                              hint: "The final release of a Soul Reaper's zanpakuto.",  icon: "⚫" },
    { id: "type-kamehameha",    name: "Kamehameha!",                description: "KA-ME-HA-ME-HA!!",                                   xp: 90,  trigger: "type-sequence", sequence: ["k","a","m","e","h","a","m","e","h","a"],              hint: "The signature ki blast.",                          icon: "💫" },
    { id: "type-rasengan",      name: "Rasengan!",                  description: "Spinning chakra sphere.",                            xp: 80,  trigger: "type-sequence", sequence: ["r","a","s","e","n","g","a","n"],                      hint: "The Fourth Hokage's original jutsu.",              icon: "🌀" },
    { id: "type-shannaro",      name: "Shannaro!",                  description: "SHANNARO!",                                          xp: 60,  trigger: "type-sequence", sequence: ["s","h","a","n","n","a","r","o"],                      hint: "Sakura's battle cry.",                             icon: "👊" },
    { id: "type-byakugan",      name: "Byakugan",                   description: "I can see everything.",                              xp: 75,  trigger: "type-sequence", sequence: ["b","y","a","k","u","g","a","n"],                      hint: "The all-seeing Hyuga eye.",                        icon: "👁️" },
    { id: "type-rinnengan",     name: "Rinnegan",                   description: "The eyes of the Sage of Six Paths.",                 xp: 95,  trigger: "type-sequence", sequence: ["r","i","n","n","e","g","a","n"],                      hint: "The legendary dojutsu above the Sharingan.",      icon: "🟣" },
    { id: "type-zanpakuto",     name: "Zanpakuto",                  description: "Speak its name.",                                    xp: 70,  trigger: "type-sequence", sequence: ["z","a","n","p","a","k","u","t","o"],                  hint: "The soul-cutting sword.",                          icon: "🗡️" },
    { id: "type-hollowmask",    name: "Hollow Mask",                description: "Getsuga Tensho!",                                    xp: 80,  trigger: "type-sequence", sequence: ["h","o","l","l","o","w"],                              hint: "The inner hollow manifested.",                     icon: "😶" },
    { id: "type-haki",          name: "Conqueror's Haki",           description: "A will that tames the world.",                       xp: 85,  trigger: "type-sequence", sequence: ["h","a","k","i"],                                      hint: "The invisible power in One Piece.",                icon: "👊" },
    { id: "type-onepiece",      name: "Roger's Legacy",             description: "One Piece... is real!",                              xp: 95,  trigger: "type-sequence", sequence: ["o","n","e","p","i","e","c","e"],                      hint: "The treasure at the end of the Grand Line.",      icon: "🏴‍☠️" },
    { id: "type-freedomsong",   name: "Wings of Freedom",           description: "If you lose, you die. If you win, you live.",        xp: 75,  trigger: "type-sequence", sequence: ["f","r","e","e","d","o","m"],                          hint: "What the Survey Corps fights for.",                icon: "🦅" },
    { id: "type-akatsuki",      name: "Akatsuki",                   description: "Ring the dawn.",                                     xp: 70,  trigger: "type-sequence", sequence: ["a","k","a","t","s","u","k","i"],                      hint: "The red cloud organization.",                      icon: "🌧️" },
    { id: "type-jutsu",         name: "Hand Signs",                 description: "Tiger. Dog. Ox. Rabbit. Snake.",                     xp: 55,  trigger: "type-sequence", sequence: ["j","u","t","s","u"],                                  hint: "The techniques used by ninja.",                    icon: "🤙" },
    { id: "type-nen",           name: "Nen",                        description: "Gyo!",                                               xp: 75,  trigger: "type-sequence", sequence: ["n","e","n"],                                          hint: "The life energy in Hunter x Hunter.",              icon: "✨" },
    { id: "type-transmute",     name: "Clap and Transmute",         description: "All is one, one is all.",                            xp: 75,  trigger: "type-sequence", sequence: ["t","r","a","n","s","m","u","t","e"],                  hint: "The core of alchemy.",                             icon: "🔄" },
    { id: "type-requiem",       name: "Requiem",                    description: "Gold Experience Requiem!",                           xp: 85,  trigger: "type-sequence", sequence: ["r","e","q","u","i","e","m"],                          hint: "Giorno's ultimate Stand.",                         icon: "🌹" },
    { id: "type-zawarudo",      name: "Za Warudo",                  description: "THE WORLD!",                                         xp: 90,  trigger: "type-sequence", sequence: ["z","a","w","o","r","u","l","d","o"],                  hint: "DIO's time-stopping Stand.",                       icon: "🌍" },
    { id: "type-diomuda",       name: "MUDA MUDA MUDA",             description: "USELESS! USELESS!",                                  xp: 80,  trigger: "type-sequence", sequence: ["m","u","d","a","m","u","d","a"],                      hint: "DIO's signature barrage.",                         icon: "✋" },
    { id: "type-oraoraora",     name: "ORA ORA ORA",                description: "Star Platinum!",                                     xp: 80,  trigger: "type-sequence", sequence: ["o","r","a","o","r","a"],                              hint: "Jotaro's Stand barrage.",                          icon: "⭐" },
    { id: "type-chuunibyou",    name: "Dark Flame Master",          description: "The wicked eye awakens.",                            xp: 60,  trigger: "type-sequence", sequence: ["c","h","u","u","n","i"],                              hint: "The middle school syndrome.",                      icon: "🔥" },
    { id: "type-waifu",         name: "Waifu Declared",             description: "She is the best character. No arguments.",           xp: 50,  trigger: "type-sequence", sequence: ["w","a","i","f","u"],                                  hint: "The highest honor in anime culture.",              icon: "💝" },
    { id: "type-husbando",      name: "Husbando Declared",          description: "He is the best character. No arguments.",            xp: 50,  trigger: "type-sequence", sequence: ["h","u","s","b","a","n","d","o"],                      hint: "The male equivalent of waifu.",                    icon: "💝" },
    { id: "type-nakama",        name: "The Power of Nakama",        description: "Bonds are the true treasure.",                       xp: 70,  trigger: "type-sequence", sequence: ["n","a","k","a","m","a"],                              hint: "The word for companions/friends.",                 icon: "🤝" },
    { id: "type-korosensei",    name: "Nuruhuhuhu",                 description: "Graduation is near.",                                xp: 70,  trigger: "type-sequence", sequence: ["k","o","r","o","s","e","n","s","e","i"],              hint: "The impossible teacher of 3-E.",                  icon: "🌊" },
    { id: "type-geass",         name: "Obey My Command!",           description: "Geass granted.",                                     xp: 90,  trigger: "type-sequence", sequence: ["g","e","a","s","s"],                                  hint: "Lelouch's power of absolute obedience.",           icon: "👁️" },
    { id: "type-anime",         name: "So Meta",                    description: "Typed the medium itself.",                           xp: 30,  trigger: "type-sequence", sequence: ["a","n","i","m","e"],                                  hint: "The thing this app is all about.",                 icon: "📺" },
    { id: "type-manga",         name: "Paper Power",                description: "The source material.",                               xp: 30,  trigger: "type-sequence", sequence: ["m","a","n","g","a"],                                  hint: "The black and white pages that started it all.",  icon: "📚" },
    { id: "type-otaku",         name: "Self-Aware",                 description: "You know what you are.",                             xp: 40,  trigger: "type-sequence", sequence: ["o","t","a","k","u"],                                  hint: "The word for the most devoted fans.",              icon: "🤓" },
    { id: "type-kawaii",        name: "So Cute!",                   description: "すごくかわいい！",                                     xp: 35,  trigger: "type-sequence", sequence: ["k","a","w","a","i","i"],                              hint: "The word that explains most of anime.",            icon: "✨" },
    { id: "type-sugoi",         name: "Sugoi!",                     description: "Amazing!",                                           xp: 35,  trigger: "type-sequence", sequence: ["s","u","g","o","i"],                                  hint: "The word for 'amazing' or 'great'.",               icon: "⭐" },
    { id: "type-senpai",        name: "Notice Me",                  description: "Senpai noticed you!",                                xp: 45,  trigger: "type-sequence", sequence: ["s","e","n","p","a","i"],                              hint: "The upperclassman you need to impress.",           icon: "🎀" },
    { id: "type-desu",          name: "Desu Desu",                  description: "It is what it is. (Desu.)",                          xp: 35,  trigger: "type-sequence", sequence: ["d","e","s","u"],                                      hint: "The famous Japanese copula.",                      icon: "🎎" },
    { id: "type-konnichiwa",    name: "Konnichiwa!",                description: "Hello from Japan!",                                  xp: 30,  trigger: "type-sequence", sequence: ["k","o","n","n","i","c","h","i","w","a"],              hint: "The afternoon greeting.",                          icon: "🌸" },
    { id: "type-ohayou",        name: "Ohayou Gozaimasu!",          description: "Good morning!",                                      xp: 25,  trigger: "type-sequence", sequence: ["o","h","a","y","o","u"],                              hint: "The morning greeting.",                            icon: "🌅" },
    { id: "type-arigatou",      name: "Arigatou!",                  description: "Thank you!",                                         xp: 25,  trigger: "type-sequence", sequence: ["a","r","i","g","a","t","o","u"],                      hint: "The word for 'thank you'.",                        icon: "🙏" },
    { id: "type-samurai",       name: "Bushido",                    description: "The way of the warrior.",                            xp: 65,  trigger: "type-sequence", sequence: ["s","a","m","u","r","a","i"],                          hint: "Japan's iconic warriors.",                         icon: "⛩️" },
    { id: "type-shinobi",       name: "Shadow Arts",                description: "Art of the ninja.",                                  xp: 65,  trigger: "type-sequence", sequence: ["s","h","i","n","o","b","i"],                          hint: "The shadow warriors.",                             icon: "🥷" },
    { id: "type-sakura",        name: "Cherry Blossom",             description: "Fleeting beauty.",                                   xp: 40,  trigger: "type-sequence", sequence: ["s","a","k","u","r","a"],                              hint: "Japan's most famous flower AND a character name.", icon: "🌸" },
    { id: "type-ramen",         name: "Ichiraku Ramen",             description: "Best ramen in the village.",                         xp: 35,  trigger: "type-sequence", sequence: ["r","a","m","e","n"],                                  hint: "Naruto's favorite food.",                          icon: "🍜" },
    { id: "type-shonen",        name: "Shonen Spirit",              description: "Friendship, hard work, victory.",                    xp: 45,  trigger: "type-sequence", sequence: ["s","h","o","n","e","n"],                              hint: "The genre that defined a generation.",             icon: "👊" },
    { id: "type-seinen",        name: "Mature Themes",              description: "The adult demographic.",                             xp: 45,  trigger: "type-sequence", sequence: ["s","e","i","n","e","n"],                              hint: "The demographic aimed at adult men.",              icon: "📖" },
    { id: "type-shoujo",        name: "Shoujo Power",               description: "The heart of the story.",                            xp: 45,  trigger: "type-sequence", sequence: ["s","h","o","u","j","o"],                              hint: "The demographic aimed at young girls.",            icon: "🌹" },
    { id: "type-josei",         name: "Josei Hearts",               description: "Mature romance.",                                    xp: 45,  trigger: "type-sequence", sequence: ["j","o","s","e","i"],                                  hint: "The demographic aimed at adult women.",            icon: "🌷" },
    { id: "type-mecha",         name: "Mecha Pilot",                description: "GET IN THE ROBOT!",                                  xp: 55,  trigger: "type-sequence", sequence: ["m","e","c","h","a"],                                  hint: "The robot genre.",                                 icon: "🤖" },
    { id: "type-ova",           name: "Bonus Content",              description: "Original Video Animation.",                          xp: 35,  trigger: "type-sequence", sequence: ["o","v","a"],                                          hint: "Direct-to-video anime releases.",                  icon: "📼" },
    { id: "type-kimetsu",       name: "Kimetsu no Yaiba",           description: "Blade of demon destruction.",                        xp: 65,  trigger: "type-sequence", sequence: ["k","i","m","e","t","s","u"],                          hint: "The Japanese title of Demon Slayer.",              icon: "🔥" },
    { id: "type-jojo",          name: "It's a JoJo Reference",      description: "Your next line is...",                               xp: 80,  trigger: "type-sequence", sequence: ["j","o","j","o"],                                      hint: "Araki's legendary manga series.",                  icon: "👉" },
    { id: "type-pokemon",       name: "Gotta Catch 'Em All",        description: "You are now a Pokemon Trainer.",                     xp: 50,  trigger: "type-sequence", sequence: ["p","o","k","e","m","o","n"],                          hint: "The most famous monster-catching franchise.",     icon: "⚡" },
    { id: "type-digimon",       name: "Digimon Are the Champions",  description: "Digimon: Digital Monsters!",                         xp: 50,  trigger: "type-sequence", sequence: ["d","i","g","i","m","o","n"],                          hint: "The other monster franchise.",                     icon: "💾" },
    { id: "type-evangelion",    name: "Don't Run Away",             description: "You can (not) redo.",                                xp: 85,  trigger: "type-sequence", sequence: ["e","v","a","n","g","e","l","i","o","n"],              hint: "Hideaki Anno's legendary mecha series.",          icon: "🔴" },
    { id: "type-ayanami",       name: "Rei Ayanami",                description: "I am not your doll.",                                xp: 70,  trigger: "type-sequence", sequence: ["a","y","a","n","a","m","i"],                          hint: "The First Child's surname.",                       icon: "🔵" },
    { id: "type-asuka",         name: "Anta Baka?!",                description: "Are you stupid?!",                                   xp: 70,  trigger: "type-sequence", sequence: ["a","s","u","k","a"],                                  hint: "The Second Child's name.",                         icon: "🔴" },
    { id: "type-haruhi",        name: "SOS Brigade",                description: "I'm looking for aliens!",                           xp: 65,  trigger: "type-sequence", sequence: ["h","a","r","u","h","i"],                              hint: "The brigade leader's name.",                       icon: "⭐" },
    { id: "type-clannad",       name: "Dango Daikazoku",            description: "Dango Dango Dango...",                               xp: 75,  trigger: "type-sequence", sequence: ["c","l","a","n","n","a","d"],                          hint: "The VN and Anime that destroyed millions.",        icon: "🍡" },
    { id: "type-steins",        name: "El Psy Kongroo",             description: "It is I, Hououin Kyouma!",                          xp: 85,  trigger: "type-sequence", sequence: ["s","t","e","i","n","s"],                              hint: "The time-traveling scientist's series.",           icon: "🧪" },
    { id: "type-rezero",        name: "Return by Death",            description: "I will keep coming back.",                          xp: 80,  trigger: "type-sequence", sequence: ["r","e","z","e","r","o"],                              hint: "Subaru's loop ability.",                           icon: "🔄" },
    { id: "type-emilia",        name: "Half-Elf",                   description: "Please remember me.",                               xp: 65,  trigger: "type-sequence", sequence: ["e","m","i","l","i","a"],                              hint: "The silver-haired half-elf.",                      icon: "🌿" },
    { id: "type-rem",           name: "I Love Rem",                 description: "Rem will always choose you.",                        xp: 70,  trigger: "type-sequence", sequence: ["r","e","m"],                                          hint: "The blue-haired demon maid.",                      icon: "💙" },
    { id: "type-overlord",      name: "Ainz Ooal Gown",            description: "All hail the Supreme Being.",                        xp: 75,  trigger: "type-sequence", sequence: ["o","v","e","r","l","o","r","d"],                      hint: "The skeleton overlord's series.",                  icon: "💀" },
    { id: "type-rimuru",        name: "That Time I Reincarnated",   description: "Rimuru Tempest!",                                    xp: 65,  trigger: "type-sequence", sequence: ["r","i","m","u","r","u"],                              hint: "The slime who became a demon lord.",               icon: "💧" },
    { id: "type-konosuba",      name: "Kazuma Kazuma!",             description: "Explosion!",                                         xp: 65,  trigger: "type-sequence", sequence: ["k","o","n","o","s","u","b","a"],                      hint: "The isekai comedy.",                               icon: "💥" },
    { id: "type-naofumi",       name: "Rise of the Shield Hero",    description: "Naofumi Iwatani, the Shield Hero.",                  xp: 65,  trigger: "type-sequence", sequence: ["n","a","o","f","u","m","i"],                          hint: "The betrayed hero of the shield.",                 icon: "🛡️" },
    { id: "type-noragami",      name: "Stray God",                  description: "I am Yato, the god of calamity.",                    xp: 70,  trigger: "type-sequence", sequence: ["n","o","r","a","g","a","m","i"],                      hint: "The obscure god at 5 yen a wish.",                 icon: "⛩️" },
    { id: "type-vinland",       name: "True Warrior",               description: "A true warrior needs no sword.",                     xp: 80,  trigger: "type-sequence", sequence: ["v","i","n","l","a","n","d"],                          hint: "The Viking epic by Makoto Yukimura.",              icon: "⚓" },
    { id: "type-berserk",       name: "The Black Swordsman",        description: "I sacrifice.",                                       xp: 90,  trigger: "type-sequence", sequence: ["b","e","r","s","e","r","k"],                          hint: "Guts's legendary dark fantasy.",                   icon: "⚫" },
    { id: "type-vagabond",      name: "Musashi",                    description: "The Way of the Sword.",                              xp: 80,  trigger: "type-sequence", sequence: ["v","a","g","a","b","o","n","d"],                      hint: "Inoue's masterpiece about Miyamoto Musashi.",      icon: "⚔️" },
    { id: "type-frieren",       name: "Stark of the North",         description: "Frieren: Beyond Journey's End.",                     xp: 75,  trigger: "type-sequence", sequence: ["f","r","i","e","r","e","n"],                          hint: "The elven mage who outlives everyone.",            icon: "✨" },
    { id: "type-dandadan",      name: "Dandadan",                   description: "OkaRun!",                                            xp: 65,  trigger: "type-sequence", sequence: ["d","a","n","d","a","d","a","n"],                      hint: "The chaotic supernatural romance.",                icon: "👻" },
    { id: "type-chainsaw",      name: "Public Safety Devil",        description: "Pochita…",                                           xp: 85,  trigger: "type-sequence", sequence: ["c","h","a","i","n","s","a","w"],                      hint: "Denji's partner and his devil form.",              icon: "⛓️" },
    { id: "type-anya",          name: "Mission: Forger",            description: "Anya: heh!",                                         xp: 65,  trigger: "type-sequence", sequence: ["a","n","y","a"],                                      hint: "The telepath who just wants a family.",            icon: "🥜" },
    { id: "type-bocchi",        name: "Bocchi the Rock!",           description: "Guitarhero!",                                        xp: 65,  trigger: "type-sequence", sequence: ["b","o","c","c","h","i"],                              hint: "The anxious guitarist.",                           icon: "🎸" },
    { id: "type-haikyuu",       name: "The View From The Top",      description: "There are no 'kings' in volleyball!",               xp: 70,  trigger: "type-sequence", sequence: ["h","a","i","k","y","u","u"],                          hint: "The volleyball anime.",                            icon: "🏐" },
    { id: "type-toradora",      name: "Taiga",                      description: "Palmtop Tiger!",                                     xp: 65,  trigger: "type-sequence", sequence: ["t","o","r","a","d","o","r","a"],                      hint: "The love story with the tiny tiger.",              icon: "🐯" },
    { id: "type-kaguya",        name: "Shuchiin Academy",           description: "I will not confess.",                                xp: 65,  trigger: "type-sequence", sequence: ["k","a","g","u","y","a"],                              hint: "The schemer of love.",                             icon: "💝" },
    { id: "type-violet",        name: "Violet Evergarden",          description: "I want to know what love means.",                    xp: 80,  trigger: "type-sequence", sequence: ["v","i","o","l","e","t"],                              hint: "The Auto Memory Doll.",                            icon: "📝" },
    { id: "type-chihiro",       name: "Spirited Away",              description: "Sen... to Chihiro.",                                 xp: 75,  trigger: "type-sequence", sequence: ["c","h","i","h","i","r","o"],                          hint: "The girl who got a job at a bathhouse.",          icon: "♨️" },
    { id: "type-kiki",          name: "Kiki's Delivery",            description: "I deliver.",                                         xp: 65,  trigger: "type-sequence", sequence: ["k","i","k","i"],                                      hint: "The witch and her delivery service.",              icon: "🧹" },
    { id: "type-fma",           name: "Fullmetal",                  description: "Brotherhood.",                                       xp: 70,  trigger: "type-sequence", sequence: ["f","u","l","l","m","e","t","a","l"],                  hint: "The adjective before the title.",                  icon: "⚙️" },
    { id: "type-ymir",          name: "Ymir Fritz",                 description: "The first Titan.",                                   xp: 75,  trigger: "type-sequence", sequence: ["y","m","i","r"],                                      hint: "The Founder's name.",                              icon: "🔗" },
    { id: "type-mikasa",        name: "Mikasa Ackerman",            description: "The last Ackerman.",                                 xp: 65,  trigger: "type-sequence", sequence: ["m","i","k","a","s","a"],                              hint: "The most loyal soldier.",                          icon: "🧣" },
    { id: "type-historia",      name: "True Queen",                 description: "Historia Reiss.",                                    xp: 65,  trigger: "type-sequence", sequence: ["h","i","s","t","o","r","i","a"],                      hint: "The true queen of the Walls.",                     icon: "👸" },
    { id: "type-hunter",        name: "Hunter Exam",                description: "Gon! Let's go!",                                    xp: 60,  trigger: "type-sequence", sequence: ["h","u","n","t","e","r"],                              hint: "The H in HxH.",                                    icon: "🎯" },
    { id: "type-phantom",       name: "Phantom Troupe",             description: "A spider with no legs still scares.",               xp: 80,  trigger: "type-sequence", sequence: ["p","h","a","n","t","o","m"],                          hint: "The group of thieves who feared nothing.",         icon: "🕷️" },
]

// ─────────────────────────────────────────────────────────────────────────────
// CLICK COUNT
// ─────────────────────────────────────────────────────────────────────────────
const CLICK_EGGS: EasterEggDefinition[] = [
    { id: "click-logo-10",   name: "Curious Clicker",   description: "Clicked the logo 10 times.",          xp: 50,  trigger: "click-count", target: "[data-easter-egg='logo']",        clickCount: 10,  hint: "What happens if you click the logo a lot?", icon: "🖱️" },
    { id: "click-logo-30",   name: "Obsessive Clicker", description: "Clicked the logo 30 times. Ok?",      xp: 75,  trigger: "click-count", target: "[data-easter-egg='logo']",        clickCount: 30,  hint: "30 times. Really.",                         icon: "🔁" },
    { id: "click-logo-100",  name: "Logo Enthusiast",   description: "100 logo clicks. Impressive.",        xp: 120, trigger: "click-count", target: "[data-easter-egg='logo']",        clickCount: 100, hint: "Why? Why not.",                             icon: "💯" },
    { id: "avatar-click-10", name: "Mirror Mirror",     description: "Clicked your own avatar 10 times.",  xp: 60,  trigger: "click-count", target: "[data-easter-egg='user-avatar']", clickCount: 10,  hint: "You're your own biggest fan.",              icon: "🪞" },
    { id: "avatar-click-50", name: "True Narcissist",   description: "Clicked your avatar 50 times.",      xp: 90,  trigger: "click-count", target: "[data-easter-egg='user-avatar']", clickCount: 50,  hint: "No shame.",                                 icon: "😍" },
]

// ─────────────────────────────────────────────────────────────────────────────
// DATE-BASED — Holidays + Anime premiere/character birthdays
// ─────────────────────────────────────────────────────────────────────────────
const DATE_EGGS: EasterEggDefinition[] = [
    { id: "new-year-visit",       name: "Happy New Year!",         description: "Ringing in the new year with anime.",      xp: 200, trigger: "date", month: 1,  day: 1,  hint: "Visit on New Year's Day.",                icon: "🎆" },
    { id: "valentines-visit",     name: "Valentine's Weeb",        description: "Anime for Valentine's Day.",               xp: 80,  trigger: "date", month: 2,  day: 14, hint: "Visit on Valentine's Day.",              icon: "💕" },
    { id: "white-day",            name: "White Day",               description: "Japan's response to Valentine's.",         xp: 80,  trigger: "date", month: 3,  day: 14, hint: "Visit on White Day (March 14).",         icon: "🤍" },
    { id: "april-fools",          name: "April Fool!",             description: "You fell for it. Or did you?",             xp: 60,  trigger: "date", month: 4,  day: 1,  hint: "Visit on April Fool's Day.",             icon: "🃏" },
    { id: "star-wars-day",        name: "May The Force...",        description: "Wrong fandom, but still.",                 xp: 50,  trigger: "date", month: 5,  day: 4,  hint: "May the 4th be with you.",               icon: "⚔️" },
    { id: "tanabata",             name: "Tanabata",                description: "Stars align tonight.",                     xp: 90,  trigger: "date", month: 7,  day: 7,  hint: "Japan's star festival on July 7.",       icon: "🎋" },
    { id: "midsummer",            name: "Midsummer Watch",         description: "Long nights for long anime runs.",         xp: 60,  trigger: "date", month: 6,  day: 21, hint: "The longest day of the year.",           icon: "☀️" },
    { id: "obon",                 name: "Obon Festival",           description: "Honoring those who came before.",          xp: 70,  trigger: "date", month: 8,  day: 15, hint: "Japanese festival of the dead, Aug 15.", icon: "🪔" },
    { id: "halloween-visit",      name: "Spooky Season",           description: "Trick or treat, anime edition.",           xp: 120, trigger: "date", month: 10, day: 31, hint: "Visit on Halloween.",                    icon: "🎃" },
    { id: "christmas-eve",        name: "Christmas Eve Watcher",   description: "Anime > Christmas parties.",               xp: 100, trigger: "date", month: 12, day: 24, hint: "Visit on Christmas Eve.",                icon: "🎄" },
    { id: "christmas-visit",      name: "Merry Kurisumasu!",       description: "Santa delivered the anime.",               xp: 150, trigger: "date", month: 12, day: 25, hint: "Visit on Christmas.",                    icon: "🎅" },
    { id: "new-years-eve",        name: "Countdown",               description: "Last watch of the year.",                  xp: 100, trigger: "date", month: 12, day: 31, hint: "Visit on New Year's Eve.",               icon: "🎉" },
    // Character birthdays
    { id: "birthday-naruto",      name: "Happy Birthday Naruto!",  description: "October 10: Naruto's birthday.",           xp: 80,  trigger: "date", month: 10, day: 10, hint: "Naruto was born on Oct 10.",             icon: "🍜" },
    { id: "birthday-luffy",       name: "Happy Birthday Luffy!",   description: "May 5: Luffy's birthday.",                 xp: 80,  trigger: "date", month: 5,  day: 5,  hint: "Luffy was born on May 5.",               icon: "⚓" },
    { id: "birthday-goku",        name: "Happy Birthday Kakarot",  description: "April 16: Goku's birthday.",               xp: 80,  trigger: "date", month: 4,  day: 16, hint: "Goku was born April 16.",                icon: "🐉" },
    { id: "birthday-ichigo",      name: "Happy Birthday Ichigo!",  description: "July 15: Ichigo's birthday.",              xp: 80,  trigger: "date", month: 7,  day: 15, hint: "Ichigo was born on July 15.",            icon: "⚔️" },
    { id: "birthday-levi",        name: "Happy Birthday Levi!",    description: "December 25: Humanity's strongest bday.", xp: 80,  trigger: "date", month: 12, day: 25, hint: "Levi was born on Christmas.",            icon: "⚙️" },
    { id: "birthday-tanjiro",     name: "Happy Birthday Tanjiro!", description: "July 14: Tanjiro's birthday.",             xp: 80,  trigger: "date", month: 7,  day: 14, hint: "Tanjiro was born on July 14.",           icon: "💧" },
    { id: "birthday-light",       name: "Happy Birthday Light!",   description: "February 28: Light Yagami's birthday.",   xp: 80,  trigger: "date", month: 2,  day: 28, hint: "Light was born on Feb 28.",              icon: "📓" },
    { id: "birthday-gojo",        name: "Happy Birthday Gojo!",    description: "December 7: Gojo Satoru's birthday.",     xp: 90,  trigger: "date", month: 12, day: 7,  hint: "Gojo was born on December 7.",           icon: "🔵" },
    { id: "birthday-rem",         name: "Happy Birthday Rem!",     description: "February 2: Rem's birthday.",              xp: 75,  trigger: "date", month: 2,  day: 2,  hint: "Rem was born on Feb 2.",                 icon: "💙" },
    { id: "birthday-anya",        name: "Happy Birthday Anya!",    description: "February 27: Anya's birthday.",            xp: 75,  trigger: "date", month: 2,  day: 27, hint: "Anya was born on Feb 27. Heh.",          icon: "🥜" },
    { id: "birthday-edward",      name: "Happy Birthday Ed!",      description: "January 23: Edward Elric's birthday.",    xp: 75,  trigger: "date", month: 1,  day: 23, hint: "Ed was born on January 23.",             icon: "⚗️" },
    { id: "birthday-deku",        name: "Happy Birthday Deku!",    description: "July 15: Izuku Midoriya's birthday.",      xp: 75,  trigger: "date", month: 7,  day: 15, hint: "Deku was born on July 15.",              icon: "💚" },
    { id: "birthday-mikasa",      name: "Happy Birthday Mikasa!",  description: "February 10: Mikasa Ackerman's birthday.", xp: 75,  trigger: "date", month: 2,  day: 10, hint: "Mikasa was born on Feb 10.",             icon: "🧣" },
    // Anime premiere anniversaries
    { id: "anniversary-naruto",   name: "Naruto Anniversary",      description: "Oct 3, 2002: Naruto premiered.",           xp: 100, trigger: "date", month: 10, day: 3,  hint: "Naruto first aired on October 3, 2002.", icon: "🍃" },
    { id: "anniversary-bleach",   name: "Bleach Anniversary",      description: "Oct 5, 2004: Bleach premiered.",           xp: 100, trigger: "date", month: 10, day: 5,  hint: "Bleach first aired October 5, 2004.",    icon: "⚔️" },
    { id: "anniversary-fma",      name: "FMA Anniversary",         description: "Oct 4, 2003: FMA premiered.",              xp: 100, trigger: "date", month: 10, day: 4,  hint: "FMA first aired October 4, 2003.",       icon: "⚗️" },
    { id: "anniversary-aot",      name: "AoT Anniversary",         description: "Apr 7, 2013: Attack on Titan premiered.",  xp: 100, trigger: "date", month: 4,  day: 7,  hint: "AoT first aired April 7, 2013.",         icon: "⚙️" },
    { id: "anniversary-onepiece", name: "One Piece Anniversary",   description: "Oct 20, 1999: One Piece premiered.",       xp: 100, trigger: "date", month: 10, day: 20, hint: "One Piece first aired Oct 20, 1999.",    icon: "🏴‍☠️" },
    { id: "anniversary-dbz",      name: "DBZ Anniversary",         description: "Apr 26, 1989: Dragon Ball Z premiered.",   xp: 100, trigger: "date", month: 4,  day: 26, hint: "DBZ first aired April 26, 1989.",        icon: "🐉" },
    { id: "anniversary-dn",       name: "Death Note Anniversary",  description: "Oct 3, 2006: Death Note premiered.",       xp: 100, trigger: "date", month: 10, day: 3,  hint: "Death Note aired October 3, 2006.",      icon: "📓" },
]

// ─────────────────────────────────────────────────────────────────────────────
// TIME OF DAY + DAY OF WEEK
// ─────────────────────────────────────────────────────────────────────────────
const TIME_EGGS: EasterEggDefinition[] = [
    { id: "midnight-visit",    name: "Night Owl",            description: "Visited at midnight.",                    xp: 50, trigger: "time-of-day", hour: 0,  hint: "Be here when the clock strikes midnight.",     icon: "🦉" },
    { id: "deep-night-2am",    name: "The Void",             description: "2 AM is the witching hour.",             xp: 55, trigger: "time-of-day", hour: 2,  hint: "Visit when only ghosts are awake.",             icon: "👻" },
    { id: "deep-night-3am",    name: "3 AM Club",            description: "What are you doing at 3 AM?",            xp: 60, trigger: "time-of-day", hour: 3,  hint: "The darkest hour.",                             icon: "🕯️" },
    { id: "deep-night-4am",    name: "Pre-Dawn Scholar",     description: "4 AM is technically morning.",           xp: 65, trigger: "time-of-day", hour: 4,  hint: "The 4 AM crowd.",                               icon: "🌌" },
    { id: "early-morning-6am", name: "Early Bird",           description: "Up before the anime starts.",            xp: 35, trigger: "time-of-day", hour: 6,  hint: "6 AM, the day is young.",                       icon: "🐦" },
    { id: "monday-morning",    name: "Already Monday",       description: "Starting the week with anime.",          xp: 20, trigger: "time-of-day", hour: 7,  dayOfWeek: 1, hint: "Monday 7 AM.",                  icon: "☕" },
    { id: "lunch-break",       name: "Lunch Break Binge",    description: "Anime during lunch? A true hero.",       xp: 30, trigger: "time-of-day", hour: 12, hint: "Visiting at noon.",                             icon: "🍱" },
    { id: "friday-night",      name: "No Life Friday",       description: "Watching anime on a Friday night.",      xp: 30, trigger: "time-of-day", hour: 22, dayOfWeek: 5, hint: "Friday night, peak anime hours.", icon: "🎉" },
    { id: "saturday-morning",  name: "Cartoon Saturday",     description: "Old habit: cartoons on Saturday morning.",xp: 40, trigger: "time-of-day", hour: 9,  dayOfWeek: 6, hint: "Saturday, 9 AM.",                icon: "📺" },
    { id: "sunday-night",      name: "Sunday Dread",         description: "Sunday night anime to cope.",            xp: 35, trigger: "time-of-day", hour: 20, dayOfWeek: 0, hint: "Sunday at 8 PM.",                icon: "😔" },
    { id: "midnight-30",       name: "Insomniac",            description: "Still here at 0:30?",                   xp: 40, trigger: "time-of-day", hour: 0,  hint: "Half past midnight.",                           icon: "🌑" },
]

// ─────────────────────────────────────────────────────────────────────────────
// SCROLL + IDLE
// ─────────────────────────────────────────────────────────────────────────────
const SCROLL_IDLE_EGGS: EasterEggDefinition[] = [
    { id: "scroll-to-bottom", name: "Rock Bottom",      description: "Scrolled all the way to the bottom.", xp: 30,  trigger: "scroll-to-bottom", hint: "The floor is XP.", icon: "⬇️" },
    { id: "idle-5min",        name: "AFK Watcher",      description: "Left the app idle for 5 minutes.",   xp: 25,  trigger: "idle", idleSeconds: 300,   hint: "Just walk away for a bit.", icon: "⏳" },
    { id: "long-session",     name: "Committed",        description: "Kept the app open for 2 hours.",     xp: 50,  trigger: "idle", idleSeconds: 7200,  hint: "Time flies.", icon: "⌚" },
    { id: "ultra-session",    name: "No Days Off",      description: "6 hours straight in the app.",       xp: 80,  trigger: "idle", idleSeconds: 21600, hint: "You've been here for 6 hours total.", icon: "🏃" },
]

// ─────────────────────────────────────────────────────────────────────────────
// PAGE VISIT
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_EGGS: EasterEggDefinition[] = [
    { id: "page-character",       name: "Character Lore",          description: "Visited a character page.",              xp: 20, trigger: "page-visit", pagePath: "/character",      hint: "Look up a character's bio.", icon: "👤" },
    { id: "page-staff",           name: "Creator's Credit",        description: "Visited a staff/creator page.",          xp: 20, trigger: "page-visit", pagePath: "/staff",           hint: "Look up a staff member.",    icon: "🎬" },
    { id: "page-studio",          name: "Studio Tour",             description: "Visited a studio page.",                 xp: 20, trigger: "page-visit", pagePath: "/studio",          hint: "Visit a studio page.",       icon: "🏢" },
    { id: "page-manga",           name: "Manga Section",           description: "Visited the manga section.",             xp: 15, trigger: "page-visit", pagePath: "/manga",           hint: "Visit the manga section.",   icon: "📚" },
    { id: "page-discover",        name: "Explorer",                description: "Visited the discover/search page.",      xp: 15, trigger: "page-visit", pagePath: "/discover",        hint: "Explore the discover page.", icon: "🔍" },
    { id: "page-schedule",        name: "On Schedule",             description: "Checked the airing schedule.",           xp: 15, trigger: "page-visit", pagePath: "/schedule",        hint: "Visit the schedule.",        icon: "📅" },
    { id: "page-community",       name: "Community Member",        description: "Visited the community page.",            xp: 20, trigger: "page-visit", pagePath: "/community",       hint: "Check out the community.",   icon: "👥" },
    { id: "page-settings",        name: "Tinkerer",                description: "Poked around in settings.",              xp: 10, trigger: "page-visit", pagePath: "/settings",        hint: "Visit the settings page.",   icon: "⚙️" },
    { id: "page-torrent",         name: "The Pirate Way",          description: "Visited the torrent page.",              xp: 25, trigger: "page-visit", pagePath: "/torrent",         hint: "Yo ho ho.",                  icon: "🏴‍☠️" },
    { id: "page-debrid",          name: "Premium User",            description: "Visited the debrid section.",            xp: 25, trigger: "page-visit", pagePath: "/debrid",          hint: "Visit the debrid section.",  icon: "⚡" },
    { id: "page-extensions",      name: "Extension Explorer",      description: "Checked the extensions.",                xp: 20, trigger: "page-visit", pagePath: "/extensions",      hint: "Browse extensions.",         icon: "🧩" },
    { id: "page-onlinestream",    name: "Stream Rider",            description: "Used the online streaming section.",     xp: 20, trigger: "page-visit", pagePath: "/online",          hint: "Visit online streaming.",    icon: "📡" },
    { id: "page-profile-me",      name: "Self-Aware",              description: "Visited your own profile.",              xp: 10, trigger: "page-visit", pagePath: "/profile/me",      hint: "Visit your own profile.",    icon: "🪞" },
    { id: "page-profile-user",    name: "Stalker",                 description: "Visited someone else's profile.",        xp: 25, trigger: "page-visit", pagePath: "/profile/user",    hint: "Visit another user's profile.", icon: "🕵️" },
    { id: "page-nakama",          name: "Watch Party!",            description: "Visited the watch party section.",       xp: 30, trigger: "page-visit", pagePath: "/nakama",          hint: "Visit the nakama/watch party.", icon: "🎊" },
    { id: "page-playlist",        name: "Playlist Maker",          description: "Visited the playlists.",                 xp: 15, trigger: "page-visit", pagePath: "/playlist",        hint: "Check the playlist section.", icon: "🎵" },
    { id: "page-mediastream",     name: "Streamer",                description: "Used the media stream section.",         xp: 20, trigger: "page-visit", pagePath: "/mediastream",     hint: "Visit the mediastream page.",icon: "📺" },
    { id: "page-achievement",     name: "Achievement Gazer",       description: "Viewed the achievements page.",          xp: 15, trigger: "page-visit", pagePath: "/achievement",     hint: "Visit the achievements page.",icon: "🏆" },
    { id: "page-privacy",         name: "Reading the Fine Print",  description: "Read the privacy page.",                 xp: 20, trigger: "page-visit", pagePath: "/privacy",         hint: "Visit the privacy page.",    icon: "🔒" },
    { id: "page-troubleshooter",  name: "Debugger",                description: "Visited the troubleshooter.",            xp: 25, trigger: "page-visit", pagePath: "/troubleshooter",  hint: "Visit the troubleshooter.",  icon: "🔧" },
]

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL (fired by app code on specific actions)
// ─────────────────────────────────────────────────────────────────────────────
const MANUAL_EGGS: EasterEggDefinition[] = [
    { id: "theme-changed-5",        name: "Costume Collector",      description: "Changed the theme 5 times.",           xp: 50,  trigger: "manual", hint: "Try on every outfit.",                icon: "👗" },
    { id: "theme-changed-10",       name: "Fashion Designer",       description: "Changed the theme 10 times.",          xp: 70,  trigger: "manual", hint: "You've tried them all.",              icon: "🎨" },
    { id: "theme-changed-20",       name: "Indecisive",             description: "Changed the theme 20 times.",          xp: 80,  trigger: "manual", hint: "Can't decide?",                       icon: "🔄" },
    { id: "search-empty",           name: "The Void",               description: "Searched with no results.",            xp: 25,  trigger: "manual", hint: "The void stares back.",               icon: "🔍" },
    { id: "dark-mode-toggle",       name: "Light/Dark Duality",     description: "Toggled dark mode.",                   xp: 20,  trigger: "manual", hint: "Embrace both sides.",                 icon: "🌓" },
    { id: "watched-all-episodes",   name: "Episode Marathon",       description: "Marked all episodes as watched.",      xp: 75,  trigger: "manual", hint: "Finish what you started.",            icon: "✅" },
    { id: "manga-binge",            name: "Page Turner",            description: "Read 50+ chapters in one session.",    xp: 75,  trigger: "manual", hint: "One more chapter...",                 icon: "📖" },
    { id: "achievement-unlock-10",  name: "Achievement Hunter",     description: "Unlocked 10 achievements.",            xp: 80,  trigger: "manual", hint: "Keep collecting badges.",             icon: "🏆" },
    { id: "profile-complete",       name: "Identity Established",   description: "Set avatar, username, and bio.",       xp: 60,  trigger: "manual", hint: "Let the world know who you are.",    icon: "🪪" },
    { id: "secret-path",            name: "Secret Garden",          description: "Found the hidden path.",               xp: 150, trigger: "manual", hint: "Some things are hidden in plain sight.", icon: "🌸" },
    { id: "first-download",         name: "First Torrent",          description: "Downloaded your first torrent.",       xp: 40,  trigger: "manual", hint: "The first download is always special.", icon: "⬇️" },
    { id: "first-stream",           name: "First Stream",           description: "Started your first stream.",           xp: 40,  trigger: "manual", hint: "Hit play for the first time.",        icon: "▶️" },
    { id: "first-watched",          name: "First Watched",          description: "Marked your first anime as watched.",  xp: 30,  trigger: "manual", hint: "The beginning of your journey.",      icon: "👁️" },
    { id: "first-manga-read",       name: "First Chapter",          description: "Read your first manga chapter.",       xp: 30,  trigger: "manual", hint: "Turn the first page.",                icon: "📄" },
    { id: "added-to-list",          name: "Planner",                description: "Added something to plan-to-watch.",    xp: 20,  trigger: "manual", hint: "Add to plan-to-watch list.",          icon: "📋" },
    { id: "completed-series",       name: "Series Completer",       description: "Marked a full series as completed.",   xp: 50,  trigger: "manual", hint: "Finish an entire series.",            icon: "🎊" },
    { id: "watched-movie",          name: "Movie Night",            description: "Watched an anime movie.",              xp: 40,  trigger: "manual", hint: "Watch an anime movie entry.",         icon: "🎬" },
    { id: "wrote-review",           name: "Critic",                 description: "Wrote a review or bio.",               xp: 45,  trigger: "manual", hint: "Use the bio or review feature.",      icon: "✍️" },
    { id: "joined-watch-party",     name: "Watch Party Guest",      description: "Joined a Nakama watch party.",         xp: 60,  trigger: "manual", hint: "Join a watch party via Nakama.",      icon: "🎊" },
    { id: "hosted-watch-party",     name: "Party Host",             description: "Hosted a Nakama watch party.",         xp: 80,  trigger: "manual", hint: "Host a watch party.",                 icon: "🎖️" },
    { id: "used-plugin",            name: "Plugin Pioneer",         description: "Used an extension/plugin.",            xp: 30,  trigger: "manual", hint: "Install and use an extension.",       icon: "🧩" },
    { id: "customized-cursor",      name: "Custom Cursor",          description: "Equipped a non-default cursor.",       xp: 25,  trigger: "manual", hint: "Equip a cursor from the shop.",       icon: "🖱️" },
    { id: "equipped-title",         name: "Titled",                 description: "Equipped a rank title.",               xp: 25,  trigger: "manual", hint: "Equip a title from rewards.",         icon: "🏅" },
    { id: "sent-community-message", name: "Communicator",           description: "Posted in the community feed.",        xp: 30,  trigger: "manual", hint: "Post in the community.",              icon: "💬" },
    { id: "added-to-favorites",     name: "Favorited",              description: "Added something to favorites.",        xp: 20,  trigger: "manual", hint: "Favorite an anime, character, or staff.", icon: "❤️" },
    { id: "bulk-favorites",         name: "Hoarder",                description: "Added 10+ favorites.",                 xp: 40,  trigger: "manual", hint: "Add 10 things to favorites.",         icon: "💝" },
    { id: "torrent-streamed",       name: "Stream While Download",  description: "Streamed a torrent in progress.",      xp: 50,  trigger: "manual", hint: "Start streaming while it downloads.", icon: "📡" },
    { id: "debrid-used",            name: "Debrid Power",           description: "Used a debrid service.",               xp: 45,  trigger: "manual", hint: "Use the debrid feature.",             icon: "⚡" },
    { id: "autodownloader-setup",   name: "Automated",              description: "Set up the auto-downloader.",          xp: 55,  trigger: "manual", hint: "Configure the auto-downloader.",      icon: "🤖" },
    { id: "score-updated",          name: "Critic's Score",         description: "Updated an anime score on AniList.",   xp: 20,  trigger: "manual", hint: "Update a score via the app.",         icon: "⭐" },
]

// ─────────────────────────────────────────────────────────────────────────────
// MILESTONES — Library counts, episodes, chapters, levels, XP
// ─────────────────────────────────────────────────────────────────────────────
const MILESTONE_EGGS: EasterEggDefinition[] = [
    // ── Anime library count ────────────────────────────────────────────────────
    { id: "anime-count-1",    name: "First Entry",          description: "1 anime in library.",     xp: 20,  trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 1,    hint: "Add your first anime.", icon: "📺" },
    { id: "anime-count-5",    name: "Getting Started",      description: "5 anime in library.",     xp: 25,  trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 5,    hint: "Add 5 anime.", icon: "📺" },
    { id: "anime-count-10",   name: "Rookie Collector",     description: "10 anime in library.",    xp: 30,  trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 10,   hint: "Add 10 anime.", icon: "📺" },
    { id: "anime-count-25",   name: "Growing Collection",   description: "25 anime in library.",    xp: 40,  trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 25,   hint: "Add 25 anime.", icon: "📺" },
    { id: "anime-count-50",   name: "Seasoned Viewer",      description: "50 anime in library.",    xp: 55,  trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 50,   hint: "Add 50 anime.", icon: "📺" },
    { id: "anime-count-100",  name: "Centurion",            description: "100 anime in library.",   xp: 80,  trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 100,  hint: "Add 100 anime.", icon: "💯" },
    { id: "anime-count-200",  name: "Connoisseur",          description: "200 anime in library.",   xp: 100, trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 200,  hint: "Add 200 anime.", icon: "🎖️" },
    { id: "anime-count-300",  name: "Veteran Viewer",       description: "300 anime in library.",   xp: 120, trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 300,  hint: "Add 300 anime.", icon: "🎖️" },
    { id: "anime-count-500",  name: "Anime Encyclopedia",   description: "500 anime in library.",   xp: 150, trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 500,  hint: "Add 500 anime.", icon: "📚" },
    { id: "anime-count-750",  name: "Legendary Collector",  description: "750 anime in library.",   xp: 180, trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 750,  hint: "Add 750 anime.", icon: "🏆" },
    { id: "anime-count-1000", name: "The 1000 Club",        description: "1000 anime in library.",  xp: 250, trigger: "milestone", milestoneKey: "animeCount", milestoneValue: 1000, hint: "Add 1000 anime. Respect.", icon: "👑" },
    // ── Manga library count ────────────────────────────────────────────────────
    { id: "manga-count-1",    name: "First Page",           description: "1 manga in library.",     xp: 20,  trigger: "milestone", milestoneKey: "mangaCount", milestoneValue: 1,    hint: "Add your first manga.", icon: "📚" },
    { id: "manga-count-5",    name: "Manga Starter",        description: "5 manga in library.",     xp: 25,  trigger: "milestone", milestoneKey: "mangaCount", milestoneValue: 5,    hint: "Add 5 manga.", icon: "📚" },
    { id: "manga-count-10",   name: "Panel Reader",         description: "10 manga in library.",    xp: 30,  trigger: "milestone", milestoneKey: "mangaCount", milestoneValue: 10,   hint: "Add 10 manga.", icon: "📚" },
    { id: "manga-count-25",   name: "Manga Enthusiast",     description: "25 manga in library.",    xp: 40,  trigger: "milestone", milestoneKey: "mangaCount", milestoneValue: 25,   hint: "Add 25 manga.", icon: "📚" },
    { id: "manga-count-50",   name: "Volume Collector",     description: "50 manga in library.",    xp: 55,  trigger: "milestone", milestoneKey: "mangaCount", milestoneValue: 50,   hint: "Add 50 manga.", icon: "📚" },
    { id: "manga-count-100",  name: "Manga Centurion",      description: "100 manga in library.",   xp: 80,  trigger: "milestone", milestoneKey: "mangaCount", milestoneValue: 100,  hint: "Add 100 manga.", icon: "💯" },
    { id: "manga-count-200",  name: "Manga Scholar",        description: "200 manga in library.",   xp: 100, trigger: "milestone", milestoneKey: "mangaCount", milestoneValue: 200,  hint: "Add 200 manga.", icon: "🎓" },
    { id: "manga-count-500",  name: "Manga Sage",           description: "500 manga in library.",   xp: 150, trigger: "milestone", milestoneKey: "mangaCount", milestoneValue: 500,  hint: "Add 500 manga.", icon: "🧙" },
    { id: "manga-count-1000", name: "Manga Deity",          description: "1000 manga in library.",  xp: 250, trigger: "milestone", milestoneKey: "mangaCount", milestoneValue: 1000, hint: "Add 1000 manga. God-tier.", icon: "👑" },
    // ── Episodes watched ───────────────────────────────────────────────────────
    { id: "episodes-10",    name: "Just Starting",    description: "10 episodes watched.",    xp: 20,  trigger: "milestone", milestoneKey: "episodesWatched", milestoneValue: 10,    hint: "Watch 10 episodes.", icon: "👁️" },
    { id: "episodes-50",    name: "Binge Starter",    description: "50 episodes watched.",    xp: 30,  trigger: "milestone", milestoneKey: "episodesWatched", milestoneValue: 50,    hint: "Watch 50 episodes.", icon: "👁️" },
    { id: "episodes-100",   name: "Triple Digits",    description: "100 episodes watched.",   xp: 45,  trigger: "milestone", milestoneKey: "episodesWatched", milestoneValue: 100,   hint: "Watch 100 episodes.", icon: "👁️" },
    { id: "episodes-500",   name: "Binge Warrior",    description: "500 episodes watched.",   xp: 80,  trigger: "milestone", milestoneKey: "episodesWatched", milestoneValue: 500,   hint: "Watch 500 episodes.", icon: "🎮" },
    { id: "episodes-1000",  name: "Thousand Eyes",    description: "1000 episodes watched.",  xp: 120, trigger: "milestone", milestoneKey: "episodesWatched", milestoneValue: 1000,  hint: "Watch 1000 episodes.", icon: "🌟" },
    { id: "episodes-5000",  name: "The Unwashed",     description: "5000 episodes watched.",  xp: 200, trigger: "milestone", milestoneKey: "episodesWatched", milestoneValue: 5000,  hint: "5000 episodes? Your social life is an Easter egg.", icon: "💀" },
    { id: "episodes-10000", name: "One Piece Progress",description: "10000 episodes watched.",xp: 300, trigger: "milestone", milestoneKey: "episodesWatched", milestoneValue: 10000, hint: "10000 episodes? You have reached One Piece.", icon: "🏴‍☠️" },
    // ── Chapters read ──────────────────────────────────────────────────────────
    { id: "chapters-10",   name: "First Arc",      description: "10 chapters read.",     xp: 20,  trigger: "milestone", milestoneKey: "chaptersRead", milestoneValue: 10,   hint: "Read 10 chapters.", icon: "📄" },
    { id: "chapters-50",   name: "Manga Reader",   description: "50 chapters read.",     xp: 30,  trigger: "milestone", milestoneKey: "chaptersRead", milestoneValue: 50,   hint: "Read 50 chapters.", icon: "📄" },
    { id: "chapters-100",  name: "Triple Digits",  description: "100 chapters read.",    xp: 45,  trigger: "milestone", milestoneKey: "chaptersRead", milestoneValue: 100,  hint: "Read 100 chapters.", icon: "📄" },
    { id: "chapters-500",  name: "Page Warrior",   description: "500 chapters read.",    xp: 75,  trigger: "milestone", milestoneKey: "chaptersRead", milestoneValue: 500,  hint: "Read 500 chapters.", icon: "📖" },
    { id: "chapters-1000", name: "Thousand Pages", description: "1000 chapters read.",   xp: 100, trigger: "milestone", milestoneKey: "chaptersRead", milestoneValue: 1000, hint: "Read 1000 chapters.", icon: "📚" },
    { id: "chapters-5000", name: "Mangaka Level",  description: "5000 chapters read.",   xp: 200, trigger: "milestone", milestoneKey: "chaptersRead", milestoneValue: 5000, hint: "5000 chapters? You're basically a mangaka.", icon: "✏️" },
    // ── Level milestones ───────────────────────────────────────────────────────
    { id: "level-5",   name: "Rising Star",     description: "Reached level 5.",    xp: 30,  trigger: "milestone", milestoneKey: "level", milestoneValue: 5,   hint: "Reach level 5.", icon: "⭐" },
    { id: "level-10",  name: "Level 10!",       description: "Reached level 10.",   xp: 40,  trigger: "milestone", milestoneKey: "level", milestoneValue: 10,  hint: "Reach level 10.", icon: "🌟" },
    { id: "level-15",  name: "Halfway to 30",   description: "Reached level 15.",   xp: 50,  trigger: "milestone", milestoneKey: "level", milestoneValue: 15,  hint: "Reach level 15.", icon: "💫" },
    { id: "level-20",  name: "Level 20!",       description: "Reached level 20.",   xp: 60,  trigger: "milestone", milestoneKey: "level", milestoneValue: 20,  hint: "Reach level 20.", icon: "✨" },
    { id: "level-25",  name: "Quarter Century", description: "Reached level 25.",   xp: 70,  trigger: "milestone", milestoneKey: "level", milestoneValue: 25,  hint: "Reach level 25.", icon: "🎯" },
    { id: "level-30",  name: "Level 30!",       description: "Reached level 30.",   xp: 80,  trigger: "milestone", milestoneKey: "level", milestoneValue: 30,  hint: "Reach level 30.", icon: "🔥" },
    { id: "level-40",  name: "Level 40!",       description: "Reached level 40.",   xp: 90,  trigger: "milestone", milestoneKey: "level", milestoneValue: 40,  hint: "Reach level 40.", icon: "💥" },
    { id: "level-50",  name: "Half Century",    description: "Reached level 50.",   xp: 100, trigger: "milestone", milestoneKey: "level", milestoneValue: 50,  hint: "Reach level 50.", icon: "🏆" },
    { id: "level-60",  name: "Level 60!",       description: "Reached level 60.",   xp: 110, trigger: "milestone", milestoneKey: "level", milestoneValue: 60,  hint: "Reach level 60.", icon: "🎖️" },
    { id: "level-75",  name: "Three Quarters",  description: "Reached level 75.",   xp: 120, trigger: "milestone", milestoneKey: "level", milestoneValue: 75,  hint: "Reach level 75.", icon: "💎" },
    { id: "level-100", name: "Level 100!",      description: "Reached level 100.",  xp: 200, trigger: "milestone", milestoneKey: "level", milestoneValue: 100, hint: "Reach level 100. A true legend.", icon: "👑" },
    // ── XP milestones ──────────────────────────────────────────────────────────
    { id: "xp-1000",   name: "First Thousand",  description: "Earned 1,000 total XP.",    xp: 30,  trigger: "milestone", milestoneKey: "totalXP", milestoneValue: 1000,   hint: "Earn 1,000 XP.", icon: "⭐" },
    { id: "xp-5000",   name: "XP Hoarder",      description: "Earned 5,000 total XP.",    xp: 50,  trigger: "milestone", milestoneKey: "totalXP", milestoneValue: 5000,   hint: "Earn 5,000 XP.", icon: "💫" },
    { id: "xp-10000",  name: "Ten Thousand",    description: "Earned 10,000 total XP.",   xp: 80,  trigger: "milestone", milestoneKey: "totalXP", milestoneValue: 10000,  hint: "Earn 10,000 XP.", icon: "💥" },
    { id: "xp-50000",  name: "XP Tycoon",       description: "Earned 50,000 total XP.",   xp: 120, trigger: "milestone", milestoneKey: "totalXP", milestoneValue: 50000,  hint: "Earn 50,000 XP.", icon: "💰" },
    { id: "xp-100000", name: "Six Figures",     description: "Earned 100,000 total XP.",  xp: 200, trigger: "milestone", milestoneKey: "totalXP", milestoneValue: 100000, hint: "Earn 100,000 XP.", icon: "💎" },
    // ── Achievements unlocked ──────────────────────────────────────────────────
    { id: "ach-5",  name: "Five Badges",   description: "Unlocked 5 achievements.",  xp: 40,  trigger: "milestone", milestoneKey: "achievementsUnlocked", milestoneValue: 5,  hint: "Unlock 5 achievements.", icon: "🏅" },
    { id: "ach-10", name: "Ten Badges",    description: "Unlocked 10 achievements.", xp: 60,  trigger: "milestone", milestoneKey: "achievementsUnlocked", milestoneValue: 10, hint: "Unlock 10 achievements.", icon: "🏆" },
    { id: "ach-20", name: "Twenty Badges", description: "Unlocked 20 achievements.", xp: 80,  trigger: "milestone", milestoneKey: "achievementsUnlocked", milestoneValue: 20, hint: "Unlock 20 achievements.", icon: "🎖️" },
    { id: "ach-50", name: "Fifty Badges",  description: "Unlocked 50 achievements.", xp: 120, trigger: "milestone", milestoneKey: "achievementsUnlocked", milestoneValue: 50, hint: "Unlock 50 achievements.", icon: "👑" },
    // ── Easter eggs found ─────────────────────────────────────────────────────
    { id: "eggs-5",   name: "Five Eggs",     description: "Found 5 easter eggs.",   xp: 30,  trigger: "milestone", milestoneKey: "eggsFound", milestoneValue: 5,   hint: "Find 5 easter eggs.", icon: "🥚" },
    { id: "eggs-10",  name: "Egg Hunter",    description: "Found 10 easter eggs.",  xp: 50,  trigger: "milestone", milestoneKey: "eggsFound", milestoneValue: 10,  hint: "Find 10 easter eggs.", icon: "🐣" },
    { id: "eggs-25",  name: "Egg Collector", description: "Found 25 easter eggs.",  xp: 75,  trigger: "milestone", milestoneKey: "eggsFound", milestoneValue: 25,  hint: "Find 25 easter eggs.", icon: "🐥" },
    { id: "eggs-50",  name: "Egg Master",    description: "Found 50 easter eggs.",  xp: 100, trigger: "milestone", milestoneKey: "eggsFound", milestoneValue: 50,  hint: "Find 50 easter eggs.", icon: "🐓" },
    { id: "eggs-100", name: "Egg Legend",    description: "Found 100 easter eggs.", xp: 150, trigger: "milestone", milestoneKey: "eggsFound", milestoneValue: 100, hint: "Find 100 easter eggs.", icon: "🦅" },
    { id: "eggs-200", name: "Obsessive",     description: "Found 200 easter eggs.", xp: 200, trigger: "milestone", milestoneKey: "eggsFound", milestoneValue: 200, hint: "Find 200 easter eggs.", icon: "🔮" },
    // ── Cursors unlocked ──────────────────────────────────────────────────────
    { id: "cursors-5",  name: "Cursor Collector",  description: "Unlocked 5 cursors.",  xp: 30, trigger: "milestone", milestoneKey: "cursorsUnlocked", milestoneValue: 5,  hint: "Unlock 5 cursors.", icon: "🖱️" },
    { id: "cursors-10", name: "Cursor Enthusiast", description: "Unlocked 10 cursors.", xp: 50, trigger: "milestone", milestoneKey: "cursorsUnlocked", milestoneValue: 10, hint: "Unlock 10 cursors.", icon: "🖱️" },
    { id: "cursors-20", name: "Cursor Hoarder",    description: "Unlocked 20 cursors.", xp: 75, trigger: "milestone", milestoneKey: "cursorsUnlocked", milestoneValue: 20, hint: "Unlock 20 cursors.", icon: "🖱️" },
]

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────
const FEATURE_EGGS: EasterEggDefinition[] = [
    { id: "feature-first-extension",  name: "Extended",          description: "Installed your first extension.",   xp: 40, trigger: "feature", hint: "Install an extension.", icon: "🧩" },
    { id: "feature-first-custom-src", name: "Custom Source",     description: "Added a custom source.",            xp: 40, trigger: "feature", hint: "Add a custom source.", icon: "🔌" },
    { id: "feature-discord-rpc",      name: "Flex Mode",         description: "Enabled Discord Rich Presence.",    xp: 30, trigger: "feature", hint: "Enable Discord RPC.", icon: "💬" },
    { id: "feature-doh-enabled",      name: "Privacy First",     description: "Enabled DNS over HTTPS.",           xp: 35, trigger: "feature", hint: "Enable DoH in settings.", icon: "🔒" },
    { id: "feature-playlist-created", name: "My Playlist",       description: "Created a playlist.",               xp: 35, trigger: "feature", hint: "Create your first playlist.", icon: "🎵" },
    { id: "feature-scan-library",     name: "Librarian",         description: "Ran a library scan.",               xp: 25, trigger: "feature", hint: "Run a library scan.", icon: "🔍" },
    { id: "feature-manga-reader",     name: "Manga Reader Mode", description: "Opened the manga reader.",          xp: 25, trigger: "feature", hint: "Open the manga reader.", icon: "📖" },
    { id: "feature-nakama-chat",      name: "Social Butterfly",  description: "Used Nakama chat.",                 xp: 40, trigger: "feature", hint: "Chat in a watch party.", icon: "💬" },
    { id: "feature-auto-update",      name: "Up to Date",        description: "Updated the app.",                  xp: 30, trigger: "feature", hint: "Update to a new version.", icon: "🔄" },
    { id: "feature-theme-music",      name: "Atmosphere",        description: "Enabled theme music.",              xp: 25, trigger: "feature", hint: "Enable music in an anime theme.", icon: "🎵" },
    { id: "feature-particle-fx",      name: "Eye Candy",         description: "Enabled particle effects.",         xp: 25, trigger: "feature", hint: "Enable particle effects in a theme.", icon: "✨" },
    { id: "feature-shortcuts",        name: "Power User",        description: "Used a keyboard shortcut.",         xp: 20, trigger: "feature", hint: "Use a keyboard shortcut.", icon: "⌨️" },
    { id: "feature-seacommand",       name: "Commander",         description: "Opened the Sea Command palette.",   xp: 25, trigger: "feature", hint: "Open Sea Command.", icon: "🎯" },
    { id: "feature-schedule-check",   name: "On Time",           description: "Checked the airing schedule.",      xp: 15, trigger: "feature", hint: "View the schedule.", icon: "📅" },
]

// ─────────────────────────────────────────────────────────────────────────────
// FULL CATALOGUE
// ─────────────────────────────────────────────────────────────────────────────
export const EASTER_EGG_DEFINITIONS: EasterEggDefinition[] = [
    ...KONAMI_EGGS,
    ...TYPE_EGGS,
    ...CLICK_EGGS,
    ...DATE_EGGS,
    ...TIME_EGGS,
    ...SCROLL_IDLE_EGGS,
    ...PAGE_EGGS,
    ...MANUAL_EGGS,
    ...MILESTONE_EGGS,
    ...FEATURE_EGGS,
]

export const EASTER_EGG_MAP = new Map(EASTER_EGG_DEFINITIONS.map(e => [e.id, e]))

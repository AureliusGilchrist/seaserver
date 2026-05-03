export * from "./types"
export * from "./seanime-theme"
export * from "./naruto-theme"
export * from "./bleach-theme"
export * from "./one-piece-theme"
export * from "./dragon-ball-z-theme"
export * from "./attack-on-titan-theme"
export * from "./my-hero-academia-theme"
export * from "./demon-slayer-theme"
export * from "./jujutsu-kaisen-theme"
export * from "./fullmetal-alchemist-theme"
export * from "./hunter-x-hunter-theme"
export * from "./black-clover-theme"
export * from "./fairy-tail-theme"
export * from "./sword-art-online-theme"
export * from "./death-note-theme"
export * from "./code-geass-theme"
export * from "./tokyo-ghoul-theme"
export * from "./mob-psycho-100-theme"
export * from "./one-punch-man-theme"
export * from "./re-zero-theme"
export * from "./konosuba-theme"
export * from "./your-name-theme"
export * from "./violet-evergarden-theme"
export * from "./spy-x-family-theme"
export * from "./evangelion-theme"
export * from "./steins-gate-theme"
export * from "./cowboy-bebop-theme"
export * from "./psycho-pass-theme"
export * from "./ghost-in-the-shell-theme"
export * from "./berserk-theme"
export * from "./vinland-saga-theme"
export * from "./chainsaw-man-theme"
export * from "./made-in-abyss-theme"
export * from "./haikyuu-theme"
export * from "./frieren-theme"
export * from "./solo-leveling-theme"
export * from "./monster-theme"
export * from "./slam-dunk-theme"
export * from "./akira-theme"
export * from "./sailor-moon-theme"
export * from "./inuyasha-theme"
export * from "./princess-mononoke-theme"
export * from "./spirited-away-theme"
export * from "./gurren-lagann-theme"
// ── Wave 2 exports ──
export * from "./dragon-ball-theme"
export * from "./gintama-theme"
export * from "./dungeon-meshi-theme"
// ── Wave 3 exports ──
export * from "./jojo-bizarre-adventure-theme"
export * from "./pokemon-theme"
export * from "./detective-conan-theme"
export * from "./player-icons"

import { seanimeTheme } from "./seanime-theme"
import { narutoTheme } from "./naruto-theme"
import { bleachTheme } from "./bleach-theme"
import { onePieceTheme } from "./one-piece-theme"
import { dragonBallZTheme } from "./dragon-ball-z-theme"
import { attackOnTitanTheme } from "./attack-on-titan-theme"
import { myHeroAcademiaTheme } from "./my-hero-academia-theme"
import { demonSlayerTheme } from "./demon-slayer-theme"
import { jujutsuKaisenTheme } from "./jujutsu-kaisen-theme"
import { fullmetalAlchemistTheme } from "./fullmetal-alchemist-theme"
import { hunterXHunterTheme } from "./hunter-x-hunter-theme"
import { blackCloverTheme } from "./black-clover-theme"
import { fairyTailTheme } from "./fairy-tail-theme"
import { swordArtOnlineTheme } from "./sword-art-online-theme"
import { deathNoteTheme } from "./death-note-theme"
import { codeGeassTheme } from "./code-geass-theme"
import { tokyoGhoulTheme } from "./tokyo-ghoul-theme"
import { mobPsycho100Theme } from "./mob-psycho-100-theme"
import { onePunchManTheme } from "./one-punch-man-theme"
import { reZeroTheme } from "./re-zero-theme"
import { konosubaTheme } from "./konosuba-theme"
import { yourNameTheme } from "./your-name-theme"
import { violetEvergardenTheme } from "./violet-evergarden-theme"
import { spyXFamilyTheme } from "./spy-x-family-theme"
import { evangelionTheme } from "./evangelion-theme"
import { steinsGateTheme } from "./steins-gate-theme"
import { cowboyBebopTheme } from "./cowboy-bebop-theme"
import { psychoPassTheme } from "./psycho-pass-theme"
import { ghostInTheShellTheme } from "./ghost-in-the-shell-theme"
import { berserkTheme } from "./berserk-theme"
import { vinlandSagaTheme } from "./vinland-saga-theme"
import { chainsawManTheme } from "./chainsaw-man-theme"
import { madeInAbyssTheme } from "./made-in-abyss-theme"
import { haikyuuTheme } from "./haikyuu-theme"
import { frierenTheme } from "./frieren-theme"
import { soloLevelingTheme } from "./solo-leveling-theme"
import { monsterTheme } from "./monster-theme"
import { slamDunkTheme } from "./slam-dunk-theme"
import { akiraTheme } from "./akira-theme"
import { sailorMoonTheme } from "./sailor-moon-theme"
import { inuyashaTheme } from "./inuyasha-theme"
import { princessMononokeTheme } from "./princess-mononoke-theme"
import { spiritedAwayTheme } from "./spirited-away-theme"
import { gurrenLagannTheme } from "./gurren-lagann-theme"
// ── Wave 2 imports ──
import { dragonBallTheme } from "./dragon-ball-theme"
import { gintamaTheme } from "./gintama-theme"
import { dungeonMeshiTheme } from "./dungeon-meshi-theme"
// ── Wave 3 imports ──
import { jojoBizarreAdventureTheme } from "./jojo-bizarre-adventure-theme"
import { pokemonTheme } from "./pokemon-theme"
import { detectiveConanTheme } from "./detective-conan-theme"
import type { AnimeThemeConfig } from "./types"

export const ANIME_THEMES: Record<string, AnimeThemeConfig> = {
    "seanime": seanimeTheme,
    "naruto": narutoTheme,
    "bleach": bleachTheme,
    "one-piece": onePieceTheme,
    "dragon-ball-z": dragonBallZTheme,
    "attack-on-titan": attackOnTitanTheme,
    "my-hero-academia": myHeroAcademiaTheme,
    "demon-slayer": demonSlayerTheme,
    "jujutsu-kaisen": jujutsuKaisenTheme,
    "fullmetal-alchemist": fullmetalAlchemistTheme,
    "hunter-x-hunter": hunterXHunterTheme,
    "black-clover": blackCloverTheme,
    "fairy-tail": fairyTailTheme,
    "sword-art-online": swordArtOnlineTheme,
    "death-note": deathNoteTheme,
    "code-geass": codeGeassTheme,
    "tokyo-ghoul": tokyoGhoulTheme,
    "mob-psycho-100": mobPsycho100Theme,
    "one-punch-man": onePunchManTheme,
    "re-zero": reZeroTheme,
    "konosuba": konosubaTheme,
    "your-name": yourNameTheme,
    "violet-evergarden": violetEvergardenTheme,
    "spy-x-family": spyXFamilyTheme,
    "evangelion": evangelionTheme,
    "steins-gate": steinsGateTheme,
    "cowboy-bebop": cowboyBebopTheme,
    "psycho-pass": psychoPassTheme,
    "ghost-in-the-shell": ghostInTheShellTheme,
    "berserk": berserkTheme,
    "vinland-saga": vinlandSagaTheme,
    "chainsaw-man": chainsawManTheme,
    "made-in-abyss": madeInAbyssTheme,
    "haikyuu": haikyuuTheme,
    "frieren": frierenTheme,
    "solo-leveling": soloLevelingTheme,
    "monster": monsterTheme,
    "slam-dunk": slamDunkTheme,
    "akira": akiraTheme,
    "sailor-moon": sailorMoonTheme,
    "inuyasha": inuyashaTheme,
    "princess-mononoke": princessMononokeTheme,
    "spirited-away": spiritedAwayTheme,
    "gurren-lagann": gurrenLagannTheme,
    // ── Wave 2 ──
    "dragon-ball": dragonBallTheme,
    "gintama": gintamaTheme,
    "dungeon-meshi": dungeonMeshiTheme,
    // ── Wave 3 ──
    "jojo-bizarre-adventure": jojoBizarreAdventureTheme,
    "pokemon": pokemonTheme,
    "detective-conan": detectiveConanTheme,
    "custom": {
        id: "custom",
        displayName: "Custom",
        description: "Your custom theme.",
        cssVars: {},
        musicUrl: "",
        sidebarOverrides: {},
        achievementNames: {},
        milestoneNames: {
  1: "Threadbare Custom Theme Echo",
  8: "Personal's Tarnished Omen",
  14: "Fractured Theme Builder",
  21: "Theme Builder Path",
  28: "Lowborn Spark Myth",
  35: "Theme Builder Pulse",
  41: "Theme's Spark Crest",
  48: "Humble Theme Mark",
  55: "Ragged Theme Builder Vow",
  61: "Theme's Faint Echo",
  68: "Lesser Theme Builder",
  75: "Theme Builder Zenith",
  81: "Doubtful Spark Bloom",
  88: "Theme Builder Sigil",
  95: "Theme's Spark Flame",
  102: "Really Cool Theme Spark",
  108: "Awakened Theme Builder Omen",
  115: "Theme's Resolute Seal",
  122: "Rising Theme Builder",
  128: "Theme Builder Myth",
  135: "Dauntless Spark Pulse",
  142: "Theme Builder Crest",
  149: "Theme's Spark Mark",
  155: "Fresh Theme Vow",
  162: "Valiant Theme Builder Echo",
  169: "Theme's Prime Crown",
  175: "Polished Theme Builder",
  182: "Theme Builder Bloom",
  189: "Stormlit Spark Sigil",
  195: "Theme Builder Flame",
  202: "Theme's Spark Spark",
  209: "Tempered Theme Omen",
  216: "Trusted Theme Builder Seal",
  222: "Theme's Steadfast Path",
  229: "Ironclad Theme Builder",
  236: "Veteran Spark Pulse",
  242: "Core Spark Crest",
  249: "Theme Builder Mark",
  256: "Theme's Spark Vow",
  262: "Formidable Theme Echo",
  269: "Lucid Theme Builder Crown",
  276: "Theme's Ranked Zenith",
  283: "Fabled Theme Builder",
  289: "Grand Spark Sigil",
  296: "Seasoned Spark Flame",
  303: "Theme Builder Spark",
  309: "Theme's Spark Omen",
  316: "Valorous Theme Seal",
  323: "Stalwart Theme Builder Path",
  330: "Theme's Commanding Myth",
  336: "Refined Theme Builder",
  343: "Unbroken Spark Crest",
  350: "Blazing Spark Mark",
  356: "Theme Builder Vow",
  363: "Theme's Spark Echo",
  370: "Peerless Theme Crown",
  376: "Ardent Theme Builder Zenith",
  383: "Theme's Focused Bloom",
  390: "Vigilant Theme Builder",
  397: "Dominant Spark Flame",
  403: "Elite Spark Spark",
  410: "Theme Builder Omen",
  417: "Theme's Spark Seal",
  423: "Sovereign Theme Path",
  430: "Regal Theme Builder Myth",
  437: "Theme's Crowned Pulse",
  444: "Mythborn Theme Builder",
  450: "Limitless Spark Mark",
  457: "Radiant Spark Vow",
  464: "Theme Builder Echo",
  470: "Theme's Spark Crown",
  477: "Climactic Theme Zenith",
  484: "Epic Theme Builder Bloom",
  490: "Theme's Unreal Sigil",
  497: "Peak Theme Builder",
  504: "Supreme Spark Spark",
  511: "Exalted Spark Omen",
  517: "Theme Builder Seal",
  524: "Theme's Spark Path",
  531: "Celestial Theme Myth",
  537: "Phantom Theme Builder Pulse",
  544: "Theme's Crimson Crest",
  551: "Silver Theme Builder",
  557: "Golden Spark Vow",
  564: "Feral Spark Echo",
  571: "Theme Builder Crown",
  578: "Theme's Spark Zenith",
  584: "Dread Theme Bloom",
  591: "Luminous Theme Builder Sigil",
  598: "Theme's Thunderous Flame",
  604: "Ultraviolet Theme Builder",
  611: "Unleashed Spark Omen",
  618: "Secret Spark Seal",
  625: "Final Theme Path",
  631: "Theme's Spark Myth",
  638: "Worldclass Theme Pulse",
  645: "Lawless Theme Builder Crest",
  651: "Theme's Chosen Mark",
  658: "Fearless Theme Builder",
  665: "Overdrive Spark Echo",
  671: "Cinematic Spark Crown",
  678: "Impossible Theme Zenith",
  685: "Theme's Spark Bloom",
  692: "Canonized Theme Sigil",
  698: "Ascendant Theme Builder Flame",
  705: "Theme's Transfigured Spark",
  712: "Immortal Theme Builder",
  718: "Eclipsed Spark Seal",
  725: "Astral Spark Path",
  732: "Sublime Theme Myth",
  739: "Theme's Spark Pulse",
  745: "Prismatic Theme Crest",
  752: "Abyssal Theme Builder Mark",
  759: "Theme's Unbound Vow",
  765: "Eternal Theme Builder",
  772: "Cosmic Spark Crown",
  779: "Transcendent Spark Zenith",
  785: "Perfected Theme Bloom",
  792: "Theme's Spark Sigil",
  799: "Ultimate Theme Flame",
  806: "Mythic Theme Builder Spark",
  812: "Theme's Godlike Omen",
  819: "Canonical Theme Builder",
  826: "Reality-Bent Spark Path",
  832: "Heavenly Spark Myth",
  839: "Absolute Theme Pulse",
  846: "Untouchable Theme Crest",
  852: "Timeless Theme Mark",
  859: "Empyrean Theme Builder Vow",
  866: "Theme's Primordial Echo",
  873: "Omniscient Theme Builder",
  879: "Unfathomed Spark Zenith",
  886: "Apocalyptic Spark Bloom",
  893: "Seraphic Theme Sigil",
  899: "Omega Theme Flame",
  906: "Final Theme Spark",
  913: "Crowned Theme Builder Omen",
  920: "Theme's Mythic Seal",
  926: "Absolute Theme Builder",
  933: "Eternal Spark Myth",
  940: "Cosmic Spark Pulse",
  946: "Transcendent Theme Crest",
  953: "Perfected Theme Mark",
  960: "Definitive Theme Vow",
  966: "Ultimate Theme Builder Echo",
  973: "Theme's Infinite Crown",
  980: "Sovereign Theme Builder",
  987: "Celestial Spark Bloom",
  993: "Legendary Spark Sigil",
  1000: "Ultimate Theme Builder"
},
        previewColors: { bg: "#0c1018", primary: "#8b5cf6", secondary: "#6d28d9", accent: "#a78bfa" },
    },
}


export const ANIME_THEME_LIST: AnimeThemeConfig[] = [
    seanimeTheme,
    narutoTheme,
    bleachTheme,
    onePieceTheme,
    dragonBallZTheme,
    attackOnTitanTheme,
    myHeroAcademiaTheme,
    demonSlayerTheme,
    jujutsuKaisenTheme,
    fullmetalAlchemistTheme,
    hunterXHunterTheme,
    blackCloverTheme,
    fairyTailTheme,
    swordArtOnlineTheme,
    deathNoteTheme,
    codeGeassTheme,
    tokyoGhoulTheme,
    mobPsycho100Theme,
    onePunchManTheme,
    reZeroTheme,
    konosubaTheme,
    yourNameTheme,
    violetEvergardenTheme,
    spyXFamilyTheme,
    evangelionTheme,
    steinsGateTheme,
    cowboyBebopTheme,
    psychoPassTheme,
    ghostInTheShellTheme,
    berserkTheme,
    vinlandSagaTheme,
    chainsawManTheme,
    madeInAbyssTheme,
    haikyuuTheme,
    frierenTheme,
    soloLevelingTheme,
    monsterTheme,
    slamDunkTheme,
    akiraTheme,
    sailorMoonTheme,
    inuyashaTheme,
    princessMononokeTheme,
    spiritedAwayTheme,
    gurrenLagannTheme,
    dragonBallTheme,
    gintamaTheme,
    dungeonMeshiTheme,
    jojoBizarreAdventureTheme,
    pokemonTheme,
    detectiveConanTheme,
]

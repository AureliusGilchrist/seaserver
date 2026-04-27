# update-theme-backgrounds.ps1
# Downloads wallhaven.cc wallpapers for all 99 anime themes and updates theme .ts files.
# Run from: E:\Main\seaserver
# Usage: .\update-theme-backgrounds.ps1

$ErrorActionPreference = "Continue"
$themesDir  = "e:\Main\seaserver\seanime-web\src\lib\theme\anime-themes"
$outDir     = "e:\Main\seaserver\seanime-web\public\themes"
$creditsFile = "e:\Main\seaserver\artists-credit.txt"
$apiBase    = "https://wallhaven.cc/api/v1/search"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# ─── Theme definitions ──────────────────────────────────────────────────────────
# Format: id, wallhaven search query, isManga (bool), particleColor hex
$themes = @(
    # ── Big Three / Shonen ──
    [pscustomobject]@{ id="naruto";              q="naruto konoha landscape anime";           manga=$false; color="#dc5000" },
    [pscustomobject]@{ id="bleach";              q="bleach ichigo soul society";              manga=$false; color="#3a6fc8" },
    [pscustomobject]@{ id="one-piece";           q="one piece luffy grand line sea";          manga=$false; color="#e87028" },
    [pscustomobject]@{ id="dragon-ball-z";       q="dragon ball z goku power";                manga=$false; color="#f0a000" },
    [pscustomobject]@{ id="attack-on-titan";     q="attack on titan wall landscape";          manga=$false; color="#6a5040" },
    [pscustomobject]@{ id="my-hero-academia";    q="my hero academia deku hero";              manga=$false; color="#24a840" },
    [pscustomobject]@{ id="demon-slayer";        q="demon slayer kimetsu sunset";             manga=$false; color="#c84850" },
    [pscustomobject]@{ id="jujutsu-kaisen";      q="jujutsu kaisen cursed energy";            manga=$false; color="#4060b0" },
    [pscustomobject]@{ id="fullmetal-alchemist"; q="fullmetal alchemist brotherhood";         manga=$false; color="#c07830" },
    [pscustomobject]@{ id="hunter-x-hunter";     q="hunter x hunter landscape";               manga=$false; color="#28a060" },
    [pscustomobject]@{ id="black-clover";        q="black clover magic knight";               manga=$false; color="#404080" },
    [pscustomobject]@{ id="fairy-tail";          q="fairy tail guild magic";                  manga=$false; color="#e05030" },
    [pscustomobject]@{ id="sword-art-online";    q="sword art online aincrad";                manga=$false; color="#3878d8" },
    [pscustomobject]@{ id="death-note";          q="death note light darkness";               manga=$false; color="#b8a030" },
    [pscustomobject]@{ id="code-geass";          q="code geass lelouch geass";                manga=$false; color="#8228dc" },
    [pscustomobject]@{ id="tokyo-ghoul";         q="tokyo ghoul kaneki mask";                 manga=$false; color="#303050" },
    [pscustomobject]@{ id="mob-psycho-100";      q="mob psycho 100 psychic";                  manga=$false; color="#00b9a5" },
    [pscustomobject]@{ id="one-punch-man";       q="one punch man saitama city";              manga=$false; color="#f0d020" },
    # ── Isekai / Fantasy ──
    [pscustomobject]@{ id="re-zero";             q="re zero subaru emilia snow";              manga=$false; color="#2d5fc8" },
    [pscustomobject]@{ id="konosuba";            q="konosuba kazuma party adventurers";       manga=$false; color="#e07850" },
    [pscustomobject]@{ id="mushoku-tensei";      q="mushoku tensei magic forest";             manga=$false; color="#4890d8" },
    [pscustomobject]@{ id="slime-isekai";        q="slime isekai rimuru fantasy";             manga=$false; color="#3088b0" },
    [pscustomobject]@{ id="overlord";            q="overlord ainz ooal gown dark";            manga=$false; color="#a06020" },
    # ── Romance / Slice of Life ──
    [pscustomobject]@{ id="your-name";           q="your name kimi no na wa comet sky";       manga=$false; color="#1e5fd2" },
    [pscustomobject]@{ id="violet-evergarden";   q="violet evergarden flowers letter";        manga=$false; color="#6888d0" },
    [pscustomobject]@{ id="toradora";            q="toradora taiga ryuuji autumn";             manga=$false; color="#e05850" },
    [pscustomobject]@{ id="spy-x-family";        q="spy x family anya forger city";           manga=$false; color="#c87090" },
    [pscustomobject]@{ id="bocchi-the-rock";     q="bocchi the rock guitar music";            manga=$false; color="#e8407a" },
    # ── Mecha / Sci-Fi ──
    [pscustomobject]@{ id="evangelion";          q="neon genesis evangelion eva tokyo 3";     manga=$false; color="#4c8c50" },
    [pscustomobject]@{ id="steins-gate";         q="steins gate time machine lab";            manga=$false; color="#f0a820" },
    [pscustomobject]@{ id="cowboy-bebop";        q="cowboy bebop space jazz";                 manga=$false; color="#d0802a" },
    [pscustomobject]@{ id="psycho-pass";         q="psycho pass city scanner";                manga=$false; color="#60a8c0" },
    [pscustomobject]@{ id="ghost-in-the-shell";  q="ghost in the shell cyber city";           manga=$false; color="#3890b8" },
    # ── Dark / Seinen ──
    [pscustomobject]@{ id="berserk";             q="berserk guts dark fantasy";               manga=$true;  color="#a82020" },
    [pscustomobject]@{ id="vinland-saga";        q="vinland saga viking landscape";           manga=$false; color="#6c7840" },
    [pscustomobject]@{ id="chainsaw-man";        q="chainsaw man denji city";                 manga=$false; color="#e84020" },
    [pscustomobject]@{ id="made-in-abyss";       q="made in abyss abyss landscape";           manga=$false; color="#3068a0" },
    [pscustomobject]@{ id="parasyte";            q="parasyte maxim shinichi body horror";     manga=$false; color="#38a848" },
    # ── Sports / Other ──
    [pscustomobject]@{ id="haikyuu";             q="haikyuu volleyball court";                manga=$false; color="#e87020" },
    [pscustomobject]@{ id="frieren";             q="frieren beyond journey end magic";        manga=$false; color="#9870d8" },
    [pscustomobject]@{ id="dandadan";            q="dandadan alien supernatural";             manga=$false; color="#5080c0" },
    [pscustomobject]@{ id="dr-stone";            q="dr stone science stone world";            manga=$false; color="#58a830" },
    [pscustomobject]@{ id="fire-force";          q="fire force flame firefighter";            manga=$false; color="#e86030" },
    # ── Manga ──
    [pscustomobject]@{ id="solo-leveling";       q="solo leveling sung jinwoo dungeon";       manga=$false; color="#4060d0" },
    [pscustomobject]@{ id="tower-of-god";        q="tower of god baam rachel tower";          manga=$false; color="#3890a8" },
    [pscustomobject]@{ id="vagabond";            q="vagabond miyamoto musashi manga samurai";  manga=$true;  color="#806040" },
    [pscustomobject]@{ id="20th-century-boys";   q="20th century boys manga kenji";           manga=$true;  color="#d09040" },
    [pscustomobject]@{ id="monster";             q="monster naoki urasawa manga thriller";    manga=$true;  color="#707070" },
    [pscustomobject]@{ id="goodnight-punpun";    q="goodnight punpun manga dark";             manga=$true;  color="#505050" },
    [pscustomobject]@{ id="slam-dunk";           q="slam dunk basketball manga";              manga=$true;  color="#d04030" },
    [pscustomobject]@{ id="akira";               q="akira katsuhiro otomo anime city";        manga=$false; color="#d03020" },
    [pscustomobject]@{ id="gantz";               q="gantz manga alien dark";                  manga=$true;  color="#304050" },
    [pscustomobject]@{ id="dorohedoro";          q="dorohedoro magic hole landscape";         manga=$false; color="#5c7838" },
    # ── Retro / Classic ──
    [pscustomobject]@{ id="serial-experiments-lain"; q="serial experiments lain wired";      manga=$false; color="#5870a0" },
    [pscustomobject]@{ id="trigun";              q="trigun vash desert";                      manga=$false; color="#d89040" },
    [pscustomobject]@{ id="rurouni-kenshin";     q="rurouni kenshin samurai meiji";           manga=$false; color="#c85040" },
    [pscustomobject]@{ id="sailor-moon";         q="sailor moon senshi moon";                 manga=$false; color="#e878d8" },
    [pscustomobject]@{ id="cardcaptor-sakura";   q="cardcaptor sakura star magic";            manga=$false; color="#e850a8" },
    [pscustomobject]@{ id="inuyasha";            q="inuyasha kagome feudal japan forest";     manga=$false; color="#c05068" },
    [pscustomobject]@{ id="yuyu-hakusho";        q="yu yu hakusho yusuke spirit world";       manga=$false; color="#4870d0" },
    [pscustomobject]@{ id="initial-d";           q="initial d eurobeat mountain road night";  manga=$false; color="#e0d020" },
    [pscustomobject]@{ id="ranma-12";            q="ranma 1/2 martial arts";                  manga=$false; color="#e85050" },
    [pscustomobject]@{ id="revolutionary-girl-utena"; q="revolutionary girl utena dueling";   manga=$false; color="#e060c0" },
    [pscustomobject]@{ id="outlaw-star";         q="outlaw star space ship";                  manga=$false; color="#c04830" },
    [pscustomobject]@{ id="great-teacher-onizuka"; q="great teacher onizuka GTO school";     manga=$false; color="#d87828" },
    [pscustomobject]@{ id="perfect-blue";        q="perfect blue satoshi kon psychological";  manga=$false; color="#4060c0" },
    [pscustomobject]@{ id="princess-mononoke";   q="princess mononoke forest spirit";        manga=$false; color="#386828" },
    [pscustomobject]@{ id="spirited-away";       q="spirited away spirit bath house";        manga=$false; color="#d88838" },
    [pscustomobject]@{ id="lupin-iii";           q="lupin III heist retro";                   manga=$false; color="#c04030" },
    [pscustomobject]@{ id="grave-of-the-fireflies"; q="grave of the fireflies fireflies";    manga=$false; color="#d09030" },
    [pscustomobject]@{ id="samurai-champloo";    q="samurai champloo edo japan";              manga=$false; color="#d86830" },
    [pscustomobject]@{ id="flcl";               q="flcl fooly cooly surreal";               manga=$false; color="#e87040" },
    [pscustomobject]@{ id="gurren-lagann";       q="gurren lagann mecha drill";               manga=$false; color="#d83020" },
    [pscustomobject]@{ id="haruhi-suzumiya";     q="haruhi suzumiya SOS brigade school";     manga=$false; color="#e85050" },
    [pscustomobject]@{ id="elfen-lied";          q="elfen lied Lucy vectors";                 manga=$false; color="#d04060" },
    [pscustomobject]@{ id="clannad";             q="clannad afterstory countryside";          manga=$false; color="#4890c8" },
    [pscustomobject]@{ id="angel-beats";         q="angel beats afterlife school";            manga=$false; color="#6888d0" },
    [pscustomobject]@{ id="nana";               q="nana anime music tokyo";                 manga=$false; color="#c050a0" },
    [pscustomobject]@{ id="escaflowne";          q="vision of escaflowne guymelef sky";      manga=$false; color="#9060c0" },
    [pscustomobject]@{ id="claymore";            q="claymore anime warrior fantasy";          manga=$false; color="#8080a0" },
    [pscustomobject]@{ id="mirai-nikki";         q="future diary yuno gasai";                manga=$false; color="#d040a0" },
    [pscustomobject]@{ id="higurashi";           q="higurashi when they cry village";        manga=$false; color="#b03060" },
    [pscustomobject]@{ id="record-of-lodoss-war"; q="record of lodoss war fantasy";          manga=$false; color="#806040" },
    # ── Additional ──
    [pscustomobject]@{ id="no-game-no-life";     q="no game no life shiro sora chess";       manga=$false; color="#d08030" },
    [pscustomobject]@{ id="fate-grand-order";    q="fate grand order servants battle";       manga=$false; color="#c0a030" },
    # ── Manga extras ──
    [pscustomobject]@{ id="tokyo-ghoul-re";      q="tokyo ghoul re kaneki dark city";        manga=$false; color="#404060" },
    [pscustomobject]@{ id="blue-lock";           q="blue lock soccer football";              manga=$false; color="#2840c0" },
    [pscustomobject]@{ id="kingdom";             q="kingdom manga china war battlefield";    manga=$true;  color="#906040" },
    [pscustomobject]@{ id="blame";              q="blame nihei tsutomu megastructure";      manga=$true;  color="#506080" },
    [pscustomobject]@{ id="junji-ito";           q="junji ito horror manga spiral";          manga=$true;  color="#505050" },
    [pscustomobject]@{ id="uzumaki";             q="uzumaki junji ito spiral horror";        manga=$true;  color="#404040" },
    [pscustomobject]@{ id="pluto";              q="pluto naoki urasawa robot";              manga=$true;  color="#607090" },
    [pscustomobject]@{ id="battle-angel-alita";  q="battle angel alita gunnm cyborg";        manga=$true;  color="#506080" },
    [pscustomobject]@{ id="blade-of-the-immortal"; q="blade of the immortal samurai manga"; manga=$true;  color="#808070" },
    [pscustomobject]@{ id="hellsing";            q="hellsing alucard vampire";               manga=$false; color="#c02020" },
    [pscustomobject]@{ id="homunculus";          q="homunculus manga trepanation";           manga=$true;  color="#605050" },
    [pscustomobject]@{ id="holyland";            q="holyland manga street fight";            manga=$true;  color="#606060" },
    [pscustomobject]@{ id="berserk-of-gluttony"; q="berserk of gluttony manga dark fantasy"; manga=$true;  color="#803030" }
)

# ─── Download phase ──────────────────────────────────────────────────────────────
$results = @{}
$credits = @(
    "SEANIME THEME BACKGROUND CREDITS",
    "=" * 80,
    "All wallpaper images sourced from wallhaven.cc",
    "Wallhaven hosts community-uploaded wallpapers. Full credit to original artists.",
    "Please visit wallhaven.cc to find and credit the original creators.",
    "",
    "Theme ID                      | Wallhaven URL",
    "-" * 80
)

Write-Host "`n=== Downloading theme backgrounds ===`n"

foreach ($t in $themes) {
    $file = Join-Path $themesDir "$($t.id)-theme.ts"
    if (!(Test-Path $file)) {
        Write-Warning "No theme file: $($t.id)-theme.ts — skipping download"
        continue
    }

    $searchQ = if ($t.manga) { "$($t.q) monochrome" } else { $t.q }

    try {
        $params = @{
            q          = $searchQ
            categories = "110"
            purity     = "100"
            sorting    = "toplist"
            order      = "desc"
            topRange   = "1y"
        }
        $resp = Invoke-RestMethod $apiBase -Body $params -Method Get -TimeoutSec 15 -ErrorAction Stop

        if ($null -ne $resp.data -and $resp.data.Count -gt 0) {
            $img     = $resp.data[0]
            $imgUrl  = $img.path
            $uploader = try { $img.uploader.username } catch { "unknown" }
            $ext     = [IO.Path]::GetExtension($imgUrl)
            if ([string]::IsNullOrEmpty($ext)) { $ext = ".jpg" }

            $localName = "$($t.id)$ext"
            $localPath = Join-Path $outDir $localName
            $webPath   = "/themes/$localName"

            Invoke-WebRequest $imgUrl -OutFile $localPath -TimeoutSec 60 -ErrorAction Stop

            $results[$t.id] = @{ webPath = $webPath; imgUrl = $imgUrl; uploader = $uploader }
            $idPad = $t.id.PadRight(30)
            $credits += "${idPad}| $imgUrl"
            $credits += "                               Uploaded by: @$uploader -- https://wallhaven.cc/user/$uploader"
            $credits += ""

            Write-Host "  [OK] $($t.id)  ($uploader)"
        } else {
            Write-Warning "  [--] $($t.id) : no results on wallhaven"
            $results[$t.id] = @{ webPath = ""; imgUrl = ""; uploader = "" }
        }
    }
    catch {
        Write-Warning "  [!!] $($t.id) : $_"
        $results[$t.id] = @{ webPath = ""; imgUrl = ""; uploader = "" }
    }

    Start-Sleep -Milliseconds 700  # respect wallhaven rate limit (~85 req/min)
}

$credits | Out-File $creditsFile -Encoding UTF8
Write-Host "`nCredit file written: $creditsFile"

# ─── Update theme .ts files ────────────────────────────────────────────────────
Write-Host "`n=== Updating theme files ===`n"

foreach ($t in $themes) {
    $file = Join-Path $themesDir "$($t.id)-theme.ts"
    if (!(Test-Path $file)) { continue }

    $content = Get-Content $file -Raw -Encoding UTF8
    $changed = $false

    # ── 1. Extract particleColor from previewColors.primary if not in $t.color ──
    $color = $t.color
    if ([string]::IsNullOrWhiteSpace($color)) {
        if ($content -match 'primary:\s*"(#[0-9a-fA-F]{3,6})"') {
            $color = $Matches[1]
        } else {
            $color = "#ffffff"
        }
    }

    # ── 2. Background image URL ──
    $webPath = if ($results.ContainsKey($t.id)) { $results[$t.id].webPath } else { "" }

    if ($content -match 'backgroundImageUrl:\s*"https://[^"]*"') {
        # Replace existing CDN URL with local path
        if (-not [string]::IsNullOrEmpty($webPath)) {
            $content = $content -replace 'backgroundImageUrl:\s*"https://[^"]*"', "backgroundImageUrl: `"$webPath`""
            $changed = $true
        }
    }
    elseif ($content -match 'backgroundImageUrl:\s*""') {
        # Replace empty with local path
        $content = $content -replace 'backgroundImageUrl:\s*""', "backgroundImageUrl: `"$webPath`""
        $changed = $true
    }
    elseif ($content -notmatch 'backgroundImageUrl:') {
        # Insert backgroundImageUrl before milestoneNames (or before closing })
        if ($content -match 'milestoneNames:') {
            $content = $content -replace '(\s+milestoneNames:)', "    backgroundImageUrl: `"$webPath`",`n    backgroundDim: 0.30,`n    backgroundBlur: 30,`n`$1"
            $changed = $true
        }
    }

    # ── 3. backgroundDim / backgroundBlur — add if missing ──
    if ($content -notmatch 'backgroundDim:') {
        $content = $content -replace '(backgroundImageUrl:\s*"[^"]*",)', "`$1`n    backgroundDim: 0.30,`n    backgroundBlur: 30,"
        $changed = $true
    }

    # ── 4. hasAnimatedElements ──
    if ($content -match 'hasAnimatedElements:\s*false') {
        $content = $content -replace 'hasAnimatedElements:\s*false', 'hasAnimatedElements: true'
        $changed = $true
    }
    elseif ($content -notmatch 'hasAnimatedElements:') {
        $content = $content -replace '(backgroundImageUrl:\s*"[^"]*",)', "hasAnimatedElements: true,`n    `$1"
        $changed = $true
    }

    # ── 5. particleColor — add after backgroundImageUrl if missing ──
    if ($content -notmatch 'particleColor:') {
        $content = $content -replace '(backgroundImageUrl:\s*"[^"]*",)', "`$1`n    particleColor: `"$color`","
        $changed = $true
    }

    if ($changed) {
        [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
        Write-Host "  [OK] Updated $($t.id)-theme.ts"
    } else {
        Write-Host "  [--] No change $($t.id)-theme.ts"
    }
}

Write-Host "`n=== Done! ==="
Write-Host "Images: $outDir"
Write-Host "Credits: $creditsFile"
Write-Host "Run: npm --prefix seanime-web run build:desktop"

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Generate 150 evenly spaced milestone levels across 1000
const generateLevels = () => {
  return Array.from(
    { length: 150 },
    (_, i) => Math.round((i + 1) * (1000 / 150))
  );
};

// Map of theme names to their progressions
const milestoneProgressions = {
  "seanime": [
    "Viewer Initiate", "Show Watcher", "Episode Tracker", "Series Starter", "Anime Novice", 
    "Show Enthusiast", "Binge Watcher", "Seasonal Explorer", "Genre Dabbler", "Format Sampler",
    "Anime Collector", "Library Builder", "Title Seeker", "Review Contributor", "Rating Tracker",
    "Score Giver", "Completion Chaser", "Achievement Hunter", "Streaker", "Marathon Runner",
    "Deep Diver", "Lore Specialist", "Rewatch Master", "Quality Critic", "Studio Appreciator",
    "Staff Follower", "Adaptation Analyst", "Source Material Nerd", "Voice Actor Fan", "OST Lover",
    "Cosplay Enthusiast", "Fan Art Collector", "Community Member", "Forum Regular", "Discord Regular",
    "Wiki Contributor", "Recommendation Giver", "New Show Advocate", "Cult Classic Supporter", "Underdog Fan",
    "Award Show Tracker", "Festival Attendee", "Convention Goer", "Merchandise Collector", "Figure Hoarder",
    "Blu-ray Collector", "Limited Edition Seeker", "Signing Attendee", "Panel Participant", "Event Attendee",
    "Streaming Pioneer", "Early Adopter", "Trend Setter", "Cultural Ambassador", "Global Viewer",
    "Decade Viewer", "Generation Connector", "Cross-Genre Expert", "Format Connoisseur", "Platform Hopper",
    "Seasonal Completionist", "Year-Round Viewer", "All-Time Watcher", "Recording Keeper", "Memory Keeper",
    "Recommendation Database", "Taste Curator", "Mood Matcher", "Discovery Engine", "Hidden Gem Finder",
    "Mainstream Lover", "Niche Appreciator", "Balance Seeker", "Quality Obsessor", "Volume Seeker",
    "Speed Watcher", "Leisurely Viewer", "Strategic Planner", "Impulsive Viewer", "Scheduled Binger",
    "Night Owl", "Early Bird", "All-Hours Viewer", "Devoted Fan", "Casual Observer",
    "Serious Scholar", "Fun Enthusiast", "Emotional Responder", "Technical Analyst", "Story Lover",
    "Character Advocate", "Worldbuilding Fan", "Plot Tracker", "Animation Appreciator", "Music Savant",
    "Transformation Witness", "Legacy Builder", "Community Pillar", "Influence Spreader", "Anime Legend",
    "Hall of Fame Member", "Eternal Enthusiast", "Living Archive", "Master of All Anime", "Anime Transcendent",
    "Immortal Viewer", "Cosmic Anime Being", "Multiverse Anime Lord", "Anime Incarnate", "Ultimate Fan"
  ],
  
  "attack-on-titan": [
    "104th Cadet Corps Recruit", "Scout Regiment Novice", "Training Squad Member", "Garrison Guard", "Supply Corps Clerk",
    "Scout Scout Recruit", "Section Squad Trainee", "Garrison Unit Soldier", "Beast Titan Intel", "Wall Maria Explorer",
    "Shinzou Devotee", "ODM Gear Trainee", "Blade Wielder", "Scout Team Member", "Section Squad Fighter",
    "Garrison Elite Soldier", "Scout Squadron Leader", "Experienced Fighter", "Veteran Scout", "Commander's Assistant",
    "Squad Advisor", "Leadership Prospect", "Officer Candidate", "Captain-Class Contender", "Elite Warrior",
    "Tactical Specialist", "Titan Kill Counter", "ODM Master", "Blade Technique Specialist", "Combat Veteran",
    "Strategic Thinker", "Section Commander", "Wing Commander", "District Defender", "Wall Protector",
    "Colossal Titan Slayer", "Armored Titan Hunter", "Beast Titan Killer", "Female Titan Tracker", "War Horse Rider",
    "Explosive Specialist", "Thunder Spear Wielder", "Fortification Expert", "Supply Logistics Master", "Intel Gatherer",
    "Recon Specialist", "Enemy Territory Scout", "Wall Breach Responder", "Strategic Reserve", "Backup Fighter",
    "Front Line Warrior", "Sacrifice Witness", "Survivor", "Loss Bearer", "Hope Keeper",
    "Humanity's Fighter", "Titan Threat Assessor", "Territory Controller", "Strategic Planner", "Resource Manager",
    "Cadet Instructor", "Younger Generation Guide", "Legacy Carrier", "Warrior Mentor", "Strength Trainer",
    "Discipline Master", "Formation Leader", "Squad Morale Booster", "Courage Inspirer", "Victory Achiever",
    "Alliance Builder", "Political Player", "Power Balance Maintainer", "Negotiator", "Unified Force Creator",
    "Beast Kingdom Challenger", "Marley Opponent", "Paradis Guardian", "Island Protector", "Rumbling Defeater",
    "Freedom Warrior", "Dedication Embodied", "Heart Offered", "Final Victory Achiever", "Founding Titan Ascended"
  ],

  "demon-slayer": [
    "Ordinary Demon Slayer", "Trainee Slayer", "Lower Rank Initiate", "Demon Awareness Master", "Sword Forging Student",
    "Breathing Technique Learner", "Water Breathing Initiate", "Flame Breathing Apprentice", "Wind Breathing Seeker", "Sound Breathing Student",
    "Lower Moon IV Hunter", "Lower Moon III Challenger", "Lower Moon II Tracker", "Lower Moon I Contender", "Demon Slayer Graduation",
    "Upper Moon VI Candidate", "Upper Moon V Aspirant", "Upper Moon IV Challenger", "Upper Moon III Contender", "Upper Moon II Seeker",
    "Upper Moon I Rival", "Demon Slayer Pillar Cadet", "Water Pillar Apprentice", "Flame Pillar Student", "Wind Pillar Trainee",
    "Sound Pillar Listener", "Mist Pillar Seeker", "Serpent Pillar Follower", "Insect Pillar Scholar", "Love Pillar Devotee",
    "Stone Pillar Strength", "Flower Pillar Grace", "Pillar Council Member", "Hashira Rank Achieved", "Former Pillar Respect",
    "Breathing Master", "Multi-Breathing User", "Demon Technique Specialist", "Cursed Technique Mastery", "Swordsmith Partnership",
    "Total Concentration Mastery", "Constant Flow Achiever", "Rhythmic Breathing Expert", "Flashy Breathing Master", "Steady Breathing Keeper",
    "Demon Elimination Expert", "Slayer of Twelve Kizuki", "Powerful Demon Killer", "All-Powerful Slayer", "Catastrophe Warrior",
    "Infinity Castle Survivor", "Moon Slayer Supreme", "Star Slayer Expert", "Darkness Defeater", "Light Bearer",
    "Sword Skill Perfection", "Swordsmanship Legend", "Blade Wielding Master", "Cutting Technique Expert", "Precision Slayer",
    "Speed Demon Catcher", "Tactical Genius", "Strategy Master", "Teamwork Exemplar", "Squad Leader",
    "Corps Commander", "Supreme Leader", "Demon Slayer Organization Leader", "Ubuyashiki Replacement", "Covenant Keeper",
    "Muzan's Nemesis", "Demon King Slayer", "Evil Annihilator", "Darkness Destroyer", "Light's Champion",
    "Final Battle Warrior", "Humanity's Last Stand", "Demon Slayer Immortal", "Eternal Protector", "Muzan's Bane Supreme"
  ],

  "one-piece": [
    "Ordinary Villager", "Rookie Adventurer", "Sea Newcomer", "Bounty Hunter Initiate", "Navy Recruit",
    "Pirate Apprentice", "East Blue Sailor", "Crew Deckhand", "Small Bounty Start", "100 Belly Hunter",
    "1000 Belly Pirate", "Grand Line Aspirant", "Ocean Explorer", "Supernova Candidate", "New Era Warrior",
    "Yonko Subordinate", "Admiral Academy Graduate", "Warlord Ally", "Fleet Member", "Ship Specialist",
    "Navigation Expert", "Combat Trainer", "Weapon Master", "Devil Fruit User", "Observation Haki Beginner",
    "Armament Haki Learner", "Conqueror's Aura User", "Powerful Fighter", "Legendary Warrior", "Immortal Being",
    "Fleet General", "Yonko Commander", "Admiral Class Fighter", "Revolutionary Ally", "Island Lord",
    "Military Strategist", "Naval Tactician", "Treasure Seeker", "Adventure Champion", "Ocean King Candidate",
    "New World Legend", "Sky Walker", "Deep Sea Explorer", "Underground King", "Underworld Leader",
    "Secret Weapon", "Ultimate Power", "Time Traveler", "Past Bearer", "Future Seeker",
    "Prophecy Keeper", "Ancient Text Reader", "History Repeater", "Destiny Changer", "Fate Bender",
    "Love Boat Ally", "Straw Hat Follower", "Pirate Alliance Member", "Flag Holder", "Dream Supporter",
    "Nakama Bond", "Friendship Champion", "Crew Protector", "Captain's Right Hand", "Legend Maker",
    "Bounty Multiplier", "Chaos Creator", "Government Threat", "Marine Target", "Living Danger",
    "Impossible Warrior", "Miracle Worker", "Comeback King", "Never Surrender Spirit", "Never Say Die Warrior",
    "Pirate King Contender", "Ocean's Greatest Power", "World's Strongest Fighter", "Freedom Champion", "King of Pirates"
  ],

  "jujutsu-kaisen": [
    "Cursed Spirit Aware", "Jujutsu Novice", "Academy Student", "Grade 4 Sorcerer", "Grade 3 Novice",
    "Grade 3 Sorcerer", "Grade 2 Candidate", "Grade 2 Sorcerer", "Special Grade Track", "Semi-Grade 1 Aspirant",
    "Semi-Grade 1 Sorcerer", "Special Grade Candidate", "Special Grade Sorcerer", "Cursed Technique Beginner", "Technique Mastery Student",
    "Domain Expansion Learner", "Domain Creation Aspirant", "Domain Expansion User", "Cursed Tool Wielder", "Potent Sorcerer",
    "Powerful Sorcerer", "Curse Specialist", "Disaster Curse Level", "Calamity Class", "Catastrophic Power",
    "Ancient Power Holder", "Curse King's Proxy", "Sukuna's Interest", "Finger Bearer", "Vessel Candidate",
    "Black Flash Master", "Binding Vow Expert", "Cursed Speech User", "Limitless Technique", "Infinity Infinity",
    "Six Eyes Bearer", "Jujutsu Highlander", "Cursed Spirit Hunter Elite", "Malevolent Shrine User", "Divine Punishment Wielder",
    "Hollow Purple Caster", "Cleave Master", "Dismantle Specialist", "Cursed Flame User", "Cursed Womb Destroyer",
    "Special Grade Assistant", "Special Grade Teacher", "Sorcerer Council Member", "Higher-Up Influencer", "Political Power",
    "Corporate Sorcerer", "Cursed Corporation Leader", "Jujutsu Headquarters Presence", "Kenjaku's Opponent", "Curse User Hunter",
    "Immortality Seeker", "Soul Transfer Expert", "Cursed Technique Jujutsu", "Heavenly Restriction Bearer", "Divine Technique User",
    "Godly Power", "Transcendent Sorcerer", "Beyond Human Limits", "Supernatural Being", "Cursed Spirit Hybrid",
    "Cursed Object Collector", "Cursed Energy Amplifier", "Technique Perfection", "Absolute Technique", "Ultimate Jujutsu User",
    "Sukuna's Challenge", "King of Curses Rival", "Malevolent Power", "Golden Age Sorcerer", "Eternal Jujutsu Master",
    "Transcendental Existence", "Cursed Realm Ruler", "Jujutsu Transcendence"
  ],
};

// Generate milestones for a theme based on progression array
const generateMilestones = (progressionArray) => {
  const levels = generateLevels();
  const result = {};
  
  for (let i = 0; i < levels.length; i++) {
    result[levels[i]] = progressionArray[i] || `Rank ${i + 1}`;
  }
  
  return result;
};

// Extract theme ID from filename
const getThemeId = (filename) => {
  return filename.replace('-theme.ts', '').replace(/^\d+-/, '');
};

// Read all theme files
const themesDir = 'e:/Main/server/seaserver/seanime-web/src/lib/theme/anime-themes';
const themeFiles = fs.readdirSync(themesDir)
  .filter(f => f.endsWith('-theme.ts') && f !== 'animated-elements.tsx');

console.log(`Found ${themeFiles.length} theme files`);
console.log('Example files:', themeFiles.slice(0, 5));

// Show what needs to be updated
console.log('\nThemes that need milestone progression generation:');
themeFiles.forEach(file => {
  const themeId = getThemeId(file);
  const hasProgression = milestoneProgressions[themeId];
  console.log(`${file}: ${hasProgression ? '✓ Has progression' : '✗ Needs progression'}`);
});

console.log(`\n${Object.keys(milestoneProgressions).length} themes have progressions defined.`);
console.log(`${themeFiles.length - Object.keys(milestoneProgressions).length} themes need progressions.`);

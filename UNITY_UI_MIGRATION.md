# VYTHERA — Unity UI / Front-End Migration Matrix

This document tracks the complete audit and 1-to-1 migration of all user interface screens, menus, studios, editors, and HUD components from the legacy VYTHERA TypeScript/HTML codebase into the Unity 6.6 C# architecture.

---

## Screen Migration Matrix

| Old Screen / Component | Old TypeScript Source | Unity Screen / Component | Unity Namespace & File | Data / System Connection | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Title & Main Menu** | `src/ui/MainMenu.ts` (`.vy-home`) | `MainMenuScreen` | `VYTHERA.UI.MainMenu.MainMenuScreen` | Connects to `SaveManager`, `GameBootstrapper`, and `UIManager` navigation | Implemented & Verified |
| **Character Preview Card** | `src/ui/MainMenu.ts`, `ProfilePreview3D.ts` | `CharacterPreviewWidget` | `VYTHERA.UI.MainMenu.MainMenuScreen` | Connects to player model renderer and wardrobe configuration | Implemented & Verified |
| **World Selection (Load Game)** | `src/ui/MainMenu.ts` (`[data-world-view="list"]`) | `WorldSelectScreen` | `VYTHERA.UI.WorldSelect.WorldSelectScreen` | Reads saved world JSON files from `SaveManager.ListWorlds()`, boots selected seed | Implemented & Verified |
| **World Creation** | `src/ui/MainMenu.ts` (`[data-world-view="create"]`) | `WorldCreationScreen` | `VYTHERA.UI.WorldCreation.WorldCreationScreen` | Seeds `GameBootstrapper.WorldSeed`, sets biome and structure flags | Implemented & Verified |
| **Settings (General & Video)** | `src/ui/MainMenu.ts`, `gfxPrefs.ts` | `SettingsScreen` | `VYTHERA.UI.Settings.SettingsScreen` | Direct binding to `QualityManager`, `RenderPipelineManager`, URP assets | Implemented & Verified |
| **Settings (Controls)** | `src/ui/MainMenu.ts` | `SettingsScreen` (Controls tab) | `VYTHERA.UI.Settings.SettingsScreen` | Direct binding to `PlayerInputHandler` sensitivities and axis inversions | Implemented & Verified |
| **Settings (Privacy & AI)** | `src/ui/MainMenu.ts`, `onlineSettings.ts` | `SettingsScreen` (AI tab) | `VYTHERA.UI.Settings.SettingsScreen` | Toggles local AI vs offline mode, sets network telemetry policy | Implemented & Verified |
| **Survival HUD (Health & Hunger)** | `src/ui/Hud.ts` | `SurvivalHUD` | `VYTHERA.UI.HUDManager` | Binds to `SurvivalSystem.OnHealthChanged`, `OnHungerChanged` | Implemented & Verified |
| **Survival HUD (Compass & Biome)** | `src/ui/Hud.ts` | `SurvivalHUD` | `VYTHERA.UI.HUDManager` | Binds to `PlayerCameraRig.Yaw` and coordinates | Implemented & Verified |
| **Survival HUD (Targeted Look)** | `src/ui/Hud.ts` (`.vy-hud__look`) | `SurvivalHUD` (Target indicator) | `VYTHERA.UI.HUDManager` | Binds to `BlockInteractionSystem` crosshair raycast hit block | Implemented & Verified |
| **In-Game Hotbar** | `src/ui/InventoryUi.ts` (`.vy-hotbar`) | `HotbarUI` | `VYTHERA.UI.HUDManager` | Binds to `InventorySystem.HotbarSlots` and `SelectedHotbarIndex` | Implemented & Verified |
| **In-Game Inventory (Storage Grid)** | `src/ui/InventoryUi.ts` (`.vy-inv-card`) | `InventoryScreen` | `VYTHERA.UI.Inventory.InventoryScreen` | Binds to `InventorySystem.StorageSlots` (27 slots) with drag/drop/split | Implemented & Verified |
| **Equipment & Armor Stats** | `src/ui/InventoryUi.ts`, `EquipmentSystem.ts` | `InventoryScreen` (Equip tab) | `VYTHERA.UI.Inventory.InventoryScreen` | Binds to `EquipmentSystem` (Head, Chest, Legs, Feet) and armor ratings | Implemented & Verified |
| **Crafting (2x2 Player & 3x3 Table)** | `src/ui/InventoryUi.ts`, `Crafting.ts` | `InventoryScreen` (Craft grid) | `VYTHERA.UI.Inventory.InventoryScreen` | Binds to `RecipeRegistry` for pattern matching and item output | Implemented & Verified |
| **Pause Menu** | `src/ui/PauseMenu.ts` | `PauseMenuScreen` | `VYTHERA.UI.Pause.PauseMenuScreen` | Binds to game timescale, `SaveManager.SaveWorld()`, and scene unload | Implemented & Verified |
| **Death & Respawn Screen** | `src/ui/Hud.ts` (`.vy-hud__death`) | `DeathScreen` | `VYTHERA.UI.HUDManager` | Binds to `SurvivalSystem.OnDied`, triggers player respawn teleport | Implemented & Verified |
| **Custom World Editor** | `src/ui/customworld/CustomWorldEditor.ts` | `CustomWorldScreen` | `VYTHERA.UI.WorldEditor.CustomWorldScreen` | Binds to `TerrainGenerator` procedural noise frequency and height bounds | Implemented & Verified |
| **MOD Studio** | `src/ui/modstudio/ModStudioApp.ts` | `ModStudioScreen` | `VYTHERA.UI.ModStudio.ModStudioScreen` | Mod manifest, custom block definitions, and animation curve hooks | Implemented & Verified |
| **MOD Hub** | `src/ui/modhub/ModHubApp.ts` | `ModHubScreen` | `VYTHERA.UI.ModHub.ModHubScreen` | Installed mod listing, enable/disable toggles, package importer | Implemented & Verified |
| **AI Studio / Vision UI** | `src/vythera_ai/ui/VytheraAIStudio.ts` | `AIStudioScreen` | `VYTHERA.UI.AI.AIStudioScreen` | Local AI agent state inspection, vision recognition debug output | Implemented & Verified |
| **Multiplayer / Friends Panel** | `src/ui/FriendsPanel.ts`, `SocialClient.ts` | `MultiplayerScreen` | `VYTHERA.UI.Multiplayer.MultiplayerScreen` | Friend code generation, friend list management, LAN lobby discovery | Implemented & Verified |
| **Touch Controls (Mobile)** | `src/ui/TouchControls.ts` | `TouchControls` | `VYTHERA.UI.Touch.TouchControls` | On-screen virtual joystick, jump, sprint, sneak, break/place touch buttons | Implemented & Verified |

---

## Design System Tokens & Aesthetics

- **Color Palette**:
  - Void Background: `#030507`
  - Deep Obsidian Surface: `#070a0e` (with alpha `0.72` to `0.85` for panel glass)
  - Ornamental Gold: `#c9a227` (accent trims, dividers, active state highlights)
  - Bright Gold: `#e0c068` (hover states, brand gems)
  - Moss Green: `#5f9e78` (success, nature tags, health/recovery)
  - Teal: `#4eb8a8` (magic, active slots, selections)
  - Warm Ink Text: `#f3eee2` (primary typography), `#a4b3a8` (muted subtitles)
- **Responsive Guidelines**:
  - Desktop: Clean 16:9 / 21:9 responsive scaling with cursor locking and hotkeys (Esc, E, F5, F6, 1-9).
  - Mobile: Safe-area padding, minimum 44px touch targets, touch look/drag zones, and virtual on-screen controls.
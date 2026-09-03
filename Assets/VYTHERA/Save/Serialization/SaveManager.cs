using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using VYTHERA.Gameplay.Equipment;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.Gameplay.Survival;
using VYTHERA.Player.Physics;

namespace VYTHERA.Save
{
    [Serializable]
    public sealed class WorldSaveData
    {
        public int Version = 1;
        public string Seed;
        public long SavedTimestamp;

        // Player state
        public float PlayerX;
        public float PlayerY;
        public float PlayerZ;
        public float PlayerYaw;
        public float PlayerPitch;
        public float Health = 20f;
        public float Hunger = 20f;

        // Inventory & Equipment
        public List<ItemStack> Inventory = new List<ItemStack>();
        public List<ItemStack> Equipment = new List<ItemStack>();

        // Modified world blocks: "x,y,z:blockId"
        public List<string> ModifiedBlocks = new List<string>();
    }

    public static class SaveManager
    {
        public const int CurrentFormatVersion = 1;
        private static string SaveDirectory => Path.Combine(Application.persistentDataPath, "Saves");

        public static string GetSaveFilePath(string seed)
        {
            if (!Directory.Exists(SaveDirectory))
            {
                Directory.CreateDirectory(SaveDirectory);
            }
            return Path.Combine(SaveDirectory, $"world_{seed.Trim().ToLowerInvariant()}.json");
        }

        public static bool SaveWorld(
            string seed,
            PlayerPhysics player,
            SurvivalSystem survival,
            InventorySystem inventory,
            EquipmentSystem equipment,
            Dictionary<Vector3Int, byte> modifiedBlocks)
        {
            try
            {
                var data = new WorldSaveData
                {
                    Version = CurrentFormatVersion,
                    Seed = seed,
                    SavedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                };

                if (player != null)
                {
                    data.PlayerX = player.Position.x;
                    data.PlayerY = player.Position.y;
                    data.PlayerZ = player.Position.z;
                }

                if (survival != null)
                {
                    data.Health = survival.Health;
                    data.Hunger = survival.Hunger;
                }

                if (inventory != null)
                {
                    for (int i = 0; i < InventorySystem.TotalSlots; i++)
                    {
                        data.Inventory.Add(inventory.GetSlot(i));
                    }
                }

                if (equipment != null)
                {
                    for (int i = 0; i < 6; i++)
                    {
                        data.Equipment.Add(equipment.GetEquipment((EquipmentSlot)i));
                    }
                }

                if (modifiedBlocks != null)
                {
                    foreach (var kvp in modifiedBlocks)
                    {
                        data.ModifiedBlocks.Add($"{kvp.Key.x},{kvp.Key.y},{kvp.Key.z}:{kvp.Value}");
                    }
                }

                string json = JsonUtility.ToJson(data, true);
                File.WriteAllText(GetSaveFilePath(seed), json);
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SaveManager] Failed to save world: {ex.Message}");
                return false;
            }
        }

        public static WorldSaveData LoadWorld(string seed)
        {
            string path = GetSaveFilePath(seed);
            if (!File.Exists(path)) return null;

            try
            {
                string json = File.ReadAllText(path);
                var data = JsonUtility.FromJson<WorldSaveData>(json);

                if (data != null && data.Version < CurrentFormatVersion)
                {
                    data = MigrateSaveData(data);
                }

                return data;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SaveManager] Failed to load world: {ex.Message}");
                return null;
            }
        }

        public static bool HasSavedWorld(string seed)
        {
            if (string.IsNullOrEmpty(seed)) return false;
            return File.Exists(GetSaveFilePath(seed));
        }

        public static List<WorldSaveData> ListSavedWorlds()
        {
            var list = new List<WorldSaveData>();
            if (!Directory.Exists(SaveDirectory)) return list;

            var files = Directory.GetFiles(SaveDirectory, "world_*.json");
            foreach (var f in files)
            {
                try
                {
                    string json = File.ReadAllText(f);
                    var data = JsonUtility.FromJson<WorldSaveData>(json);
                    if (data != null) list.Add(data);
                }
                catch
                {
                    // Ignore corrupted files
                }
            }
            return list;
        }

        public static bool DeleteSave(string seed) => DeleteWorld(seed);

        public static bool DeleteWorld(string seed)
        {
            try
            {
                string path = GetSaveFilePath(seed);
                if (File.Exists(path))
                {
                    File.Delete(path);
                    return true;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SaveManager] Failed to delete world '{seed}': {ex.Message}");
            }
            return false;
        }

        private static WorldSaveData MigrateSaveData(WorldSaveData oldData)
        {
            // Forward compatibility migrations
            oldData.Version = CurrentFormatVersion;
            return oldData;
        }
    }
}

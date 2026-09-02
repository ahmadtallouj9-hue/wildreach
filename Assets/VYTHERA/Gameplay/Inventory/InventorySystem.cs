using System;
using UnityEngine;

namespace VYTHERA.Gameplay.Inventory
{
    public sealed class InventorySystem : MonoBehaviour
    {
        public const int HotbarSlots = 9;
        public const int MainSlots = 27;
        public const int TotalSlots = HotbarSlots + MainSlots; // 36

        [SerializeField] private ItemStack[] _slots = new ItemStack[TotalSlots];
        public int SelectedHotbarIndex = 0;

        public event Action OnInventoryChanged;
        public event Action<int> OnHotbarSelected;

        public ItemStack GetSlot(int index)
        {
            if ((uint)index >= TotalSlots) return ItemStack.Empty;
            return _slots[index];
        }

        public void SetSlot(int index, ItemStack item)
        {
            if ((uint)index < TotalSlots)
            {
                _slots[index] = item;
                OnInventoryChanged?.Invoke();
            }
        }

        public ItemStack GetHotbarSlot(int index) => GetSlot(index);
        public void SetHotbarSlot(int index, ItemStack item)
        {
            if ((uint)index < HotbarSlots)
            {
                _slots[index] = item;
                OnInventoryChanged?.Invoke();
            }
        }

        public ItemStack GetStorageSlot(int index) => GetSlot(HotbarSlots + index);
        public void SetStorageSlot(int index, ItemStack item)
        {
            if ((uint)index < MainSlots)
            {
                _slots[HotbarSlots + index] = item;
                OnInventoryChanged?.Invoke();
            }
        }

        public ItemStack GetSelectedHotbarItem()
        {
            return GetSlot(SelectedHotbarIndex);
        }

        public ItemStack AddItem(ItemStack stack)
        {
            if (stack.IsEmpty) return ItemStack.Empty;
            AddItem(stack.ItemId, stack.Count, stack.Durability, stack.MaxDurability);
            return ItemStack.Empty;
        }

        public bool AddItem(int itemId, int count = 1, int durability = 0, int maxDurability = 0)
        {
            if (itemId == 0 || count <= 0) return false;
            var def = ItemRegistry.Get(itemId);
            int maxStack = def.MaxStackSize > 0 ? def.MaxStackSize : 64;

            // Try stacking onto existing non-full slots
            for (int i = 0; i < TotalSlots; i++)
            {
                if (_slots[i].ItemId == itemId && _slots[i].Count < maxStack)
                {
                    int space = maxStack - _slots[i].Count;
                    int toAdd = Math.Min(space, count);
                    _slots[i].Count += toAdd;
                    count -= toAdd;
                    if (count <= 0)
                    {
                        OnInventoryChanged?.Invoke();
                        return true;
                    }
                }
            }

            // Place in first empty slot
            for (int i = 0; i < TotalSlots; i++)
            {
                if (_slots[i].IsEmpty)
                {
                    int toAdd = Math.Min(maxStack, count);
                    _slots[i] = new ItemStack(itemId, toAdd, durability, maxDurability);
                    count -= toAdd;
                    if (count <= 0)
                    {
                        OnInventoryChanged?.Invoke();
                        return true;
                    }
                }
            }

            OnInventoryChanged?.Invoke();
            return count <= 0;
        }

        public bool RemoveItem(int itemId, int count = 1)
        {
            if (itemId == 0 || count <= 0) return false;

            int remaining = count;
            for (int i = TotalSlots - 1; i >= 0; i--)
            {
                if (_slots[i].ItemId == itemId)
                {
                    int toTake = Math.Min(_slots[i].Count, remaining);
                    _slots[i].Count -= toTake;
                    remaining -= toTake;
                    if (_slots[i].Count <= 0) _slots[i] = ItemStack.Empty;
                    if (remaining <= 0) break;
                }
            }

            if (remaining <= 0)
            {
                OnInventoryChanged?.Invoke();
                return true;
            }

            return false;
        }

        public void SwapSlots(int fromIndex, int toIndex)
        {
            if ((uint)fromIndex >= TotalSlots || (uint)toIndex >= TotalSlots) return;

            var temp = _slots[fromIndex];
            _slots[fromIndex] = _slots[toIndex];
            _slots[toIndex] = temp;
            OnInventoryChanged?.Invoke();
        }

        public void SelectHotbar(int index)
        {
            if (index >= 0 && index < HotbarSlots)
            {
                SelectedHotbarIndex = index;
                OnHotbarSelected?.Invoke(index);
                OnInventoryChanged?.Invoke();
            }
        }
    }
}

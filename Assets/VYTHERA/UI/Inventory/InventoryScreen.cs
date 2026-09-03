using System;
using UnityEngine;
using UnityEngine.UI;
using VYTHERA.Gameplay.Crafting;
using VYTHERA.Gameplay.Equipment;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.UI.Core;
using VYTHERA.Voxel.Data;

namespace VYTHERA.UI.Inventory
{
    public sealed class InventoryScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "Inventory";

        [SerializeField] private InventorySystem _inventory;
        [SerializeField] private EquipmentSystem _equipment;

        private GameObject _rootPanel;
        public bool IsOpen => _rootPanel != null && _rootPanel.activeSelf;

        private ItemStack _cursorItem = ItemStack.Empty;
        private ItemStack[] _craftGrid = new ItemStack[4];
        private ItemStack _craftResult = ItemStack.Empty;

        private Image[] _storageSlotImages = new Image[27];
        private Text[] _storageSlotCounts = new Text[27];
        private Image[] _hotbarSlotImages = new Image[9];
        private Text[] _hotbarSlotCounts = new Text[9];
        private Image[] _equipSlotImages = new Image[4];
        private Image[] _craftSlotImages = new Image[4];
        private Text[] _craftSlotCounts = new Text[4];
        private Image _resultSlotImage;
        private Text _resultSlotCount;
        private Text _armorStatsText;

        private GameObject _cursorObject;
        private Image _cursorImage;
        private Text _cursorCountText;

        private void Awake()
        {
            BuildUI();
        }

        private void Start()
        {
            if (_inventory == null) _inventory = FindAnyObjectByType<InventorySystem>();
            if (_equipment == null) _equipment = FindAnyObjectByType<EquipmentSystem>();

            UIManager.Instance?.RegisterScreen(this);
            Hide();
        }

        private void OnDestroy()
        {
            UIManager.Instance?.UnregisterScreen(this);
        }

        private static Sprite _inventoryBgSprite;

        public static Sprite GetInventorySprite()
        {
            if (_inventoryBgSprite != null) return _inventoryBgSprite;

            _inventoryBgSprite = Resources.Load<Sprite>("UI/inventory") ?? Resources.Load<Sprite>("inventory");
            if (_inventoryBgSprite != null) return _inventoryBgSprite;

            string[] searchPaths = new[]
            {
                System.IO.Path.Combine(Application.dataPath, "VYTHERA/UI/Inventory/inventory.png"),
                System.IO.Path.Combine(Application.dataPath, "Resources/UI/inventory.png"),
                System.IO.Path.Combine(Application.streamingAssetsPath, "inventory.png")
            };

            foreach (var path in searchPaths)
            {
                if (System.IO.File.Exists(path))
                {
                    try
                    {
                        byte[] bytes = System.IO.File.ReadAllBytes(path);
                        var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                        tex.filterMode = FilterMode.Point;
                        if (tex.LoadImage(bytes))
                        {
                            tex.filterMode = FilterMode.Point;
                            _inventoryBgSprite = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f));
                            return _inventoryBgSprite;
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning("[InventoryScreen] Texture load warning: " + ex.Message);
                    }
                }
            }

            return null;
        }

        private Image _cardImage;

        private void Update()
        {
            var keyboard = UnityEngine.InputSystem.Keyboard.current;
            if (keyboard != null)
            {
                if (keyboard.eKey.wasPressedThisFrame || (IsOpen && keyboard.escapeKey.wasPressedThisFrame))
                {
                    if (IsOpen) CloseInventory();
                    else OpenInventory();
                }
            }

            // Update floating cursor position
            if (IsOpen && _cursorObject != null)
            {
                var mouse = UnityEngine.InputSystem.Mouse.current;
                if (mouse != null)
                {
                    _cursorObject.transform.position = mouse.position.ReadValue();
                }
            }
        }

        public void OpenInventory()
        {
            Show();
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            RefreshAllSlots();
        }

        public void CloseInventory()
        {
            // Return cursor item and crafting items to inventory
            if (!_cursorItem.IsEmpty && _inventory != null)
            {
                _cursorItem = _inventory.AddItem(_cursorItem);
            }
            for (int i = 0; i < 4; i++)
            {
                if (!_craftGrid[i].IsEmpty && _inventory != null)
                {
                    _inventory.AddItem(_craftGrid[i]);
                    _craftGrid[i] = ItemStack.Empty;
                }
            }
            _craftResult = ItemStack.Empty;

            Hide();
            if (!Application.isMobilePlatform)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }

        public void Show()
        {
            if (_rootPanel != null)
            {
                _rootPanel.SetActive(true);
                if (_cardImage != null && _cardImage.sprite == null)
                {
                    var spr = GetInventorySprite();
                    if (spr != null)
                    {
                        _cardImage.sprite = spr;
                        _cardImage.color = Color.white;
                    }
                }
            }
            RefreshAllSlots();
        }

        public void Hide()
        {
            if (_rootPanel != null) _rootPanel.SetActive(false);
        }

        private void BuildUI()
        {
            _rootPanel = UIWidgetFactory.CreatePanel(transform, "InventoryRoot", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);

            var sprite = GetInventorySprite();
            var card = UIWidgetFactory.CreatePanel(_rootPanel.transform, "Card", sprite != null ? Color.white : UIColors.SurfaceCard, new Vector2(760f, 620f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f));
            _cardImage = card.GetComponent<Image>();
            if (_cardImage != null && sprite != null)
            {
                _cardImage.sprite = sprite;
                _cardImage.color = Color.white;
                _cardImage.type = Image.Type.Simple;
                _cardImage.preserveAspect = true;
            }

            // Title & Close Button
            var title = UIWidgetFactory.CreateText(card.transform, "Title", "INVENTORY & CRAFTING", 18, UIColors.Gold, TextAnchor.MiddleLeft);
            var tRt = title.GetComponent<RectTransform>();
            tRt.anchorMin = new Vector2(0.05f, 0.92f);
            tRt.anchorMax = new Vector2(0.85f, 0.98f);
            tRt.offsetMin = Vector2.zero;
            tRt.offsetMax = Vector2.zero;

            var closeBtn = UIWidgetFactory.CreateButton(card.transform, "BtnClose", "✕", UIColors.SurfaceSolid, UIColors.Ink, CloseInventory, 36f, 36f);
            var cbRt = closeBtn.GetComponent<RectTransform>();
            cbRt.anchorMin = new Vector2(0.95f, 0.95f);
            cbRt.anchorMax = new Vector2(0.95f, 0.95f);
            cbRt.anchoredPosition = new Vector2(-18f, -18f);

            // ── TOP ROW: Equipment + Avatar Box + 2x2 Crafting ──────────────────────
            // 1. Equipment Column (4 slots)
            var equipCol = new GameObject("EquipCol", typeof(RectTransform), typeof(VerticalLayoutGroup));
            equipCol.transform.SetParent(card.transform, false);
            var ecRt = equipCol.GetComponent<RectTransform>();
            ecRt.anchorMin = new Vector2(0.06f, 0.52f);
            ecRt.anchorMax = new Vector2(0.18f, 0.90f);
            ecRt.offsetMin = Vector2.zero;
            ecRt.offsetMax = Vector2.zero;

            string[] equipNames = { "Helmet", "Chest", "Legs", "Boots" };
            for (int i = 0; i < 4; i++)
            {
                int slotIdx = i;
                CreateSlot(equipCol.transform, "Equip_" + equipNames[i], out _equipSlotImages[i], out var countTxt, () => OnEquipSlotClicked(slotIdx));
                countTxt.gameObject.SetActive(false);
            }

            // 2. Avatar Preview Box
            var avatarBox = UIWidgetFactory.CreatePanel(card.transform, "AvatarBox", UIColors.SurfaceSolid, new Vector2(160f, 200f), new Vector2(0.34f, 0.71f), new Vector2(0.34f, 0.71f));
            var avLabel = UIWidgetFactory.CreateText(avatarBox.transform, "AvLabel", "WANDERER", 13, UIColors.Gold, TextAnchor.MiddleCenter);
            var avRt = avLabel.GetComponent<RectTransform>();
            avRt.anchorMin = new Vector2(0f, 0.8f);
            avRt.anchorMax = new Vector2(1f, 1f);
            avRt.offsetMin = Vector2.zero;
            avRt.offsetMax = Vector2.zero;

            _armorStatsText = UIWidgetFactory.CreateText(avatarBox.transform, "ArmorStats", "Armor: 0", 12, UIColors.Teal, TextAnchor.LowerCenter);
            var astRt = _armorStatsText.GetComponent<RectTransform>();
            astRt.anchorMin = new Vector2(0f, 0f);
            astRt.anchorMax = new Vector2(1f, 0.2f);
            astRt.offsetMin = Vector2.zero;
            astRt.offsetMax = Vector2.zero;

            // 3. Crafting 2x2 Grid + Result
            var craftPanel = UIWidgetFactory.CreatePanel(card.transform, "CraftPanel", UIColors.SurfaceSolid, new Vector2(250f, 200f), new Vector2(0.72f, 0.71f), new Vector2(0.72f, 0.71f));
            var craftTitle = UIWidgetFactory.CreateText(craftPanel.transform, "CraftTitle", "Crafting (2x2)", 13, UIColors.InkDim, TextAnchor.UpperLeft);
            var ctRt = craftTitle.GetComponent<RectTransform>();
            ctRt.anchorMin = new Vector2(0.08f, 0.82f);
            ctRt.anchorMax = new Vector2(0.9f, 0.98f);
            ctRt.offsetMin = Vector2.zero;
            ctRt.offsetMax = Vector2.zero;

            var craftGridGo = new GameObject("CraftGrid", typeof(RectTransform), typeof(GridLayoutGroup));
            craftGridGo.transform.SetParent(craftPanel.transform, false);
            var cgRt = craftGridGo.GetComponent<RectTransform>();
            cgRt.anchorMin = new Vector2(0.08f, 0.15f);
            cgRt.anchorMax = new Vector2(0.58f, 0.80f);
            cgRt.offsetMin = Vector2.zero;
            cgRt.offsetMax = Vector2.zero;

            var cgl = craftGridGo.GetComponent<GridLayoutGroup>();
            cgl.cellSize = new Vector2(50f, 50f);
            cgl.spacing = new Vector2(6f, 6f);
            cgl.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            cgl.constraintCount = 2;

            for (int i = 0; i < 4; i++)
            {
                int craftIdx = i;
                CreateSlot(craftGridGo.transform, "Craft_" + i, out _craftSlotImages[i], out _craftSlotCounts[i], () => OnCraftSlotClicked(craftIdx));
            }

            // Arrow & Result Slot
            var arrow = UIWidgetFactory.CreateText(craftPanel.transform, "Arrow", "➔", 22, UIColors.Gold, TextAnchor.MiddleCenter);
            var aRt = arrow.GetComponent<RectTransform>();
            aRt.anchorMin = new Vector2(0.60f, 0.4f);
            aRt.anchorMax = new Vector2(0.72f, 0.6f);
            aRt.offsetMin = Vector2.zero;
            aRt.offsetMax = Vector2.zero;

            var resSlotGo = new GameObject("ResultSlot", typeof(RectTransform));
            resSlotGo.transform.SetParent(craftPanel.transform, false);
            var rsRt = resSlotGo.GetComponent<RectTransform>();
            rsRt.anchorMin = new Vector2(0.74f, 0.35f);
            rsRt.anchorMax = new Vector2(0.96f, 0.65f);
            rsRt.offsetMin = Vector2.zero;
            rsRt.offsetMax = Vector2.zero;
            CreateSlot(resSlotGo.transform, "Result", out _resultSlotImage, out _resultSlotCount, OnCraftResultClicked);

            // ── BOTTOM: 27 Storage Slots (3 rows x 9) ──────────────────────────────
            var storageGo = new GameObject("StorageGrid", typeof(RectTransform), typeof(GridLayoutGroup));
            storageGo.transform.SetParent(card.transform, false);
            var sRt = storageGo.GetComponent<RectTransform>();
            sRt.anchorMin = new Vector2(0.05f, 0.16f);
            sRt.anchorMax = new Vector2(0.95f, 0.48f);
            sRt.offsetMin = Vector2.zero;
            sRt.offsetMax = Vector2.zero;

            var sgl = storageGo.GetComponent<GridLayoutGroup>();
            sgl.cellSize = new Vector2(64f, 56f);
            sgl.spacing = new Vector2(6f, 6f);
            sgl.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            sgl.constraintCount = 9;

            for (int i = 0; i < 27; i++)
            {
                int invIdx = i;
                CreateSlot(storageGo.transform, "Storage_" + i, out _storageSlotImages[i], out _storageSlotCounts[i], () => OnStorageSlotClicked(invIdx));
            }

            // ── BOTTOM: 9 Hotbar Slots (1 row x 9) ──────────────────────────────────
            var hotbarGo = new GameObject("HotbarGrid", typeof(RectTransform), typeof(GridLayoutGroup));
            hotbarGo.transform.SetParent(card.transform, false);
            var hRt = hotbarGo.GetComponent<RectTransform>();
            hRt.anchorMin = new Vector2(0.05f, 0.03f);
            hRt.anchorMax = new Vector2(0.95f, 0.13f);
            hRt.offsetMin = Vector2.zero;
            hRt.offsetMax = Vector2.zero;

            var hgl = hotbarGo.GetComponent<GridLayoutGroup>();
            hgl.cellSize = new Vector2(64f, 54f);
            hgl.spacing = new Vector2(6f, 6f);
            hgl.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            hgl.constraintCount = 9;

            for (int i = 0; i < 9; i++)
            {
                int hbIdx = i;
                CreateSlot(hotbarGo.transform, "Hotbar_" + i, out _hotbarSlotImages[i], out _hotbarSlotCounts[i], () => OnHotbarSlotClicked(hbIdx));
            }

            // ── FLOATING CURSOR ─────────────────────────────────────────────────────
            _cursorObject = new GameObject("CursorItem", typeof(RectTransform), typeof(Image));
            _cursorObject.transform.SetParent(_rootPanel.transform, false);
            var crt = _cursorObject.GetComponent<RectTransform>();
            crt.sizeDelta = new Vector2(48f, 48f);
            _cursorImage = _cursorObject.GetComponent<Image>();
            _cursorImage.sprite = UIWidgetFactory.WhitePixel;
            _cursorImage.raycastTarget = false;

            _cursorCountText = UIWidgetFactory.CreateText(_cursorObject.transform, "CursorCount", "", 13, UIColors.Ink, TextAnchor.LowerRight);
            var ccRt = _cursorCountText.GetComponent<RectTransform>();
            ccRt.anchorMin = Vector2.zero;
            ccRt.anchorMax = Vector2.one;
            ccRt.offsetMin = Vector2.zero;
            ccRt.offsetMax = Vector2.zero;
            _cursorObject.SetActive(false);
        }

        private void CreateSlot(Transform parent, string name, out Image icon, out Text count, Action onClick)
        {
            var btn = UIWidgetFactory.CreateButton(parent, name, "", new Color(0.1f, 0.1f, 0.12f, 0.35f), UIColors.Ink, onClick, 56f, 54f);
            var border = UIWidgetFactory.CreatePanel(btn.transform, "Border", new Color(0.5f, 0.45f, 0.3f, 0.45f), Vector2.zero, Vector2.zero, Vector2.one);

            var iconGo = new GameObject("Icon", typeof(RectTransform), typeof(Image));
            iconGo.transform.SetParent(btn.transform, false);
            var iRt = iconGo.GetComponent<RectTransform>();
            iRt.anchorMin = new Vector2(0.15f, 0.15f);
            iRt.anchorMax = new Vector2(0.85f, 0.85f);
            iRt.offsetMin = Vector2.zero;
            iRt.offsetMax = Vector2.zero;
            icon = iconGo.GetComponent<Image>();
            icon.sprite = UIWidgetFactory.WhitePixel;
            icon.color = Color.clear;
            icon.raycastTarget = false;

            count = UIWidgetFactory.CreateText(btn.transform, "Count", "", 12, UIColors.Ink, TextAnchor.LowerRight);
            var cRt = count.GetComponent<RectTransform>();
            cRt.anchorMin = Vector2.zero;
            cRt.anchorMax = Vector2.one;
            cRt.offsetMin = new Vector2(0f, 2f);
            cRt.offsetMax = new Vector2(-4f, 0f);
            count.raycastTarget = false;
        }

        // ── Slot Interaction Handlers ───────────────────────────────────────────
        private void OnStorageSlotClicked(int index)
        {
            if (_inventory == null) return;
            var slotItem = _inventory.GetStorageSlot(index);
            HandleSlotSwap(ref slotItem, item => _inventory.SetStorageSlot(index, item));
        }

        private void OnHotbarSlotClicked(int index)
        {
            if (_inventory == null) return;
            var slotItem = _inventory.GetHotbarSlot(index);
            HandleSlotSwap(ref slotItem, item => _inventory.SetHotbarSlot(index, item));
        }

        private void OnEquipSlotClicked(int slotIndex)
        {
            if (_equipment == null) return;
            var slotType = (EquipmentSlot)slotIndex;
            var slotItem = _equipment.GetEquipment(slotType);

            if (_cursorItem.IsEmpty)
            {
                if (!slotItem.IsEmpty)
                {
                    _cursorItem = slotItem;
                    _equipment.Equip(slotType, ItemStack.Empty);
                }
            }
            else
            {
                var prev = _equipment.Equip(slotType, _cursorItem);
                _cursorItem = prev;
            }
            RefreshAllSlots();
        }

        private void OnCraftSlotClicked(int index)
        {
            HandleSlotSwap(ref _craftGrid[index], item => _craftGrid[index] = item);
            RecalculateCrafting();
        }

        private void OnCraftResultClicked()
        {
            if (_craftResult.IsEmpty) return;

            if (_cursorItem.IsEmpty)
            {
                _cursorItem = _craftResult;
                ConsumeCraftingIngredients();
            }
            else if (_cursorItem.ItemId == _craftResult.ItemId && _cursorItem.Count + _craftResult.Count <= 64)
            {
                _cursorItem.Count += _craftResult.Count;
                ConsumeCraftingIngredients();
            }

            RecalculateCrafting();
            RefreshAllSlots();
        }

        private void ConsumeCraftingIngredients()
        {
            for (int i = 0; i < 4; i++)
            {
                if (!_craftGrid[i].IsEmpty)
                {
                    _craftGrid[i].Count--;
                    if (_craftGrid[i].Count <= 0) _craftGrid[i] = ItemStack.Empty;
                }
            }
        }

        private void HandleSlotSwap(ref ItemStack slotItem, Action<ItemStack> assigner)
        {
            if (_cursorItem.IsEmpty)
            {
                if (!slotItem.IsEmpty)
                {
                    _cursorItem = slotItem;
                    assigner(ItemStack.Empty);
                }
            }
            else
            {
                if (slotItem.IsEmpty)
                {
                    assigner(_cursorItem);
                    _cursorItem = ItemStack.Empty;
                }
                else if (slotItem.ItemId == _cursorItem.ItemId && slotItem.Count + _cursorItem.Count <= 64)
                {
                    slotItem.Count += _cursorItem.Count;
                    assigner(slotItem);
                    _cursorItem = ItemStack.Empty;
                }
                else
                {
                    var temp = slotItem;
                    assigner(_cursorItem);
                    _cursorItem = temp;
                }
            }
            RefreshAllSlots();
        }

        private void RecalculateCrafting()
        {
            int[] grid2x2 = new int[]
            {
                _craftGrid[0].ItemId, _craftGrid[1].ItemId,
                _craftGrid[2].ItemId, _craftGrid[3].ItemId
            };
            _craftResult = RecipeRegistry.MatchRecipe(grid2x2, 2, 2);
        }

        public void RefreshAllSlots()
        {
            if (_inventory != null)
            {
                for (int i = 0; i < 27; i++)
                {
                    UpdateSlotVisual(_storageSlotImages[i], _storageSlotCounts[i], _inventory.GetStorageSlot(i));
                }
                for (int i = 0; i < 9; i++)
                {
                    UpdateSlotVisual(_hotbarSlotImages[i], _hotbarSlotCounts[i], _inventory.GetHotbarSlot(i));
                }
            }

            if (_equipment != null)
            {
                for (int i = 0; i < 4; i++)
                {
                    UpdateSlotVisual(_equipSlotImages[i], null, _equipment.GetEquipment((EquipmentSlot)i));
                }
                if (_armorStatsText != null)
                {
                    _armorStatsText.text = $"Armor: {_equipment.GetTotalDefense()}";
                }
            }

            for (int i = 0; i < 4; i++)
            {
                UpdateSlotVisual(_craftSlotImages[i], _craftSlotCounts[i], _craftGrid[i]);
            }
            UpdateSlotVisual(_resultSlotImage, _resultSlotCount, _craftResult);

            // Update floating cursor item
            if (_cursorObject != null)
            {
                if (!_cursorItem.IsEmpty)
                {
                    _cursorObject.SetActive(true);
                    _cursorImage.color = BlockUtility.GetBlockColor((BlockType)_cursorItem.ItemId, 0);
                    _cursorCountText.text = _cursorItem.Count > 1 ? _cursorItem.Count.ToString() : "";
                }
                else
                {
                    _cursorObject.SetActive(false);
                }
            }
        }

        private void UpdateSlotVisual(Image icon, Text countText, ItemStack item)
        {
            if (icon == null) return;

            if (item.IsEmpty)
            {
                icon.color = Color.clear;
                if (countText != null) countText.text = "";
            }
            else
            {
                icon.color = BlockUtility.GetBlockColor((BlockType)item.ItemId, 0);
                if (countText != null) countText.text = item.Count > 1 ? item.Count.ToString() : "";
            }
        }
    }
}
using System;
using UnityEngine;
using UnityEngine.UI;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.Gameplay.Survival;
using VYTHERA.Player.Physics;
using VYTHERA.UI.Core;

namespace VYTHERA.UI
{
    public static class HUDBuilder
    {
        public static GameObject BuildHUD()
        {
            var root = new GameObject("HUD");
            var canvas = root.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            var scaler = root.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;
            root.AddComponent<GraphicRaycaster>();

            // 1. Health Bar & Text
            var healthBar = CreateSlider(root.transform, "HealthBar",
                new Vector2(24, 24), new Vector2(200, 20),
                TextAnchor.LowerLeft, new Color(0.85f, 0.15f, 0.15f));
            var healthTxt = UIWidgetFactory.CreateText(healthBar.transform, "HealthTxt", "20 / 20", 12, UIColors.Ink, TextAnchor.MiddleCenter);
            var htRt = healthTxt.GetComponent<RectTransform>();
            htRt.anchorMin = Vector2.zero;
            htRt.anchorMax = Vector2.one;
            htRt.offsetMin = Vector2.zero;
            htRt.offsetMax = Vector2.zero;

            // 2. Hunger Bar & Text
            var hungerBar = CreateSlider(root.transform, "HungerBar",
                new Vector2(24, 52), new Vector2(200, 20),
                TextAnchor.LowerLeft, new Color(0.85f, 0.65f, 0.1f));
            var hungerTxt = UIWidgetFactory.CreateText(hungerBar.transform, "HungerTxt", "20 / 20", 12, UIColors.Ink, TextAnchor.MiddleCenter);
            var huRt = hungerTxt.GetComponent<RectTransform>();
            huRt.anchorMin = Vector2.zero;
            huRt.anchorMax = Vector2.one;
            huRt.offsetMin = Vector2.zero;
            huRt.offsetMax = Vector2.zero;

            // 3. Hotbar
            const int hotbarCount = 9;
            const float slotSize = 56f;
            const float gap = 6f;
            float totalWidth = hotbarCount * (slotSize + gap) - gap;

            var hotbarRoot = new GameObject("Hotbar");
            var hotbarRect = hotbarRoot.AddComponent<RectTransform>();
            hotbarRect.SetParent(root.transform, false);
            hotbarRect.anchorMin = new Vector2(0.5f, 0f);
            hotbarRect.anchorMax = new Vector2(0.5f, 0f);
            hotbarRect.pivot = new Vector2(0.5f, 0f);
            hotbarRect.anchoredPosition = new Vector2(0f, 16f);
            hotbarRect.sizeDelta = new Vector2(totalWidth, slotSize);

            var slotImages = new Image[hotbarCount];
            var slotCounts = new Text[hotbarCount];
            for (int i = 0; i < hotbarCount; i++)
            {
                var slotGO = new GameObject($"Slot{i}");
                var slotRect = slotGO.AddComponent<RectTransform>();
                slotRect.SetParent(hotbarRect, false);
                slotRect.anchorMin = new Vector2(0f, 0f);
                slotRect.anchorMax = new Vector2(0f, 0f);
                slotRect.pivot = new Vector2(0f, 0f);
                slotRect.anchoredPosition = new Vector2(i * (slotSize + gap), 0f);
                slotRect.sizeDelta = new Vector2(slotSize, slotSize);

                var slotImg = slotGO.AddComponent<Image>();
                slotImg.sprite = UIWidgetFactory.WhitePixel;
                slotImg.color = UIColors.SurfaceSolid;
                slotImages[i] = slotImg;

                var border = UIWidgetFactory.CreatePanel(slotGO.transform, "Border", UIColors.GoldBorder, Vector2.zero, Vector2.zero, Vector2.one);

                var count = UIWidgetFactory.CreateText(slotGO.transform, "Count", "", 12, UIColors.Ink, TextAnchor.LowerRight);
                var cRt = count.GetComponent<RectTransform>();
                cRt.anchorMin = Vector2.zero;
                cRt.anchorMax = Vector2.one;
                cRt.offsetMin = new Vector2(0f, 2f);
                cRt.offsetMax = new Vector2(-4f, 0f);
                slotCounts[i] = count;
            }

            // Hotbar selection highlight
            var highlightGO = new GameObject("HotbarHighlight");
            var highlightRect = highlightGO.AddComponent<RectTransform>();
            highlightRect.SetParent(hotbarRect, false);
            highlightRect.anchorMin = new Vector2(0f, 0f);
            highlightRect.anchorMax = new Vector2(0f, 0f);
            highlightRect.pivot = new Vector2(0f, 0f);
            highlightRect.sizeDelta = new Vector2(slotSize, slotSize);
            var highlightImg = highlightGO.AddComponent<Image>();
            highlightImg.sprite = UIWidgetFactory.WhitePixel;
            highlightImg.color = UIColors.GoldBright;
            highlightImg.color = new Color(highlightImg.color.r, highlightImg.color.g, highlightImg.color.b, 0.45f);

            // 4. Crosshair — center
            var crosshair = new GameObject("Crosshair");
            var crossRect = crosshair.AddComponent<RectTransform>();
            crossRect.SetParent(root.transform, false);
            crossRect.anchorMin = new Vector2(0.5f, 0.5f);
            crossRect.anchorMax = new Vector2(0.5f, 0.5f);
            crossRect.pivot = new Vector2(0.5f, 0.5f);
            crossRect.sizeDelta = new Vector2(16f, 16f);
            crossRect.anchoredPosition = Vector2.zero;
            var crossImg = crosshair.AddComponent<Image>();
            crossImg.sprite = UIWidgetFactory.WhitePixel;
            crossImg.color = new Color(1f, 1f, 1f, 0.85f);
            crossImg.raycastTarget = false;

            // 5. Coords & FPS — top left
            var coords = UIWidgetFactory.CreateText(root.transform, "CoordsText", "XYZ: 0.0 / 0.0 / 0.0   FPS: 60", 13, UIColors.InkDim);
            var cdRt = coords.GetComponent<RectTransform>();
            cdRt.anchorMin = new Vector2(0f, 1f);
            cdRt.anchorMax = new Vector2(0f, 1f);
            cdRt.anchoredPosition = new Vector2(130f, -24f);

            // 6. Compass — top center
            var compass = UIWidgetFactory.CreateText(root.transform, "CompassText", "N (0°)", 14, UIColors.Gold, TextAnchor.MiddleCenter);
            var cpRt = compass.GetComponent<RectTransform>();
            cpRt.anchorMin = new Vector2(0.5f, 1f);
            cpRt.anchorMax = new Vector2(0.5f, 1f);
            cpRt.anchoredPosition = new Vector2(0f, -24f);

            // 7. Look Raycast Target — above crosshair
            var lookText = UIWidgetFactory.CreateText(root.transform, "TargetBlockText", "", 13, UIColors.Ink, TextAnchor.MiddleCenter);
            var ltRt = lookText.GetComponent<RectTransform>();
            ltRt.anchorMin = new Vector2(0.5f, 0.5f);
            ltRt.anchorMax = new Vector2(0.5f, 0.5f);
            ltRt.anchoredPosition = new Vector2(0f, 40f);

            // 8. Hurt Vignette Flash
            var hurtGo = new GameObject("HurtFlash", typeof(RectTransform), typeof(Image));
            hurtGo.transform.SetParent(root.transform, false);
            var hfRt = hurtGo.GetComponent<RectTransform>();
            hfRt.anchorMin = Vector2.zero;
            hfRt.anchorMax = Vector2.one;
            hfRt.offsetMin = Vector2.zero;
            hfRt.offsetMax = Vector2.zero;
            var hurtImg = hurtGo.GetComponent<Image>();
            hurtImg.sprite = UIWidgetFactory.WhitePixel;
            hurtImg.color = Color.clear;
            hurtImg.raycastTarget = false;

            // 9. Death Screen Overlay
            var deathGo = UIWidgetFactory.CreatePanel(root.transform, "DeathScreen", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);
            var dTitle = UIWidgetFactory.CreateText(deathGo.transform, "DeathTitle", "YOU DIED", 42, UIColors.Danger, TextAnchor.MiddleCenter);
            var dtRt = dTitle.GetComponent<RectTransform>();
            dtRt.anchorMin = new Vector2(0.2f, 0.65f);
            dtRt.anchorMax = new Vector2(0.8f, 0.85f);
            dtRt.offsetMin = Vector2.zero;
            dtRt.offsetMax = Vector2.zero;

            var hud = root.AddComponent<HUDManager>();

            var respawnBtn = UIWidgetFactory.CreateButton(deathGo.transform, "BtnRespawn", "Respawn", UIColors.Gold, UIColors.Void, () =>
            {
                hud.RespawnPlayer();
            }, 200f, 44f);
            var rbRt = respawnBtn.GetComponent<RectTransform>();
            rbRt.anchorMin = new Vector2(0.5f, 0.45f);
            rbRt.anchorMax = new Vector2(0.5f, 0.45f);
            rbRt.anchoredPosition = Vector2.zero;

            var titleBtn = UIWidgetFactory.CreateButton(deathGo.transform, "BtnTitle", "Quit to Title", UIColors.SurfaceSolid, UIColors.Ink, () =>
            {
                UIManager.Instance?.ReturnToMainMenu();
            }, 200f, 44f);
            var tbRt = titleBtn.GetComponent<RectTransform>();
            tbRt.anchorMin = new Vector2(0.5f, 0.35f);
            tbRt.anchorMax = new Vector2(0.5f, 0.35f);
            tbRt.anchoredPosition = Vector2.zero;

            deathGo.SetActive(false);

            // Wire HUDManager fields
            SetField(hud, "_healthBar", healthBar);
            SetField(hud, "_healthText", healthTxt);
            SetField(hud, "_hungerBar", hungerBar);
            SetField(hud, "_hungerText", hungerTxt);
            SetField(hud, "_hotbarSlots", slotImages);
            SetField(hud, "_hotbarCounts", slotCounts);
            SetField(hud, "_hotbarHighlight", highlightRect);
            SetField(hud, "_coordsText", coords);
            SetField(hud, "_compassText", compass);
            SetField(hud, "_targetBlockText", lookText);
            SetField(hud, "_hurtFlash", hurtImg);
            SetField(hud, "_deathScreen", deathGo);

            return root;
        }

        private static void SetField(object obj, string name, object val)
        {
            typeof(HUDManager).GetField(name, System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.SetValue(obj, val);
        }

        private static Slider CreateSlider(Transform parent, string name, Vector2 anchoredPos, Vector2 size, TextAnchor anchor, Color fillColor)
        {
            var go = new GameObject(name);
            var rect = go.AddComponent<RectTransform>();
            rect.SetParent(parent, false);

            Vector2 anchorVec = anchor == TextAnchor.LowerLeft ? new Vector2(0f, 0f) : new Vector2(0.5f, 0f);
            rect.anchorMin = anchorVec;
            rect.anchorMax = anchorVec;
            rect.pivot = anchorVec;
            rect.anchoredPosition = anchoredPos;
            rect.sizeDelta = size;

            var bg = new GameObject("Background").AddComponent<Image>();
            bg.rectTransform.SetParent(go.transform, false);
            bg.rectTransform.anchorMin = Vector2.zero;
            bg.rectTransform.anchorMax = Vector2.one;
            bg.rectTransform.sizeDelta = Vector2.zero;
            bg.sprite = UIWidgetFactory.WhitePixel;
            bg.color = UIColors.SurfaceSolid;

            var fillArea = new GameObject("FillArea").AddComponent<RectTransform>();
            fillArea.SetParent(go.transform, false);
            fillArea.anchorMin = Vector2.zero;
            fillArea.anchorMax = Vector2.one;
            fillArea.sizeDelta = new Vector2(-4f, -4f);
            fillArea.anchoredPosition = Vector2.zero;

            var fillGO = new GameObject("Fill").AddComponent<Image>();
            fillGO.rectTransform.SetParent(fillArea, false);
            fillGO.rectTransform.anchorMin = Vector2.zero;
            fillGO.rectTransform.anchorMax = Vector2.one;
            fillGO.rectTransform.sizeDelta = Vector2.zero;
            fillGO.sprite = UIWidgetFactory.WhitePixel;
            fillGO.color = fillColor;

            var slider = go.AddComponent<Slider>();
            slider.fillRect = fillGO.rectTransform;
            slider.direction = Slider.Direction.LeftToRight;
            slider.minValue = 0f;
            slider.maxValue = 1f;
            slider.value = 1f;
            slider.interactable = false;

            return slider;
        }
    }
}
using System;
using UnityEngine;
using UnityEngine.UI;

namespace VYTHERA.UI.Core
{
    public static class UIWidgetFactory
    {
        private static Sprite _whitePixel;
        public static Sprite WhitePixel
        {
            get
            {
                if (_whitePixel == null)
                {
                    var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                    tex.SetPixels(new[] { Color.white, Color.white, Color.white, Color.white });
                    tex.Apply();
                    _whitePixel = Sprite.Create(tex, new Rect(0, 0, 2, 2), new Vector2(0.5f, 0.5f));
                }
                return _whitePixel;
            }
        }

        public static GameObject CreatePanel(Transform parent, string name, Color bgColor, Vector2 size, Vector2 anchorMin, Vector2 anchorMax)
        {
            if (parent != null && parent.GetComponent<RectTransform>() == null)
            {
                var canvas = parent.GetComponentInParent<Canvas>() ?? UnityEngine.Object.FindAnyObjectByType<Canvas>();
                if (canvas != null)
                {
                    parent = canvas.transform;
                }
            }

            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            if (parent != null) go.transform.SetParent(parent, false);

            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
            if (anchorMin != Vector2.zero || anchorMax != Vector2.one)
            {
                rt.sizeDelta = size;
            }

            var img = go.GetComponent<Image>();
            img.sprite = WhitePixel;
            img.color = bgColor;
            img.type = Image.Type.Simple;

            return go;
        }

        public static Text CreateText(Transform parent, string name, string content, int fontSize, Color color, TextAnchor alignment = TextAnchor.MiddleLeft)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);

            var txt = go.GetComponent<Text>();
            txt.text = content;
            txt.fontSize = fontSize;
            txt.color = color;
            txt.alignment = alignment;
            txt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            txt.horizontalOverflow = HorizontalWrapMode.Overflow;
            txt.verticalOverflow = VerticalWrapMode.Overflow;

            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(300f, 30f);

            return txt;
        }

        public static Button CreateButton(Transform parent, string name, string label, Color baseColor, Color textColor, Action onClick, float width = 220f, float height = 44f)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);

            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(width, height);

            var img = go.GetComponent<Image>();
            img.sprite = WhitePixel;
            img.color = baseColor;

            var btn = go.GetComponent<Button>();
            var colors = btn.colors;
            colors.normalColor = baseColor;
            colors.highlightedColor = baseColor * 1.25f;
            colors.pressedColor = baseColor * 0.85f;
            colors.selectedColor = baseColor * 1.15f;
            btn.colors = colors;

            if (onClick != null)
            {
                btn.onClick.AddListener(() => onClick());
            }

            var txt = CreateText(go.transform, "Label", label, 16, textColor, TextAnchor.MiddleCenter);
            var txtRt = txt.GetComponent<RectTransform>();
            txtRt.anchorMin = Vector2.zero;
            txtRt.anchorMax = Vector2.one;
            txtRt.offsetMin = Vector2.zero;
            txtRt.offsetMax = Vector2.zero;

            return btn;
        }

        public static Button CreateRowButton(Transform parent, string name, string label, string subtitle, Action onClick)
        {
            var btn = CreateButton(parent, name, "", UIColors.Surface, UIColors.Ink, onClick, 280f, 52f);
            var labelTxt = CreateText(btn.transform, "RowLabel", label, 16, UIColors.Ink, TextAnchor.MiddleLeft);
            var labelRt = labelTxt.GetComponent<RectTransform>();
            labelRt.anchorMin = new Vector2(0f, 0.5f);
            labelRt.anchorMax = new Vector2(0.65f, 1f);
            labelRt.offsetMin = new Vector2(16f, 0f);
            labelRt.offsetMax = Vector2.zero;

            if (!string.IsNullOrEmpty(subtitle))
            {
                var subTxt = CreateText(btn.transform, "RowSubtitle", subtitle, 12, UIColors.Muted, TextAnchor.MiddleRight);
                var subRt = subTxt.GetComponent<RectTransform>();
                subRt.anchorMin = new Vector2(0.5f, 0f);
                subRt.anchorMax = new Vector2(1f, 1f);
                subRt.offsetMin = Vector2.zero;
                subRt.offsetMax = new Vector2(-16f, 0f);
            }

            return btn;
        }

        public static Slider CreateSlider(Transform parent, string name, string labelText, float min, float max, float current, Action<float> onValueChanged)
        {
            var row = new GameObject(name + "_Row", typeof(RectTransform));
            row.transform.SetParent(parent, false);
            var rowRt = row.GetComponent<RectTransform>();
            rowRt.sizeDelta = new Vector2(320f, 40f);

            var lbl = CreateText(row.transform, "Label", labelText, 14, UIColors.InkDim);
            var lblRt = lbl.GetComponent<RectTransform>();
            lblRt.anchorMin = new Vector2(0f, 0f);
            lblRt.anchorMax = new Vector2(0.45f, 1f);
            lblRt.offsetMin = Vector2.zero;
            lblRt.offsetMax = Vector2.zero;

            var valTxt = CreateText(row.transform, "Value", current.ToString("F1"), 13, UIColors.Gold, TextAnchor.MiddleRight);
            var valRt = valTxt.GetComponent<RectTransform>();
            valRt.anchorMin = new Vector2(0.85f, 0f);
            valRt.anchorMax = new Vector2(1f, 1f);
            valRt.offsetMin = Vector2.zero;
            valRt.offsetMax = Vector2.zero;

            var sliderGo = new GameObject(name, typeof(RectTransform), typeof(Slider));
            sliderGo.transform.SetParent(row.transform, false);
            var sliderRt = sliderGo.GetComponent<RectTransform>();
            sliderRt.anchorMin = new Vector2(0.48f, 0.2f);
            sliderRt.anchorMax = new Vector2(0.82f, 0.8f);
            sliderRt.offsetMin = Vector2.zero;
            sliderRt.offsetMax = Vector2.zero;

            var bg = CreatePanel(sliderGo.transform, "Background", UIColors.SurfaceSolid, Vector2.zero, Vector2.zero, Vector2.one);
            var bgRt = bg.GetComponent<RectTransform>();
            bgRt.offsetMin = new Vector2(0f, 4f);
            bgRt.offsetMax = new Vector2(0f, -4f);

            var fillArea = new GameObject("FillArea", typeof(RectTransform));
            fillArea.transform.SetParent(sliderGo.transform, false);
            var faRt = fillArea.GetComponent<RectTransform>();
            faRt.anchorMin = Vector2.zero;
            faRt.anchorMax = Vector2.one;
            faRt.offsetMin = new Vector2(0f, 4f);
            faRt.offsetMax = new Vector2(0f, -4f);

            var fill = CreatePanel(fillArea.transform, "Fill", UIColors.Gold, Vector2.zero, Vector2.zero, Vector2.one);
            var fillRt = fill.GetComponent<RectTransform>();
            fillRt.offsetMin = Vector2.zero;
            fillRt.offsetMax = Vector2.zero;

            var slider = sliderGo.GetComponent<Slider>();
            slider.fillRect = fillRt;
            slider.minValue = min;
            slider.maxValue = max;
            slider.value = current;

            slider.onValueChanged.AddListener(v =>
            {
                valTxt.text = v.ToString("F1");
                onValueChanged?.Invoke(v);
            });

            return slider;
        }

        public static InputField CreateInputField(Transform parent, string name, string placeholder, Action<string> onEndEdit, float width = 280f, float height = 40f)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(InputField));
            go.transform.SetParent(parent, false);

            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(width, height);

            var img = go.GetComponent<Image>();
            img.sprite = WhitePixel;
            img.color = UIColors.SurfaceSolid;

            var ph = CreateText(go.transform, "Placeholder", placeholder, 14, UIColors.Muted);
            var phRt = ph.GetComponent<RectTransform>();
            phRt.anchorMin = Vector2.zero;
            phRt.anchorMax = Vector2.one;
            phRt.offsetMin = new Vector2(10f, 0f);
            phRt.offsetMax = new Vector2(-10f, 0f);

            var txt = CreateText(go.transform, "Text", "", 14, UIColors.Ink);
            var txtRt = txt.GetComponent<RectTransform>();
            txtRt.anchorMin = Vector2.zero;
            txtRt.anchorMax = Vector2.one;
            txtRt.offsetMin = new Vector2(10f, 0f);
            txtRt.offsetMax = new Vector2(-10f, 0f);

            var input = go.GetComponent<InputField>();
            input.textComponent = txt;
            input.placeholder = ph;
            if (onEndEdit != null) input.onEndEdit.AddListener(s => onEndEdit(s));

            return input;
        }

        public static GameObject CreateDivider(Transform parent, string label = "")
        {
            var row = new GameObject("Divider", typeof(RectTransform));
            row.transform.SetParent(parent, false);
            var rowRt = row.GetComponent<RectTransform>();
            rowRt.sizeDelta = new Vector2(280f, 24f);

            if (!string.IsNullOrEmpty(label))
            {
                var txt = CreateText(row.transform, "Label", label.ToUpperInvariant(), 11, UIColors.Gold, TextAnchor.MiddleCenter);
                var txtRt = txt.GetComponent<RectTransform>();
                txtRt.anchorMin = Vector2.zero;
                txtRt.anchorMax = Vector2.one;
                txtRt.offsetMin = Vector2.zero;
                txtRt.offsetMax = Vector2.zero;
            }
            else
            {
                var line = CreatePanel(row.transform, "Line", UIColors.GoldBorder, new Vector2(280f, 1f), new Vector2(0f, 0.5f), new Vector2(1f, 0.5f));
            }

            return row;
        }
    }
}
using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;

namespace VYTHERA.UI.Touch
{
    /// <summary>
    /// Mobile virtual joystick and action buttons.
    /// Receives multi-touch input and forwards analog axes + button presses to PlayerInputHandler.
    /// </summary>
    public sealed class TouchControls : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IDragHandler
    {
        [Header("Layout")]
        [SerializeField] private RectTransform _stickBackground;
        [SerializeField] private RectTransform _stickKnob;
        [SerializeField] private float _stickRadius = 60f;

        public Vector2 MoveAxis { get; private set; }
        public bool JumpPressed { get; private set; }

        private int _touchId = -1;
        private Vector2 _stickCenter;

        private void Start()
        {
            if (_stickBackground != null)
                _stickCenter = _stickBackground.position;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (_touchId == -1)
            {
                _touchId = eventData.pointerId;
                _stickCenter = eventData.position;
                if (_stickBackground != null)
                    _stickBackground.position = _stickCenter;
                UpdateStick(eventData.position);
            }
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (eventData.pointerId == _touchId)
                UpdateStick(eventData.position);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.pointerId == _touchId)
            {
                _touchId = -1;
                MoveAxis = Vector2.zero;
                if (_stickKnob != null)
                    _stickKnob.localPosition = Vector2.zero;
            }
        }

        private void UpdateStick(Vector2 pos)
        {
            Vector2 delta = pos - _stickCenter;
            if (delta.magnitude > _stickRadius)
                delta = delta.normalized * _stickRadius;

            MoveAxis = delta / _stickRadius;

            if (_stickKnob != null)
                _stickKnob.position = _stickCenter + delta;
        }

        private void LateUpdate()
        {
            JumpPressed = false;
        }

        // Called by HUD jump button
        public void PressJump() => JumpPressed = true;

        /// <summary>Builds the touch control panel and attaches it to a canvas.</summary>
        public static TouchControls Build(Canvas targetCanvas)
        {
            var root = new GameObject("TouchControls");
            var rootRect = root.AddComponent<RectTransform>();
            rootRect.SetParent(targetCanvas.transform, false);
            rootRect.anchorMin = Vector2.zero;
            rootRect.anchorMax = Vector2.one;
            rootRect.sizeDelta = Vector2.zero;

            // Joystick background — bottom left zone
            var bgGO = new GameObject("StickBackground");
            var bgRect = bgGO.AddComponent<RectTransform>();
            bgRect.SetParent(rootRect, false);
            bgRect.anchorMin = new Vector2(0f, 0f);
            bgRect.anchorMax = new Vector2(0f, 0f);
            bgRect.pivot = new Vector2(0.5f, 0.5f);
            bgRect.sizeDelta = new Vector2(130f, 130f);
            bgRect.anchoredPosition = new Vector2(100f, 100f);

            var bgImg = bgGO.AddComponent<UnityEngine.UI.Image>();
            bgImg.color = new Color(1f, 1f, 1f, 0.15f);
            bgImg.raycastTarget = true;

            // Knob
            var knobGO = new GameObject("StickKnob");
            var knobRect = knobGO.AddComponent<RectTransform>();
            knobRect.SetParent(bgRect, false);
            knobRect.sizeDelta = new Vector2(60f, 60f);
            knobRect.anchoredPosition = Vector2.zero;
            var knobImg = knobGO.AddComponent<UnityEngine.UI.Image>();
            knobImg.color = new Color(1f, 1f, 1f, 0.45f);
            knobImg.raycastTarget = false;

            // Jump button — bottom right
            var jumpGO = new GameObject("JumpButton");
            var jumpRect = jumpGO.AddComponent<RectTransform>();
            jumpRect.SetParent(rootRect, false);
            jumpRect.anchorMin = new Vector2(1f, 0f);
            jumpRect.anchorMax = new Vector2(1f, 0f);
            jumpRect.pivot = new Vector2(1f, 0f);
            jumpRect.sizeDelta = new Vector2(100f, 60f);
            jumpRect.anchoredPosition = new Vector2(-20f, 80f);
            var jumpImg = jumpGO.AddComponent<UnityEngine.UI.Image>();
            jumpImg.color = new Color(0.2f, 0.7f, 0.2f, 0.7f);

            var touchControls = root.AddComponent<TouchControls>();
            typeof(TouchControls).GetField("_stickBackground", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.SetValue(touchControls, bgRect);
            typeof(TouchControls).GetField("_stickKnob", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.SetValue(touchControls, knobRect);

            // Wire jump button
            var jumpTrigger = jumpGO.AddComponent<UnityEngine.UI.Button>();
            jumpTrigger.onClick.AddListener(touchControls.PressJump);

            // EventSystem for touch
            if (FindFirstObjectByType<EventSystem>() == null)
            {
                var esGO = new GameObject("EventSystem");
                esGO.AddComponent<EventSystem>();
                esGO.AddComponent<InputSystemUIInputModule>();
            }

            return touchControls;
        }
    }
}

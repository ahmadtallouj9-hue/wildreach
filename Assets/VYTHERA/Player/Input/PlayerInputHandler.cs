using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.EnhancedTouch;
using VYTHERA.Core.Timing;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.Player.Camera;
using VYTHERA.Player.Physics;
using VYTHERA.UI.Touch;

namespace VYTHERA.Player.Input
{
    public sealed class PlayerInputHandler : MonoBehaviour
    {
        [SerializeField] private PlayerPhysics _physics;
        [SerializeField] private PlayerCameraRig _cameraRig;
        [SerializeField] private InventorySystem _inventory;

        [Header("Controller Settings")]
        public float ControllerLookSensitivity = 120f;
        public float StickDeadzone = 0.15f;

        [Header("Touch Settings")]
        public float TouchLookSensitivity = 0.15f;

        // Mobile touch integration
        public TouchControls MobileTouch { get; set; }

        private PlayerInputSnapshot _currentSnapshot;
        private bool _jumpPressedQueued;

        private void OnEnable()
        {
            EnhancedTouchSupport.Enable();
        }

        private void OnDisable()
        {
            EnhancedTouchSupport.Disable();
        }

        private void Start()
        {
            if (_physics == null) _physics = GetComponent<PlayerPhysics>();
            if (_cameraRig == null) _cameraRig = GetComponent<PlayerCameraRig>();
            if (_inventory == null) _inventory = GetComponent<InventorySystem>();

            FixedTickManager.OnFixedTick += HandleFixedTick;

            if (Application.isMobilePlatform)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
            else
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }

        private void OnDestroy()
        {
            FixedTickManager.OnFixedTick -= HandleFixedTick;
        }

        private void Update()
        {
            if (Time.timeScale == 0f)
            {
                _currentSnapshot = default;
                return;
            }

            var keyboard = Keyboard.current;
            var mouse = Mouse.current;
            var gamepad = Gamepad.current;
            var touchscreen = Touchscreen.current;
            bool mouseLocked = Cursor.lockState == CursorLockMode.Locked;

            float lookX = 0f, lookY = 0f;

            bool forward = false;
            bool backward = false;
            bool left = false;
            bool right = false;
            bool jumpHeld = false;
            bool sprintHeld = false;
            bool sneakHeld = false;
            float analogX = 0f;
            float analogZ = 0f;

            // ── 1. Keyboard & Mouse ────────────────────────────────────────────────
            if (keyboard != null)
            {
                forward   |= keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed;
                backward  |= keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed;
                left      |= keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed;
                right     |= keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed;
                jumpHeld  |= keyboard.spaceKey.isPressed;
                sprintHeld |= keyboard.leftShiftKey.isPressed;
                sneakHeld  |= keyboard.leftCtrlKey.isPressed || keyboard.cKey.isPressed;

                if (keyboard.spaceKey.wasPressedThisFrame)
                {
                    _jumpPressedQueued = true;
                }

                // Hotbar numbers 1-9
                if (_inventory != null)
                {
                    var digits = new[]
                    {
                        keyboard.digit1Key, keyboard.digit2Key, keyboard.digit3Key,
                        keyboard.digit4Key, keyboard.digit5Key, keyboard.digit6Key,
                        keyboard.digit7Key, keyboard.digit8Key, keyboard.digit9Key
                    };
                    for (int i = 0; i < digits.Length; i++)
                    {
                        if (digits[i].wasPressedThisFrame) _inventory.SelectHotbar(i);
                    }
                }

                // View mode toggle (F5)
                if (keyboard.f5Key.wasPressedThisFrame && _cameraRig != null)
                {
                    int next = ((int)_cameraRig.ViewMode + 1) % 3;
                    _cameraRig.ViewMode = (CameraViewMode)next;
                }

                // Quick save (F6)
                if (keyboard.f6Key.wasPressedThisFrame)
                {
                    var bootstrapper = FindFirstObjectByType<Gameplay.Bootstrap.GameBootstrapper>();
                    bootstrapper?.SaveGame();
                }
            }

            if (mouse != null && mouseLocked)
            {
                Vector2 mouseDelta = mouse.delta.ReadValue();
                lookX += mouseDelta.x * 0.1f;
                lookY += mouseDelta.y * 0.1f;

                // Mouse scroll: hotbar cycle
                if (_inventory != null)
                {
                    float scroll = mouse.scroll.y.ReadValue();
                    if (scroll > 0) _inventory.SelectHotbar((_inventory.SelectedHotbarIndex - 1 + 9) % 9);
                    else if (scroll < 0) _inventory.SelectHotbar((_inventory.SelectedHotbarIndex + 1) % 9);
                }
            }

            // ── 2. Controller / Gamepad ────────────────────────────────────────────
            if (gamepad != null)
            {
                // Left stick movement
                Vector2 leftStick = gamepad.leftStick.ReadValue();
                if (leftStick.magnitude > StickDeadzone)
                {
                    analogX += leftStick.x;
                    analogZ += leftStick.y;
                }

                // D-pad movement fallback
                if (gamepad.dpad.up.isPressed) forward = true;
                if (gamepad.dpad.down.isPressed) backward = true;
                if (gamepad.dpad.left.isPressed) left = true;
                if (gamepad.dpad.right.isPressed) right = true;

                // Right stick camera look
                Vector2 rightStick = gamepad.rightStick.ReadValue();
                if (rightStick.magnitude > StickDeadzone)
                {
                    lookX += rightStick.x * ControllerLookSensitivity * Time.deltaTime;
                    lookY += rightStick.y * ControllerLookSensitivity * Time.deltaTime;
                }

                // Jump button
                if (gamepad.buttonSouth.wasPressedThisFrame)
                {
                    _jumpPressedQueued = true;
                }
                jumpHeld |= gamepad.buttonSouth.isPressed;

                if (gamepad.leftStickButton.isPressed || gamepad.leftTrigger.ReadValue() > 0.5f)
                    sprintHeld = true;

                if (gamepad.buttonEast.isPressed || gamepad.rightStickButton.isPressed)
                    sneakHeld = true;

                // Shoulders / Bumpers: cycle hotbar
                if (_inventory != null)
                {
                    if (gamepad.leftShoulder.wasPressedThisFrame)
                        _inventory.SelectHotbar((_inventory.SelectedHotbarIndex - 1 + 9) % 9);
                    if (gamepad.rightShoulder.wasPressedThisFrame)
                        _inventory.SelectHotbar((_inventory.SelectedHotbarIndex + 1) % 9);
                }

                // View mode toggle
                if (gamepad.selectButton.wasPressedThisFrame && _cameraRig != null)
                {
                    int next = ((int)_cameraRig.ViewMode + 1) % 3;
                    _cameraRig.ViewMode = (CameraViewMode)next;
                }

                // Quick save
                if (gamepad.startButton.wasPressedThisFrame)
                {
                    var bootstrapper = FindFirstObjectByType<Gameplay.Bootstrap.GameBootstrapper>();
                    bootstrapper?.SaveGame();
                }
            }

            // ── 3. Android Touch ───────────────────────────────────────────────────
            if (MobileTouch != null)
            {
                if (MobileTouch.MoveAxis.sqrMagnitude > 0.01f)
                {
                    analogX += MobileTouch.MoveAxis.x;
                    analogZ += MobileTouch.MoveAxis.y;
                }
                if (MobileTouch.JumpPressed)
                {
                    _jumpPressedQueued = true;
                }
            }

            // Touchscreen drag for look (right half of the screen)
            if (touchscreen != null)
            {
                var touches = UnityEngine.InputSystem.EnhancedTouch.Touch.activeTouches;
                for (int i = 0; i < touches.Count; i++)
                {
                    var t = touches[i];
                    if (t.startScreenPosition.x > Screen.width * 0.45f)
                    {
                        Vector2 delta = t.delta;
                        lookX += delta.x * TouchLookSensitivity;
                        lookY += delta.y * TouchLookSensitivity;
                    }
                }
            }

            // Update snapshot with freshly calculated values
            _currentSnapshot.Forward = forward;
            _currentSnapshot.Backward = backward;
            _currentSnapshot.Left = left;
            _currentSnapshot.Right = right;
            _currentSnapshot.AnalogX = analogX;
            _currentSnapshot.AnalogZ = analogZ;
            _currentSnapshot.JumpHeld = jumpHeld;
            _currentSnapshot.SprintHeld = sprintHeld;
            _currentSnapshot.SneakHeld = sneakHeld;

            // Apply camera rotation
            if (_cameraRig != null && (lookX != 0f || lookY != 0f))
            {
                _cameraRig.AddLookInput(lookX, lookY);
            }
        }

        private void HandleFixedTick(ulong tick, float dt)
        {
            if (_physics != null && _cameraRig != null)
            {
                // Assign one-shot jump trigger for this simulation tick
                _currentSnapshot.JumpPressed = _jumpPressedQueued;
                _jumpPressedQueued = false;

                _physics.SimulateTick(_currentSnapshot, _cameraRig.Yaw);

                _currentSnapshot.JumpPressed = false;
            }
        }
    }
}
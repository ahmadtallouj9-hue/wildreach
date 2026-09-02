using UnityEngine;
using VYTHERA.Player.Physics;

namespace VYTHERA.Player.Camera
{
    public enum CameraViewMode
    {
        FirstPerson = 0,
        ThirdPerson = 1,
        FrontPerson = 2
    }

    public sealed class PlayerCameraRig : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private UnityEngine.Camera _camera;
        [SerializeField] private PlayerPhysics _physics;

        [Header("Settings")]
        public CameraViewMode ViewMode = CameraViewMode.FirstPerson;
        public float MouseSensitivity = 2.0f;
        public float Yaw;
        public float Pitch;

        private float _landingDip;
        private float _landingDipVelocity;
        private float _baseFov = 75f;

        private void Start()
        {
            if (_camera == null) _camera = UnityEngine.Camera.main;
            if (_physics != null)
            {
                _physics.OnLanded += HandleLanding;
            }
            if (_camera != null) _baseFov = _camera.fieldOfView;
        }

        private void OnDestroy()
        {
            if (_physics != null)
            {
                _physics.OnLanded -= HandleLanding;
            }
        }

        public void AddLookInput(float deltaX, float deltaY)
        {
            Yaw = (Yaw + deltaX * MouseSensitivity) % 360f;
            Pitch = Mathf.Clamp(Pitch - deltaY * MouseSensitivity, PlayerConfig.Camera.PitchMinDeg, PlayerConfig.Camera.PitchMaxDeg);
        }

        private void HandleLanding(float fallDist, byte block)
        {
            if (fallDist > 0.5f)
            {
                _landingDip = Mathf.Min(0.25f, fallDist * 0.05f);
            }
        }

        public void SetBaseFov(float fov)
        {
            _baseFov = fov;
            if (_camera != null) _camera.fieldOfView = fov;
        }

        private void LateUpdate()
        {
            if (_physics == null || _camera == null) return;

            // Spring decay for landing dip
            _landingDipVelocity += (-PlayerConfig.Camera.LandingSpringStiffness * _landingDip - PlayerConfig.Camera.LandingSpringDamping * _landingDipVelocity) * Time.deltaTime;
            _landingDip += _landingDipVelocity * Time.deltaTime;

            Vector3 eyePos = _physics.InterpolatedPosition + Vector3.up * (_physics.CurrentEyeHeight - _landingDip);
            Quaternion rot = Quaternion.Euler(Pitch, Yaw, 0f);

            if (ViewMode == CameraViewMode.FirstPerson)
            {
                _camera.transform.position = eyePos;
                _camera.transform.rotation = rot;
            }
            else if (ViewMode == CameraViewMode.ThirdPerson)
            {
                Vector3 backDir = rot * Vector3.back;
                _camera.transform.position = eyePos + backDir * PlayerConfig.Camera.ThirdPersonDist + Vector3.up * PlayerConfig.Camera.CamHeightLift;
                _camera.transform.rotation = rot;
            }
            else // FrontPerson
            {
                Vector3 forwardDir = rot * Vector3.forward;
                _camera.transform.position = eyePos + forwardDir * PlayerConfig.Camera.FrontPersonDist + Vector3.up * PlayerConfig.Camera.CamHeightLift;
                _camera.transform.rotation = Quaternion.Euler(Pitch, (Yaw + 180f) % 360f, 0f);
            }

            // Sprint FOV boost
            float targetFov = _physics.Sprinting ? _baseFov + PlayerConfig.Camera.SprintFovBoost : _baseFov;
            _camera.fieldOfView = Mathf.Lerp(_camera.fieldOfView, targetFov, Time.deltaTime * 10f);
        }
    }
}

using UnityEngine;

namespace VYTHERA.UI.Core
{
    /// <summary>
    /// VYTHERA signature design tokens translated from tokens.css
    /// </summary>
    public static class UIColors
    {
        // Backgrounds & Surfaces
        public static readonly Color Void = new Color(0.012f, 0.020f, 0.027f, 1.0f);        // #030507
        public static readonly Color Background = new Color(0.027f, 0.039f, 0.055f, 1.0f);  // #070a0e
        public static readonly Color Surface = new Color(0.039f, 0.086f, 0.102f, 0.75f);    // rgba(10, 22, 26, 0.75)
        public static readonly Color SurfaceSolid = new Color(0.039f, 0.086f, 0.102f, 1.0f);
        public static readonly Color SurfaceCard = new Color(0.055f, 0.102f, 0.125f, 0.85f);
        public static readonly Color ModalDim = new Color(0.0f, 0.0f, 0.0f, 0.65f);

        // Gold Accents & Highlights
        public static readonly Color Gold = new Color(0.788f, 0.635f, 0.153f, 1.0f);        // #c9a227
        public static readonly Color GoldBright = new Color(0.878f, 0.753f, 0.408f, 1.0f);  // #e0c068
        public static readonly Color GoldDark = new Color(0.659f, 0.518f, 0.078f, 1.0f);    // #a88414
        public static readonly Color GoldDim = new Color(0.788f, 0.635f, 0.153f, 0.16f);
        public static readonly Color GoldBorder = new Color(0.788f, 0.635f, 0.153f, 0.40f);

        // Nature Accents
        public static readonly Color Moss = new Color(0.373f, 0.620f, 0.471f, 1.0f);        // #5f9e78
        public static readonly Color MossDim = new Color(0.373f, 0.620f, 0.471f, 0.20f);
        public static readonly Color Teal = new Color(0.306f, 0.722f, 0.659f, 1.0f);        // #4eb8a8

        // Typography / Ink
        public static readonly Color Ink = new Color(0.953f, 0.933f, 0.886f, 1.0f);         // #f3eee2
        public static readonly Color InkDim = new Color(0.847f, 0.875f, 0.839f, 1.0f);      // #d8dfd6
        public static readonly Color Muted = new Color(0.643f, 0.702f, 0.659f, 1.0f);       // #a4b3a8
        public static readonly Color Faint = new Color(0.424f, 0.486f, 0.447f, 1.0f);       // #6c7c72

        // Status
        public static readonly Color Success = new Color(0.420f, 0.710f, 0.435f, 1.0f);     // #6bb56f
        public static readonly Color Danger = new Color(0.769f, 0.365f, 0.365f, 1.0f);      // #c45d5d
        public static readonly Color DangerHover = new Color(0.880f, 0.420f, 0.420f, 1.0f);
        public static readonly Color Warning = new Color(0.788f, 0.573f, 0.227f, 1.0f);     // #c9923a
    }
}